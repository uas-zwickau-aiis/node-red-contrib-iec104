'use strict'

const assert = require('assert')
const fc = require('fast-check')

const FrameParser = require('../../lib/protocol/frameParser')

describe('Frame Parser', function (){
    it('parses a complete frame', () => {
        const frames = [];

        const parser = new FrameParser(f => frames.push(f));

        const frame = Buffer.from([0x68, 0x04, 1, 2, 3, 4]);

        parser.push(frame);

        assert.strictEqual(frames.length, 1);
        assert.deepStrictEqual(frames[0], frame);
    });
    it('parses frame split across multiple chunks', () => {
        const frames = [];
        const parser = new FrameParser(f => frames.push(f));

        const frame = Buffer.from([0x68, 0x04, 1, 2, 3, 4]);

        parser.push(frame.slice(0, 2));
        parser.push(frame.slice(2));

        assert.strictEqual(frames.length, 1);
    });
    it('parses multiple frames in one chunk', () => {
        const frames = [];
        const parser = new FrameParser(f => frames.push(f));

        const f1 = Buffer.from([0x68, 0x02, 1, 2]);
        const f2 = Buffer.from([0x68, 0x02, 3, 4]);

        parser.push(Buffer.concat([f1, f2]));

        assert.strictEqual(frames.length, 2);
    });
    it('skips invalid leading bytes', () => {
        const frames = [];
        const parser = new FrameParser(f => frames.push(f));

        const frame = Buffer.from([0x68, 0x02, 1, 2]);

        parser.push(Buffer.concat([
            Buffer.from([0x00, 0xFF, 0x12]),
            frame
        ]));

        assert.strictEqual(frames.length, 1);
    });
    it('waits for full frame before emitting', () => {
        const frames = [];
        const parser = new FrameParser(f => frames.push(f));

        parser.push(Buffer.from([0x68, 0x04, 1]));

        assert.strictEqual(frames.length, 0);
    });
   
});