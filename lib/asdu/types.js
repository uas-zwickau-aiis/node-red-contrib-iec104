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
        time: false
    },
    M_DP_TA_1: {
        id: 0x04,
        encodeData: "doublePoint",
        time: TIME.CP24
    },
    M_SP_TB_1: {
        id: 0x1E,
        encodeData: "singlePoint",
        time: TIME.CP56
    }

}