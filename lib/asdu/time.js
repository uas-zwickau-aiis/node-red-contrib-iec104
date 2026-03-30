const TIME = {
    NONE: 0,
    CP24: 1,
    CP56: 2
}

function encodeCP56(date = new Date()) {
  const buf = Buffer.alloc(7);

  const ms = (date.getSeconds() * 1000 + date.getMilliseconds()) % 60000;
  buf.writeUInt16LE(ms, 0);

  buf[2] = date.getMinutes() & 0x3F;
  buf[3] = date.getHours() & 0x1F;

  const day = date.getDate();
  let dow = date.getDay();
  if (dow === 0) dow = 7;

  buf[4] = (day & 0x1F) | ((dow & 0x07) << 5);
  buf[5] = (date.getMonth() + 1) & 0x0F;
  buf[6] = (date.getFullYear() - 2000) & 0x7F;

  return buf;
}

function encodeCP24(date = new Date()) {
  const buf = Buffer.alloc(3);

  const ms = date.getMilliseconds() + date.getSeconds() * 1000;
  buf.writeUInt16LE(ms, 0);

  buf[2] = date.getMinutes() & 0x3F;

  return buf;
}

module.exports = {
  TIME,
  encodeCP24,
  encodeCP56
};