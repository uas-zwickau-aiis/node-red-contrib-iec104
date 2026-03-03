function buildQDS(q = {}) {
  let b = 0;

  if (q.invalid)     b |= 0x80; // IV
  if (q.notTopical)  b |= 0x40; // NT
  if (q.substituted) b |= 0x20; // SB
  if (q.blocked)     b |= 0x10; // BL
  if (q.overflow)    b |= 0x01; // OV 

  return b;
}

module.exports = { buildQDS };