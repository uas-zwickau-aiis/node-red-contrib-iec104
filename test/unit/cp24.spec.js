'use strict'

const assert = require('assert')
const { encodeCP24 } = require('../../lib/asdu/time')

describe('CP24Time2a Encoding', function() {

    it('encodes milliseconds and minutes correctly', () => {
        const date = new Date('2024-01-01T00:05:10.250Z');

        const buf = encodeCP24(date);

        const expectedMs = 10 * 1000 + 250;

        assert.strictEqual(buf.readUInt16LE(0), expectedMs);
        assert.strictEqual(buf[2], 5);
    });

    it('handles max millisecond value within minute', () => {
        const date = new Date('2024-01-01T00:00:59.999Z');

        const buf = encodeCP24(date);

        assert.strictEqual(buf.readUInt16LE(0), 59999);
    });

    it('accepts different input formats', () => {
        assert.strictEqual(encodeCP24(1700000000).length, 3);
        assert.strictEqual(encodeCP24(1700000000000).length, 3);
        assert.strictEqual(encodeCP24('2024-01-01T00:00:00Z').length, 3);
    });

    it('defaults to current date when input is undefined', () => {
        const buf = encodeCP24();

        assert.strictEqual(buf.length, 3);
    });

    it('throws on invalid input', () => {
        assert.throws(() => encodeCP24("invalid"));
    });

});