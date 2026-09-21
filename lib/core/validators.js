const { START } = require("./constants");

function isValidPoint(p) {
  return Boolean(
    p &&
    typeof p.ca === "number" &&
    typeof p.ioa === "number" &&
    typeof p.type === "string" &&
    p.type.length > 0 &&
    typeof p.value !== "undefined"
  );
}

function isValidFrame(buf) {
    return Buffer.isBuffer(buf)
    && buf.length >=6 
    && buf[0] === START
    && buf[1] === buf.length - 2;
}

function toDate(input) {
  if (input == null) return new Date();

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

module.exports = {isValidPoint, isValidFrame, toDate}