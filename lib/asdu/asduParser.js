const { TYPES } = require("./types");
const decoders = require("./decoders");

function getTypeById(typeId) {
    return Object.values(TYPES).find(t => t.id === typeId);
}

function parseASDU(buf) {
    let offset = 6;

    const typeId = buf[offset++];
    const vsq = buf[offset++];

    const sq = (vsq & 0x80) !== 0;
    const num = vsq & 0x7F;

    const cot = buf[offset] | (buf[offset + 1] << 8);
    offset += 2;

    const ca = buf[offset] | (buf[offset + 1] << 8);
    offset += 2;

    const type = getTypeById(typeId);
    if (!type) return null;

    const objects = [];

    if (sq) {
        let ioa = readIOA(buf, offset);
        offset += 3;

        for (let i = 0; i < num; i++) {
            const res = decoders[type.codec](buf, offset);
            offset += res.size;

            objects.push({
                ioa: ioa + i,
                value: res.value,
                quality: res.quality
            });
        }
    } else {
        for (let i = 0; i < num; i++) {
            const ioa = readIOA(buf, offset);
            offset += 3;

            const res = decoders[type.codec](buf, offset);
            offset += res.size;

            objects.push({
                ioa,
                value: res.value,
                quality: res.quality
            });
        }
    }

    return { typeId, cot, ca, objects };
}

function readIOA(buf, offset) {
    return buf[offset] |
        (buf[offset + 1] << 8) |
        (buf[offset + 2] << 16);
}

module.exports = { parseASDU };