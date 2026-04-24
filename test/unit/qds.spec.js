'use strict'

const assert = require('assert')
const fc = require('fast-check')
const {buildQDS, parseQDS} = require("../../lib/asdu/quality")

describe('Quality Defaults', function() {
    describe('buildQDS', function() {
        it('returns 0 when no flags set', () => {
            assert.strictEqual(buildQDS({}), 0x00);
        });
        it('sets invalid flag', () => {
            assert.strictEqual(buildQDS({ invalid: true }), 0x80);
        });
        it('sets notTopical flag', () => {
            assert.strictEqual(buildQDS({ notTopical: true }), 0x40);
        });

        it('sets substituted flag', () => {
            assert.strictEqual(buildQDS({ substituted: true }), 0x20);
        });

        it('sets blocked flag', () => {
            assert.strictEqual(buildQDS({ blocked: true }), 0x10);
        });

        it('sets overflow flag', () => {
            assert.strictEqual(buildQDS({ overflow: true }), 0x01);
        });
        it('sets all flags', () => {
            const result = buildQDS({
                invalid: true,
                notTopical: true,
                substituted: true,
                blocked: true,
                overflow: true
            });

            assert.strictEqual(result, 0xF1);
        });
        it('combines highest and lowest bit', () => {
            const result = buildQDS({
                invalid: true,
                overflow: true
            });

            assert.strictEqual(result, 0x81);
        });
        it('ignores unknown properties', () => {
            const result = buildQDS({
                invalid: true,
                foo: true
            });

            assert.strictEqual(result, 0x80);
        });
        it('treats non-boolean values as truthy', () => {
            const result = buildQDS({ invalid: 1 });

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
                invalid: false,
                notTopical: false,
                substituted: false,
                blocked: false,
                overflow: false
            });
        });

        it('parses invalid flag', () => {
            const result = parseQDS(0x80);

            assert.strictEqual(result.invalid, true);
        });

        it('parses notTopical flag', () => {
            const result = parseQDS(0x40);

            assert.strictEqual(result.notTopical, true);
        });

        it('parses substituted flag', () => {
            const result = parseQDS(0x20);

            assert.strictEqual(result.substituted, true);
        });

        it('parses blocked flag', () => {
            const result = parseQDS(0x10);

            assert.strictEqual(result.blocked, true);
        });

        it('parses overflow flag', () => {
            const result = parseQDS(0x01);

            assert.strictEqual(result.overflow, true);
        });

        it('parses all flags set', () => {
            const result = parseQDS(0xF1);

            assert.deepStrictEqual(result, {
                invalid: true,
                notTopical: true,
                substituted: true,
                blocked: true,
                overflow: true
            });
        });

        it('parses combination of highest and lowest bit', () => {
            const result = parseQDS(0x81);

            assert.deepStrictEqual(result, {
                invalid: true,
                notTopical: false,
                substituted: false,
                blocked: false,
                overflow: true
            });
        });

        it('ignores unrelated bits (e.g. middle unused bits)', () => {
            const result = parseQDS(0x0E);

            assert.deepStrictEqual(result, {
                invalid: false,
                notTopical: false,
                substituted: false,
                blocked: false,
                overflow: false
            });
        });

        it('handles undefined input', () => {
            const result = parseQDS();

            assert.deepStrictEqual(result, {
                invalid: false,
                notTopical: false,
                substituted: false,
                blocked: false,
                overflow: false
            });
        });

        it('handles null input', () => {
            const result = parseQDS(null);

            assert.deepStrictEqual(result, {
                invalid: false,
                notTopical: false,
                substituted: false,
                blocked: false,
                overflow: false
            });
        });
    });
    describe('Roundtrip (buildQDS -> parseQDS)', function() {

        it('roundtrips empty object', () => {
            const input = {};
            const encoded = buildQDS(input);
            const decoded = parseQDS(encoded);

            assert.deepStrictEqual(decoded, {
                invalid: false,
                notTopical: false,
                substituted: false,
                blocked: false,
                overflow: false
            });
        });

        it('roundtrips single flags', () => {
            const flags = ['invalid', 'notTopical', 'substituted', 'blocked', 'overflow'];

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
                invalid: true,
                notTopical: true,
                substituted: true,
                blocked: true,
                overflow: true
            };

            const encoded = buildQDS(input);
            const decoded = parseQDS(encoded);

            assert.deepStrictEqual(decoded, input);
        });

        it('roundtrips mixed combinations', () => {
            const cases = [
                { invalid: true, overflow: true },
                { notTopical: true, blocked: true },
                { substituted: true, overflow: true },
                { invalid: true, substituted: true, blocked: true }
            ];

            cases.forEach(input => {
                const encoded = buildQDS(input);
                const decoded = parseQDS(encoded);

                const expected = {
                    invalid: !!input.invalid,
                    notTopical: !!input.notTopical,
                    substituted: !!input.substituted,
                    blocked: !!input.blocked,
                    overflow: !!input.overflow
                };

                assert.deepStrictEqual(decoded, expected);
            });
        });

        it('ignores unknown properties in roundtrip', () => {
            const input = {
                invalid: true,
                foo: true
            };

            const encoded = buildQDS(input);
            const decoded = parseQDS(encoded);

            assert.deepStrictEqual(decoded, {
                invalid: true,
                notTopical: false,
                substituted: false,
                blocked: false,
                overflow: false
            });
        });

        it('handles truthy values in roundtrip', () => {
            const input = {
                invalid: 1,
                overflow: "yes"
            };

            const encoded = buildQDS(input);
            const decoded = parseQDS(encoded);

            assert.deepStrictEqual(decoded, {
                invalid: true,
                notTopical: false,
                substituted: false,
                blocked: false,
                overflow: true
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
                        invalid: fc.boolean(),
                        notTopical: fc.boolean(),
                        substituted: fc.boolean(),
                        blocked: fc.boolean(),
                        overflow: fc.boolean()
                    }),
                    (input) => {
                        const encoded = buildQDS(input);
                        const decoded = parseQDS(encoded);

                        // Normalize input: undefined -> false
                        const expected = {
                            invalid: !!input.invalid,
                            notTopical: !!input.notTopical,
                            substituted: !!input.substituted,
                            blocked: !!input.blocked,
                            overflow: !!input.overflow
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
        it('never produces invalid states for arbitrary input', () => {
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
         * 0x80 invalid
         * 0x40 notTopical
         * 0x20 substituted
         * 0x10 blocked
         * 0x01 overflow
         *
         * Combined allowed mask: 0xF1
         */
        it('encoded value never exceeds valid bitmask', () => {
            fc.assert(
                fc.property(
                    fc.record({
                        invalid: fc.boolean(),
                        notTopical: fc.boolean(),
                        substituted: fc.boolean(),
                        blocked: fc.boolean(),
                        overflow: fc.boolean()
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
   