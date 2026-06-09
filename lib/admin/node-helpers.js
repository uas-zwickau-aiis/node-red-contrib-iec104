function parseBoolConfig(v, fallback = "msg") {
  return String(v ?? fallback);
}

function resolveQualityBit(mode, incomingValue) {
  if (mode === "true") return true;
  if (mode === "false") return false;
  return !!incomingValue;
}

function normalizeIoa(value) {
  if (!Array.isArray(value) || value.length !== 3) return null;

  const bytes = value.map(Number);

  if (!bytes.every(b => Number.isInteger(b) && b >= 0 && b <= 255)) {
    return null;
  }

  return (bytes[0] << 16) | (bytes[1] << 8) | bytes[2];
}

function configuredIoa(config) {
  return (Number(config.ioa0) << 16) |
         (Number(config.ioa1) << 8) |
          Number(config.ioa2);
}

function resolveIoa(config, msg) {
  const fromMsg = config.ioaFromMsg === true || config.ioaFromMsg === "true";
  return fromMsg ? normalizeIoa(msg.ioa) : configuredIoa(config);
}

function buildQuality(msg, modes, keys) {
  const incoming = msg.qds && typeof msg.qds === "object" ? msg.qds : {};

  return Object.fromEntries(
    keys.map(key => [key, resolveQualityBit(modes[key], incoming[key])])
  );
}

function applyTimestamp(payload, typeMeta, TIME, tsSource, msg) {
  if (typeMeta?.time !== TIME.NONE) {
    payload.ts = tsSource === "msg" && msg.ts != null
      ? msg.ts
      : new Date().toISOString();
  }
}

function parseNumberMaybe(v) {
  if (typeof v === "number" && Number.isFinite(v)) return v;

  if (typeof v === "string") {
    const s = v.trim().replace(",", ".");
    if (s === "") return null;

    const n = Number(s);
    return Number.isFinite(n) ? n : null;
  }

  return null;
}

function normalizeDpi(value) {
  if (typeof value === "string") {
    const s = value.trim();
    if (s === "") return null;
    value = Number(s);
  }

  if (!Number.isInteger(value)) return null;
  return value >= 0 && value <= 3 ? value : null;
}

module.exports = {
  parseBoolConfig,
  resolveIoa,
  buildQuality,
  applyTimestamp,
  parseNumberMaybe,
  normalizeDpi
};