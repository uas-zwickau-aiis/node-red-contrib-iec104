'use strict'

const assert = require('assert')
const { buildBCRFlags, parseBCRFlags } = require("../../lib/asdu/quality")

describe('BCR Flags', function() {
    describe('Encoding', function() {

        it('returns 0 when no flags and seq = 0', () => {
            assert.strictEqual(buildBCRFlags({}, 0), 0x00);
        });

        it('sets invalid flag', () => {
            assert.strictEqual(buildBCRFlags({ invalid: true }), 0x80);
        });

        it('sets adjusted flag', () => {
            assert.strictEqual(buildBCRFlags({ adjusted: true }), 0x40);
        });

        it('sets overflow flag', () => {
            assert.strictEqual(buildBCRFlags({ overflow: true }), 0x20);
        });

        it('sets sequence number (lower 5 bits)', () => {
            assert.strictEqual(buildBCRFlags({}, 0x1F), 0x1F);
        });

        it('masks sequence to 5 bits', () => {
            // 0x3F -> 00111111 → should become 00011111 (0x1F)
            assert.strictEqual(buildBCRFlags({}, 0x3F), 0x1F);
        });

        it('combines flags and sequence', () => {
            const result = buildBCRFlags(
                { invalid: true, adjusted: true, overflow: true },
                0x1F
            );

            assert.strictEqual(result, 0xE0 | 0x1F); // 0xFF
        });

        it('combines single flag with sequence', () => {
            const result = buildBCRFlags(
                { invalid: true },
                0x01
            );

            assert.strictEqual(result, 0x80 | 0x01);
        });

        it('ignores unknown properties', () => {
            const result = buildBCRFlags(
                { invalid: true, foo: true },
                0
            );

            assert.strictEqual(result, 0x80);
        });

        it('treats non-boolean values as truthy', () => {
            const result = buildBCRFlags(
                { invalid: 1, adjusted: "yes" },
                0
            );

            assert.strictEqual(result, 0xC0);
        });

        it('handles undefined input', () => {
            assert.strictEqual(buildBCRFlags(undefined, 0), 0x00);
        });

        it('handles null input', () => {
            assert.strictEqual(buildBCRFlags(null, 0), 0x00);
        });

    });
    describe('Decoding', function() {

        it('returns all flags false and sequence 0 for 0x00', () => {
            const result = parseBCRFlags(0x00);

            assert.deepStrictEqual(result, {
                invalid: false,
                adjusted: false,
                overflow: false,
                sequence: 0
            });
        });

        it('parses invalid flag', () => {
            const result = parseBCRFlags(0x80);
            assert.strictEqual(result.invalid, true);
        });

        it('parses adjusted flag', () => {
            const result = parseBCRFlags(0x40);
            assert.strictEqual(result.adjusted, true);
        });

        it('parses overflow flag', () => {
            const result = parseBCRFlags(0x20);
            assert.strictEqual(result.overflow, true);
        });

        it('parses sequence number', () => {
            const result = parseBCRFlags(0x1F);
            assert.strictEqual(result.sequence, 0x1F);
        });

        it('parses flags and sequence together', () => {
            const result = parseBCRFlags(0xE5); // 1110 0101

            assert.deepStrictEqual(result, {
                invalid: true,
                adjusted: true,
                overflow: true,
                sequence: 0x05
            });
        });

        it('ignores unrelated bits for flags but keeps sequence', () => {
            const result = parseBCRFlags(0xFF);

            assert.deepStrictEqual(result, {
                invalid: true,
                adjusted: true,
                overflow: true,
                sequence: 0x1F
            });
        });

        it('handles undefined input', () => {
            const result = parseBCRFlags();

            assert.deepStrictEqual(result, {
                invalid: false,
                adjusted: false,
                overflow: false,
                sequence: 0
            });
        });

        it('handles null input', () => {
            const result = parseBCRFlags(null);

            assert.deepStrictEqual(result, {
                invalid: false,
                adjusted: false,
                overflow: false,
                sequence: 0
            });
        });

    });
    describe('Roundtrip (buildBCRFlags -> parseBCRFlags', function () {
        it('parse(build(x)) preserves flags and sequence', () => {
            const input = {
                invalid: true,
                adjusted: false,
                overflow: true
            };
            const seq = 17;

            const encoded = buildBCRFlags(input, seq);
            const decoded = parseBCRFlags(encoded);

            assert.deepStrictEqual(decoded, {
                invalid: true,
                adjusted: false,
                overflow: true,
                sequence: seq & 0x1F
            });
        });
    });
});