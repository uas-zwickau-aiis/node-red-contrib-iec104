const { parseQDS, parseBCRFlags } = require("./quality");

exports.singlePoint = (buf, offset) => {
    const byte = buf[offset];

    return {
        value: byte & 0x01,
        quality: parseQDS(byte),
        size: 1
    };
};

exports.doublePoint = (buf, offset) => {
    const byte = buf[offset];

    return {
        value: byte & 0x03,
        quality: parseQDS(byte),
        size: 1
    };
};

exports.measuredScaled = (buf, offset) => {
    return {
        value: buf.readInt16LE(offset),
        quality: parseQDS(buf[offset + 2]),
        size: 3
    };
};

exports.measuredFloat = (buf, offset) => {
    return {
        value: buf.readFloatLE(offset),
        quality: parseQDS(buf[offset + 4]),
        size: 5
    };
};

exports.integratedTotals = (buf, offset) => {
    const bcr = buf[offset + 4];

    const flags = parseBCRFlags(bcr);

    return {
        value: buf.readInt32LE(offset),

        quality: {
            invalid: flags.invalid,
            adjusted: flags.adjusted,
            overflow: flags.overflow
        },

        sequence: flags.sequence,

        size: 5
    };
};

exports.interrogation = (buf, offset) => {
    return {
        value: {
            qoi: buf[offset]
        },
        quality: null,
        size: 1
    };
};