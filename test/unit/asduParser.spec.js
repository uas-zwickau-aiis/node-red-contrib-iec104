'use strict';

const assert = require('assert');

const { parseASDU } = require('../../lib/asdu/asduParser');
const { buildASDU } = require('../../lib/asdu/asduBuilder');
const { TYPES } = require('../../lib/asdu/types');
const { COT } = require('../../lib/core/constants');

describe('ASDU Parser', function () {

  function withApci(asdu) {
    return Buffer.concat([
      Buffer.alloc(6),
      asdu
    ]);
  }

  function ioaBuffer(ioa) {
    return Buffer.from([
      ioa & 0xFF,
      (ioa >> 8) & 0xFF,
      (ioa >> 16) & 0xFF
    ]);
  }

  describe('header parsing', function () {
    it('returns null for unknown type ID', function () {
      const buf = Buffer.concat([
        Buffer.alloc(6),

        Buffer.from([
          0xFF,       // unknown type
          0x01,       // VSQ
          COT.SPONT,
          0x00,
          0x01,
          0x00,

          0x01,
          0x00,
          0x00,

          0x00
        ])
      ]);

      const result = parseASDU(buf);

      assert.strictEqual(
        result,
        null
      );
    });

    it('parses type ID, COT and common address', function () {
      const asdu = buildASDU({
        type: 'M_SP_NA_1',
        ca: 0x1234,
        ioa: 1,
        value: true,
        quality: {}
      }, COT.SPONT);

      const result = parseASDU(
        withApci(asdu)
      );

      assert.strictEqual(
        result.typeId,
        TYPES.M_SP_NA_1.id
      );

      assert.strictEqual(
        result.cot,
        COT.SPONT
      );

      assert.strictEqual(
        result.ca,
        0x1234
      );
    });
  });

  describe('SQ = 0', function () {
    it('parses single information object', function () {
      const asdu = buildASDU({
        type: 'M_SP_NA_1',
        ca: 1,
        ioa: 0x010203,
        value: true,
        quality: {}
      });

      const result = parseASDU(
        withApci(asdu)
      );

      assert.strictEqual(
        result.objects.length,
        1
      );

      assert.strictEqual(
        result.objects[0].ioa,
        0x010203
      );

      assert.strictEqual(
        result.objects[0].value,
        1
      );
    });

    it('parses multiple objects with individual IOAs', function () {
      const typeId = TYPES.M_SP_NA_1.id;

      const asdu = Buffer.concat([
        Buffer.from([
          typeId,
          0x02,       // SQ=0, 2 objects
          COT.SPONT,
          0x00,
          0x01,
          0x00
        ]),

        ioaBuffer(10),
        Buffer.from([0x01]),

        ioaBuffer(20),
        Buffer.from([0x00])
      ]);

      const result = parseASDU(
        withApci(asdu)
      );

      assert.strictEqual(
        result.objects.length,
        2
      );

      assert.strictEqual(
        result.objects[0].ioa,
        10
      );

      assert.strictEqual(
        result.objects[0].value,
        1
      );

      assert.strictEqual(
        result.objects[1].ioa,
        20
      );

      assert.strictEqual(
        result.objects[1].value,
        0
      );
    });

    it('parses maximum 24-bit IOA', function () {
      const asdu = buildASDU({
        type: 'M_SP_NA_1',
        ca: 1,
        ioa: 0xFFFFFF,
        value: true,
        quality: {}
      });

      const result = parseASDU(
        withApci(asdu)
      );

      assert.strictEqual(
        result.objects[0].ioa,
        0xFFFFFF
      );
    });
  });

  describe('SQ = 1', function () {
    it('increments IOA for sequential objects', function () {
      const typeId = TYPES.M_SP_NA_1.id;

      const asdu = Buffer.concat([
        Buffer.from([
          typeId,

          // SQ = 1, num = 3
          0x80 | 0x03,

          COT.SPONT,
          0x00,

          // CA = 1
          0x01,
          0x00
        ]),

        // Starting IOA = 100
        ioaBuffer(100),

        // Three single-point objects
        Buffer.from([
          0x01,
          0x00,
          0x01
        ])
      ]);

      const result = parseASDU(
        withApci(asdu)
      );

      assert.strictEqual(
        result.objects.length,
        3
      );

      assert.deepStrictEqual(
        result.objects.map(object => object.ioa),
        [100, 101, 102]
      );

      assert.deepStrictEqual(
        result.objects.map(object => object.value),
        [1, 0, 1]
      );
    });

    it('parses quality for sequential objects', function () {
      const typeId = TYPES.M_SP_NA_1.id;

      const asdu = Buffer.concat([
        Buffer.from([
          typeId,
          0x82, // SQ=1, num=2
          COT.SPONT,
          0x00,
          0x01,
          0x00
        ]),

        ioaBuffer(10),

        Buffer.from([
          0x81, // value true + IV
          0x00
        ])
      ]);

      const result = parseASDU(
        withApci(asdu)
      );

      assert.strictEqual(
        result.objects[0].quality.iv,
        true
      );

      assert.strictEqual(
        result.objects[1].quality.iv,
        false
      );
    });
  });

  describe('different codecs', function () {
    it('parses double point', function () {
      const asdu = buildASDU({
        type: 'M_DP_NA_1',
        ca: 1,
        ioa: 10,
        value: 2,
        quality: {}
      });

      const result = parseASDU(
        withApci(asdu)
      );

      assert.strictEqual(
        result.objects[0].value,
        2
      );
    });

    it('parses measured scaled value', function () {
      const asdu = buildASDU({
        type: 'M_ME_NB_1',
        ca: 1,
        ioa: 10,
        value: -1234,
        quality: {}
      });

      const result = parseASDU(
        withApci(asdu)
      );

      assert.strictEqual(
        result.objects[0].value,
        -1234
      );
    });

    it('parses measured float value', function () {
      const asdu = buildASDU({
        type: 'M_ME_NC_1',
        ca: 1,
        ioa: 10,
        value: 12.5,
        quality: {}
      });

      const result = parseASDU(
        withApci(asdu)
      );

      assert.strictEqual(
        result.objects[0].value,
        12.5
      );
    });

    it('parses integrated total', function () {
      const asdu = buildASDU({
        type: 'M_IT_NA_1',
        ca: 1,
        ioa: 10,
        value: 123456,
        quality: {},
        sequence: 4
      });

      const result = parseASDU(
        withApci(asdu)
      );

      assert.strictEqual(
        result.objects[0].value,
        123456
      );
    });

    it('parses single command', function () {
      const asdu = buildASDU({
        type: 'C_SC_NA_1',
        ca: 1,
        ioa: 10,
        value: true,
        qualifier: 17,
        select: true
      }, COT.ACT);

      const result = parseASDU(
        withApci(asdu)
      );

      assert.strictEqual(
        result.objects[0].value,
        true
      );
    });
  });

  describe('empty object list', function () {
    it('returns empty objects array when VSQ count is zero', function () {
      const typeId = TYPES.M_SP_NA_1.id;

      const asdu = Buffer.from([
        typeId,
        0x00,       // zero objects
        COT.SPONT,
        0x00,
        0x01,
        0x00
      ]);

      const result = parseASDU(
        withApci(asdu)
      );

      assert.deepStrictEqual(
        result.objects,
        []
      );
    });
  });

  describe('builder/parser roundtrip', function () {
    it('roundtrips single point ASDU', function () {
      const original = {
        type: 'M_SP_NA_1',
        ca: 12,
        ioa: 345,
        value: true,
        quality: {
          iv: true,
          sb: true
        }
      };

      const asdu = buildASDU(
        original,
        COT.SPONT
      );

      const result = parseASDU(
        withApci(asdu)
      );

      assert.strictEqual(
        result.typeId,
        TYPES[original.type].id
      );

      assert.strictEqual(
        result.cot,
        COT.SPONT
      );

      assert.strictEqual(
        result.ca,
        original.ca
      );

      assert.strictEqual(
        result.objects.length,
        1
      );

      assert.strictEqual(
        result.objects[0].ioa,
        original.ioa
      );

      assert.strictEqual(
        result.objects[0].value,
        1
      );

      assert.strictEqual(
        result.objects[0].quality.iv,
        true
      );

      assert.strictEqual(
        result.objects[0].quality.sb,
        true
      );
    });
  });
  it('appends CP24Time2a for CP24 timed type', function () {
    const ts = new Date('2024-01-01T00:05:10.250Z');

    const p = {
        type: 'M_SP_TA_1',
        ca: 1,
        ioa: 1,
        value: true,
        quality: {},
        ts
    };

    const buf = buildASDU(p);

    assert.ok(Buffer.isBuffer(buf));

    // ASDU header: 6
    // IOA:         3
    // SIQ:         1
    // CP24Time2a:  3
    assert.strictEqual(buf.length, 13);

    // Timestamp starts after header + IOA + SIQ
    const timeOffset = 10;

    const expectedMs =
        ts.getUTCSeconds() * 1000 +
        ts.getUTCMilliseconds();

    assert.strictEqual(
        buf.readUInt16LE(timeOffset),
        expectedMs
    );
   });
   it('appends CP56Time2a for CP56 timed type', function () {
    const ts = new Date('2024-01-02T03:04:05.678');

    const p = {
        type: 'M_SP_TB_1',
        ca: 1,
        ioa: 1,
        value: true,
        quality: {},
        ts
    };

    const buf = buildASDU(p);

    assert.ok(Buffer.isBuffer(buf));

    // ASDU header: 6
    // IOA:         3
    // SIQ:         1
    // CP56Time2a:  7
    assert.strictEqual(buf.length, 17);

    const timeOffset = 10;

    const expectedMs =
        ts.getSeconds() * 1000 +
        ts.getMilliseconds();

    assert.strictEqual(
        buf.readUInt16LE(timeOffset),
        expectedMs
    );
   });
    it('uses current time when timestamp is not provided', function () {
        const p = {
            type: 'M_SP_TB_1',
            ca: 1,
            ioa: 1,
            value: true,
            quality: {}
        };

        const buf = buildASDU(p);

        assert.ok(Buffer.isBuffer(buf));
        assert.strictEqual(buf.length, 17);
    });
    it('returns null for unknown ASDU type', function () {
        const result = buildASDU({
            type: 'UNKNOWN_TYPE',
            ca: 1,
            ioa: 1,
            value: true
        });

        assert.strictEqual(result, null);
    });
});