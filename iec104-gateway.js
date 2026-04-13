const net = require("net");
const IEC104 = require("./lib/core/constants");
const Session = require("./lib/protocol/session");
const StatusPublisher = require("./lib/core/statusPublisher");

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
        node.socket = null;
        node.rxBuffer = Buffer.alloc(0);

        node.currentState = "IDLE";
        node.currentReason = "Warte auf Verbindungen";
        node.currentTs = Date.now();

        function emitData(asdu)
        {
            node.emit("iec104:data", {
                topic: "iec104/data",
                payload: asdu,
                ts: Date.now()
            });
        }

        node.statusPub = new StatusPublisher(node);
        node.session = new Session({
            send: data => tcpWrite(data),
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
                tcpCleanup(reason);
            },
            t1: node.t1,
            t3: node.t3
        });

        node.server = net.createServer(sock => {
            node.socket = sock;
            node.rxBuffer = Buffer.alloc(0);

            sock.setNoDelay(true);
            sock.setKeepAlive(true, 10000);

            sock.on("data", onRxBytes);
            sock.on("end", () => tcpCleanup("socket end"));
            sock.on("close", () => tcpCleanup("socket close"));
            sock.on("error", err => tcpCleanup(err?.message || "socket error"));
            sock.on("timeout", () => tcpCleanup("socket timeout"));

            node.session.start();
        });

        node.server.on("error", err => {
            node.statusPub.publish("IDLE", err?.message || "server error");
        });

        node.server.listen(node.port);

        function tcpWrite(data) {
            if (node.socket) {
                node.socket.write(data);
                emitData(data);
            }
        }

        function tcpCleanup(reason = "") {
            if (node.socket) {
                try {
                    node.socket.destroy();
                } catch (_) {
                    // ignore
                }
                node.socket = null;
            }

            node.rxBuffer = Buffer.alloc(0);
            node.session.stop(reason);
        }

        function onRxBytes(data) {
            node.rxBuffer = Buffer.concat([node.rxBuffer, data]);

            while (node.rxBuffer.length >= 2) {
                if (node.rxBuffer[0] !== IEC104.START) {
                    node.rxBuffer = node.rxBuffer.slice(1);
                    continue;
                }

                const len = node.rxBuffer[1];
                const frameLen = len + 2;

                if (node.rxBuffer.length < frameLen) {
                    return;
                }

                const frame = node.rxBuffer.slice(0, frameLen);
                node.rxBuffer = node.rxBuffer.slice(frameLen);

                node.session.handleFrame(frame).catch(err => node.error(err));
            }
        }



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
            if (node.socket) {
                try {
                    node.socket.destroy();
                } catch (_) {
                    // ignore
                }
                node.socket = null;
            }

            node.statusPub.closeAll();

            if (node.server) {
                node.server.close(() => done());
            } else {
                done();
            }
        });
    }

    RED.nodes.registerType("iec104-gateway", IEC104Gateway);
};