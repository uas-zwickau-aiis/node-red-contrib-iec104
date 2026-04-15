'use strict'

const assert = require('assert')
const {buildQDS} = require("../lib/asdu/quality")

describe('Quality Defaults', function() {
    describe('Encoding', function() {
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



});
   