function isValidPoint(p) {
    return !!p &&
        typeof p.ca === "number" &&
        typeof p.ioa === "number" &&
        p.type &&
        typeof p.value !== "undefined";
}

function toDate(input) {
  if (!input) return new Date();

  // Date
  if (input instanceof Date) return input;

  // UNIX Timestamp
  if (typeof input === "number") {
    return input < 1e12
      ? new Date(input * 1000)   // s
      : new Date(input);         // ms
  }

  // ISO String (local/UTC)
  if (typeof input === "string") {
    const d = new Date(input);
    if (!isNaN(d.getTime())) return d;
  }

  throw new Error("Invalid timestamp format");
}

module.exports = {isValidPoint, toDate}