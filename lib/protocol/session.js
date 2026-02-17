const { buildASDU } = require("../asdu/asdu");
const IEC104 = require("../core/constants");
const APCI = require("./apci");

class Session {
    constructor(opts = {}) {
        this.apci = new APCI();

        this.state = "IDLE";

        this.ca = opts.ca;
        this.send = opts.send || (() => {});
        this.onStateChange = opts.onStateChange ||(() => {});
        this.onGI = opts.onGI || (() => {});
    }

    setState(s, msg) {
        if (this.state === s) return;
        this.state = s;
        this.onStateChange(s, msg);
    }

    start() {
        this.setState("CONNECTED", "Verbindung aufgebaut");
    }

    stop() {
        this.setState("IDLE", "Keine Verbindung");
        this.apci.reset?.();
    }

    canSendData() {
        return this.state === "DATA_TRANSFER"
    }

   async handleFrame(buf) {
        if(!Buffer.isBuffer(buf)) return;
        if(buf.length < 6) return;

        if(buf[0] !== IEC104.START ) return;
        if(buf[1] !== buf.length -2) return

        // --- U-Frames ------------------------------------------------
        if(this.apci.isUFrame(buf)) {
            const code = buf[2];

            switch (code) {
                case IEC104.U.STARTDT_ACT:
                    this.send(this.apci.buildUFrame(IEC104.U.STARTDT_CON));
                    this.setState("DATA_TRANSFER", "Datentransfer aktiv");
                    return;
                case IEC104.U.TESTFR_ACT:
                    this.send(this.apci.buildUFrame(IEC104.U.TESTFR_CON));
                    return;
                case IEC104.U.STOPDT_ACT:
                    this.send(this.apci.buildUFrame(IEC104.U.STOPDT_CON));
                    this.setState("STOPPED", "Datentransfer gestoppt");
                    return;

                default:
                    return;
            }
        }

        // --- I-Frames ------------------------------------------------
        if(this.apci.isIFrame(buf)){
            const ca = buf[10] | (buf[11] << 8);

            if (ca !== this.ca && ca !== 65535)
                return;

            this.apci.updateRecvFromFrame(buf);
        }

        const typeId = buf[6];
        const cot = buf[8];
        const caLo = buf[10];
        const caHi = buf[11];

        if(typeId === IEC104.ASDU.C_IC_NA_1 && cot === IEC104.COT.ACT) {

            this.send(this.apci.buildInterrogationFrame(IEC104.COT.ACTCON, caLo, caHi));
            await this.onGI(p => {
                const asdu = buildASDU(p, "GI", this.ca);
                this.send(this.apci.buildIFrame(asdu));
            });
            this.send(this.apci.buildInterrogationFrame(IEC104.COT.ACTTERM, caLo, caHi));
        }
    }


    sendPoint(p, cause = "SPONT") {
        if (!this.canSendData()) return;

        const asdu = this.buildASDU(p, cause, this.ca);
        if (!asdu) return;

        this.send(this.apci.buildIFrame(asdu));
    }

}

module.exports = Session;
