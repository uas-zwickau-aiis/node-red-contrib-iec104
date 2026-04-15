module.exports = Object.freeze({
        START: 0x68,

        U: {
            STARTDT_ACT: 0x07,
            STARTDT_CON: 0x0B,
            STOPDT_ACT: 0x13,
            STOPDT_CON: 0x23,
            TESTFR_ACT: 0x43,
            TESTFR_CON: 0x83
        },

        COT: {
            CYC: 0x01,
            SPONT: 0x03,
            ACT: 0x06,
            ACTCON: 0x07,
            ACTTERM: 0x0A,
            INROGEN: 0x14
        },
        CA: {
            BROADCAST: 65535
        },

        QOI: {
            GLOBAL: 0x14
        }
});
