const { buildASDU } = require("../asdu/asdu");
const IEC104 = require("../core/constants");
const APCI = require("./apci");
const Timers = require("./timers");

class Session {
    constructor(opts = {}) {
        this.apci = new APCI();

        this.send = opts.send || (() => {});
        this.onStateChange = opts.onStateChange || (() => {});
        this.onGI = opts.onGI || (() => {});
        this.onConnectionLost = opts.onConnectionLost || (() => {});

        this.awaitingTestCon = false; // Prüfvariable für T1
        this.giInProgress = new Set(); // Schutz vor doppeltem GI

        this.setState("IDLE", "Warte auf Verbindungen");

        this.timers = new Timers({
            t1: opts.t1,
            t3: opts.t3,
            onT1: () => this.handleT1Timeout(),
            onT3: () => this.handleT3Timeout()
        });
    }

    setState(s, msg) {
        if (this.state === s) return;
        this.state = s;
        this.onStateChange(s, msg);
    }

    start() {
        this.setState("CONNECTED", "Verbindung aufgebaut");
    }

    stop(reason) {
        this.setState("IDLE", reason);
        this.timers.stopT1();
        this.timers.stopT3();
        this.apci.reset();
        this.awaitingTestCon = false;
    }

    canSendData() {
        return this.state === "DATA_TRANSFER";
    }

    async handleFrame(buf) {
        if (!Buffer.isBuffer(buf)) return;
        if (buf.length < 6) return;
        if (buf[0] !== IEC104.START) return;
        if (buf[1] !== buf.length - 2) return;

        // Jede Aktivität resetet t3
        this.timers.resetT3();

        // ---------------- U-Frames ----------------
        if (this.apci.isUFrame(buf)) {
            const code = buf[2];

            switch (code) {
                case IEC104.U.STARTDT_ACT:
                    this.send(this.apci.buildUFrame(IEC104.U.STARTDT_CON));
                    this.setState("DATA_TRANSFER", "STARTDT_ACT empfangen");
                    this.timers.startT3();
                    return;

                case IEC104.U.TESTFR_ACT:
                    this.send(this.apci.buildUFrame(IEC104.U.TESTFR_CON));
                    return;

                case IEC104.U.TESTFR_CON:
                    this.awaitingTestCon = false;
                    return;

                case IEC104.U.STOPDT_ACT:
                    this.send(this.apci.buildUFrame(IEC104.U.STOPDT_CON));
                    this.setState("STOPPED", "STOPDT_ACT empfangen");
                    return;

                default:
                    return;
            }
        }

        // ---------------- I-Frames ----------------
        if (this.apci.isIFrame(buf)) {

            this.apci.updateRecvFromFrame(buf);

            // t1 stoppen wenn alles bestätigt
            if (this.apci.unconfirmedCount() === 0) {
                this.timers.stopT1();
            }
        }

        // ---------------- S-Frames ----------------
        else if (this.apci.isSFrame(buf)) {

            this.apci.updateRecvFromFrame(buf);

            if (this.apci.unconfirmedCount() === 0) {
                this.timers.stopT1();
            }

            return;
        }

        // ---------------- ASDU Verarbeitung ----------------
        const typeId = buf[6];
        const cot = buf[8];
        const caLo = buf[10];
        const caHi = buf[11];
        const ca = caLo | (caHi << 8);

        if (typeId === IEC104.ASDU.C_IC_NA_1 && cot === IEC104.COT.ACT) {

            if (this.giInProgress.has(ca)) {

                this.send(this.apci.buildInterrogationFrame(
                    IEC104.COT.ACTCON, caLo, caHi
                ));

                this.send(this.apci.buildInterrogationFrame(
                    IEC104.COT.ACTTERM, caLo, caHi
                ));

                return;
            }
           
            this.giInProgress.add(ca);

            this.send(this.apci.buildInterrogationFrame(
                IEC104.COT.ACTCON,
                caLo,
                caHi
            ));

            try {
                await this.onGI(ca, (p) => {
                    const asdu = buildASDU(p, "GI");
                    const frame = this.apci.buildIFrame(asdu);

                    this.send(frame);

                    if (this.apci.unconfirmedCount() === 1) {
                        this.timers.startT1();
                    }
                });
            } finally {
                this.giInProgress.delete(ca);
            }

            this.send(this.apci.buildInterrogationFrame(
                IEC104.COT.ACTTERM,
                caLo,
                caHi
            ));
        }
    }

    sendPoint(p, cause = "SPONT") {
        if (!this.canSendData()) return;

        const asdu = buildASDU(p, cause);
        if (!asdu) return;

        const frame = this.apci.buildIFrame(asdu);
        this.send(frame);

        // t1 nur starten wenn erstes unbestätigtes Frame
        if (this.apci.unconfirmedCount() === 1) {
            this.timers.startT1();
        }

        this.timers.resetT3();
    }

    handleT3Timeout() {
        if (this.awaitingTestCon) {
            this.onConnectionLost("t3 timeout");
            return;
        }

        this.awaitingTestCon = true;
        this.send(this.apci.buildUFrame(IEC104.U.TESTFR_ACT));
    }

    handleT1Timeout() {
        this.onConnectionLost("t1 timeout");
    }
}

module.exports = Session;