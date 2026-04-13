const Session = require("./lib/protocol/session");
const StatusPublisher = require("./lib/core/statusPublisher");
const FrameParser = require("./lib/protocol/frameParser");
const TcpConnection = require("./lib/tcp/connection");
const registerRoutes = require("./lib/admin/routes");
const {isValidPoint} = require("./lib/core/validators")

module.exports = function (RED) {
    registerRoutes(RED);

    function IEC104Gateway(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        node.port = Number(config.port);
        node.t1 = Number(config.t1) * 1000;
        node.t3 = Number(config.t3) * 1000;

        node.processImage = new Map();

        node.currentState = "IDLE";
        node.currentReason = "Warte auf Verbindungen";
        node.currentTs = Date.now();

        node.statusPub = new StatusPublisher(node);
        node.session = new Session({
            send: data => {
                node.tcp.send(data);
                emitData(data);
            },
            onStateChange: (s, msg) => node.statusPub.publish(s, msg),
            onGI: async (ca, sendPoint) => {
                const snapshot = Array
                    .from(node.processImage.values())
                    .filter(p => ca === 65535 || p.ca === ca)
                    .sort((a, b) => a.ioa - b.ioa);

                for (const p of snapshot) {
                    sendPoint(p);
                }
            },
            onConnectionLost: reason => {
                node.session.stop(reason)
            },
            t1: node.t1,
            t3: node.t3
        });


        node.tcp = new TcpConnection({
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
                node.statusPub.publish("IDLE", err?.message || "tcp error");
            }
        });

        node.tcp.start();

        node.on("iec104:input", function (msg) {
            const p = msg.payload;

            if (!isValidPoint(p)) {
                node.error("Invalid IEC104 point");
                return;
            }

            node.processImage.set(`${p.ca}:${p.ioa}`, p);
            node.session.sendPoint(p, "SPONT");
        });

        node.on("close", function (done) {
            node.statusPub.closeAll();

            if (node.tcp) {
                node.tcp.stop(done);
            } else {
                done();
            }
        });

        function emitData(asdu)
        {
            node.emit("iec104:data", {
                topic: "iec104/data",
                payload: asdu,
                ts: Date.now()
            });
        }
    }


    RED.nodes.registerType("iec104-gateway", IEC104Gateway);
};