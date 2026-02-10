const net = require("net");
const { buildASDU } = require("./lib/asdu/asdu")

module.exports = function(RED) {
  function IEC104Gateway(config) {
    RED.nodes.createNode(this, config);

    this.port = Number(config.port) || 2404;
    this.commonAddress = Number(config.commonAddress) || 1;
    this.bufferMode = config.bufferMode;
    this.bufferSize = config.bufferSize;

    const node = this;
    node.points = new Map();

    // ########################################### //
    //                  IEC104                     //
    // ########################################### //
    const IEC104 = {
        START: 0x68,

        U: {
            STARTDT_ACT: 0x07,
            STARTDT_CON: 0x0B,
            STOPDT_ACT: 0x13,
            STOPDT_CON: 0x23,
            TESTFR_ACT: 0x43,
            TESTFR_CON: 0x83
        },

        ASDU: {
            C_IC_NA_1: 0x64
        },

        COT: {
            CYC: 0x01,
            SPONT: 0x03,
            ACT: 0x06,
            ACTCON: 0x07,
            ACTTERM: 0x0A
        },

        QOI: {
            GLOBAL: 0x14
        }
    };

    // ================
    //  STATE
    // ================
    const STATE = {
        IDLE: "IDLE",
        CONNECTED: "CONNECTED",
        DATA_TRANSFER: "DATA_TRANSFER",
        STOPPED: "STOPPED"
    };
    node.state = STATE.IDLE;

    function setState(state, msg)
    {
        if(node.state === state) return;

        node.state = state;

        let color = "red";
        switch(node.state)
        {
            case STATE.CONNECTED:
                color = "yellow";
                break;
            case STATE.DATA_TRANSFER:
                color = "green";
                break;
            case STATE.STOPPED:
                color = "blue";
                break;
            default:
                break;
        }
        node.status({ fill: color, shape: "dot", text: msg || "" });
        emitStatus(node.state, msg)
    }

    // ================
    //  SEQUENCE
    // ================
    const SEQ_MOD = 0x8000; // 32768
    node.sendSeq = 0;
    node.recvSeq = 0;

    function incSeq(seq) {
        return (seq + 1) % SEQ_MOD;
    }

    function applySeq(buf) {

        buf[2] = (node.sendSeq << 1) & 0xFF;
        buf[3] = (node.sendSeq >> 7) & 0xFF;
        buf[4] = (node.recvSeq << 1) & 0xFF;
        buf[5] = (node.recvSeq >> 7) & 0xFF;

        node.sendSeq = incSeq(node.sendSeq);
    }

    // ================
    // FRAME BUILDERS
    // ================
    function buildUFrame(code) {
        return Buffer.from([
            IEC104.START,
            0x04,
            code,
            0x00, 0x00, 0x00
        ]);  }

    function buildIFrame(asdu) {
        const len = asdu.length + 4;
        const buf = Buffer.alloc(len + 2);

        buf[0] = IEC104.START;
        buf[1] = len;

        applySeq(buf);
        asdu.copy(buf, 6);

        return buf;
    }

    function buildInterrogationFrame(cot, asduLo, asduHi) {
        const buf = Buffer.from([
            IEC104.START, 0x0E,
            0x00, 0x00,   // N(S)
            0x00, 0x00,   // N(R)

            IEC104.ASDU.C_IC_NA_1,
            0x01,                 // VSQ
            cot, 0x00,
            asduLo, asduHi,
            0x00, 0x00, 0x00,     // IOA
            IEC104.QOI.GLOBAL
        ]);

        applySeq(buf);
        return buf;
    }
    // ================
    // RECEIVE HANDLE
    // ================
    function PARSE_IEC104(buf) {
        // --- Guards --------------------------------------------------
        if(!isIEC104(buf)) return null;

        // --- U-Frames ------------------------------------------------
        if (buf.length === 6 && buf[1] === 0x04) {
            switch (buf[2]) {
                case IEC104.U.STARTDT_ACT:
                    tcpWrite(buildUFrame(IEC104.U.STARTDT_CON));
                    setState(STATE.DATA_TRANSFER, "Datentransfer aktiv");
                    return;

                case IEC104.U.TESTFR_ACT:
                    tcpWrite(buildUFrame(IEC104.U.TESTFR_CON));
                    return;

                case IEC104.U.STOPDT_ACT:
                    tcpWrite(buildUFrame(IEC104.U.STOPDT_CON));
                    setState(STATE.STOPPED, "Datentransfer gestoppt");
                    return;

                default:
                    return null;
            }
        }

        // --- I-Frames ------------------------------------------------
        // Sequence update (RX I-Frame)
        if ((buf[2] & 0x01) === 0) {
            const scadaNS = ((buf[2] | (buf[3] << 8)) >> 1) & 0x7FFF;
            node.recvSeq = incSeq(scadaNS);
        }

        // ASDU Parsing 
        const typeId = buf[6];
        const cot = buf[8];


        // Interrogation 
        if (typeId === IEC104.ASDU.C_IC_NA_1 && cot === IEC104.COT.ACT) {
            const caLo = buf[10];
            const caHi = buf[11];

            tcpWrite(buildInterrogationFrame(IEC104.COT.ACTCON, caLo, caHi));

            for (const p of node.points.values()) {
                const frame = encodePoint(p, "GI");
                if (frame) tcpWrite(frame);
            }

            tcpWrite(buildInterrogationFrame(IEC104.COT.ACTTERM, caLo, caHi));
        }

    }

    function isIEC104(buf)
    {
        if (!Buffer.isBuffer(buf)) return false;
        if (buf.length < 6) return false;
        if (buf[0] !== IEC104.START) return false;
        if (buf[1] !== buf.length - 2) return false; 

        return true;
    }

    // ########################################### //
    //                    TCP                      //
    // ########################################### //
    node.server = net.createServer(sock => {
        node.socket = sock;

        node.sendSeq = 0;
        node.recvSeq = 0;
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
        
        setState(STATE.CONNECTED, "Verbindung angenommen");
    });

    node.server.on("error", err => {
        tcpCleanup()
    });

    node.server.listen(node.port, () => {
       setState(STATE.IDLE, `Keine Verbindung - Höre auf ${node.port}`)
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
        node.sendSeq = 0;
        node.recvSeq = 0;

        setState(STATE.IDLE, `Verbindung abgebrochen - Höre auf ${node.port}`);
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

            PARSE_IEC104(frame);
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

    function encodePoint(p, cause) {
        const asdu = buildASDU(p, cause, node.commonAddress);
        if (!asdu) {
            node.warn(`Unsupported IEC104 type: ${p.type}`);
            return null;
        }

        return buildIFrame(asdu);
    }

    node.on("input", function (msg) {

        // 1) Protokoll-Check
        if (msg._proto !== "iec104-point") {
            node.error("Unsupported proto");
            return;
        }

        const p = msg.payload;

        // 2) Validierung
        if (!isValidPoint(p)) {
            node.error("Invalid IEC104 point");
            return;
        }

        // 3) Zustand aktualisieren
        node.points.set(p.ioa, p);

        // 4) Nur senden, wenn Datentransfer aktiv
        if (node.state !== STATE.DATA_TRANSFER) {
            return;
        }

        // 5) Encoden & senden
        const frame = encodePoint(p, "SPONT");
        if (frame) {
            tcpWrite(frame);
        }
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
