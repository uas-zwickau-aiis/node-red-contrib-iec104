const { parseQDS, parseBCRFlags } = require("./quality");

/////////////////////////////////////////
//      MONITORING INFORMATION
/////////////////////////////////////////

exports.singlePoint = (buf, offset) => {
  const byte = buf[offset];

  return {
    value: byte & 0x01,
    qds: parseQDS(byte & 0xF0),
    size: 1
  };
};

exports.doublePoint = (buf, offset) => {
  const byte = buf[offset];

  return {
    value: byte & 0x03,
    qds: parseQDS(byte & 0xF0),
    size: 1
  };
};

exports.measuredScaled = (buf, offset) => {
    return {
        value: buf.readInt16LE(offset),
        qds: parseQDS(buf[offset + 2]),
        size: 3
    };
};

exports.measuredFloat = (buf, offset) => {
    return {
        value: buf.readFloatLE(offset),
        qds: parseQDS(buf[offset + 4]),
        size: 5
    };
};

exports.integratedTotals = (buf, offset) => {
    const bcr = buf[offset + 4];

    const flags = parseBCRFlags(bcr);

    return {
        value: buf.readInt32LE(offset),

        qds: {
            invalid: flags.iv,
            adjusted: flags.adjusted,
            overflow: flags.ov
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
        qds: null,
        size: 1
    };
};


/////////////////////////////////////////
//          COMMANDS
/////////////////////////////////////////

exports.singleCommand = (buf, offset) => {
    const byte = buf[offset];

    return {
        value: (byte & 0x01) !== 0,

        qualifier: (byte >> 2) & 0x1f,

        select: (byte & 0x80) !== 0,

        qds: null,

        size: 1
    };
};