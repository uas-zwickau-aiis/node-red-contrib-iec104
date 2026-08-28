const { buildASDU } = require("../asdu/asduBuilder");
const { TYPES } = require("../asdu/types");

const {
    STATE,
    FRAME,
    U,
    COT
} = require("../core/constants");

const BaseSession = require("./baseSession");

class SlaveSession extends BaseSession {
    constructor(opts = {}) {
        super(opts);

        this.onGI =
            opts.onGI ||
            (() => {});

        this.onCommand =
            opts.onCommand ||
            (() => {});

        /*
         * Wird erst aufgerufen, nachdem die
         * ASDU tatsächlich als Command
         * erkannt wurde.
         */
        this.onInboundStart =
            opts.onInboundStart ||
            (() => {});

        this.onInboundComplete =
            opts.onInboundComplete ||
            (() => {});
    }

    handleUFrame(buf) {
        const code = buf[2];

        switch (code) {
            case U.STARTDT_ACT:
                this.sendFrame(
                    this.apci.buildUFrame(
                        U.STARTDT_CON
                    ),
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
                    this.apci.buildUFrame(
                        U.TESTFR_CON
                    ),
                    FRAME.U
                );

                return;

            case U.TESTFR_CON:
                this.awaitingTestCon =
                    false;

                this.stats
                    .testFrConReceived++;

                this.publishStats(
                    true
                );

                return;

            case U.STOPDT_ACT:
                this.sendFrame(
                    this.apci.buildUFrame(
                        U.STOPDT_CON
                    ),
                    FRAME.U
                );

                this.setState(
                    STATE.CONNECTED,
                    "STOPDT_ACT empfangen"
                );

                return;

            default:
                return;
        }
    }

    async handleASDU(
        asdu,
        buf,
        benchStart = null
    ) {
        const {
            typeId,
            cot
        } = asdu;

        if (
            typeId ===
                TYPES.C_IC_NA_1.id &&
            cot === COT.ACT
        ) {
            await this
                .handleInterrogation(
                    asdu
                );

            return;
        }

        if (
            typeId ===
                TYPES.C_SC_NA_1.id &&
            cot === COT.ACT
        ) {
            await this
                .handleSingleCommand(
                    asdu,
                    benchStart
                );
        }
    }

    async handleInterrogation(
        asdu
    ) {
        const { ca } = asdu;

        if (
            !this.beginGI(ca)
        ) {
            this
                .sendInterrogationResponse(
                    COT.ACTCON,
                    ca
                );

            this
                .sendInterrogationResponse(
                    COT.ACTTERM,
                    ca
                );

            return;
        }

        this.stats.giCount++;

        this.publishStats(
            true
        );

        try {
            this
                .sendInterrogationResponse(
                    COT.ACTCON,
                    ca
                );

            await this.onGI(
                ca,
                async point => {
                    while (
                        !this.apci
                            .hasSendWindow()
                    ) {
                        if (
                            !this
                                .isDataTransferActive()
                        ) {
                            return false;
                        }

                        await new Promise(
                            resolve =>
                                setTimeout(
                                    resolve,
                                    5
                                )
                        );
                    }

                    const asdu =
                        buildASDU(
                            point,
                            COT.INROGEN
                        );

                    if (!asdu) {
                        return false;
                    }

                    this.sendIFrame(
                        asdu
                    );

                    return true;
                }
            );

            this
                .sendInterrogationResponse(
                    COT.ACTTERM,
                    ca
                );
        } finally {
            this.endGI(ca);

            this.publishStats(
                true
            );
        }
    }

    async handleSingleCommand(
        asdu,
        benchStart = null
    ) {
        /*
         * Erst hier ist bekannt, dass das
         * vollständige eingegangene Frame
         * tatsächlich einen zu messenden
         * Single Command enthält.
         */
        this.onInboundStart(
            benchStart
        );

        await this.onCommand(
            asdu
        );

        this.onInboundComplete(
            benchStart
        );
    }

    sendInterrogationResponse(
        cause,
        ca
    ) {
        const frame =
            this.apci
                .buildInterrogationFrame(
                    cause,
                    ca
                );

        this.sendFrame(
            frame,
            FRAME.I
        );

        this.afterIFrameSent();

        return true;
    }

    sendIFrame(asdu) {
        if (
            !this
                .isDataTransferActive()
        ) {
            return false;
        }

        if (
            !this.apci
                .hasSendWindow()
        ) {
            return false;
        }

        const frame =
            this.apci
                .buildIFrame(
                    asdu
                );

        this.sendFrame(
            frame,
            FRAME.I
        );

        this.afterIFrameSent();

        return true;
    }

    afterIFrameSent() {
        if (
            this.apci
                .unconfirmedCount() ===
            1
        ) {
            this.timers.startT1();
        }

        this.timers.resetT3();
    }
}

module.exports = SlaveSession;