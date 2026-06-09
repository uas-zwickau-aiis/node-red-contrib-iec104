'use strict';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function hex(buffer) {
    return buffer.toString('hex').match(/.{1,2}/g).join(' ');
}

function bufferEquals(a, b) {
    return Buffer.compare(a, b) === 0;
}

module.exports = {
    sleep,
    hex,
    bufferEquals
};

