const Session = require("./lib/protocol/masterSession");
const StatusPublisher = require("./lib/core/statusPublisher");
const TcpClient = require("./lib/tcp/client");
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
        node.t1 = Number(config.t1) * 1000;
        node.t3 = Number(config.t3) * 1000;
        node.k = Number(config.k_win);
        node.w = Number(config.w_win);

        node.autoGI = config.autoGI === true || config.autoGI === "true";
        node.giCA = Number(config.gi_ca || IEC104.CA.BROADCAST);

        node.processImage = new Map();

        node.currentState = "IDLE";
        node.currentReason = "Nicht verbunden";
        node.currentTs = Date.now();

        node.statusPub = new StatusPublisher(node);

        node.session = new Session({
            send: data => {
                node.tcp.send(data);
                emitData(data);
            },

            onStateChange: (s, msg) => {
                node.statusPub.publishState(s, msg);

                if (s === "DATA_TRANSFER" && node.autoGI) {
                    node.session.sendInterrogation(node.giCA);
                }
            },

            onStatus: (s, msg) => node.statusPub.publishStats(),

            onSessionSummary: summary => {
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
                if (point && point.ca !== undefined && point.ioa !== undefined) {
                    node.processImage.set(`${point.ca}:${point.ioa}`, point);
                }
                console.log(point);
                node.emit("iec104:point", {
                    topic: "iec104/point",
                    payload: point,
                    ts: Date.now()
                });
            },

            onGIStart: ca => {
                node.emit("iec104:status", {
                    topic: "iec104/gi-start",
                    payload: {
                        ca
                    },
                    ts: Date.now()
                });
            },

            onGIEnd: ca => {
                const snapshot = Array
                    .from(node.processImage.values())
                    .filter(p => ca === IEC104.CA.BROADCAST || p.ca === ca)
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

            onConnectionLost: reason => {
                node.session.stop(reason);
            },

            t1: node.t1,
            t3: node.t3,
            k: node.k,
            w: node.w
        });

        node.tcp = new TcpClient({
            host: node.host,
            port: node.port,

            onFrame: frame => {
                node.session.handleFrame(frame).catch(err => node.error(err));
            },

            onConnect: () => {
                node.session.start();
            },

            onDisconnect: reason => {
                node.session.stop(reason);
            },

            onError: err => {
                node.statusPub.publishState("IDLE", err?.message || "tcp error");
            }
        });

        node.tcp.start();

        node.on("iec104:input", function (msg) {
            const payload = msg.payload || {};

            if (payload.command === "gi" || payload.type === "gi") {
                const ca = Number(payload.ca || node.giCA || IEC104.CA.BROADCAST);
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
                node.error("Invalid IEC104 point");
                return;
            }

            node.session.sendPoint(payload, IEC104.COT.ACT);
        });

        node.on("close", function (done) {
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