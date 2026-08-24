const Session = require("./lib/protocol/slaveSession");
const StatusPublisher = require("./lib/core/statusPublisher");
const TcpServer = require("./lib/tcp/server");
const Benchmark = require("./lib/core/benchmark");
const BENCHMARK = require("./lib/core/benchmarkDefinitions");
const IEC104 = require("./lib/core/constants");
const registerRoutes = require("./lib/admin/routes");
const { isValidPoint } = require("./lib/core/validators");

module.exports = function (RED) {
    registerRoutes(RED);

    function IEC104Slave(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.port = Number(config.port);

        node.t1 = Number(config.t1) * 1000;
        node.t2 = Number(config.t2) * 1000;
        node.t3 = Number(config.t3) * 1000;

        node.k = Number(config.k_win);
        node.w = Number(config.w_win);

        node.processImage = new Map();

        node.currentState = "IDLE";
        node.currentReason = "tcp.socket.init";
        node.currentTs = Date.now();

        // ==========================================
        // Benchmark
        // ==========================================

        node.benchmark = new Benchmark({
            maxFrames: Number(config.benchmark_max_frames),

            lowestDiscernibleValue: 1,
            highestTrackableValue: 10_000_000_000,
            numberOfSignificantValueDigits: 3
        });

        node.benchmark.setEnabled(
            BENCHMARK.OUTBOUND.id,
            config.benchmark_outbound === true
        );

        node.benchmark.setEnabled(
            BENCHMARK.INBOUND_COMMAND.id,
            config.benchmark_inbound_command === true
        );

        // ==========================================
        // Status
        // ==========================================

        node.statusPub = new StatusPublisher(node);

        // ==========================================
        // IEC-104 Session
        // ==========================================

        node.session = new Session({
            /*
             * OUTBOUND
             *
             * Start:
             * Node-RED Input
             *
             * Ende:
             * Übergabe des vollständigen Frames an TCP
             */
            send: (data, benchStart = null, msg = null) => {
                node.tcp.send(data);

                const result = node.benchmark.result(
                    BENCHMARK.OUTBOUND.id,
                    benchStart
                );

                handleBenchmarkResult(
                    BENCHMARK.OUTBOUND.id,
                    result
                );

                emitData(data, msg);
            },

            /*
             * INBOUND COMMAND
             *
             * Ende nach abgeschlossener
             * Command-Verarbeitung.
             */
            onInboundComplete: benchStart => {
                const result = node.benchmark.result(
                    BENCHMARK.INBOUND_COMMAND.id,
                    benchStart
                );

                handleBenchmarkResult(
                    BENCHMARK.INBOUND_COMMAND.id,
                    result
                );
            },

            onStateChange: (state, message) => {
                node.statusPub.publishState(
                    state,
                    message
                );
            },

            onStats: () => {
                node.statusPub.publishStats();
            },

            onSessionStop: summary => {
                node.emit("iec104:status", {
                    topic: "iec104/session-summary",
                    payload: summary,
                    ts: Date.now()
                });
            },

            onGI: async (ca, sendPoint) => {
                const snapshot = Array
                    .from(node.processImage.values())
                    .filter(p =>
                        ca === IEC104.CA.BROADCAST ||
                        p.ca === ca
                    )
                    .sort((a, b) => a.ioa - b.ioa);

                for (const p of snapshot) {
                    await sendPoint(p);
                }
            },

            onCommand: async asdu => {
                console.log(asdu);
            },

            t1: node.t1,
            t2: node.t2,
            t3: node.t3,
            k: node.k,
            w: node.w
        });

        // ==========================================
        // TCP Server
        // ==========================================

        node.tcp = new TcpServer({
            port: node.port,

            /*
             * INBOUND COMMAND START
             *
             * Der Startwert wird für jedes vollständige
             * Frame erzeugt. Nur bei tatsächlich
             * verarbeitetem Command wird er später
             * aufgezeichnet.
             */
            onFrame: frame => {
                const benchStart = node.benchmark.start(
                    BENCHMARK.INBOUND_COMMAND.id
                );

                node.session
                    .handleFrame(frame, benchStart)
                    .catch(err => node.error(err));
            },

            onConnect: () => {
                node.session.start();
            },

            onDisconnect: reason => {
                node.session.stop(`tcp.${reason}`);
            }
        });

        node.tcp.start();

        // ==========================================
        // Node-RED Input
        // ==========================================

        node.on("iec104:input", function (msg) {
            const benchStart = node.benchmark.start(
                BENCHMARK.OUTBOUND.id
            );

            const p = msg.payload;

            if (!isValidPoint(p)) {
                node.error("Invalid IEC104 point");
                return;
            }

            node.processImage.set(
                `${p.ca}:${p.ioa}`,
                p
            );

            node.session.sendPoint(
                p,
                IEC104.COT.SPONT,
                benchStart,
                msg
            );
        });

        // ==========================================
        // Benchmark Result Event
        // ==========================================

        function handleBenchmarkResult(metric, result) {
            if (!result?.completed) {
                return;
            }

            node.emit("iec104:status", {
                topic: "benchmark",
                payload: node.benchmark.metricSnapshot(metric),
                ts: Date.now()
            });
        }

        // ==========================================
        // Data Event
        // ==========================================

        function emitData(asdu, msg = null) {
            msg ??= {};

            msg.asdu = asdu;
            msg.ts = Date.now();

            node.emit("iec104:data", msg);
        }

        // ==========================================
        // Close
        // ==========================================

        node.on("close", function (done) {
            node.statusPub.closeAll();

            if (node.tcp) {
                node.tcp.stop(done);
            } else {
                done();
            }
        });
    }

    RED.nodes.registerType(
        "iec104-slave",
        IEC104Slave
    );
};