const Session = require("./lib/protocol/masterSession");
const StatusPublisher = require("./lib/core/statusPublisher");
const TcpClient = require("./lib/tcp/client");
const Benchmark = require("./lib/core/benchmark");
const BENCHMARK = require("./lib/core/benchmarkDefinitions");
const IEC104 = require("./lib/core/constants");
const registerRoutes = require("./lib/admin/routes");
const { isValidPoint } = require("./lib/core/validators");

module.exports = function (RED) {
    registerRoutes(RED);

    function IEC104Master(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.host = config.host;
        node.port = Number(config.port);
        node.t0 = Number(config.t0) * 1000;
        node.t1 = Number(config.t1) * 1000;
        node.t2 = Number(config.t2) * 1000;
        node.t3 = Number(config.t3) * 1000;
        node.k = Number(config.k_win);
        node.w = Number(config.w_win);

        node.autoGI = config.autoGI === true || config.autoGI === "true";
        node.giCA = Number(config.gi_ca || IEC104.CA.BROADCAST);
        node.reconnectDelay = Number(config.reconnectDelay) * 1000;
        node.maxRetries = Number(config.maxRetries ?? 10);

        node.processImage = new Map();

        node.currentState = "IDLE";
        node.currentReason = "Nicht verbunden";
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
            BENCHMARK.INBOUND_REPORT.id,
            config.benchmark_inbound_report === true
        );

        node.statusPub = new StatusPublisher(node);

        node.session = new Session({
            /*
             * OUTBOUND COMMAND
             *
             * Start: Node-RED Input
             * Ende: Übergabe des vollständigen Frames an TCP.
             */
            send: (data, benchStart = null, msg = null) => {
                const sent = node.tcp.send(data);

                if (!sent) {
                    node.error(
                        "TCP-Telegramm konnte nicht gesendet werden",
                        msg || undefined
                    );
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

                emitData(data);
                return true;
            },

            /*
             * INBOUND REPORT
             *
             * Der Latenzstartpunkt wird bereits beim vollständigen
             * APDU-Eingang gesetzt. Der Throughput-Eingang wird erst
             * gezählt, wenn eine ASDU mit zu verarbeitenden Objekten
             * vorliegt.
             */
            onInboundStart: benchStart => {
                if (benchStart !== null) {
                    node.benchmark.recordInput(
                        BENCHMARK.INBOUND_REPORT.id,
                        1,
                        benchStart
                    );
                }
            },

            onInboundComplete: benchStart => {
                if (benchStart !== null) {
                    node.benchmark.recordOutput(
                        BENCHMARK.INBOUND_REPORT.id,
                        1,
                        benchStart
                    );
                }

                node.benchmark.result(
                    BENCHMARK.INBOUND_REPORT.id,
                    benchStart
                );
            },

            onStateChange: (state, reason) => {
                node.statusPub.publishState(state, reason);

                if (state === IEC104.STATE.DATA_TRANSFER && node.autoGI) {
                    node.session.sendInterrogation(node.giCA);
                }
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

            onASDU: asdu => {
                node.emit("iec104:asdu", {
                    topic: "iec104/asdu",
                    payload: asdu,
                    ts: Date.now()
                });
            },

            onPoint: point => {
                if (
                    point &&
                    point.ca !== undefined &&
                    point.ioa !== undefined
                ) {
                    node.processImage.set(
                        `${point.ca}:${point.ioa}`,
                        point
                    );
                }

                node.emit("iec104:point", {
                    topic: "iec104/point",
                    payload: point,
                    ts: Date.now()
                });
            },

            onGIStart: ca => {
                node.emit("iec104:status", {
                    topic: "iec104/gi-start",
                    payload: { ca },
                    ts: Date.now()
                });
            },

            onGIEnd: ca => {
                const snapshot = Array
                    .from(node.processImage.values())
                    .filter(point =>
                        ca === IEC104.CA.BROADCAST ||
                        point.ca === ca
                    )
                    .sort((a, b) => a.ioa - b.ioa);

                node.emit("iec104:gi-complete", {
                    topic: "iec104/gi-complete",
                    payload: {
                        ca,
                        points: snapshot
                    },
                    ts: Date.now()
                });
            },

            t1: node.t1,
            t2: node.t2,
            t3: node.t3,
            k: node.k,
            w: node.w
        });

        node.tcp = new TcpClient({
            host: node.host,
            port: node.port,

            reconnectDelay: node.reconnectDelay,
            maxRetries: node.maxRetries,
            t0: node.t0,

            onFrame: frame => {
                const benchStart = node.benchmark.start(
                    BENCHMARK.INBOUND_REPORT.id
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
                node.session.stop(reason);

                node.statusPub.publishState(
                    "IDLE",
                    `Verbindung unterbrochen: ${reason}`
                );
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

            node.emit("iec104:status", {
                topic: "benchmark",
                payload: result.snapshot,
                ts: Date.now()
            });
        }, 1000);

        node.on("iec104:input", function (msg) {
            const payload = msg.payload || {};

            if (payload.command === "gi" || payload.type === "gi") {
                const ca = Number(payload.ca || node.giCA);
                const ok = node.session.sendInterrogation(ca);

                if (!ok) {
                    node.warn("GI konnte nicht gesendet werden");
                }

                return;
            }

            if (payload.command === "stopdt" || payload.type === "stopdt") {
                node.session.sendStopDt();
                return;
            }

            if (!isValidPoint(payload)) {
                node.error("Invalid IEC104 point", msg);
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
                payload,
                IEC104.COT.ACT,
                benchStart,
                msg
            );

            if (!ok) {
                node.error(
                    "IEC104 point could not be encoded",
                    msg
                );
            }
        });

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

        function emitData(asdu) {
            node.emit("iec104:data", {
                topic: "iec104/data",
                payload: asdu,
                ts: Date.now()
            });
        }
    }

    RED.nodes.registerType("iec104-master", IEC104Master);
};