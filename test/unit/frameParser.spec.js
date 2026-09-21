'use strict';

const assert = require('assert');

const FrameParser = require('../../lib/protocol/frameParser');

describe('Frame Parser', function () {

  it('parses a complete frame', function () {
    const frames = [];

    const parser = new FrameParser(
      frame => frames.push(frame)
    );

    const frame = Buffer.from([
      0x68,
      0x04,
      1,
      2,
      3,
      4
    ]);

    parser.push(frame);

    assert.strictEqual(
      frames.length,
      1
    );

    assert.deepStrictEqual(
      frames[0],
      frame
    );
  });

  it('parses frame split across multiple chunks', function () {
    const frames = [];

    const parser = new FrameParser(
      frame => frames.push(frame)
    );

    const frame = Buffer.from([
      0x68,
      0x04,
      1,
      2,
      3,
      4
    ]);

    parser.push(
      frame.slice(0, 2)
    );

    assert.strictEqual(
      frames.length,
      0
    );

    parser.push(
      frame.slice(2)
    );

    assert.strictEqual(
      frames.length,
      1
    );

    assert.deepStrictEqual(
      frames[0],
      frame
    );
  });

  it('parses multiple frames in one chunk', function () {
    const frames = [];

    const parser = new FrameParser(
      frame => frames.push(frame)
    );

    const frame1 = Buffer.from([
      0x68,
      0x02,
      1,
      2
    ]);

    const frame2 = Buffer.from([
      0x68,
      0x02,
      3,
      4
    ]);

    parser.push(
      Buffer.concat([
        frame1,
        frame2
      ])
    );

    assert.strictEqual(
      frames.length,
      2
    );

    assert.deepStrictEqual(
      frames[0],
      frame1
    );

    assert.deepStrictEqual(
      frames[1],
      frame2
    );
  });

  it('skips invalid leading bytes', function () {
    const frames = [];

    const parser = new FrameParser(
      frame => frames.push(frame)
    );

    const frame = Buffer.from([
      0x68,
      0x02,
      1,
      2
    ]);

    parser.push(
      Buffer.concat([
        Buffer.from([
          0x00,
          0xFF,
          0x12
        ]),
        frame
      ])
    );

    assert.strictEqual(
      frames.length,
      1
    );

    assert.deepStrictEqual(
      frames[0],
      frame
    );
  });

  it('waits for full frame before emitting', function () {
    const frames = [];

    const parser = new FrameParser(
      frame => frames.push(frame)
    );

    parser.push(
      Buffer.from([
        0x68,
        0x04,
        1
      ])
    );

    assert.strictEqual(
      frames.length,
      0
    );
  });

  it('keeps incomplete frame buffered until remaining data arrives', function () {
    const frames = [];

    const parser = new FrameParser(
      frame => frames.push(frame)
    );

    parser.push(
      Buffer.from([
        0x68,
        0x04,
        1
      ])
    );

    assert.deepStrictEqual(
      parser.buffer,
      Buffer.from([
        0x68,
        0x04,
        1
      ])
    );

    parser.push(
      Buffer.from([
        2,
        3,
        4
      ])
    );

    assert.strictEqual(
      frames.length,
      1
    );

    assert.deepStrictEqual(
      frames[0],
      Buffer.from([
        0x68,
        0x04,
        1,
        2,
        3,
        4
      ])
    );

    assert.strictEqual(
      parser.buffer.length,
      0
    );
  });

  it('keeps trailing incomplete frame after parsing complete frame', function () {
    const frames = [];

    const parser = new FrameParser(
      frame => frames.push(frame)
    );

    const complete = Buffer.from([
      0x68,
      0x02,
      1,
      2
    ]);

    const incomplete = Buffer.from([
      0x68,
      0x04,
      3
    ]);

    parser.push(
      Buffer.concat([
        complete,
        incomplete
      ])
    );

    assert.strictEqual(
      frames.length,
      1
    );

    assert.deepStrictEqual(
      frames[0],
      complete
    );

    assert.deepStrictEqual(
      parser.buffer,
      incomplete
    );
  });

  it('handles invalid bytes split across chunks', function () {
    const frames = [];

    const parser = new FrameParser(
      frame => frames.push(frame)
    );

    parser.push(
      Buffer.from([
        0x00,
        0xFF
      ])
    );

    parser.push(
      Buffer.from([
        0x12,
        0x68,
        0x02,
        1,
        2
      ])
    );

    assert.strictEqual(
      frames.length,
      1
    );

    assert.deepStrictEqual(
      frames[0],
      Buffer.from([
        0x68,
        0x02,
        1,
        2
      ])
    );
  });

  it('reset clears buffered data', function () {
    const frames = [];

    const parser = new FrameParser(
      frame => frames.push(frame)
    );

    parser.push(
      Buffer.from([
        0x68,
        0x04,
        1
      ])
    );

    assert.strictEqual(
      parser.buffer.length,
      3
    );

    parser.reset();

    assert.strictEqual(
      parser.buffer.length,
      0
    );

    assert.ok(
      Buffer.isBuffer(parser.buffer)
    );
  });

  it('does not emit discarded partial frame after reset', function () {
    const frames = [];

    const parser = new FrameParser(
      frame => frames.push(frame)
    );

    parser.push(
      Buffer.from([
        0x68,
        0x04,
        1
      ])
    );

    parser.reset();

    parser.push(
      Buffer.from([
        0x68,
        0x02,
        7,
        8
      ])
    );

    assert.strictEqual(
      frames.length,
      1
    );

    assert.deepStrictEqual(
      frames[0],
      Buffer.from([
        0x68,
        0x02,
        7,
        8
      ])
    );
  });
});