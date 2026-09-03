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
            measurementDurationMs:
                Number(config.benchmark_measurement_duration) * 1000
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
             * Übergabe des vollständigen Frames an TCP.
             */
            send: (data, benchStart = null, msg = null) => {
                try {
                    node.tcp.send(data);
                } catch (err) {
                    node.error(err, msg || undefined);
                    return false;
                }

                if (benchStart !== null) {
                    node.benchmark.recordOutput(
                        BENCHMARK.OUTBOUND.id,
                        1,
                        benchStart
                    );
                }

                node.benchmark.result(
                    BENCHMARK.OUTBOUND.id,
                    benchStart
                );

                emitData(data, msg);

                return true;
            },

            /*
             * INBOUND COMMAND
             *
             * Der Latenzstartpunkt wird bereits beim
             * vollständigen APDU-Eingang gesetzt.
             *
             * Der Throughput-Eingang wird erst gezählt,
             * nachdem die ASDU tatsächlich als Command
             * erkannt wurde.
             */
            onInboundStart: benchStart => {
                if (benchStart !== null) {
                    node.benchmark.recordInput(
                        BENCHMARK.INBOUND_COMMAND.id,
                        1,
                        benchStart
                    );
                }
            },

            /*
             * Ende nach abgeschlossener
             * Command-Verarbeitung.
             */
            onInboundComplete: benchStart => {
                if (benchStart !== null) {
                    node.benchmark.recordOutput(
                        BENCHMARK.INBOUND_COMMAND.id,
                        1,
                        benchStart
                    );
                }

                node.benchmark.result(
                    BENCHMARK.INBOUND_COMMAND.id,
                    benchStart
                );
            },

            onStateChange: (state, message) => {
                node.statusPub.publishState(state, message);
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
                    .filter(
                        p =>
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
             * Der Latenzstartpunkt wird bei Eingang
             * des vollständigen Frames erzeugt.
             *
             * Erst SlaveSession entscheidet, ob es sich
             * tatsächlich um einen zu messenden Command
             * handelt.
             */
            onFrame: frame => {
                const benchStart = node.benchmark.start(
                    BENCHMARK.INBOUND_COMMAND.id
                );

                node.session
                    .handleFrame(frame, benchStart)
                    .then(ok => {
                        if (!ok) {
                            node.warn(
                                "Ungültiges oder nicht unterstütztes IEC-104-Telegramm verworfen"
                            );
                        }
                    })
                    .catch(err => node.error(err));
            },

            onConnect: () => {
                node.session.start();
            },

            onDisconnect: reason => {
                node.session.stop(`tcp.${reason}`);
            },

            onError: err => {
                node.error(err);

                node.statusPub.publishState(
                    "IDLE",
                    err?.message || "TCP-Fehler"
                );
            }
        });

        node.tcp.start();

        // ==========================================
        // Benchmark timer
        // ==========================================

        /*
         * Der Timer läuft dauerhaft im Sekundenintervall.
         *
         * IDLE / FINISHED:
         * keine Messung.
         *
         * WARMUP:
         * Durchsatz erfassen und Stabilität prüfen.
         *
         * MEASUREMENT:
         * Messwerte erfassen und Messdauer überwachen.
         */
        node.benchmarkTimer = setInterval(() => {
            const result = node.benchmark.tick(
                Date.now(),
                {
                    outboundBacklog:
                        node.session.getOutboundBacklogStatus()
                }
            );

            if (result.transition) {
                node.emit("iec104:status", {
                    topic: "benchmark/state",
                    payload: node.benchmark.status(),
                    ts: Date.now()
                });
            }

            if (!result.finished) {
                return;
            }

            /*
             * Finales Ergebnis eines Benchmark-Laufs.
             *
             * Enthält Warm-up- und Messdaten.
             */
            node.emit("iec104:status", {
                topic: "benchmark",
                payload: result.snapshot,
                ts: Date.now()
            });
        }, 1000);

        // ==========================================
        // Node-RED Input
        // ==========================================

        node.on("iec104:input", function (msg) {
            const p = msg.payload;

            if (!isValidPoint(p)) {
                node.error(
                    "Invalid IEC104 point",
                    msg
                );
                return;
            }

            const benchStart = node.benchmark.start(
                BENCHMARK.OUTBOUND.id
            );

            if (benchStart !== null) {
                node.benchmark.recordInput(
                    BENCHMARK.OUTBOUND.id,
                    1,
                    benchStart
                );
            }

            const ok = node.session.sendPoint(
                p,
                IEC104.COT.SPONT,
                benchStart,
                msg
            );

            if (!ok) {
                node.error(
                    "IEC104 point could not be encoded",
                    msg
                );
                return;
            }

            node.processImage.set(
                `${p.ca}:${p.ioa}`,
                p
            );
        });

        // ==========================================
        // Data Event
        // ==========================================

        function emitData(asdu, msg) {
            msg ??= {};

            msg.asdu = asdu;
            msg.ts = Date.now();

            node.emit(
                "iec104:data",
                msg
            );
        }

        // ==========================================
        // Close
        // ==========================================

        node.on("close", function (done) {
            if (node.benchmarkTimer) {
                clearInterval(node.benchmarkTimer);
                node.benchmarkTimer = null;
            }

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