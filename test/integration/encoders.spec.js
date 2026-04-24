'use strict'
const assert = require('assert')

const { singlePoint, doublePoint, measuredScaled, measuredFloat, integratedTotals } = require("../../lib/asdu/encoders")
const { parseBCRFlags } = require('../../lib/asdu/quality')

describe('Encoders (Value + QDS/BCR)', function (){
    describe('singlePoint', () => {
        it('encodes value = true', () => {
            const buf = singlePoint({ value: true });

            assert.strictEqual(buf[0] & 0x01, 1);
        });

        it('encodes value = false', () => {
            const buf = singlePoint({ value: false });

            assert.strictEqual(buf[0] & 0x01, 0);
        });

        it('includes QDS flags', () => {
            const buf = singlePoint({
                value: true,
                quality: { invalid: true }
            });

            assert.strictEqual(buf[0] & 0x80, 0x80);
        });

    });
    describe('doublePoint', () => {

        it('encodes value (2 bits)', () => {
            const buf = doublePoint({ value: 2 });

            assert.strictEqual(buf[0] & 0x03, 2);
        });

        it('masks value to 2 bits', () => {
            const buf = doublePoint({ value: 7 });

            assert.strictEqual(buf[0] & 0x03, 3);
        });

    });
    describe('measuredScaled', () => {

        it('encodes int16 value', () => {
            const buf = measuredScaled({ value: 1234 });

            assert.strictEqual(buf.readInt16LE(0), 1234);
        });

        it('encodes negative values', () => {
            const buf = measuredScaled({ value: -1234 });

            assert.strictEqual(buf.readInt16LE(0), -1234);
        });

        it('includes QDS', () => {
            const buf = measuredScaled({
                value: 1,
                quality: { overflow: true }
            });

            assert.strictEqual(buf[2] & 0x01, 1);
        });

    });
    describe('measuredFloat', () => {

        it('encodes float value', () => {
            const buf = measuredFloat({ value: 12.5 });

            assert.strictEqual(buf.readFloatLE(0), 12.5);
        });

        it('handles NaN and Infinity', () => {
            const buf = measuredFloat({ value: NaN });

            assert.strictEqual(buf.readFloatLE(0), 0);
        });

        it('includes QDS', () => {
            const buf = measuredFloat({
                value: 1.5,
                quality: { invalid: true }
            });

            assert.strictEqual(buf[4] & 0x80, 0x80);
        });

    });
    describe('integratedTotals', () => {

        it('encodes int32 value', () => {
            const buf = integratedTotals({ value: 123456 });

            assert.strictEqual(buf.readInt32LE(0), 123456);
        });

        it('encodes negative values', () => {
            const buf = integratedTotals({ value: -123456 });

            assert.strictEqual(buf.readInt32LE(0), -123456);
        });

        it('encodes BCR flags and sequence', () => {
            const buf = integratedTotals({
                value: 1,
                quality: { invalid: true, overflow: true },
                sequence: 5
            });

            const flags = buf[4];

            assert.strictEqual(flags & 0x80, 0x80); // invalid
            assert.strictEqual(flags & 0x20, 0x20); // overflow
            assert.strictEqual(flags & 0x1F, 5);    // sequence
        });

        it('handles invalid numeric values', () => {
            const buf = integratedTotals({ value: Infinity });

            assert.strictEqual(buf.readInt32LE(0), 0);
        });
        it('roundtrip: integratedTotals flags decode correctly', () => {
            const buf = integratedTotals({
                value: 42,
                quality: { invalid: true, adjusted: true },
                sequence: 17
            });

            const decoded = parseBCRFlags(buf[4]);

            assert.deepStrictEqual(decoded, {
                invalid: true,
                adjusted: true,
                overflow: false,
                sequence: 17
            });
        });
    });
});
