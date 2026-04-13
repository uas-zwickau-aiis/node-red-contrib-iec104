function buildQDS(q = {}) {
  q = q || {}
  let b = 0;

  if (q.invalid)     b |= 0x80;
  if (q.notTopical)  b |= 0x40; 
  if (q.substituted) b |= 0x20; 
  if (q.blocked)     b |= 0x10; 
  if (q.overflow)    b |= 0x01; 

  return b;
}

function buildBCRFlags(q = {}, seq = 0) {
  let b = 0;

  if (q.invalid)  b |= 0x80;
  if (q.adjusted) b |= 0x40;
  if (q.overflow) b |= 0x20;

  b |= (seq & 0x1F);

  return b;
}

function parseQDS(byte = 0) {
  return {
    invalid:     !!(byte & 0x80),
    notTopical:  !!(byte & 0x40),
    substituted: !!(byte & 0x20),
    blocked:     !!(byte & 0x10),
    overflow:    !!(byte & 0x01)
  };
}

function parseBCRFlags(byte = 0) {
  return {
    invalid:  !!(byte & 0x80),
    adjusted: !!(byte & 0x40),
    overflow: !!(byte & 0x20),
    sequence: byte & 0x1F
  };
}

module.exports = { buildQDS, buildBCRFlags, parseQDS, parseBCRFlags };