const { STATE, CA, FRAME, U } = require("../core/constants");
const { buildASDU } = require("../asdu/asduBuilder");
const { parseASDU } = require("../asdu/asduParser");
const {isValidFrame} = require("../core/validators")
const APCI = require("./apci");
const Timers = require("./timers");

class BaseSession {
    constructor(opts = {}) {
        this.apci = new APCI({ k: opts.k, w: opts.w});

        this.send = opts.send || (() => {});
        this.sendQueue = [];

        // Callbacks for diagnostics
        this.onStateChange = opts.onStateChange || (() => {});
        this.onStats = opts.onStats || (()=> {});
        this.onSessionStop = opts.onSessionStop || (() => {});

        this.awaitingTestCon = false;
        this.lastStatsPublish = 0;
        this.activeInterrogations = new Set();

        this.timers = new Timers({
            t1: opts.t1,
            t2: opts.t2,
            t3: opts.t3,
            onT1: () => this.handleT1Timeout(),
            onT2: () => this.handleT2Timeout(),
            onT3: () => this.handleT3Timeout()
        });

        this.resetStats();
        this.setState(STATE.IDLE, "tcp.socket.init");

    }

    setState(state, reason) {
        if(this.state === state) return;

        this.state = state;
        this.onStateChange(state, reason);
    }

    isDataTransferActive() { return this.state === STATE.DATA_TRANSFER; }

    start() {
        this.stats.connectionStartedAt = Date.now();
        this.setState(STATE.CONNECTED, "Verbindung aufgebaut");
    }

    stop(reason) {
        if (this.state === STATE.IDLE) return;

        const summary = this.bundleStatistics();

        this.onSessionStop({
            reason: reason || "",
            stoppedAt: Date.now(),
            state: this.state,
            ...summary
        });

        this.timers.stopT1();
        this.timers.stopT2();
        this.timers.stopT3();

        this.apci.reset();
        this.resetStats();
        this.sendQueue.length = 0;
        this.awaitingTestCon = false;
        this.activeInterrogations.clear();

        this.setState(STATE.IDLE, reason);
        this.publishStats(true);
    }


    processRemoteAck(buf) {
        const previousAck = this.apci.ackSeq;

        this.apci.updateRecvFromFrame(buf);

        if (this.apci.ackSeq === previousAck) {
            return false;
        }

        if (this.apci.unconfirmedCount() === 0) {
            this.timers.stopT1();
        } else {
            this.timers.resetT1();
        }

        this.flushSendQueue();

        return true;
    }

    async handleFrame(buf) {
        if (!isValidFrame(buf)) {
            return false;
        }

        this.recordReceivedFrame(buf);
        this.timers.resetT3();

        if (this.apci.isUFrame(buf)) {
            await this.handleUFrame(buf);
            return true;
        }

        if (this.apci.isSFrame(buf)) {
            this.handleSFrame(buf);
            return true;
        }

        if (this.apci.isIFrame(buf)) {
            await this.handleIFrame(buf);
            return true;
        }

        return false;
    }

    handleSFrame(buf) {
        this.processRemoteAck(buf);
        this.publishStats();
    }

    handleUFrame() {
        throw new Error(
            `${this.constructor.name} must implement handleUFrame()`
        );
    }

    handleIFrame(buf) {
        this.processRemoteAck(buf);
        this.publishStats();

        if (this.apci.shouldSendAck()) {
            this.sendFrame(
                this.apci.buildSFrame(),
                FRAME.S
            );
        } else {
            this.timers.startT2();
        }

        const asdu = parseASDU(buf);
        return this.handleASDU(asdu, buf);
    }

    handleASDU() {
        throw new Error(
            `${this.constructor.name} must implement handleASDU()`
        );
    }

    handleT1Timeout() {
        this.stop("T1 Timeout");
    }

    handleT2Timeout() {
        if (!this.isDataTransferActive()) return;

        this.sendFrame(
            this.apci.buildSFrame(),
            FRAME.S
        );
    }

    handleT3Timeout() {
        if (this.awaitingTestCon) {
            this.stop("T3 Timeout");
            return;
        }

        this.awaitingTestCon = true;
        this.stats.testFrActSent++;
        this.sendFrame(
            this.apci.buildUFrame(U.TESTFR_ACT),
            FRAME.U
        )
    }

    sendFrame(frame, type) {
        if (type === FRAME.I || type === FRAME.S) {
            this.apci.ackSent();
            this.timers.stopT2();
        }

        const statKey = `${type.toLowerCase()}Tx`;

        this.stats[statKey]++;
        this.stats.lastTxAt = Date.now();
        this.stats.lastFrameType = `${type}-TX`;

        this.send(frame);
        this.publishStats();
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
        if (!this.isDataTransferActive()) return;

        while (this.sendQueue.length > 0 && this.apci.hasSendWindow()) {
            const item = this.sendQueue[0];

            this.sendFrame(
                this.apci.buildIFrame(item.asdu), 
                FRAME.I
            );
            this.sendQueue.shift();

            if (this.apci.unconfirmedCount() === 1) {
                this.timers.startT1();
            }

            this.timers.resetT3();

        }
    }



    publishStats(force = false) {
        const now = Date.now();

        if (!force && this.lastStatsPublish && now - this.lastStatsPublish < 250) {
            return;
        }

        this.lastStatsPublish = now;
        this.onStats?.(this.bundleStatistics());
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

            testFrActSent: 0,
            testFrConReceived: 0,

            connectionStartedAt: null,
            lastRxAt: null,
            lastTxAt: null,
            lastFrameType: null
        };
    }

    recordReceivedFrame(buf) {
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
    }

    bundleStatistics() {
        return {
            apci: this.apci.getStatus(),
            stats: this.stats,
            timers : {
                awaitingTestCon: this.awaitingTestCon
            },
            gi: {
                active: this.activeInterrogations.size > 0,
                cas: Array.from(this.activeInterrogations).map(ca => 
                     ca === CA.BROADCAST ? "BROADCAST" : ca
                )
            }
        };
    }


    isGIActive(ca) { return this.activeInterrogations.has(ca); }
    beginGI(ca) { 
        if (this.activeInterrogations.has(ca)) return false;
        
        this.activeInterrogations.add(ca);
        return true;
    }
    endGI(ca) { this.activeInterrogations.delete(ca); }


}

module.exports = BaseSession;