function isValidPoint(p) {
    return !!p &&
        typeof p.ca === "number" &&
        typeof p.ioa === "number" &&
        p.type &&
        typeof p.value !== "undefined";
}

module.exports = {isValidPoint}