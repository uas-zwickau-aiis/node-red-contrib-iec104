'use strict';

const assert = require('assert');

const {
  isValidPoint,
  isValidFrame,
  toDate
} = require('../../lib/core/validators');

const {
  START
} = require('../../lib/core/constants');

describe('Validators', function () {

  describe('isValidPoint', function () {
    it('accepts valid point', function () {
      assert.strictEqual(
        isValidPoint({
          ca: 1,
          ioa: 100,
          type: 'M_SP_NA_1',
          value: true
        }),
        true
      );
    });

    it('accepts value false', function () {
      assert.strictEqual(
        isValidPoint({
          ca: 1,
          ioa: 100,
          type: 'M_SP_NA_1',
          value: false
        }),
        true
      );
    });

    it('accepts value zero', function () {
      assert.strictEqual(
        isValidPoint({
          ca: 1,
          ioa: 100,
          type: 'M_ME_NC_1',
          value: 0
        }),
        true
      );
    });

    it('rejects null', function () {
      assert.strictEqual(
        isValidPoint(null),
        false
      );
    });

    it('rejects undefined', function () {
      assert.strictEqual(
        isValidPoint(undefined),
        false
      );
    });

    it('rejects missing CA', function () {
      assert.strictEqual(
        isValidPoint({
          ioa: 100,
          type: 'M_SP_NA_1',
          value: true
        }),
        false
      );
    });

    it('rejects non-number CA', function () {
      assert.strictEqual(
        isValidPoint({
          ca: '1',
          ioa: 100,
          type: 'M_SP_NA_1',
          value: true
        }),
        false
      );
    });

    it('rejects missing IOA', function () {
      assert.strictEqual(
        isValidPoint({
          ca: 1,
          type: 'M_SP_NA_1',
          value: true
        }),
        false
      );
    });

    it('rejects non-number IOA', function () {
      assert.strictEqual(
        isValidPoint({
          ca: 1,
          ioa: '100',
          type: 'M_SP_NA_1',
          value: true
        }),
        false
      );
    });

    it('rejects missing type', function () {
      assert.strictEqual(
        isValidPoint({
          ca: 1,
          ioa: 100,
          value: true
        }),
        false
      );
    });

    it('rejects empty type', function () {
      assert.strictEqual(
        isValidPoint({
          ca: 1,
          ioa: 100,
          type: '',
          value: true
        }),
        false
      );
    });

    it('rejects undefined value', function () {
      assert.strictEqual(
        isValidPoint({
          ca: 1,
          ioa: 100,
          type: 'M_SP_NA_1',
          value: undefined
        }),
        false
      );
    });

    it('accepts null value because it is defined', function () {
      assert.strictEqual(
        isValidPoint({
          ca: 1,
          ioa: 100,
          type: 'M_SP_NA_1',
          value: null
        }),
        true
      );
    });
  });

  describe('isValidFrame', function () {
    it('accepts valid frame', function () {
      const buf = Buffer.from([
        START,
        0x04,
        0x00,
        0x00,
        0x00,
        0x00
      ]);

      assert.strictEqual(
        isValidFrame(buf),
        true
      );
    });

    it('rejects non-buffer input', function () {
      assert.strictEqual(
        isValidFrame([
          START,
          0x04,
          0,
          0,
          0,
          0
        ]),
        false
      );
    });

    it('rejects frame shorter than six bytes', function () {
      assert.strictEqual(
        isValidFrame(
          Buffer.from([
            START,
            0x03,
            0,
            0,
            0
          ])
        ),
        false
      );
    });

    it('rejects invalid start byte', function () {
      const buf = Buffer.from([
        0x00,
        0x04,
        0x00,
        0x00,
        0x00,
        0x00
      ]);

      assert.strictEqual(
        isValidFrame(buf),
        false
      );
    });

    it('rejects invalid length field', function () {
      const buf = Buffer.from([
        START,
        0x05,
        0x00,
        0x00,
        0x00,
        0x00
      ]);

      assert.strictEqual(
        isValidFrame(buf),
        false
      );
    });

    it('accepts frame with payload when length matches', function () {
      const buf = Buffer.from([
        START,
        0x06,
        0x00,
        0x00,
        0x00,
        0x00,
        0xAA,
        0xBB
      ]);

      assert.strictEqual(
        isValidFrame(buf),
        true
      );
    });
  });

  describe('toDate', function () {
    it('returns current date for null', function () {
      const before = Date.now();

      const result = toDate(null);

      const after = Date.now();

      assert.ok(
        result instanceof Date
      );

      assert.ok(
        result.getTime() >= before
      );

      assert.ok(
        result.getTime() <= after
      );
    });

    it('returns current date for undefined', function () {
      const before = Date.now();

      const result = toDate(undefined);

      const after = Date.now();

      assert.ok(
        result instanceof Date
      );

      assert.ok(
        result.getTime() >= before
      );

      assert.ok(
        result.getTime() <= after
      );
    });

    it('returns Date instance unchanged', function () {
      const input =
        new Date('2026-01-02T03:04:05.000Z');

      const result =
        toDate(input);

      assert.strictEqual(
        result,
        input
      );
    });

    it('converts UNIX timestamp in seconds', function () {
      const result =
        toDate(1700000000);

      assert.strictEqual(
        result.getTime(),
        1700000000 * 1000
      );
    });

    it('converts UNIX timestamp in milliseconds', function () {
      const result =
        toDate(1700000000000);

      assert.strictEqual(
        result.getTime(),
        1700000000000
      );
    });

    it('treats value below 1e12 as seconds', function () {
      const result =
        toDate(999999999999);

      assert.strictEqual(
        result.getTime(),
        999999999999 * 1000
      );
    });

    it('treats value equal to 1e12 as milliseconds', function () {
      const result =
        toDate(1000000000000);

      assert.strictEqual(
        result.getTime(),
        1000000000000
      );
    });

    it('parses valid ISO string', function () {
      const result =
        toDate(
          '2026-01-02T03:04:05.000Z'
        );

      assert.ok(
        result instanceof Date
      );

      assert.strictEqual(
        result.toISOString(),
        '2026-01-02T03:04:05.000Z'
      );
    });

    it('rejects invalid date string', function () {
      assert.throws(
        () => {
          toDate('not-a-date');
        },
        /Invalid timestamp format/
      );
    });

    it('rejects unsupported object input', function () {
      assert.throws(
        () => {
          toDate({});
        },
        /Invalid timestamp format/
      );
    });

    it('rejects boolean input', function () {
      assert.throws(
        () => {
          toDate(true);
        },
        /Invalid timestamp format/
      );
    });
  });
});