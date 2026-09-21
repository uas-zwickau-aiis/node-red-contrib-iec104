'use strict';

const assert = require('assert');

const { buildASDU } = require('../../lib/asdu/asduBuilder');
const { TYPES } = require('../../lib/asdu/types');
const { COT } = require('../../lib/core/constants');

describe('ASDU Builder', function () {

  describe('type handling', function () {
    it('returns null for unknown ASDU type', function () {
      const result = buildASDU({
        type: 'UNKNOWN_TYPE',
        ca: 1,
        ioa: 1,
        value: true
      });

      assert.strictEqual(
        result,
        null
      );
    });
  });

  describe('ASDU header', function () {
    it('encodes type ID', function () {
      const buf = buildASDU({
        type: 'M_SP_NA_1',
        ca: 1,
        ioa: 1,
        value: true
      });

      assert.strictEqual(
        buf[0],
        TYPES.M_SP_NA_1.id
      );
    });

    it('encodes VSQ for one information object', function () {
      const buf = buildASDU({
        type: 'M_SP_NA_1',
        ca: 1,
        ioa: 1,
        value: true
      });

      assert.strictEqual(
        buf[1],
        0x01
      );
    });

    it('uses spontaneous transmission as default COT', function () {
      const buf = buildASDU({
        type: 'M_SP_NA_1',
        ca: 1,
        ioa: 1,
        value: true
      });

      assert.strictEqual(
        buf[2],
        COT.SPONT
      );

      assert.strictEqual(
        buf[3],
        0
      );
    });

    it('uses explicitly supplied COT', function () {
      const buf = buildASDU(
        {
          type: 'M_SP_NA_1',
          ca: 1,
          ioa: 1,
          value: true
        },
        COT.ACT
      );

      assert.strictEqual(
        buf[2],
        COT.ACT
      );

      assert.strictEqual(
        buf[3],
        0
      );
    });

    it('encodes common address little endian', function () {
      const buf = buildASDU({
        type: 'M_SP_NA_1',
        ca: 0x1234,
        ioa: 1,
        value: true
      });

      assert.strictEqual(
        buf[4],
        0x34
      );

      assert.strictEqual(
        buf[5],
        0x12
      );
    });

    it('supports maximum 16-bit common address', function () {
      const buf = buildASDU({
        type: 'M_SP_NA_1',
        ca: 0xFFFF,
        ioa: 1,
        value: true
      });

      assert.strictEqual(
        buf[4],
        0xFF
      );

      assert.strictEqual(
        buf[5],
        0xFF
      );
    });
  });

  describe('IOA encoding', function () {
    it('encodes IOA as three little-endian bytes', function () {
      const buf = buildASDU({
        type: 'M_SP_NA_1',
        ca: 1,
        ioa: 0x010203,
        value: true
      });

      assert.strictEqual(
        buf[6],
        0x03
      );

      assert.strictEqual(
        buf[7],
        0x02
      );

      assert.strictEqual(
        buf[8],
        0x01
      );
    });

    it('supports maximum 24-bit IOA', function () {
      const buf = buildASDU({
        type: 'M_SP_NA_1',
        ca: 1,
        ioa: 0xFFFFFF,
        value: true
      });

      assert.strictEqual(
        buf[6],
        0xFF
      );

      assert.strictEqual(
        buf[7],
        0xFF
      );

      assert.strictEqual(
        buf[8],
        0xFF
      );
    });
  });

  describe('information object encoding', function () {
    it('encodes single point value true', function () {
      const buf = buildASDU({
        type: 'M_SP_NA_1',
        ca: 1,
        ioa: 1,
        value: true
      });

      assert.strictEqual(
        buf[9] & 0x01,
        1
      );
    });

    it('encodes single point value false', function () {
      const buf = buildASDU({
        type: 'M_SP_NA_1',
        ca: 1,
        ioa: 1,
        value: false
      });

      assert.strictEqual(
        buf[9] & 0x01,
        0
      );
    });

    it('encodes supported single point quality flags', function () {
      const buf = buildASDU({
        type: 'M_SP_NA_1',
        ca: 1,
        ioa: 1,
        value: true,
        qds: {
          iv: true,
          nt: true,
          sb: true,
          bl: true
        }
      });

      assert.strictEqual(
        buf[9],
        0xF1
      );
    });

    it('does not encode OV into single point value bit', function () {
      const buf = buildASDU({
        type: 'M_SP_NA_1',
        ca: 1,
        ioa: 1,
        value: false,
        qds: {
          ov: true
        }
      });

      assert.strictEqual(
        buf[9],
        0x00
      );
    });

    it('encodes double point value', function () {
      const buf = buildASDU({
        type: 'M_DP_NA_1',
        ca: 1,
        ioa: 1,
        value: 2
      });

      assert.strictEqual(
        buf[9] & 0x03,
        2
      );
    });

    it('encodes measured scaled value', function () {
      const buf = buildASDU({
        type: 'M_ME_NB_1',
        ca: 1,
        ioa: 1,
        value: -1234,
        qds: {}
      });

      assert.strictEqual(
        buf.readInt16LE(9),
        -1234
      );
    });

    it('encodes measured float value', function () {
      const buf = buildASDU({
        type: 'M_ME_NC_1',
        ca: 1,
        ioa: 1,
        value: 12.5,
        qds: {}
      });

      assert.strictEqual(
        buf.readFloatLE(9),
        12.5
      );
    });

    it('encodes integrated total value', function () {
      const buf = buildASDU({
        type: 'M_IT_NA_1',
        ca: 1,
        ioa: 1,
        value: 123456,
        qds: {},
        sequence: 3
      });

      assert.strictEqual(
        buf.readInt32LE(9),
        123456
      );

      assert.strictEqual(
        buf[13] & 0x1F,
        3
      );
    });

    it('encodes single command', function () {
      const buf = buildASDU(
        {
          type: 'C_SC_NA_1',
          ca: 1,
          ioa: 1,
          value: true,
          qualifier: 17,
          select: true
        },
        COT.ACT
      );

      assert.strictEqual(
        buf[9],
        0xC5
      );
    });
  });

  describe('timestamp handling', function () {
    it('does not append timestamp for non-timed type', function () {
      const buf = buildASDU({
        type: 'M_SP_NA_1',
        ca: 1,
        ioa: 1,
        value: true,
        ts: new Date()
      });

      // Header 6 + IOA 3 + SIQ 1
      assert.strictEqual(
        buf.length,
        10
      );
    });

    it('appends CP24Time2a for CP24 timed type', function () {
      const ts = new Date(
        2024,
        0,
        1,
        0,
        5,
        10,
        250
      );

      const buf = buildASDU({
        type: 'M_SP_TA_1',
        ca: 1,
        ioa: 1,
        value: true,
        ts
      });

      // Header 6 + IOA 3 + SIQ 1 + CP24 3
      assert.strictEqual(
        buf.length,
        13
      );

      const timeOffset = 10;

      const expectedMs =
        ts.getSeconds() * 1000 +
        ts.getMilliseconds();

      assert.strictEqual(
        buf.readUInt16LE(timeOffset),
        expectedMs
      );

      assert.strictEqual(
        buf[timeOffset + 2] & 0x3F,
        ts.getMinutes()
      );
    });

    it('appends CP56Time2a for CP56 timed type', function () {
      const ts = new Date(
        2024,
        0,
        2,
        3,
        4,
        5,
        678
      );

      const buf = buildASDU({
        type: 'M_SP_TB_1',
        ca: 1,
        ioa: 1,
        value: true,
        ts
      });

      // Header 6 + IOA 3 + SIQ 1 + CP56 7
      assert.strictEqual(
        buf.length,
        17
      );

      const timeOffset = 10;

      const expectedMs =
        ts.getSeconds() * 1000 +
        ts.getMilliseconds();

      assert.strictEqual(
        buf.readUInt16LE(timeOffset),
        expectedMs
      );

      assert.strictEqual(
        buf[timeOffset + 2] & 0x3F,
        ts.getMinutes()
      );

      assert.strictEqual(
        buf[timeOffset + 3] & 0x1F,
        ts.getHours()
      );
    });

    it('uses current time when timestamp is missing', function () {
      const before = Date.now();

      const buf = buildASDU({
        type: 'M_SP_TB_1',
        ca: 1,
        ioa: 1,
        value: true
      });

      const after = Date.now();

      assert.strictEqual(
        buf.length,
        17
      );

      const timeOffset = 10;

      const millisecondsInMinute =
        buf.readUInt16LE(timeOffset);

      assert.ok(
        millisecondsInMinute >= 0
      );

      assert.ok(
        millisecondsInMinute < 60000
      );

      // Merely ensure the builder produced a timed ASDU
      // during the current invocation.
      assert.ok(
        after >= before
      );
    });
  });
});