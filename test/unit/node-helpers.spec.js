'use strict'

const assert = require('assert')
const fc = require('fast-check')

const {
    parseBoolConfig,
    resolveIoa,
    buildQuality,
    applyTimestamp,
    parseNumberMaybe,
    normalizeDpi
} = require('../../lib/admin/node-helpers')

describe('Node Helpers', function() {

    describe('parseBoolConfig', function() {
        it('returns string value for true', () => {
            assert.strictEqual(parseBoolConfig(true), 'true')
        })

        it('returns string value for false', () => {
            assert.strictEqual(parseBoolConfig(false), 'false')
        })

        it('uses msg as default fallback', () => {
            assert.strictEqual(parseBoolConfig(undefined), 'msg')
        })

        it('uses custom fallback for nullish values', () => {
            assert.strictEqual(parseBoolConfig(null, 'false'), 'false')
        })

        it('keeps existing string values', () => {
            assert.strictEqual(parseBoolConfig('msg'), 'msg')
            assert.strictEqual(parseBoolConfig('true'), 'true')
            assert.strictEqual(parseBoolConfig('false'), 'false')
        })
    })

    describe('resolveIoa', function() {
        it('uses configured IOA when ioaFromMsg is false', () => {
            const config = {
                ioaFromMsg: false,
                ioa0: 1,
                ioa1: 2,
                ioa2: 3
            }

            assert.strictEqual(resolveIoa(config, {}), 0x010203)
        })

        it('uses configured IOA when ioaFromMsg is missing', () => {
            const config = {
                ioa0: 0,
                ioa1: 1,
                ioa2: 2
            }

            assert.strictEqual(resolveIoa(config, {}), 0x000102)
        })

        it('uses msg.ioa when ioaFromMsg is true', () => {
            const config = {
                ioaFromMsg: true,
                ioa0: 0,
                ioa1: 0,
                ioa2: 0
            }

            const msg = {
                ioa: [1, 2, 3]
            }

            assert.strictEqual(resolveIoa(config, msg), 0x010203)
        })

        it('uses msg.ioa when ioaFromMsg is string true', () => {
            const config = {
                ioaFromMsg: 'true',
                ioa0: 0,
                ioa1: 0,
                ioa2: 0
            }

            const msg = {
                ioa: [255, 255, 255]
            }

            assert.strictEqual(resolveIoa(config, msg), 0xFFFFFF)
        })

        it('returns null for invalid msg.ioa', () => {
            const config = {
                ioaFromMsg: true
            }

            assert.strictEqual(resolveIoa(config, { ioa: [1, 2] }), null)
            assert.strictEqual(resolveIoa(config, { ioa: [1, 2, 256] }), null)
            assert.strictEqual(resolveIoa(config, { ioa: '010203' }), null)
        })
    })

    describe('buildQuality', function() {
        it('uses incoming msg.qds values when mode is msg', () => {
            const msg = {
                qds: {
                    iv: true,
                    sb: false,
                    bl: 1,
                    nt: 0
                }
            }

            const modes = {
                iv: 'msg',
                sb: 'msg',
                bl: 'msg',
                nt: 'msg'
            }

            assert.deepStrictEqual(
                buildQuality(msg, modes, ['iv', 'sb', 'bl', 'nt']),
                {
                    iv: true,
                    sb: false,
                    bl: true,
                    nt: false
                }
            )
        })

        it('forces true and false values from modes', () => {
            const msg = {
                qds: {
                    iv: false,
                    sb: true
                }
            }

            const modes = {
                iv: 'true',
                sb: 'false'
            }

            assert.deepStrictEqual(
                buildQuality(msg, modes, ['iv', 'sb']),
                {
                    iv: true,
                    sb: false
                }
            )
        })

        it('uses empty incoming quality when msg.qds is missing', () => {
            const modes = {
                iv: 'msg',
                nt: 'msg'
            }

            assert.deepStrictEqual(
                buildQuality({}, modes, ['iv', 'nt']),
                {
                    iv: false,
                    nt: false
                }
            )
        })

        it('only includes requested keys', () => {
            const msg = {
                qds: {
                    iv: true,
                    nt: true,
                    ov: true
                }
            }

            const modes = {
                iv: 'msg',
                nt: 'msg',
                ov: 'msg'
            }

            assert.deepStrictEqual(
                buildQuality(msg, modes, ['iv', 'ov']),
                {
                    iv: true,
                    ov: true
                }
            )
        })
    })

    describe('applyTimestamp', function() {
        it('does not add timestamp for TIME.NONE', () => {
            const payload = {}
            const TIME = { NONE: 0 }

            applyTimestamp(payload, { time: TIME.NONE }, TIME, 'now', {})

            assert.deepStrictEqual(payload, {})
        })

        it('adds current timestamp when timestamp is required', () => {
            const payload = {}
            const TIME = { NONE: 0 }
            const typeMeta = { time: 1 }

            applyTimestamp(payload, typeMeta, TIME, 'now', {})

            assert.strictEqual(typeof payload.ts, 'string')
            assert.ok(Number.isFinite(Date.parse(payload.ts)))
        })

        it('uses msg.ts when tsSource is msg', () => {
            const payload = {}
            const TIME = { NONE: 0 }
            const typeMeta = { time: 1 }

            applyTimestamp(payload, typeMeta, TIME, 'msg', {
                ts: '2026-01-02T03:04:05.000Z'
            })

            assert.strictEqual(payload.ts, '2026-01-02T03:04:05.000Z')
        })

        it('uses current timestamp when tsSource is msg but msg.ts is missing', () => {
            const payload = {}
            const TIME = { NONE: 0 }
            const typeMeta = { time: 1 }

            applyTimestamp(payload, typeMeta, TIME, 'msg', {})

            assert.strictEqual(typeof payload.ts, 'string')
            assert.ok(Number.isFinite(Date.parse(payload.ts)))
        })
    })

    describe('parseNumberMaybe', function() {
        it('accepts finite numbers', () => {
            assert.strictEqual(parseNumberMaybe(12.5), 12.5)
            assert.strictEqual(parseNumberMaybe(0), 0)
        })

        it('accepts numeric strings', () => {
            assert.strictEqual(parseNumberMaybe('12.5'), 12.5)
            assert.strictEqual(parseNumberMaybe(' 12.5 '), 12.5)
        })

        it('accepts comma decimal strings', () => {
            assert.strictEqual(parseNumberMaybe('12,5'), 12.5)
        })

        it('rejects empty strings', () => {
            assert.strictEqual(parseNumberMaybe(''), null)
            assert.strictEqual(parseNumberMaybe('   '), null)
        })

        it('rejects non-finite numbers', () => {
            assert.strictEqual(parseNumberMaybe(NaN), null)
            assert.strictEqual(parseNumberMaybe(Infinity), null)
            assert.strictEqual(parseNumberMaybe(-Infinity), null)
        })

        it('rejects non-numeric values', () => {
            assert.strictEqual(parseNumberMaybe('abc'), null)
            assert.strictEqual(parseNumberMaybe({}), null)
            assert.strictEqual(parseNumberMaybe([]), null)
        })
    })

    describe('normalizeDpi', function() {
        it('accepts integer values from 0 to 3', () => {
            assert.strictEqual(normalizeDpi(0), 0)
            assert.strictEqual(normalizeDpi(1), 1)
            assert.strictEqual(normalizeDpi(2), 2)
            assert.strictEqual(normalizeDpi(3), 3)
        })

        it('accepts integer strings from 0 to 3', () => {
            assert.strictEqual(normalizeDpi('0'), 0)
            assert.strictEqual(normalizeDpi('1'), 1)
            assert.strictEqual(normalizeDpi('2'), 2)
            assert.strictEqual(normalizeDpi('3'), 3)
        })

        it('rejects values outside 0 to 3', () => {
            assert.strictEqual(normalizeDpi(-1), null)
            assert.strictEqual(normalizeDpi(4), null)
            assert.strictEqual(normalizeDpi('4'), null)
        })

        it('rejects non-integer values', () => {
            assert.strictEqual(normalizeDpi(1.5), null)
            assert.strictEqual(normalizeDpi('1.5'), null)
        })

        it('rejects empty and invalid strings', () => {
            assert.strictEqual(normalizeDpi(''), null)
            assert.strictEqual(normalizeDpi('   '), null)
            assert.strictEqual(normalizeDpi('abc'), null)
        })
    })

    describe('Property-based: IOA', function() {
        it('resolves configured IOA from three bytes', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 255 }),
                    fc.integer({ min: 0, max: 255 }),
                    fc.integer({ min: 0, max: 255 }),
                    (b0, b1, b2) => {
                        const config = {
                            ioaFromMsg: false,
                            ioa0: b0,
                            ioa1: b1,
                            ioa2: b2
                        }

                        const expected = (b0 << 16) | (b1 << 8) | b2

                        assert.strictEqual(resolveIoa(config, {}), expected)
                    }
                )
            )
        })

        it('resolves msg.ioa from three bytes', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: 0, max: 255 }),
                    fc.integer({ min: 0, max: 255 }),
                    fc.integer({ min: 0, max: 255 }),
                    (b0, b1, b2) => {
                        const config = {
                            ioaFromMsg: true
                        }

                        const expected = (b0 << 16) | (b1 << 8) | b2

                        assert.strictEqual(
                            resolveIoa(config, { ioa: [b0, b1, b2] }),
                            expected
                        )
                    }
                )
            )
        })
    })

    describe('Property-based: parseNumberMaybe', function() {
        it('returns finite numbers unchanged', () => {
            fc.assert(
                fc.property(
                    fc.double({ noNaN: true, noDefaultInfinity: true }),
                    (input) => {
                        assert.strictEqual(parseNumberMaybe(input), input)
                    }
                )
            )
        })
    })

    describe('Property-based: normalizeDpi', function() {
        it('accepts only integers from 0 to 3', () => {
            fc.assert(
                fc.property(
                    fc.integer({ min: -1000, max: 1000 }),
                    (input) => {
                        const result = normalizeDpi(input)

                        if (input >= 0 && input <= 3) {
                            assert.strictEqual(result, input)
                        } else {
                            assert.strictEqual(result, null)
                        }
                    }
                )
            )
        })
    })
})