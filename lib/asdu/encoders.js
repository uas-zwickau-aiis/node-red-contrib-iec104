exports.singlePoint = p =>
  Buffer.from([(p.value ? 1 : 0) | (p.quality ?? 0)]);

exports.doublePoint = p =>
  Buffer.from([(p.value & 0x03) | (p.quality ?? 0)]);

exports.float = p => {
  const buf = Buffer.alloc(5);
  buf.writeFloatLE(p.value, 0);
  buf[4] = p.quality ?? 0;
  return buf;
};
