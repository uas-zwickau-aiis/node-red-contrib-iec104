function buildQDS(q = {}) {
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

module.exports = { buildQDS, buildBCRFlags };