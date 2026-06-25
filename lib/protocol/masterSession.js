const { parseASDU } = require("../asdu/asduParser");
const { TYPES } = require("../asdu/types");
const IEC104 = require("../core/constants");
const APCI = require("./apci");
const Timers = require("./timers");

class Session {
    constructor(opts = {}) {
        this.apci = new APCI({
            k: opts.k,
            w: opts.w
        });

        this.send = opts.send || (() => {});
        this.onStateChange = opts.onStateChange || (() => {});
        this.onStatus = opts.onStatus || (() => {});
        this.onSessionSummary = opts.onSessionSummary || (() => {});
        this.onConnectionLost = opts.onConnectionLost || (() => {});

        // Master-spezifisch
        this.onASDU = opts.onASDU || (() => {});
        this.onPoint = opts.onPoint || (() => {});
        this.onGIStart = opts.onGIStart || (() => {});
        this.onGIEnd = opts.onGIEnd || (() => {});

        this.awaitingTestCon = false;
        this.awaitingStartCon = false;
        this.giInProgress = new Set();
        this._lastStatusPublish = 0;

        this.timers = new Timers({
            t1: opts.t1,
            t3: opts.t3,
            onT1: () => this.handleT1Timeout(),
            onT3: () => this.handleT3Timeout()
        });

        this.resetStats();

        this.setState("IDLE", "Nicht verbunden");
    }

    setState(s, msg) {
        if (this.state === s) return;
        this.state = s;
        this.onStateChange(s, msg);
    }

    start() {
        this.stats.connectionStartedAt = Date.now();

        this.setState("CONNECTED", "Verbindung aufgebaut");

        this.awaitingStartCon = true;

        this.sendU(
            this.apci.buildUFrame(IEC104.U.STARTDT_ACT),
            "STARTDT_ACT gesendet"
        );

        this.timers.startT1();
    }

    stop(reason) {
        if (this.state === "IDLE") return;

        const summary = this.getStatus();

        this.onSessionSummary({
            reason: reason || "",
            stoppedAt: Date.now(),
            state: this.state,
            ...summary
        });

        this.timers.stopT1();
        this.timers.stopT3();

        this.apci.reset();
        this.resetStats();

        this.awaitingTestCon = false;
        this.awaitingStartCon = false;
        this.giInProgress.clear();

        this.setState("IDLE", reason);
        this.publishStatus("Session reset", true);
    }

    canSendData() {
        return this.state === "DATA_TRANSFER";
    }

    async handleFrame(buf) {
        if (!Buffer.isBuffer(buf)) return;
        if (buf.length < 6) return;
        if (buf[0] !== IEC104.START) return;
        if (buf[1] !== buf.length - 2) return;

        this.stats.lastRxAt = Date.now();

        if (this.apci.isIFrame(buf)) {
            this.stats.iRx++;
            this.stats.lastFrameType = "I-RX";
        } else if (this.apci.isSFrame(buf)) {
            this.stats.sRx++;
            this.stats.lastFrameType = "S-RX";
        } else if (this.apci.isUFrame(buf)) {
            this.stats.uRx++;
            this.stats.lastFrameType = "U-RX";
        }

        this.timers.resetT3();

        // ---------------- U-Frames ----------------
        if (this.apci.isUFrame(buf)) {
            const code = buf[2];

            switch (code) {
                case IEC104.U.STARTDT_CON:
                    this.awaitingStartCon = false;
                    this.timers.stopT1();
                    this.setState("DATA_TRANSFER", "STARTDT_CON empfangen");
                    this.timers.startT3();
                    return;

                case IEC104.U.STARTDT_ACT:
                    this.sendU(
                        this.apci.buildUFrame(IEC104.U.STARTDT_CON),
                        "STARTDT_CON gesendet"
                    );
                    this.setState("DATA_TRANSFER", "STARTDT_ACT empfangen");
                    this.timers.startT3();
                    return;

                case IEC104.U.TESTFR_ACT:
                    this.sendU(
                        this.apci.buildUFrame(IEC104.U.TESTFR_CON),
                        "TESTFR_CON gesendet"
                    );
                    return;

                case IEC104.U.TESTFR_CON:
                    this.awaitingTestCon = false;
                    this.stats.testFrConReceived++;
                    this.publishStatus("TESTFR_CON empfangen", true);
                    return;

                case IEC104.U.STOPDT_ACT:
                    this.sendU(
                        this.apci.buildUFrame(IEC104.U.STOPDT_CON),
                        "STOPDT_CON gesendet"
                    );
                    this.setState("STOPPED", "STOPDT_ACT empfangen");
                    return;

                case IEC104.U.STOPDT_CON:
                    this.setState("STOPPED", "STOPDT_CON empfangen");
                    return;

                default:
                    return;
            }
        }

        // ---------------- S-Frames ----------------
        else if (this.apci.isSFrame(buf)) {
            const oldAck = this.apci.ackSeq;

            this.apci.updateRecvFromFrame(buf);
            this.publishStatus("Frame empfangen");

            if (this.apci.ackSeq !== oldAck) {
                if (this.apci.unconfirmedCount() === 0) {
                    this.timers.stopT1();
                } else {
                    this.timers.resetT1();
                }
            }

            return;
        }

        // ---------------- I-Frames ----------------
        if (!this.apci.isIFrame(buf)) return;

        const oldAck = this.apci.ackSeq;

        this.apci.updateRecvFromFrame(buf);
        this.publishStatus("Frame empfangen");

        if (this.apci.shouldSendAck()) {
            this.sendS(this.apci.buildSFrame(), "S-Frame ACK gesendet");
        }

        if (this.apci.ackSeq !== oldAck) {
            if (this.apci.unconfirmedCount() === 0) {
                this.timers.stopT1();
            } else {
                this.timers.resetT1();
            }
        }

        // ---------------- ASDU Verarbeitung ----------------
        const asdu = parseASDU(buf);
        const { typeId, cot, ca, objects } = asdu;

        this.onASDU(asdu, buf);

        if (typeId === TYPES.C_IC_NA_1.id) {
            if (cot === IEC104.COT.ACTCON) {
                this.stats.giActConReceived++;
                this.publishStatus("GI ACTCON empfangen", true);
                return;
            }

            if (cot === IEC104.COT.ACTTERM) {
                this.stats.giActTermReceived++;
                this.giInProgress.delete(ca);
                this.onGIEnd(ca);
                this.publishStatus("GI ACTTERM empfangen", true);
                return;
            }
        }

        if (objects && objects.length) {
            for (const obj of objects) {
                this.stats.pointsReceived++;

                this.onPoint({
                    typeId,
                    cot,
                    ca,
                    ...obj
                });
            }
        }
    }

