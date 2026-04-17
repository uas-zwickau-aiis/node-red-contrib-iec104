const {TYPES} = require("./types");
const {TIME, encodeCP24, encodeCP56} = require("./time")
const encoders = require("./encoders");
const {COT} = require("../core/constants")

function buildASDU(p, cause = COT.SPONT) {
  const t = TYPES[p.type];
  if (!t) return null;

  const header = Buffer.from([
    t.id,
    0x01,
    cause, 0x00,
    p.ca & 0xff, p.ca >> 8
  ]);

  const ioa = Buffer.from([
    p.ioa & 0xff,
    (p.ioa >> 8) & 0xff,
    (p.ioa >> 16) & 0xff,
  ]);

  const data = encoders[t.codec](p);
  
  var time = Buffer.alloc(0);

  const ts = p.timestamp ?? Date.now();
  switch (t.time)
  {
    case TIME.CP24:
      time = encodeCP24(ts);
      break;
    case TIME.CP56:
      time = encodeCP56(ts);
      break;
  }

  return Buffer.concat([header, ioa, data, time]);
}

module.exports = { buildASDU };
