const { STATE, CA, FRAME, U } = require("../core/constants");
const { buildASDU } = require("../asdu/asduBuilder");
const { parseASDU } = require("../asdu/asduParser");
const { isValidFrame } = require("../core/validators");
const APCI = require("./apci");
const Timers = require("./timers");

class BaseSession {
    constructor(opts = {}) {
        this.apci = new APCI({ k: opts.k, w: opts.w });

        this.send = opts.send || (() => {});
        this.sendQueue = [];

        // Callbacks
        this.onStateChange = opts.onStateChange || (() => {});
        this.onStats = opts.onStats || (() => {});
        this.onSessionStop = opts.onSessionStop || (() => {});
        this.onInboundComplete = opts.onInboundComplete || (() => {});

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

    // ==========================================
    // State
    // ==========================================

    setState(state, reason) {
        if (this.state === state) return;

        this.state = state;
        this.onStateChange(state, reason);
    }

    isDataTransferActive() {
        return this.state === STATE.DATA_TRANSFER;
    }

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

    // ==========================================
    // ACK Processing
    // ==========================================

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

    // ==========================================
    // Frame Handling
    // ==========================================

    async handleFrame(buf, benchStart = null) {
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
            return await this.handleIFrame(buf, benchStart);
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

    async handleIFrame(buf, benchStart = null) {
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

        if (!asdu) {
            return false;
        }

        const handled = await this.handleASDU(
            asdu,
            buf,
            benchStart
        );

        return handled !== false;
    }
    
    handleASDU() {
        throw new Error(
            `${this.constructor.name} must implement handleASDU()`
        );
    }

    // ==========================================
    // Timers
    // ==========================================

    handleT1Timeout() {
        if (this.awaitingTestCon) {
            this.awaitingTestCon = false;
            this.stop("TESTFR Timeout");
            return;
        }

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
        this.awaitingTestCon = true;
        this.stats.testFrActSent++;

        this.sendFrame(
            this.apci.buildUFrame(U.TESTFR_ACT),
            FRAME.U
        );

        this.timers.startT1();
    }

    // ==========================================
    // Sending
    // ==========================================

    sendFrame(frame, type, benchStart = null, msg = null) {
        if (type === FRAME.I || type === FRAME.S) {
            this.apci.ackSent();
            this.timers.stopT2();
        }

        const statKey = `${type.toLowerCase()}Tx`;

        this.stats[statKey]++;
        this.stats.lastTxAt = Date.now();
        this.stats.lastFrameType = `${type}-TX`;

        this.send(frame, benchStart, msg);
        this.publishStats();
    }

    sendPoint(p, cause, benchStart = null, msg = null) {
        const asdu = buildASDU(p, cause);

        if (!asdu) {
            return false;
        }

        /*
         * benchStart bleibt beim Queue-Eintrag.
         * Damit enthält Outbound auch die Wartezeit
         * aufgrund eines vollen k-Fensters.
         */
        this.sendQueue.push({
            asdu,
            benchStart,
            msg
        });

        this.flushSendQueue();

        return true;
    }

    flushSendQueue() {
        if (!this.isDataTransferActive()) return;

        while (
            this.sendQueue.length > 0 &&
            this.apci.hasSendWindow()
        ) {
            const item = this.sendQueue[0];
            const frame = this.apci.buildIFrame(item.asdu);

            this.sendFrame(
                frame,
                FRAME.I,
                item.benchStart,
                item.msg
            );

            this.sendQueue.shift();

            if (this.apci.unconfirmedCount() === 1) {
                this.timers.startT1();
            }

            this.timers.resetT3();
        }
    }

    // ==========================================
    // Statistics
    // ==========================================

    publishStats(force = false) {
        const now = Date.now();

        if (
            !force &&
            this.lastStatsPublish &&
            now - this.lastStatsPublish < 250
        ) {
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

            timers: {
                awaitingTestCon: this.awaitingTestCon
            },

            gi: {
                active: this.activeInterrogations.size > 0,
                cas: Array
                    .from(this.activeInterrogations)
                    .map(ca =>
                        ca === CA.BROADCAST
                            ? "BROADCAST"
                            : ca
                    )
            }
        };
    }

    // ==========================================
    // GI
    // ==========================================

    isGIActive(ca) {
        return this.activeInterrogations.has(ca);
    }

    beginGI(ca) {
        if (this.activeInterrogations.has(ca)) {
            return false;
        }

        this.activeInterrogations.add(ca);
        return true;
    }

    endGI(ca) {
        this.activeInterrogations.delete(ca);
    }

    // ==========================================
    // Benchmark
    // ==========================================

    getOutboundBacklogStatus() {
        return {
            queueLength:
                this.sendQueue.length,

            unconfirmedCount:
                this.apci.unconfirmedCount()
        };
    }
}

module.exports = BaseSession;