    sendInterrogation(ca = IEC104.CA.BROADCAST) {
        if (!this.canSendData()) return false;
        if (!this.apci.canSend()) return false;

        if (this.giInProgress.has(ca)) return false;

        this.giInProgress.add(ca);
        this.stats.giCount++;

        const frame = this.apci.buildInterrogationFrame(
            IEC104.COT.ACT,
            ca
        );

        this.sendI(frame, "GI ACT gesendet");
        this.onGIStart(ca);

        if (this.apci.unconfirmedCount() === 1) {
            this.timers.startT1();
        }

        this.timers.resetT3();

        return true;
    }

    sendStopDt() {
        if (this.state === "IDLE") return false;

        this.sendU(
            this.apci.buildUFrame(IEC104.U.STOPDT_ACT),
            "STOPDT_ACT gesendet"
        );

        this.setState("STOPPING", "STOPDT_ACT gesendet");
        return true;
    }

    handleT3Timeout() {
        if (this.awaitingTestCon) {
            this.stats.t3Timeouts++;
            this.onConnectionLost("t3 timeout");
            return;
        }

        this.awaitingTestCon = true;
        this.stats.testFrActSent++;

        this.sendU(
            this.apci.buildUFrame(IEC104.U.TESTFR_ACT),
            "TESTFR_ACT gesendet"
        );
    }

    handleT1Timeout() {
        this.stats.t1Timeouts++;

        if (this.awaitingStartCon) {
            this.onConnectionLost("startdt timeout");
            return;
        }

        this.onConnectionLost("t1 timeout");
    }

    // -------- SEND HELPERS --------
    sendI(frame, reason = "I-Frame gesendet") {
        this.stats.iTx++;
        this.stats.lastTxAt = Date.now();
        this.stats.lastFrameType = "I-TX";

        this.send(frame);
        this.publishStatus(reason);
    }

    sendS(frame, reason = "S-Frame gesendet") {
        this.stats.sTx++;
        this.stats.lastTxAt = Date.now();
        this.stats.lastFrameType = "S-TX";

        this.send(frame);
        this.publishStatus(reason);
    }

    sendU(frame, reason = "U-Frame gesendet") {
        this.stats.uTx++;
        this.stats.lastTxAt = Date.now();
        this.stats.lastFrameType = "U-TX";

        this.send(frame);
        this.publishStatus(reason);
    }

    // -------- PUBLIC STATUS --------
    getStatus() {
        return {
            apci: this.apci.getStatus(),
            stats: this.stats,
            timers: {
                awaitingTestCon: this.awaitingTestCon,
                awaitingStartCon: this.awaitingStartCon
            },
            gi: {
                active: this.giInProgress.size > 0,
                cas: Array.from(this.giInProgress).map(ca =>
                    ca === IEC104.CA.BROADCAST ? "BROADCAST" : ca
                )
            }
        };
    }

    publishStatus(reason, force = false) {
        const now = Date.now();

        if (!force && this._lastStatusPublish && now - this._lastStatusPublish < 250) {
            return;
        }

        this._lastStatusPublish = now;
        this.onStatus?.(this.state, reason);
    }

    resetStats() {
        this.stats = {
            iTx: 0,
            iRx: 0,
            sTx: 0,
            sRx: 0,
            uTx: 0,
            uRx: 0,

            giCount: 0,
            giActConReceived: 0,
            giActTermReceived: 0,

            pointsReceived: 0,

            testFrActSent: 0,
            testFrConReceived: 0,

            t1Timeouts: 0,
            t3Timeouts: 0,

            connectionStartedAt: null,
            lastRxAt: null,
            lastTxAt: null,
            lastFrameType: null
        };
    }
}

module.exports = Session;