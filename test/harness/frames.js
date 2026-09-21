'use strict';

// U-frames
const STARTDT_ACT = Buffer.from([0x68, 0x04, 0x07, 0x00, 0x00, 0x00]);
const STARTDT_CON = Buffer.from([0x68, 0x04, 0x0b, 0x00, 0x00, 0x00]);
const STOPDT_ACT  = Buffer.from([0x68, 0x04, 0x13, 0x00, 0x00, 0x00]);
const STOPDT_CON  = Buffer.from([0x68, 0x04, 0x23, 0x00, 0x00, 0x00]);
const TESTFR_ACT  = Buffer.from([0x68, 0x04, 0x43, 0x00, 0x00, 0x00]);
const TESTFR_CON  = Buffer.from([0x68, 0x04, 0x83, 0x00, 0x00, 0x00]);

/*
 * I-frame builder with N(S)=0, N(R)=0.
 * The supplied ASDU is appended after the four APCI control bytes.
 */
function iFrame(asdu) {
    const control = Buffer.from([0x00, 0x00, 0x00, 0x00]);
    const len = control.length + asdu.length;

    if (len > 255) throw new Error('APDU too large');

    return Buffer.concat([
        Buffer.from([0x68, len]),
        control,
        asdu
    ]);
}

/*
 * Generic ASDU header:
 * typeId | VSQ | COT (LE) | CA (LE)
 */
function asduHeader({
    typeId,
    num = 1,
    sq = false,
    cot = 3,
    ca = 1
}) {
    return Buffer.from([
        typeId,
        (sq ? 0x80 : 0x00) | (num & 0x7f),
        cot & 0xff,
        (cot >> 8) & 0xff,
        ca & 0xff,
        (ca >> 8) & 0xff
    ]);
}

function ioa(value = 1) {
    return Buffer.from([
        value & 0xff,
        (value >> 8) & 0xff,
        (value >> 16) & 0xff
    ]);
}

/*
 * Deliberately unknown Type-ID. The exact value can be overridden if 0xff
 * becomes part of TYPES in the future.
 */
function unknownTypeFrame(typeId = 0xff) {
    const asdu = Buffer.concat([
        asduHeader({ typeId, num: 0 })
    ]);
    return iFrame(asdu);
}

/*
 * A syntactically truncated ASDU. The Type-ID must be one whose decoder
 * requires more bytes than supplied. The default type ID is configurable
 * because TYPES was not part of the uploaded source set.
 *
 * We announce one information object and provide only its IOA, but no value.
 * For a decoder using Buffer.readInt16LE/readFloatLE this should raise or be
 * rejected by the implementation.
 */
function truncatedKnownTypeFrame(typeId) {
    if (!Number.isInteger(typeId)) {
        throw new Error('A known Type-ID must be supplied');
    }

    const asdu = Buffer.concat([
        asduHeader({ typeId, num: 1 }),
        ioa(1)
        // value bytes intentionally missing
    ]);

    return iFrame(asdu);
}

/*
 * Known but session-unsupported ASDU.
 * Caller supplies a Type-ID that exists in TYPES but is not handled by the
 * concrete SlaveSession. The frame itself contains one object with a one-byte
 * value; use this only with a type whose decoder expects one byte.
 */
function unsupportedKnownOneByteTypeFrame(typeId, cot = 3) {
    if (!Number.isInteger(typeId)) {
        throw new Error('A known Type-ID must be supplied');
    }

    const asdu = Buffer.concat([
        asduHeader({ typeId, num: 1, cot }),
        ioa(1),
        Buffer.from([0x00])
    ]);

    return iFrame(asdu);
}

module.exports = {
    STARTDT_ACT,
    STARTDT_CON,
    STOPDT_ACT,
    STOPDT_CON,
    TESTFR_ACT,
    TESTFR_CON,
    iFrame,
    asduHeader,
    ioa,
    unknownTypeFrame,
    truncatedKnownTypeFrame,
    unsupportedKnownOneByteTypeFrame
};
