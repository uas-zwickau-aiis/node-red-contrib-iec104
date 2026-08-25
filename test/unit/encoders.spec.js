'use strict';

const assert = require('assert');

const {
  singlePoint,
  doublePoint,
  measuredScaled,
  measuredFloat,
  integratedTotals,
  singleCommand
} = require('../../lib/asdu/encoders');

const decoders = require('../../lib/asdu/decoders');

const {
  parseQDS,
  parseBCRFlags
} = require('../../lib/asdu/quality');

describe('Encoders (Value + QDS/BCR)', function () {

  describe('singlePoint', function () {
    it('encodes value = true', function () {
      const buf = singlePoint({
        value: true
      });

      assert.strictEqual(
        buf[0] & 0x01,
        1
      );
    });

    it('encodes value = false', function () {
      const buf = singlePoint({
        value: false
      });

      assert.strictEqual(
        buf[0] & 0x01,
        0
      );
    });

    it('includes supported quality flags', function () {
      const buf = singlePoint({
        value: true,
        quality: {
          iv: true,
          nt: true,
          sb: true,
          bl: true
        }
      });

      assert.strictEqual(buf[0] & 0x80, 0x80);
      assert.strictEqual(buf[0] & 0x40, 0x40);
      assert.strictEqual(buf[0] & 0x20, 0x20);
      assert.strictEqual(buf[0] & 0x10, 0x10);
    });

    it('roundtrips value and quality flags', function () {
      const buf = singlePoint({
        value: true,
        quality: {
          iv: true,
          nt: true,
          sb: false,
          bl: true
        }
      });

      const decoded = decoders.singlePoint(
        buf,
        0
      );

      assert.strictEqual(
        decoded.value,
        1
      );

      assert.deepStrictEqual(
        decoded.quality,
        {
          iv: true,
          nt: true,
          sb: false,
          bl: true,
          ov: false
        }
      );
    });

    it('does not let OV modify the single point value', function () {
      const buf = singlePoint({
        value: false,
        quality: {
          ov: true
        }
      });

      assert.strictEqual(
        buf[0] & 0x01,
        0
      );
    });

    it('does not encode OV in SIQ', function () {
      const buf = singlePoint({
        value: false,
        quality: {
          ov: true
        }
      });

      const quality = parseQDS(
        buf[0] & 0xF0
      );

      assert.strictEqual(
        quality.ov,
        false
      );
    });
  });

  describe('doublePoint', function () {
    it('encodes value in lower two bits', function () {
      const buf = doublePoint({
        value: 2
      });

      assert.strictEqual(
        buf[0] & 0x03,
        2
      );
    });

    it('masks value to two bits', function () {
      const buf = doublePoint({
        value: 7
      });

      assert.strictEqual(
        buf[0] & 0x03,
        3
      );
    });

    it('encodes all valid DPI values', function () {
      for (const value of [0, 1, 2, 3]) {
        const buf = doublePoint({
          value
        });

        assert.strictEqual(
          buf[0] & 0x03,
          value
        );
      }
    });

    it('includes supported quality flags', function () {
      const buf = doublePoint({
        value: 2,
        quality: {
          iv: true,
          nt: true,
          sb: true,
          bl: true
        }
      });

      assert.strictEqual(buf[0] & 0x80, 0x80);
      assert.strictEqual(buf[0] & 0x40, 0x40);
      assert.strictEqual(buf[0] & 0x20, 0x20);
      assert.strictEqual(buf[0] & 0x10, 0x10);
    });

    it('roundtrips value and quality flags', function () {
      const buf = doublePoint({
        value: 3,
        quality: {
          iv: true,
          nt: false,
          sb: true,
          bl: false
        }
      });

      const decoded = decoders.doublePoint(
        buf,
        0
      );

      assert.strictEqual(
        decoded.value,
        3
      );

      assert.deepStrictEqual(
        decoded.quality,
        {
          iv: true,
          nt: false,
          sb: true,
          bl: false,
          ov: false
        }
      );
    });

    it('does not let OV modify the double point value', function () {
      const buf = doublePoint({
        value: 2,
        quality: {
          ov: true
        }
      });

      assert.strictEqual(
        buf[0] & 0x03,
        2
      );
    });

    it('does not encode OV in DIQ', function () {
      const buf = doublePoint({
        value: 0,
        quality: {
          ov: true
        }
      });

      const quality = parseQDS(
        buf[0] & 0xF0
      );

      assert.strictEqual(
        quality.ov,
        false
      );
    });
  });

  describe('measuredScaled', function () {
    it('encodes int16 value', function () {
      const buf = measuredScaled({
        value: 1234
      });

      assert.strictEqual(
        buf.readInt16LE(0),
        1234
      );
    });

    it('encodes negative values', function () {
      const buf = measuredScaled({
        value: -1234
      });

      assert.strictEqual(
        buf.readInt16LE(0),
        -1234
      );
    });

    it('encodes minimum int16 value', function () {
      const buf = measuredScaled({
        value: -32768
      });

      assert.strictEqual(
        buf.readInt16LE(0),
        -32768
      );
    });

    it('encodes maximum int16 value', function () {
      const buf = measuredScaled({
        value: 32767
      });

      assert.strictEqual(
        buf.readInt16LE(0),
        32767
      );
    });

    it('includes QDS', function () {
      const buf = measuredScaled({
        value: 1,
        quality: {
          ov: true
        }
      });

      assert.strictEqual(
        buf[2] & 0x01,
        1
      );
    });

    it('roundtrips complete QDS', function () {
      const buf = measuredScaled({
        value: 1234,
        quality: {
          iv: true,
          nt: true,
          sb: false,
          bl: true,
          ov: true
        }
      });

      const decoded = decoders.measuredScaled(
        buf,
        0
      );

      assert.deepStrictEqual(
        decoded.quality,
        {
          iv: true,
          nt: true,
          sb: false,
          bl: true,
          ov: true
        }
      );
    });
  });

  describe('measuredFloat', function () {
    it('encodes float value', function () {
      const buf = measuredFloat({
        value: 12.5
      });

      assert.strictEqual(
        buf.readFloatLE(0),
        12.5
      );
    });

    it('encodes negative float value', function () {
      const buf = measuredFloat({
        value: -12.5
      });

      assert.strictEqual(
        buf.readFloatLE(0),
        -12.5
      );
    });

    it('encodes numeric string', function () {
      const buf = measuredFloat({
        value: '12.5'
      });

      assert.strictEqual(
        buf.readFloatLE(0),
        12.5
      );
    });

    it('replaces NaN with zero', function () {
      const buf = measuredFloat({
        value: NaN
      });

      assert.strictEqual(
        buf.readFloatLE(0),
        0
      );
    });

    it('replaces positive Infinity with zero', function () {
      const buf = measuredFloat({
        value: Infinity
      });

      assert.strictEqual(
        buf.readFloatLE(0),
        0
      );
    });

    it('replaces negative Infinity with zero', function () {
      const buf = measuredFloat({
        value: -Infinity
      });

      assert.strictEqual(
        buf.readFloatLE(0),
        0
      );
    });

    it('replaces non-numeric strings with zero', function () {
      const buf = measuredFloat({
        value: 'invalid'
      });

      assert.strictEqual(
        buf.readFloatLE(0),
        0
      );
    });

    it('includes QDS', function () {
      const buf = measuredFloat({
        value: 1.5,
        quality: {
          iv: true
        }
      });

      assert.strictEqual(
        buf[4] & 0x80,
        0x80
      );
    });

    it('roundtrips complete QDS', function () {
      const buf = measuredFloat({
        value: 12.5,
        quality: {
          iv: true,
          nt: false,
          sb: true,
          bl: false,
          ov: true
        }
      });

      const decoded = decoders.measuredFloat(
        buf,
        0
      );

      assert.deepStrictEqual(
        decoded.quality,
        {
          iv: true,
          nt: false,
          sb: true,
          bl: false,
          ov: true
        }
      );
    });
  });

  describe('integratedTotals', function () {
    it('encodes int32 value', function () {
      const buf = integratedTotals({
        value: 123456
      });

      assert.strictEqual(
        buf.readInt32LE(0),
        123456
      );
    });

    it('encodes negative values', function () {
      const buf = integratedTotals({
        value: -123456
      });

      assert.strictEqual(
        buf.readInt32LE(0),
        -123456
      );
    });

    it('encodes minimum int32 value', function () {
      const buf = integratedTotals({
        value: -2147483648
      });

      assert.strictEqual(
        buf.readInt32LE(0),
        -2147483648
      );
    });

    it('encodes maximum int32 value', function () {
      const buf = integratedTotals({
        value: 2147483647
      });

      assert.strictEqual(
        buf.readInt32LE(0),
        2147483647
      );
    });

    it('encodes numeric string', function () {
      const buf = integratedTotals({
        value: '1234'
      });

      assert.strictEqual(
        buf.readInt32LE(0),
        1234
      );
    });

    it('replaces NaN with zero', function () {
      const buf = integratedTotals({
        value: NaN
      });

      assert.strictEqual(
        buf.readInt32LE(0),
        0
      );
    });

    it('replaces positive Infinity with zero', function () {
      const buf = integratedTotals({
        value: Infinity
      });

      assert.strictEqual(
        buf.readInt32LE(0),
        0
      );
    });

    it('replaces negative Infinity with zero', function () {
      const buf = integratedTotals({
        value: -Infinity
      });

      assert.strictEqual(
        buf.readInt32LE(0),
        0
      );
    });

    it('replaces non-numeric strings with zero', function () {
      const buf = integratedTotals({
        value: 'invalid'
      });

      assert.strictEqual(
        buf.readInt32LE(0),
        0
      );
    });

    it('encodes BCR flags and sequence', function () {
      const buf = integratedTotals({
        value: 1,
        quality: {
          iv: true,
          ov: true
        },
        sequence: 5
      });

      const flags = buf[4];

      assert.strictEqual(
        flags & 0x80,
        0x80
      );

      assert.strictEqual(
        flags & 0x20,
        0x20
      );

      assert.strictEqual(
        flags & 0x1F,
        5
      );
    });

    it('roundtrips BCR flags and sequence', function () {
      const buf = integratedTotals({
        value: 42,
        quality: {
          iv: true,
          adjusted: true
        },
        sequence: 17
      });

      const decoded =
        parseBCRFlags(buf[4]);

      assert.deepStrictEqual(
        decoded,
        {
          iv: true,
          adjusted: true,
          ov: false,
          sequence: 17
        }
      );
    });

    it('masks BCR sequence to five bits', function () {
      const buf = integratedTotals({
        value: 1,
        quality: {},
        sequence: 63
      });

      const decoded =
        parseBCRFlags(buf[4]);

      assert.strictEqual(
        decoded.sequence,
        31
      );
    });
  });

  describe('singleCommand', function () {
    it('encodes value false', function () {
      const buf = singleCommand({
        value: false
      });

      assert.strictEqual(
        buf[0] & 0x01,
        0
      );
    });

    it('encodes value true', function () {
      const buf = singleCommand({
        value: true
      });

      assert.strictEqual(
        buf[0] & 0x01,
        1
      );
    });

    it('uses qualifier zero by default', function () {
      const buf = singleCommand({
        value: true
      });

      assert.strictEqual(
        (buf[0] >> 2) & 0x1F,
        0
      );
    });

    it('uses execute mode by default', function () {
      const buf = singleCommand({
        value: true
      });

      assert.strictEqual(
        buf[0] & 0x80,
        0
      );
    });

    it('encodes qualifier', function () {
      const buf = singleCommand({
        value: true,
        qualifier: 17
      });

      assert.strictEqual(
        (buf[0] >> 2) & 0x1F,
        17
      );
    });

    it('encodes minimum qualifier', function () {
      const buf = singleCommand({
        value: true,
        qualifier: 0
      });

      assert.strictEqual(
        (buf[0] >> 2) & 0x1F,
        0
      );
    });

    it('encodes maximum qualifier', function () {
      const buf = singleCommand({
        value: true,
        qualifier: 31
      });

      assert.strictEqual(
        (buf[0] >> 2) & 0x1F,
        31
      );
    });

    it('encodes select flag', function () {
      const buf = singleCommand({
        value: true,
        select: true
      });

      assert.strictEqual(
        buf[0] & 0x80,
        0x80
      );
    });

    it('encodes execute flag when select is false', function () {
      const buf = singleCommand({
        value: true,
        select: false
      });

      assert.strictEqual(
        buf[0] & 0x80,
        0
      );
    });

    it('encodes value, qualifier and select together', function () {
      const buf = singleCommand({
        value: true,
        qualifier: 17,
        select: true
      });

      assert.strictEqual(
        buf[0],
        0xC5
      );
    });

    it('rejects qualifier below valid range', function () {
      assert.throws(
        () => singleCommand({
          value: true,
          qualifier: -1
        }),
        RangeError
      );
    });

    it('rejects qualifier above valid range', function () {
      assert.throws(
        () => singleCommand({
          value: true,
          qualifier: 32
        }),
        RangeError
      );
    });

    it('rejects non-integer qualifier', function () {
      assert.throws(
        () => singleCommand({
          value: true,
          qualifier: 1.5
        }),
        RangeError
      );
    });

    it('rejects string qualifier', function () {
      assert.throws(
        () => singleCommand({
          value: true,
          qualifier: '1'
        }),
        RangeError
      );
    });
  });
});