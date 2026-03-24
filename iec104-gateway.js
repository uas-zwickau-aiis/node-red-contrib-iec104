const net = require("net");
const IEC104 = require("./lib/core/constants");
const Session = require("./lib/protocol/session")

module.exports = function(RED) {
  function IEC104Gateway(config) {
    RED.nodes.createNode(this, config);

    this.port = Number(config.port);
    this.ca = Number(config.ca); // Hier ersetzen, kommt von CA Node
    this.t1 = Number(config.t1) * 1000;
    this.t3 = Number(config.t3) * 1000;

    const node = this;

    // Zustand aller Punkte
    node.processImage = new Map();
    node.imageDirty = false;

    node.session = new Session({
        ca: node.ca,
        send: data => tcpWrite(data),
        onStateChange: (s,msg) => setState(s,msg),
        onGI: async sendPoint => {

            const snapshot = Array
                .from(node.processImage.values())
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


    function setState(state, reason)
    {
        let color = "red";
        let statusText = "Keine Verbindung";
        switch(state)
        {
            case "CONNECTED":
                color = "yellow";
                statusText = "Verbindung angenommen";
                break;
            case "DATA_TRANSFER":
                color = "green";
                statusText = "Datentransfer aktiv";
                break;
            case "STOPPED":
                color = "blue";
                statusText = "Datentransfer gestoppt"
                break;
            default:
                break;
        }
        node.status({ fill: color, shape: "dot", text: statusText || "" });
        emitStatus(state, reason)
    }

    // ########################################### //
    //                    TCP                      //
    // ########################################### //
    node.server = net.createServer(sock => {
        node.socket = sock;
        node.rxBuffer = Buffer.alloc(0);

        sock.setNoDelay(true);
        sock.setKeepAlive(true, 10000);

        sock.on("data", onRxBytes); 
        sock.on("end", tcpCleanup);
        sock.on("close", tcpCleanup);
        sock.on("error", tcpCleanup);

        sock.on("timeout", () => {

            tcpCleanup()
        });
        
        node.session.start();
    });

    node.server.on("error", err => {
        tcpCleanup(err.message)
    });

    node.server.listen(node.port, () => {
       //
    })

    function tcpWrite(data) {
        if (node.socket) {
            node.socket.write(data);
            emitData(data)
        }
    }
    function tcpCleanup(reason = "") {
        if (!node.socket) return;

        try { 
            node.socket.destroy(); 
        } catch (e) { }
        
        node.socket = null;
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

            if (node.rxBuffer.length < frameLen) return;

            const frame = node.rxBuffer.slice(0, frameLen);
            node.rxBuffer = node.rxBuffer.slice(frameLen);

            node.session.handleFrame(frame).catch(err => node.error(err));
        }
    }

    // ########################################### //
    //                   NODE                      //
    // ########################################### //
    function isValidPoint(p) {
        if (!p) return false;
        if (typeof p.ca !== "number") return false;
        if (typeof p.ioa !== "number") return false;
        if (!p.type) return false;
        if (typeof p.value === "undefined") return false;
        return true;
    }

    node.on("iec104:input", function (msg) {
        const p = msg.payload;

        if (!isValidPoint(p)) {
            node.error("Invalid IEC104 point");
            return;
        }

        node.processImage.set(p.ioa, p);

        node.session.sendPoint(p, "SPONT");
    });

    node.on("close", function(done) {
        if (node.socket) {
            try {
                node.socket.destroy(); 
            } catch (e) {}
            node.socket = null;
        }

        if(node.server)
        {
            node.server.close(() => {
                done();
            });
        }
        else done();
    });

    function emitData(asdu)
    {
        node.emit("iec104:data", {
            topic: "iec104/data",
            payload: asdu,
            ts: Date.now()
        });
    }

    function emitStatus(state, reason)
    {
        node.emit("iec104:status", {
            topic: "iec104/status",
            state,
            reason,
            ts: Date.now()
        });
    }
  }
  RED.nodes.registerType("iec104-gateway", IEC104Gateway);
};
