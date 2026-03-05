const {TIME} = require("./time")

module.exports.TYPES = {
    M_SP_NA_1: {
        id: 0x01,
        encodeData: "singlePoint",
        time: TIME.NONE
    },
    M_SP_TA_1: {
        id: 0x02,
        encodeData: "singlePoint",
        time: TIME.CP24
    },
    M_DP_NA_1: {
        id: 0x03,
        encodeData: "doublePoint",
        time: TIME.NONE
    },
    M_DP_TA_1: {
        id: 0x04,
        encodeData: "doublePoint",
        time: TIME.CP24
    },
    M_ME_NB_1: {
        id: 0x0B,
        encodeData: "measuredScaled",
        time: TIME.NONE
    },
    M_SP_TB_1: {
        id: 0x1E,
        encodeData: "singlePoint",
        time: TIME.CP56
    },
    M_DP_TB_1: {
        id: 0x1F,
        encodeData: "doublePoint",
        time: TIME.CP56
    },
    M_ME_TE_1: {
        id: 0x23,
        encodeData: "measuredScaled",
        time: TIME.CP56
    },
    M_ME_TF_1: {
        id: 0x24,
        encodeData: "measuredFloat",
        time: TIME.CP56
    }

}