const {TYPES} = require("./types");
const {TIME, encodeCP24, encodeCP56} = require("./time")
const encoders = require("./encoders");
const {COT} = require("../core/constants")

function buildASDU(p, cause) {
  const t = TYPES[p.type];
  if (!t) return null;

  const CAUSE_MAP = {
    GI: COT.ACT
  }

  const cot = CAUSE_MAP[cause] ?? COT.SPONT

  const header = Buffer.from([
    t.id,
    0x01,
    cot, 0x00,
    p.ca & 0xff, p.ca >> 8
  ]);

  const ioa = Buffer.from([
    p.ioa & 0xff,
    (p.ioa >> 8) & 0xff,
    (p.ioa >> 16) & 0xff,
  ]);

  const data = encoders[t.codec](p);
  
  var time = Buffer.alloc(0);
  switch (t.time)
  {
    case TIME.CP24:
      time = encodeCP24(p.timestamp || new Date());
      break;
    case TIME.CP56:
      time = encodeCP56(p.timestamp ||new Date());
      break;
  }

  return Buffer.concat([header, ioa, data, time]);
}

module.exports = { buildASDU };
