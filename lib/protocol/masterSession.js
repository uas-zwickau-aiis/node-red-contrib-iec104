const { TYPES } = require("../asdu/types");

const {
    STATE,
    FRAME,
    U,
    COT,
    CA
} = require("../core/constants");

const BaseSession = require("./baseSession");

class MasterSession extends BaseSession {
    constructor(opts = {}) {
        super(opts);

        this.onASDU = opts.onASDU || (() => {});
        this.onPoint = opts.onPoint || (() => {});
        this.onGIStart = opts.onGIStart || (() => {});
        this.onGIEnd = opts.onGIEnd || (() => {});
        this.onInboundStart = opts.onInboundStart || (() => {});
        this.onInboundComplete = opts.onInboundComplete || (() => {});

        this.awaitingStartCon = false;
    }

    start() {
        super.start();

        this.awaitingStartCon = true;

        this.sendFrame(
            this.apci.buildUFrame(U.STARTDT_ACT),
            FRAME.U
        );

        this.timers.startT1();
    }

    handleT1Timeout() {
        if (this.awaitingStartCon) {
            this.awaitingStartCon = false;
            this.stop("STARTDT Timeout");
            return;
        }

        super.handleT1Timeout();
    }

    sendStopDt() {
        if (this.state === STATE.IDLE) {
            return false;
        }

        this.sendFrame(
            this.apci.buildUFrame(U.STOPDT_ACT),
            FRAME.U
        );

        this.setState(
            STATE.STOPPING,
            "STOPDT_ACT gesendet"
        );

        return true;
    }

    sendInterrogation(ca = CA.BROADCAST) {
        if (!this.isDataTransferActive()) {
            return false;
        }

        if (!this.apci.hasSendWindow()) {
            return false;
        }

        if (!this.beginGI(ca)) {
            return false;
        }

        this.stats.giCount++;

        const frame = this.apci.buildInterrogationFrame(
            COT.ACT,
            ca
        );

        this.sendFrame(
            frame,
            FRAME.I
        );

        this.afterIFrameSent();

        this.onGIStart(ca);
        this.publishStats(true);

        return true;
    }

    finishInterrogation(ca) {
        if (this.isGIActive(ca)) {
            this.endGI(ca);
            return;
        }

        if (this.isGIActive(CA.BROADCAST)) {
            this.endGI(CA.BROADCAST);
        }
    }

    handleUFrame(buf) {
        const code = buf[2];

        switch (code) {

            case U.STARTDT_CON:
                this.awaitingStartCon = false;

                this.timers.stopT1();

                this.setState(
                    STATE.DATA_TRANSFER,
                    "STARTDT_CON empfangen"
                );

                this.timers.startT3();

                this.flushSendQueue();
                return;

            case U.STARTDT_ACT:

                this.sendFrame(
                    this.apci.buildUFrame(U.STARTDT_CON),
                    FRAME.U
                );

                this.setState(
                    STATE.DATA_TRANSFER,
                    "STARTDT_ACT empfangen"
                );

                this.timers.startT3();

                this.flushSendQueue();

                return;

            case U.TESTFR_ACT:

                this.sendFrame(
                    this.apci.buildUFrame(U.TESTFR_CON),
                    FRAME.U
                );

                return;

            case U.TESTFR_CON:

                this.awaitingTestCon = false;
                this.timers.stopT1();

                this.stats.testFrConReceived++;

                this.publishStats(true);

                return;

            case U.STOPDT_ACT:

                this.sendFrame(
                    this.apci.buildUFrame(U.STOPDT_CON),
                    FRAME.U
                );

                this.setState(
                    STATE.CONNECTED,
                    "STOPDT_ACT empfangen"
                );

                return;

            case U.STOPDT_CON:

                this.setState(
                    STATE.CONNECTED,
                    "STOPDT_CON empfangen"
                );

                return;

            default:
                return;
        }
    }

    async handleASDU(asdu, buf, benchStart = null) {
        this.onASDU(asdu, buf);

        const {
            typeId,
            cot,
            ca,
            objects
        } = asdu;

        if (
            typeId === TYPES.C_IC_NA_1.id &&
            cot === COT.ACTCON
        ) {
            this.stats.giActConReceived++;

            this.publishStats(true);
            return;
        }

        if (
            typeId === TYPES.C_IC_NA_1.id &&
            cot === COT.ACTTERM
        ) {
            this.stats.giActTermReceived++;

            this.finishInterrogation(ca);
            this.onGIEnd(ca);

            this.publishStats(true);
            return;
        }

        if (!objects?.length) {
            return;
        }

        // Steuer-ASDUs werden nicht als eingehende Prozessmeldungen gewertet.
        if (
            typeId === TYPES.C_IC_NA_1.id ||
            typeId === TYPES.C_SC_NA_1.id
        ) {
            return;
        }

        /*
         * Benchmark INBOUND REPORT
         *
         * benchStart wird bereits beim vollständigen APDU-Eingang erzeugt.
         * Gezählt wird die ASDU als logische Verarbeitungseinheit:
         * einmal beim Eintritt in die eigentliche Point-Verarbeitung und
         * einmal nach vollständiger Verarbeitung aller enthaltenen Objekte.
         */
        this.onInboundStart(benchStart);

        for (const object of objects) {
            this.stats.pointsReceived++;

            this.onPoint({
                typeId,
                cot,
                ca,
                ...object
            });
        }

        this.onInboundComplete(benchStart);

        this.publishStats();
    }

    afterIFrameSent() {
        if (this.apci.unconfirmedCount() === 1) {
            this.timers.startT1();
        }

        this.timers.resetT3();
    }

    stop(reason) {
        this.awaitingStartCon = false;

        super.stop(reason);
    }

    resetStats() {
        super.resetStats();

        Object.assign(this.stats, {
            giActConReceived: 0,
            giActTermReceived: 0,
            pointsReceived: 0
        });
    }
}

module.exports = MasterSession;