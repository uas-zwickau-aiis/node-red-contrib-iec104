const { buildASDU } = require("../asdu/asduBuilder");
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
        this.sendQueue = [];
        this.onStateChange = opts.onStateChange || (() => {});
        this.onStatus = opts.onStatus || (() => {});
        this.onSessionSummary = opts.onSessionSummary || (() => {});
        this.onGI = opts.onGI || (() => {});
        this.onConnectionLost = opts.onConnectionLost || (() => {});

        this.awaitingTestCon = false; // Prüfvariable für T1
        this.giInProgress = new Set(); // Schutz vor doppeltem GI
        this.onStats = opts.onStats || (() => {});
        this._lastStatsPublish = 0;

        this.timers = new Timers({
            t1: opts.t1,
            t3: opts.t3,
            onT1: () => this.handleT1Timeout(),
            onT3: () => this.handleT3Timeout()
        });

        this.resetStats();

        this.setState("IDLE", "Warte auf Verbindungen");
    }

    setState(s, msg) {
        if (this.state === s) return;

        this.state = s;
        this.onStateChange(s, msg);
    }

    publishStats(force = false) {
        const now = Date.now();

        if (!force && this._lastStatsPublish && now - this._lastStatsPublish < 250) {
            return;
        }

        this._lastStatsPublish = now;
        this.onStats?.(this.getStatus());
    }

    start() {
        this.stats.connectionStartedAt = Date.now();
        this.setState("CONNECTED", "Verbindung aufgebaut");
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
        this.sendQueue = [];
        this.awaitingTestCon = false;
        this.giInProgress.clear();

        this.setState("IDLE", reason);
        this.publishStats(true);
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

        // Jede Aktivität resetet t3
        this.timers.resetT3();

        // ---------------- U-Frames ----------------
        if (this.apci.isUFrame(buf)) {
            const code = buf[2];

            switch (code) {
                case IEC104.U.STARTDT_ACT:
                    this.sendU(this.apci.buildUFrame(IEC104.U.STARTDT_CON));
                    this.setState("DATA_TRANSFER", "STARTDT_ACT empfangen");
                    this.timers.startT3();
                    this.flushSendQueue();
                    return;

                case IEC104.U.TESTFR_ACT:
                    this.sendU(this.apci.buildUFrame(IEC104.U.TESTFR_CON));
                    return;

                case IEC104.U.TESTFR_CON:
                    this.awaitingTestCon = false;
                    this.stats.testFrConReceived++;
                    this.publishStats(true);
                    return;

                case IEC104.U.STOPDT_ACT:
                    this.sendU(this.apci.buildUFrame(IEC104.U.STOPDT_CON));
                    this.setState("STOPPED", "STOPDT_ACT empfangen");
                    return;

                default:
                    return;
            }
        }

        // ---------------- S-Frames ----------------
        else if (this.apci.isSFrame(buf)) {

            const oldAck = this.apci.ackSeq;
            this.apci.updateRecvFromFrame(buf);
            this.publishStats();

            if (this.apci.ackSeq !== oldAck) {
                if (this.apci.unconfirmedCount() === 0) {
                    this.timers.stopT1();
                } else {
                    this.timers.resetT1();
                }
                this.flushSendQueue();
            }

            return;
        }

        // ---------------- I-Frames ----------------
        if (!this.apci.isIFrame(buf)) return;

        const oldAck = this.apci.ackSeq;
        this.apci.updateRecvFromFrame(buf);
        this.publishStats();

        if (this.apci.shouldSendAck()) {
            this.sendS(this.apci.buildSFrame());
        }

        // t1 stoppen wenn alles bestätigt
        if (this.apci.ackSeq !== oldAck) {
            if (this.apci.unconfirmedCount() === 0) {
                this.timers.stopT1();
            } else {
                this.timers.resetT1();
            }
            this.flushSendQueue();
        }

        // ---------------- ASDU Verarbeitung ----------------
        const { typeId, cot, ca, objects} = parseASDU(buf);

        if (typeId === TYPES.C_IC_NA_1.id && cot === IEC104.COT.ACT) {

            if (this.giInProgress.has(ca)) {

                this.sendI(this.apci.buildInterrogationFrame(
                    IEC104.COT.ACTCON, ca
                ));

                this.sendI(this.apci.buildInterrogationFrame(
                    IEC104.COT.ACTTERM, ca
                ));

                return;
            }
           
            this.giInProgress.add(ca);
            this.stats.giCount++;
            this.publishStats(true);

            this.sendI(this.apci.buildInterrogationFrame(
                IEC104.COT.ACTCON, ca
            ));

            try {
                await this.onGI(ca, async (p) => {
                    
                    while (!this.apci.canSend()) {
                        if (!this.canSendData()) return;
                        await new Promise(r => setTimeout(r, 5));
                    }
                    const asdu = buildASDU(p, IEC104.COT.INROGEN);
                    const frame = this.apci.buildIFrame(asdu);
                    this.sendI(frame);

                    if (this.apci.unconfirmedCount() === 1) {
                        this.timers.startT1();
                    }
                });
            } finally {
                this.giInProgress.delete(ca);
                this.publishStats(true);
            }

            this.sendI(this.apci.buildInterrogationFrame(
                IEC104.COT.ACTTERM, ca
            ));
        }
    }

    sendPoint(p, cause) {
        const asdu = buildASDU(p, cause);
        if (!asdu) return false;

        this.sendQueue.push({
            asdu
        });

        this.flushSendQueue();

        return true;
    }

    flushSendQueue() {
    if (!this.canSendData()) return;

    while (this.sendQueue.length > 0 && this.apci.canSend()) {
        const item = this.sendQueue.shift();

        const frame = this.apci.buildIFrame(item.asdu);

        this.sendI(frame);

        if (this.apci.unconfirmedCount() === 1) {
            this.timers.startT1();
        }

        this.timers.resetT3();

        this.stats.spontaneousSent++;
    }
}

    handleT3Timeout() {
        if (this.awaitingTestCon) {
            this.stats.t3Timeouts++;
            this.onConnectionLost("t3 timeout");
            return;
        }

        this.awaitingTestCon = true;
        this.stats.testFrActSent++;
        this.sendU(this.apci.buildUFrame(IEC104.U.TESTFR_ACT));
    }

    handleT1Timeout() {
        this.stats.t1Timeouts++;
        this.onConnectionLost("t1 timeout");
    }

    // -------- SEND HELPERS --------
    sendI(frame) {
        this.stats.iTx++;
        this.stats.lastTxAt = Date.now();
        this.stats.lastFrameType = "I-TX";

        this.send(frame);
        this.publishStats();
    }

    sendS(frame) {
        this.stats.sTx++;
        this.stats.lastTxAt = Date.now();
        this.stats.lastFrameType = "S-TX";

        this.send(frame);
        this.publishStats();
    }

    sendU(frame) {
        this.stats.uTx++;
        this.stats.lastTxAt = Date.now();
        this.stats.lastFrameType = "U-TX";

        this.send(frame);
        this.publishStats();
    }


    // -------- PUBLIC STATUS --------
    getStatus() {
        return {
            apci: this.apci.getStatus(),
            stats: this.stats,
            timers: {
                awaitingTestCon: this.awaitingTestCon
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
            spontaneousSent: 0,

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