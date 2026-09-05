'use strict';

function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
}

function hex(buffer) {
    return Buffer.from(buffer).toString('hex').match(/.{1,2}/g)?.join(' ') || '';
}

async function waitFor(predicate, {
    timeout = 1000,
    interval = 10,
    message = 'Condition not reached'
} = {}) {
    const start = Date.now();

    while (Date.now() - start < timeout) {
        if (await predicate()) return;
        await sleep(interval);
    }

    throw new Error(`${message} within ${timeout} ms`);
}

module.exports = { sleep, hex, waitFor };
