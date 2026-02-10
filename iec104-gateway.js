const net = require("net");
const IEC104 = require("./lib/core/constants");
const { buildASDU } = require("./lib/asdu/asdu");
const Session = require("./lib/protocol/session")

module.exports = function(RED) {
  function IEC104Gateway(config) {
    RED.nodes.createNode(this, config);

    this.port = Number(config.port) || 2404;
    this.commonAddress = Number(config.commonAddress) || 1;
    this.bufferMode = config.bufferMode;
    this.bufferSize = config.bufferSize;

    const node = this;
    node.points = new Map();
    node.session = new Session({
        send: data => tcpWrite(data),
        onStateChange: (s,msg) => setState(s,msg),
        buildASDU: (p, cause) => buildASDU(p, cause, node.commonAddress),
        onGI: async sendPoint => {
            for (const p of node.points.values()) {
                sendPoint(p);
            }
        }
    });


    function setState(state, msg)
    {
        let color = "red";
        switch(state)
        {
            case "CONNECTED":
                color = "yellow";
                break;
            case "DATA_TRANSFER":
                color = "green";
                break;
            case "STOPPED":
                color = "blue";
                break;
            default:
                break;
        }
        node.status({ fill: color, shape: "dot", text: msg || "" });
        emitStatus(state, msg)
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
        tcpCleanup()
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
    function tcpCleanup() {
        if (!node.socket) return;

        try { 
            node.socket.destroy(); 
        } catch (e) { }
        
        node.socket = null;
        node.rxBuffer = Buffer.alloc(0);

        node.session.stop();
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
        if (typeof p.ioa !== "number") return false;
        if (!p.type) return false;
        if (typeof p.value === "undefined") return false;
        return true;
    }

    node.on("input", function (msg) {
        const p = msg.payload;

        // 2) Validierung
        if (!isValidPoint(p)) {
            node.error("Invalid IEC104 point");
            return;
        }

        // 3) Zustand aktualisieren
        node.points.set(p.ioa, p);

        // 5) Encoden & senden
        node.session.sendPoint(p, "SPONT") // hier evtl noch CYC/PERIODIC
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
        node.send([
            {
                topic: "iec104/data",
                payload: asdu,
                ts: Date.now()
            },
            null
        ]);
    }

    function emitStatus(state, msg)
    {
        node.send([
            null,
            {
                topic: "iec104/status",
                state,
                msg,
                ts: Date.now()
            }
        ]);
    }
  }
  RED.nodes.registerType("iec104-gateway", IEC104Gateway);
};
