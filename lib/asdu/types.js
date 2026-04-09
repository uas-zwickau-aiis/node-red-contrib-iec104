const {TIME} = require("./time")

module.exports.TYPES = {
    M_SP_NA_1: {
        id: 0x01,
        codec: "singlePoint",
        time: TIME.NONE
    },
    M_SP_TA_1: {
        id: 0x02,
        codec: "singlePoint",
        time: TIME.CP24
    },
    M_DP_NA_1: {
        id: 0x03,
        codec: "doublePoint",
        time: TIME.NONE
    },
    M_DP_TA_1: {
        id: 0x04,
        codec: "doublePoint",
        time: TIME.CP24
    },
    M_ME_NB_1: {
        id: 0x0B,
        codec: "measuredScaled",
        time: TIME.NONE
    },
    M_ME_NC_1: {
        id: 0x0D,
        codec: "measuredFloat",
        time: TIME.NONE
    },
    M_IT_NA_1: {
        id: 0x0F,
        codec: "integratedTotals",
        time: TIME.NONE
    },
    M_IT_TA_1: {
        id: 0x10,
        codec: "integratedTotals",
        time: TIME.CP24
    },
    M_SP_TB_1: {
        id: 0x1E,
        codec: "singlePoint",
        time: TIME.CP56
    },
    M_DP_TB_1: {
        id: 0x1F,
        codec: "doublePoint",
        time: TIME.CP56
    },
    M_ME_TE_1: {
        id: 0x23,
        codec: "measuredScaled",
        time: TIME.CP56
    },
    M_ME_TF_1: {
        id: 0x24,
        codec: "measuredFloat",
        time: TIME.CP56
    },
    M_IT_TB_1: {
        id: 0x25,
        codec: "integratedTotals",
        time: TIME.CP56
    }

}