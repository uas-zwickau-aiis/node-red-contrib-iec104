function buildQDS(q = {}) {
  q = q || {}
  let b = 0;

  if (q.iv) b |= 0x80;
  if (q.nt) b |= 0x40; 
  if (q.sb) b |= 0x20; 
  if (q.bl) b |= 0x10; 
  if (q.ov) b |= 0x01; 

  return b;
}

function buildBCRFlags(q = {}, seq = 0) {
  q = q || {}
  let b = 0;

  if (q.iv) b |= 0x80;
  if (q.adjusted) b |= 0x40;
  if (q.ov) b |= 0x20;

  b |= (seq & 0x1F);

  return b;
}

function parseQDS(byte = 0) {
  return {
    iv: !!(byte & 0x80),
    nt: !!(byte & 0x40),
    sb: !!(byte & 0x20),
    bl: !!(byte & 0x10),
    ov: !!(byte & 0x01)
  };
}

function parseBCRFlags(byte = 0) {
  return {
    iv: !!(byte & 0x80),
    adjusted: !!(byte & 0x40),
    ov: !!(byte & 0x20),
    sequence: byte & 0x1F
  };
}

module.exports = { buildQDS, buildBCRFlags, parseQDS, parseBCRFlags };