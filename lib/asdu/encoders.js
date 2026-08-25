const {buildQDS, buildBCRFlags} = require("./quality");

/////////////////////////////////////////
//      MONITORING INFORMATION
/////////////////////////////////////////

exports.singlePoint = p => {
  const quality = buildQDS(p.quality);

  const spi = p.value ? 0x01 : 0x00;
  const siq = spi | (quality & 0xF0);

  return Buffer.from([siq]);
};

exports.doublePoint = p => {
  const quality = buildQDS(p.quality);

  const dpi = p.value & 0x03;
  const diq = dpi | (quality & 0xF0);

  return Buffer.from([diq]);
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

exports.integratedTotals = p => {
  const buf = Buffer.alloc(5);

  let value = Number(p.value);

  if (!Number.isFinite(value)) {
    value = 0;
  }

  // BCR = 32 Bit signed
  buf.writeInt32LE(value, 0);

  buf[4] = buildBCRFlags(p.quality, p.sequence);

  return buf;
};

/////////////////////////////////////////
//          COMMANDS
/////////////////////////////////////////

exports.singleCommand = p => {
  /*
   * SCO — Single Command Object
   *
   * Bit 0:     SCS (Single Command State)
   * Bit 1:     reserviert
   * Bits 2–6:  QU  (Qualifier of Command)
   * Bit 7:     S/E (Select/Execute)
   */

  const value = p.value ? 1 : 0;
  const qualifier = p.qualifier ?? 0;
  const select = p.select ?? false;

  if (!Number.isInteger(qualifier) || qualifier < 0 || qualifier > 31) {
    throw new RangeError(
      `Invalid single-command qualifier: ${qualifier}`
    );
  }

  let sco = value;                         // Bit 0
  sco |= (qualifier & 0x1f) << 2;         // Bits 2–6

  if (select) {
    sco |= 0x80;                           // Bit 7
  }

  return Buffer.from([sco]);
};