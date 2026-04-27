'use strict'

const assert = require('assert')
const { encodeCP56 } = require('../../lib/asdu/time')

describe('CP56Time2a Encoding', function() {

    it('encodes a known date correctly', () => {
        // Must be tested with local date
        const date = new Date('2024-01-02T03:04:05.678');

        const buf = encodeCP56(date);

        // ms = seconds * 1000 + ms
        const expectedMs = 5 * 1000 + 678;

        assert.strictEqual(buf.readUInt16LE(0), expectedMs);
        assert.strictEqual(buf[2], 4);  // minutes
        assert.strictEqual(buf[3], 3);  // hours

        // day + day of week
        const day = 2;
        const dow = 2; // Tuesday (ISO: Mon=1)

        assert.strictEqual(buf[4], (day & 0x1F) | (dow << 5));

        assert.strictEqual(buf[5], 1);  // January
        assert.strictEqual(buf[6], 24); // year offset (2024 - 2000)
    });

    it('encodes Sunday as 7 (IEC format)', () => {
        const date = new Date('2024-01-07T00:00:00Z'); // Sunday

        const buf = encodeCP56(date);

        const dow = buf[4] >> 5;

        assert.strictEqual(dow, 7);
    });

    it('wraps milliseconds within one minute', () => {
        const date = new Date('2024-01-01T00:00:59.999Z');

        const buf = encodeCP56(date);

        const ms = buf.readUInt16LE(0);

        assert.strictEqual(ms, 59999);
    });

    it('accepts unix timestamp (seconds)', () => {
        const ts = 1700000000; // seconds

        const buf = encodeCP56(ts);

        assert.strictEqual(buf.length, 7);
    });

    it('accepts unix timestamp (milliseconds)', () => {
        const ts = 1700000000000; // ms

        const buf = encodeCP56(ts);

        assert.strictEqual(buf.length, 7);
    });

    it('accepts ISO string', () => {
        const buf = encodeCP56('2024-01-01T00:00:00Z');

        assert.strictEqual(buf.length, 7);
    });

    it('defaults to current date when input is undefined', () => {
        const before = Date.now();

        const buf = encodeCP56();

        const after = Date.now();

        const ms = buf.readUInt16LE(0);

        assert.ok(ms >= 0 && ms < 60000);
        assert.strictEqual(buf.length, 7);
    });

    it('throws on invalid input', () => {
        assert.throws(() => encodeCP56("not-a-date"));
    });

});