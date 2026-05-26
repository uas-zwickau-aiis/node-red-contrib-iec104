'use strict'

const assert = require('assert')
const fc = require('fast-check')
const {buildQDS, parseQDS} = require("../../lib/asdu/quality")

describe('Quality Defaults', function() {
    describe('buildQDS', function() {
        it('returns 0 when no flags set', () => {
            assert.strictEqual(buildQDS({}), 0x00);
        });
        it('sets iv flag', () => {
            assert.strictEqual(buildQDS({ iv: true }), 0x80);
        });
        it('sets nt flag', () => {
            assert.strictEqual(buildQDS({ nt: true }), 0x40);
        });

        it('sets sb flag', () => {
            assert.strictEqual(buildQDS({ sb: true }), 0x20);
        });

        it('sets bl flag', () => {
            assert.strictEqual(buildQDS({ bl: true }), 0x10);
        });

        it('sets ov flag', () => {
            assert.strictEqual(buildQDS({ ov: true }), 0x01);
        });
        it('sets all flags', () => {
            const result = buildQDS({
                iv: true,
                nt: true,
                sb: true,
                bl: true,
                ov: true
            });

            assert.strictEqual(result, 0xF1);
        });
        it('combines highest and lowest bit', () => {
            const result = buildQDS({
                iv: true,
                ov: true
            });

            assert.strictEqual(result, 0x81);
        });
        it('ignores unknown properties', () => {
            const result = buildQDS({
                iv: true,
                foo: true
            });

            assert.strictEqual(result, 0x80);
        });
        it('treats non-boolean values as truthy', () => {
            const result = buildQDS({ iv: 1 });

            assert.strictEqual(result, 0x80);
        });
        it('handles undefined input', () => {
            assert.strictEqual(buildQDS(), 0x00);
        });

        it('handles null input', () => {
            assert.strictEqual(buildQDS(null), 0x00);
        });
    });
    describe('parseQDS', function() {
        it('returns all flags false for 0x00', () => {
            const result = parseQDS(0x00);

            assert.deepStrictEqual(result, {
                iv: false,
                nt: false,
                sb: false,
                bl: false,
                ov: false
            });
        });

        it('parses iv flag', () => {
            const result = parseQDS(0x80);

            assert.strictEqual(result.iv, true);
        });

        it('parses nt flag', () => {
            const result = parseQDS(0x40);

            assert.strictEqual(result.nt, true);
        });

        it('parses sb flag', () => {
            const result = parseQDS(0x20);

            assert.strictEqual(result.sb, true);
        });

        it('parses bl flag', () => {
            const result = parseQDS(0x10);

            assert.strictEqual(result.bl, true);
        });

        it('parses ov flag', () => {
            const result = parseQDS(0x01);

            assert.strictEqual(result.ov, true);
        });

        it('parses all flags set', () => {
            const result = parseQDS(0xF1);

            assert.deepStrictEqual(result, {
                iv: true,
                nt: true,
                sb: true,
                bl: true,
                ov: true
            });
        });

        it('parses combination of highest and lowest bit', () => {
            const result = parseQDS(0x81);

            assert.deepStrictEqual(result, {
                iv: true,
                nt: false,
                sb: false,
                bl: false,
                ov: true
            });
        });

        it('ignores unrelated bits (e.g. middle unused bits)', () => {
            const result = parseQDS(0x0E);

            assert.deepStrictEqual(result, {
                iv: false,
                nt: false,
                sb: false,
                bl: false,
                ov: false
            });
        });

        it('handles undefined input', () => {
            const result = parseQDS();

            assert.deepStrictEqual(result, {
                iv: false,
                nt: false,
                sb: false,
                bl: false,
                ov: false
            });
        });

        it('handles null input', () => {
            const result = parseQDS(null);

            assert.deepStrictEqual(result, {
                iv: false,
                nt: false,
                sb: false,
                bl: false,
                ov: false
            });
        });
    });
    describe('Roundtrip (buildQDS -> parseQDS)', function() {

        it('roundtrips empty object', () => {
            const input = {};
            const encoded = buildQDS(input);
            const decoded = parseQDS(encoded);

            assert.deepStrictEqual(decoded, {
                iv: false,
                nt: false,
                sb: false,
                bl: false,
                ov: false
            });
        });

        it('roundtrips single flags', () => {
            const flags = ['iv', 'nt', 'sb', 'bl', 'ov'];

            flags.forEach(flag => {
                const input = { [flag]: true };

                const encoded = buildQDS(input);
                const decoded = parseQDS(encoded);

                assert.strictEqual(decoded[flag], true);

                // alle anderen müssen false sein
                Object.keys(decoded).forEach(k => {
                    if (k !== flag) {
                        assert.strictEqual(decoded[k], false);
                    }
                });
            });
        });

        it('roundtrips all flags', () => {
            const input = {
                iv: true,
                nt: true,
                sb: true,
                bl: true,
                ov: true
            };

            const encoded = buildQDS(input);
            const decoded = parseQDS(encoded);

            assert.deepStrictEqual(decoded, input);
        });

        it('roundtrips mixed combinations', () => {
            const cases = [
                { iv: true, ov: true },
                { nt: true, bl: true },
                { sb: true, ov: true },
                { iv: true, sb: true, bl: true }
            ];

            cases.forEach(input => {
                const encoded = buildQDS(input);
                const decoded = parseQDS(encoded);

                const expected = {
                    iv: !!input.iv,
                    nt: !!input.nt,
                    sb: !!input.sb,
                    bl: !!input.bl,
                    ov: !!input.ov
                };

                assert.deepStrictEqual(decoded, expected);
            });
        });

        it('ignores unknown properties in roundtrip', () => {
            const input = {
                iv: true,
                foo: true
            };

            const encoded = buildQDS(input);
            const decoded = parseQDS(encoded);

            assert.deepStrictEqual(decoded, {
                iv: true,
                nt: false,
                sb: false,
                bl: false,
                ov: false
            });
        });

        it('handles truthy values in roundtrip', () => {
            const input = {
                iv: 1,
                ov: "yes"
            };

            const encoded = buildQDS(input);
            const decoded = parseQDS(encoded);

            assert.deepStrictEqual(decoded, {
                iv: true,
                nt: false,
                sb: false,
                bl: false,
                ov: true
            });
        });

    });
    describe('Property-based: QDS', function() {
        /**
         * Property:
         * For any combination of input flags,
         * encoding and then decoding should yield the same values.
         *
         * fast-check generates many random combinations of boolean flags
         * to verify this invariant.
         */
        it('parseQDS(buildQDS(x)) === normalized x', () => {
            fc.assert(
                fc.property(
                    // Generates random objects with boolean flags
                    fc.record({
                        iv: fc.boolean(),
                        nt: fc.boolean(),
                        sb: fc.boolean(),
                        bl: fc.boolean(),
                        ov: fc.boolean()
                    }),
                    (input) => {
                        const encoded = buildQDS(input);
                        const decoded = parseQDS(encoded);

                        // Normalize input: undefined -> false
                        const expected = {
                            iv: !!input.iv,
                            nt: !!input.nt,
                            sb: !!input.sb,
                            bl: !!input.bl,
                            ov: !!input.ov
                        };

                        assert.deepStrictEqual(decoded, expected);
                    }
                )
            );
        });
        /**
         * Property:
         * For any possible input (including null, numbers, etc.),
         * parseQDS should always return a valid object with boolean values.
         *
         * Goal: Ensure robustness against unexpected or malformed inputs.
         */
        it('never produces iv states for arbitrary input', () => {
            fc.assert(
                fc.property(
                    // Generates ANY possible JavaScript value
                    fc.anything(),
                    (input) => {
                        const encoded = buildQDS(input);
                        const decoded = parseQDS(encoded);

                        // All returned values must be boolean
                        Object.values(decoded).forEach(v => {
                            assert.strictEqual(typeof v, 'boolean');
                        });
                    }
                )
            );
        });
        /**
         * Property:
         * buildQDS must only set defined bits.
         *
         * Allowed bits:
         * 0x80 iv
         * 0x40 nt
         * 0x20 sb
         * 0x10 bl
         * 0x01 ov
         *
         * Combined allowed mask: 0xF1
         */
        it('encoded value never exceeds valid bitmask', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        iv: fc.boolean(),
                        nt: fc.boolean(),
                        sb: fc.boolean(),
                        bl: fc.boolean(),
                        ov: fc.boolean()
                    }),
                    (input) => {
                        const encoded = buildQDS(input);

                        // Ensure no undefined bits are set
                        assert.strictEqual(encoded & ~0xF1, 0);
                    }
                )
            );
        });

    });


});
   