'use strict';

const assert = require('assert');

const decoders = require('../../lib/asdu/decoders');
const encoders = require('../../lib/asdu/encoders');

describe('Decoders', function () {

  describe('singlePoint', function () {
    it('decodes value false', function () {
      const result = decoders.singlePoint(
        Buffer.from([0x00]),
        0
      );

      assert.strictEqual(
        result.value,
        0
      );

      assert.strictEqual(
        result.size,
        1
      );

      assert.deepStrictEqual(
        result.qds,
        {
          iv: false,
          nt: false,
          sb: false,
          bl: false,
          ov: false
        }
      );
    });

    it('decodes value true', function () {
      const result = decoders.singlePoint(
        Buffer.from([0x01]),
        0
      );

      assert.strictEqual(
        result.value,
        1
      );

      assert.strictEqual(
        result.size,
        1
      );
    });

    it('decodes SIQ quality flags without interpreting SPI as OV', function () {
      const result = decoders.singlePoint(
        Buffer.from([0xF1]),
        0
      );

      assert.strictEqual(
        result.value,
        1
      );

      assert.deepStrictEqual(
        result.qds,
        {
          iv: true,
          nt: true,
          sb: true,
          bl: true,
          ov: false
        }
      );
    });

    it('does not interpret value true as overflow', function () {
      const result = decoders.singlePoint(
        Buffer.from([0x01]),
        0
      );

      assert.strictEqual(
        result.value,
        1
      );

      assert.strictEqual(
        result.qds.ov,
        false
      );
    });

    it('respects offset', function () {
      const result = decoders.singlePoint(
        Buffer.from([
          0xFF,
          0x01
        ]),
        1
      );

      assert.strictEqual(
        result.value,
        1
      );

      assert.strictEqual(
        result.qds.ov,
        false
      );
    });

    it('roundtrips encoded single point', function () {
      const buf = encoders.singlePoint({
        value: true,
        qds: {
          iv: true,
          nt: false,
          sb: true,
          bl: false
        }
      });

      const result =
        decoders.singlePoint(buf, 0);

      assert.strictEqual(
        result.value,
        1
      );

      assert.deepStrictEqual(
        result.qds,
        {
          iv: true,
          nt: false,
          sb: true,
          bl: false,
          ov: false
        }
      );
    });

    it('ignores unsupported OV flag during roundtrip', function () {
      const buf = encoders.singlePoint({
        value: false,
        qds: {
          ov: true
        }
      });

      const result =
        decoders.singlePoint(buf, 0);

      assert.strictEqual(
        result.value,
        0
      );

      assert.strictEqual(
        result.qds.ov,
        false
      );
    });
  });

  describe('doublePoint', function () {
    it('decodes all DPI values', function () {
      for (const value of [0, 1, 2, 3]) {
        const result = decoders.doublePoint(
          Buffer.from([value]),
          0
        );

        assert.strictEqual(
          result.value,
          value
        );

        assert.strictEqual(
          result.size,
          1
        );

        assert.strictEqual(
          result.qds.ov,
          false
        );
      }
    });

    it('uses only the lowest two bits for value', function () {
      const result = decoders.doublePoint(
        Buffer.from([0xFF]),
        0
      );

      assert.strictEqual(
        result.value,
        3
      );

      assert.strictEqual(
        result.qds.ov,
        false
      );
    });

    it('decodes DIQ quality flags', function () {
      const result = decoders.doublePoint(
        Buffer.from([0xF2]),
        0
      );

      assert.strictEqual(
        result.value,
        2
      );

      assert.deepStrictEqual(
        result.qds,
        {
          iv: true,
          nt: true,
          sb: true,
          bl: true,
          ov: false
        }
      );
    });

    it('does not interpret DPI bits as overflow', function () {
      const result = decoders.doublePoint(
        Buffer.from([0x03]),
        0
      );

      assert.strictEqual(
        result.value,
        3
      );

      assert.strictEqual(
        result.qds.ov,
        false
      );
    });

    it('respects offset', function () {
      const result = decoders.doublePoint(
        Buffer.from([
          0x00,
          0x02
        ]),
        1
      );

      assert.strictEqual(
        result.value,
        2
      );
    });

    it('roundtrips encoded double point', function () {
      const buf = encoders.doublePoint({
        value: 3,
        qds: {
          iv: true,
          nt: false,
          sb: true,
          bl: false
        }
      });

      const result = decoders.doublePoint(
        buf,
        0
      );

      assert.strictEqual(
        result.value,
        3
      );

      assert.deepStrictEqual(
        result.qds,
        {
          iv: true,
          nt: false,
          sb: true,
          bl: false,
          ov: false
        }
      );
    });

    it('ignores unsupported OV flag during roundtrip', function () {
      const buf = encoders.doublePoint({
        value: 2,
        qds: {
          ov: true
        }
      });

      const result =
        decoders.doublePoint(buf, 0);

      assert.strictEqual(
        result.value,
        2
      );

      assert.strictEqual(
        result.qds.ov,
        false
      );
    });
  });

  describe('measuredScaled', function () {
    it('decodes positive int16 value', function () {
      const buf = Buffer.alloc(3);

      buf.writeInt16LE(
        1234,
        0
      );

      buf[2] = 0;

      const result =
        decoders.measuredScaled(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        1234
      );

      assert.strictEqual(
        result.size,
        3
      );
    });

    it('decodes negative int16 value', function () {
      const buf = Buffer.alloc(3);

      buf.writeInt16LE(
        -1234,
        0
      );

      const result =
        decoders.measuredScaled(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        -1234
      );
    });

    it('decodes minimum int16 value', function () {
      const buf = Buffer.alloc(3);

      buf.writeInt16LE(
        -32768,
        0
      );

      const result =
        decoders.measuredScaled(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        -32768
      );
    });

    it('decodes maximum int16 value', function () {
      const buf = Buffer.alloc(3);

      buf.writeInt16LE(
        32767,
        0
      );

      const result =
        decoders.measuredScaled(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        32767
      );
    });

    it('decodes complete QDS', function () {
      const buf = Buffer.alloc(3);

      buf.writeInt16LE(
        1,
        0
      );

      buf[2] = 0xF1;

      const result =
        decoders.measuredScaled(
          buf,
          0
        );

      assert.deepStrictEqual(
        result.qds,
        {
          iv: true,
          nt: true,
          sb: true,
          bl: true,
          ov: true
        }
      );
    });

    it('respects offset', function () {
      const buf = Buffer.alloc(5);

      buf.writeInt16LE(
        1234,
        1
      );

      buf[3] = 0;

      const result =
        decoders.measuredScaled(
          buf,
          1
        );

      assert.strictEqual(
        result.value,
        1234
      );
    });

    it('roundtrips encoded measured scaled value', function () {
      const buf = encoders.measuredScaled({
        value: -1234,
        qds: {
          iv: true,
          nt: false,
          sb: true,
          bl: false,
          ov: true
        }
      });

      const result =
        decoders.measuredScaled(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        -1234
      );

      assert.deepStrictEqual(
        result.qds,
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

  describe('measuredFloat', function () {
    it('decodes float value', function () {
      const buf = Buffer.alloc(5);

      buf.writeFloatLE(
        12.5,
        0
      );

      const result =
        decoders.measuredFloat(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        12.5
      );

      assert.strictEqual(
        result.size,
        5
      );
    });

    it('decodes negative float value', function () {
      const buf = Buffer.alloc(5);

      buf.writeFloatLE(
        -12.5,
        0
      );

      const result =
        decoders.measuredFloat(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        -12.5
      );
    });

    it('decodes complete QDS', function () {
      const buf = Buffer.alloc(5);

      buf.writeFloatLE(
        1.5,
        0
      );

      buf[4] = 0xF1;

      const result =
        decoders.measuredFloat(
          buf,
          0
        );

      assert.deepStrictEqual(
        result.qds,
        {
          iv: true,
          nt: true,
          sb: true,
          bl: true,
          ov: true
        }
      );
    });

    it('respects offset', function () {
      const buf = Buffer.alloc(7);

      buf.writeFloatLE(
        12.5,
        1
      );

      const result =
        decoders.measuredFloat(
          buf,
          1
        );

      assert.strictEqual(
        result.value,
        12.5
      );
    });

    it('roundtrips encoded measured float value', function () {
      const buf = encoders.measuredFloat({
        value: 12.5,
        qds: {
          iv: true,
          nt: false,
          sb: true,
          bl: false,
          ov: true
        }
      });

      const result =
        decoders.measuredFloat(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        12.5
      );

      assert.deepStrictEqual(
        result.qds,
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
    it('decodes positive int32 value', function () {
      const buf = Buffer.alloc(5);

      buf.writeInt32LE(
        123456,
        0
      );

      buf[4] = 0;

      const result =
        decoders.integratedTotals(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        123456
      );

      assert.strictEqual(
        result.sequence,
        0
      );

      assert.strictEqual(
        result.size,
        5
      );
    });

    it('decodes negative int32 value', function () {
      const buf = Buffer.alloc(5);

      buf.writeInt32LE(
        -123456,
        0
      );

      const result =
        decoders.integratedTotals(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        -123456
      );
    });

    it('decodes minimum int32 value', function () {
      const buf = Buffer.alloc(5);

      buf.writeInt32LE(
        -2147483648,
        0
      );

      const result =
        decoders.integratedTotals(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        -2147483648
      );
    });

    it('decodes maximum int32 value', function () {
      const buf = Buffer.alloc(5);

      buf.writeInt32LE(
        2147483647,
        0
      );

      const result =
        decoders.integratedTotals(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        2147483647
      );
    });

    it('decodes BCR flags and sequence', function () {
      const buf = encoders.integratedTotals({
        value: 42,
        qds: {
          iv: true,
          adjusted: true,
          ov: true
        },
        sequence: 17
      });

      const result =
        decoders.integratedTotals(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        42
      );

      assert.strictEqual(
        result.sequence,
        17
      );

      assert.deepStrictEqual(
        result.qds,
        {
          invalid: true,
          adjusted: true,
          overflow: true
        }
      );
    });

    it('decodes cleared BCR flags', function () {
      const buf = encoders.integratedTotals({
        value: 42,
        qds: {
          iv: false,
          adjusted: false,
          ov: false
        },
        sequence: 0
      });

      const result =
        decoders.integratedTotals(
          buf,
          0
        );

      assert.deepStrictEqual(
        result.qds,
        {
          invalid: false,
          adjusted: false,
          overflow: false
        }
      );

      assert.strictEqual(
        result.sequence,
        0
      );
    });

    it('respects offset', function () {
      const encoded =
        encoders.integratedTotals({
          value: 1234,
          sequence: 3
        });

      const buf = Buffer.concat([
        Buffer.from([0xFF]),
        encoded
      ]);

      const result =
        decoders.integratedTotals(
          buf,
          1
        );

      assert.strictEqual(
        result.value,
        1234
      );

      assert.strictEqual(
        result.sequence,
        3
      );
    });

    it('roundtrips encoded integrated total', function () {
      const buf = encoders.integratedTotals({
        value: -123456,
        qds: {
          iv: true,
          adjusted: false,
          ov: true
        },
        sequence: 31
      });

      const result =
        decoders.integratedTotals(
          buf,
          0
        );

      assert.strictEqual(
        result.value,
        -123456
      );

      assert.strictEqual(
        result.sequence,
        31
      );

      assert.deepStrictEqual(
        result.qds,
        {
          invalid: true,
          adjusted: false,
          overflow: true
        }
      );
    });
  });

  describe('interrogation', function () {
    it('decodes QOI', function () {
      const result =
        decoders.interrogation(
          Buffer.from([20]),
          0
        );

      assert.deepStrictEqual(
        result.value,
        {
          qoi: 20
        }
      );

      assert.strictEqual(
        result.qds,
        null
      );

      assert.strictEqual(
        result.size,
        1
      );
    });

    it('respects offset', function () {
      const result =
        decoders.interrogation(
          Buffer.from([
            0x00,
            42
          ]),
          1
        );

      assert.strictEqual(
        result.value.qoi,
        42
      );
    });
  });

  describe('singleCommand', function () {
    it('decodes value false', function () {
      const result =
        decoders.singleCommand(
          Buffer.from([0x00]),
          0
        );

      assert.strictEqual(
        result.value,
        false
      );
    });

    it('decodes value true', function () {
      const result =
        decoders.singleCommand(
          Buffer.from([0x01]),
          0
        );

      assert.strictEqual(
        result.value,
        true
      );
    });

    it('decodes qualifier', function () {
      const byte = 17 << 2;

      const result =
        decoders.singleCommand(
          Buffer.from([byte]),
          0
        );

      assert.strictEqual(
        result.qualifier,
        17
      );
    });

    it('decodes minimum qualifier', function () {
      const result =
        decoders.singleCommand(
          Buffer.from([0x00]),
          0
        );

      assert.strictEqual(
        result.qualifier,
        0
      );
    });

    it('decodes maximum qualifier', function () {
      const byte = 31 << 2;

      const result =
        decoders.singleCommand(
          Buffer.from([byte]),
          0
        );

      assert.strictEqual(
        result.qualifier,
        31
      );
    });

    it('decodes execute mode', function () {
      const result =
        decoders.singleCommand(
          Buffer.from([0x01]),
          0
        );

      assert.strictEqual(
        result.select,
        false
      );
    });

    it('decodes select mode', function () {
      const result =
        decoders.singleCommand(
          Buffer.from([0x81]),
          0
        );

      assert.strictEqual(
        result.select,
        true
      );
    });

    it('decodes value, qualifier and select together', function () {
      const result =
        decoders.singleCommand(
          Buffer.from([0xC5]),
          0
        );

      assert.strictEqual(
        result.value,
        true
      );

      assert.strictEqual(
        result.qualifier,
        17
      );

      assert.strictEqual(
        result.select,
        true
      );

      assert.strictEqual(
        result.qds,
        null
      );

      assert.strictEqual(
        result.size,
        1
      );
    });

    it('respects offset', function () {
      const result =
        decoders.singleCommand(
          Buffer.from([
            0x00,
            0x81
          ]),
          1
        );

      assert.strictEqual(
        result.value,
        true
      );

      assert.strictEqual(
        result.select,
        true
      );
    });

    it('roundtrips encoded single command', function () {
      const buf = encoders.singleCommand({
        value: true,
        qualifier: 17,
        select: true
      });

      const result =
        decoders.singleCommand(
          buf,
          0
        );

      assert.deepStrictEqual(
        result,
        {
          value: true,
          qualifier: 17,
          select: true,
          qds: null,
          size: 1
        }
      );
    });
  });
});