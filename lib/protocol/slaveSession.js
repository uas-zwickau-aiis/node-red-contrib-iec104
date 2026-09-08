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


    // ==========================================
    // U-FRAMES
    // ==========================================

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

                this.timers.stopT1();

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


    // ==========================================
    // ASDU
    // ==========================================

    async handleASDU(
        asdu,
        buf,
        benchStart = null
    ) {
        const {
            typeId,
            cot
        } = asdu;

        /*
         * General Interrogation
         */
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

        /*
         * Single Command
         */
        if (
            typeId ===
                TYPES.C_SC_NA_1.id &&
            cot === COT.ACT
        ) {
            await this
                .handleSingleCommand(
                    asdu,
                    buf,
                    benchStart
                );

            return;
        }
    }


    // ==========================================
    // GENERAL INTERROGATION
    // ==========================================

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


    // ==========================================
    // SINGLE COMMAND
    // ==========================================

    async handleSingleCommand(
        asdu,
        buf,
        benchStart = null
    ) {
        /*
         * Start der gemessenen internen
         * Verarbeitung.
         */
        this.onInboundStart(
            benchStart
        );

        await this.onCommand(
            asdu
        );

        /*
         * Ende der gemessenen Verarbeitung.
         *
         * Die IEC-104-Protokollantworten
         * liegen bewusst außerhalb der
         * gemessenen Verarbeitungslatenz.
         */
        this.onInboundComplete(
            benchStart
        );

        /*
         * Vor ACTCON sicherstellen, dass
         * im APCI-Sendefenster Platz ist.
         */
        if (
            !await this
                .waitForSendWindow()
        ) {
            return false;
        }

        if (
            !this
                .sendSingleCommandResponse(
                    buf,
                    COT.ACTCON
                )
        ) {
            return false;
        }

        /*
         * ACTCON belegt selbst einen Platz
         * im Sendefenster. Deshalb vor
         * ACTTERM erneut prüfen.
         */
        if (
            !await this
                .waitForSendWindow()
        ) {
            return false;
        }

        if (
            !this
                .sendSingleCommandResponse(
                    buf,
                    COT.ACTTERM
                )
        ) {
            return false;
        }

        return true;
    }


    // ==========================================
    // SEND WINDOW
    // ==========================================

    async waitForSendWindow() {
        while (
            !this.apci
                .hasSendWindow()
        ) {
            /*
             * Verbindung wurde während des
             * Wartens beendet.
             */
            if (
                !this
                    .isDataTransferActive()
            ) {
                return false;
            }

            /*
             * Kurzes asynchrones Warten.
             *
             * Dadurch bleibt der Event-Loop frei,
             * sodass eingehende ACKs verarbeitet
             * werden können.
             */
            await new Promise(
                resolve =>
                    setTimeout(
                        resolve,
                        1
                    )
            );
        }

        return true;
    }


    // ==========================================
    // SINGLE COMMAND RESPONSE
    // ==========================================

    sendSingleCommandResponse(
        requestFrame,
        cause
    ) {
        if (
            !Buffer.isBuffer(
                requestFrame
            ) ||
            requestFrame.length < 13
        ) {
            return false;
        }

        /*
         * Die ursprüngliche Command-ASDU
         * wird übernommen.
         */
        const responseAsdu =
            Buffer.from(
                requestFrame.subarray(6)
            );

        /*
         * COT anpassen:
         *
         * Bit 7: Test-Bit beibehalten
         * Bit 6: Negative-Bit = 0
         * Bit 0..5: neue COT
         */
        responseAsdu[2] =
            (
                responseAsdu[2] &
                0x80
            ) |
            (
                cause &
                0x3f
            );

        return this.sendIFrame(
            responseAsdu
        );
    }


    // ==========================================
    // INTERROGATION RESPONSE
    // ==========================================

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


    // ==========================================
    // I-FRAME SEND
    // ==========================================

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