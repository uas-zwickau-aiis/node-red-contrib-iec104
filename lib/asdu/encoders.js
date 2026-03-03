const {buildQDS} = require("./quality");

exports.singlePoint = p => {
  const qds = buildQDS(p.quality);

  let byte = (p.value ? 1 : 0);  // Bit 0

  byte |= qds;  // Bits 4–7

  return Buffer.from([byte]);
};

exports.doublePoint = p => {
  const qds = buildQDS(p.quality);

  let byte = (p.value & 0x03); 
  byte |= qds;

  return Buffer.from([byte]);
};

exports.measuredScaled = p => {
  const buf = Buffer.alloc(3);

  buf.writeInt16LE(p.value, 0);
  buf[2] = buildQDS(p.quality);

  return buf;
};

exports.measuredFloat = p => {
  const buf = Buffer.alloc(5);

  let value = Number(p.value);

  if (!Number.isFinite(value)) {
    value = 0;
  }

  buf.writeFloatLE(value, 0);
  buf[4] = buildQDS(p.quality);

  return buf;
};
