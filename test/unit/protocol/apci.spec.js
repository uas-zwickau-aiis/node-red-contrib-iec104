'use strict';

const assert = require('assert');

const APCI = require('../../../lib/protocol/apci');
const IEC104 = require('../../../lib/core/constants');
const { TYPES } = require('../../../lib/asdu/types');

describe('APCI', function () {

  function iFrame(ns, nr) {
    return Buffer.from([
      IEC104.START,
      0x04,
      (ns << 1) & 0xFF,
      (ns >> 7) & 0xFF,
      (nr << 1) & 0xFF,
      (nr >> 7) & 0xFF
    ]);
  }

  function sFrame(nr) {
    return Buffer.from([
      IEC104.START,
      0x04,
      0x01,
      0x00,
      (nr << 1) & 0xFF,
      (nr >> 7) & 0xFF
    ]);
  }

  describe('initial state', function () {

    it('starts with zero sequence numbers', function () {
      const apci = new APCI();

      const s = apci.getStatus();

      assert.strictEqual(s.sendSeq, 0);
      assert.strictEqual(s.recvSeq, 0);
      assert.strictEqual(s.ackSeq, 0);
      assert.strictEqual(s.unconfirmed, 0);
      assert.strictEqual(s.recvSinceLastAck, 0);
    });

    it('uses default k/w', function () {
      const apci = new APCI();

      assert.strictEqual(apci.k, 12);
      assert.strictEqual(apci.w, 8);
    });

    it('accepts custom k/w', function () {
      const apci = new APCI({
        k: 5,
        w: 3
      });

      assert.strictEqual(apci.k, 5);
      assert.strictEqual(apci.w, 3);
    });

    it('reports configured k/w in status', function () {
      const apci = new APCI({
        k: 5,
        w: 3
      });

      const status = apci.getStatus();

      assert.strictEqual(status.k, 5);
      assert.strictEqual(status.w, 3);
      assert.strictEqual(status.hasSendWindow, true);
    });
  });

  describe('sequence handling', function () {

    it('increments sequence number', function () {
      const apci = new APCI();

      assert.strictEqual(
        apci.incSeq(0),
        1
      );

      assert.strictEqual(
        apci.incSeq(123),
        124
      );
    });

    it('wraps sequence number at 32767', function () {
      const apci = new APCI();

      assert.strictEqual(
        apci.incSeq(0x7FFF),
        0
      );
    });

    it('extracts ACK sequence from frame', function () {
      const apci = new APCI();

      const frame = sFrame(1234);

      assert.strictEqual(
        apci.getAckFromFrame(frame),
        1234
      );
    });

    it('extracts maximum ACK sequence', function () {
      const apci = new APCI();

      const frame = sFrame(0x7FFF);

      assert.strictEqual(
        apci.getAckFromFrame(frame),
        0x7FFF
      );
    });
  });

  describe('send sequence', function () {

    it('increments send sequence when building I-frame', function () {
      const apci = new APCI();

      apci.buildIFrame(Buffer.alloc(0));
      apci.buildIFrame(Buffer.alloc(0));

      assert.strictEqual(
        apci.getStatus().sendSeq,
        2
      );
    });

    it('tracks unconfirmed frames', function () {
      const apci = new APCI();

      apci.buildIFrame(Buffer.alloc(0));
      apci.buildIFrame(Buffer.alloc(0));

      assert.strictEqual(
        apci.unconfirmedCount(),
        2
      );
    });

    it('updates ack sequence from S-frame', function () {
      const apci = new APCI();

      apci.buildIFrame(Buffer.alloc(0));
      apci.buildIFrame(Buffer.alloc(0));

      apci.updateRecvFromFrame(
        sFrame(2)
      );

      assert.strictEqual(
        apci.getStatus().ackSeq,
        2
      );

      assert.strictEqual(
        apci.unconfirmedCount(),
        0
      );
    });

    it('handles unconfirmed sequence wraparound', function () {
      const apci = new APCI();

      apci.sendSeq = 1;
      apci.ackSeq = 0x7FFF;

      assert.strictEqual(
        apci.unconfirmedCount(),
        2
      );
    });
  });

  describe('receive sequence', function () {

    it('increments recv sequence for I-frame', function () {
      const apci = new APCI();

      apci.updateRecvFromFrame(
        iFrame(0, 0)
      );

      assert.strictEqual(
        apci.getStatus().recvSeq,
        1
      );
    });

    it('counts received frames since last ack', function () {
      const apci = new APCI();

      apci.updateRecvFromFrame(
        iFrame(0, 0)
      );

      apci.updateRecvFromFrame(
        iFrame(1, 0)
      );

      assert.strictEqual(
        apci.getStatus().recvSinceLastAck,
        2
      );
    });

    it('does not increment recv sequence for S-frame', function () {
      const apci = new APCI();

      apci.updateRecvFromFrame(
        sFrame(0)
      );

      assert.strictEqual(
        apci.getStatus().recvSeq,
        0
      );
    });

    it('resets receive counter after ackSent()', function () {
      const apci = new APCI();

      apci.updateRecvFromFrame(
        iFrame(0, 0)
      );

      apci.updateRecvFromFrame(
        iFrame(1, 0)
      );

      apci.ackSent();

      assert.strictEqual(
        apci.getStatus().recvSinceLastAck,
        0
      );
    });

    it('wraps receive sequence after 32767', function () {
      const apci = new APCI();

      apci.recvSeq = 0x7FFF;

      apci.updateRecvFromFrame(
        iFrame(0x7FFF, 0)
      );

      assert.strictEqual(
        apci.recvSeq,
        0
      );
    });
  });

  describe('window handling', function () {

    it('can send while k is not reached', function () {
      const apci = new APCI({
        k: 2
      });

      assert.strictEqual(
        apci.hasSendWindow(),
        true
      );

      apci.buildIFrame(
        Buffer.alloc(0)
      );

      assert.strictEqual(
        apci.hasSendWindow(),
        true
      );

      apci.buildIFrame(
        Buffer.alloc(0)
      );

      assert.strictEqual(
        apci.hasSendWindow(),
        false
      );
    });

    it('requires S-frame after w received frames', function () {
      const apci = new APCI({
        w: 2
      });

      apci.updateRecvFromFrame(
        iFrame(0, 0)
      );

      assert.strictEqual(
        apci.shouldSendAck(),
        false
      );

      apci.updateRecvFromFrame(
        iFrame(1, 0)
      );

      assert.strictEqual(
        apci.shouldSendAck(),
        true
      );
    });

    it('clears shouldSendAck after ackSent()', function () {
      const apci = new APCI({
        w: 2
      });

      apci.updateRecvFromFrame(
        iFrame(0, 0)
      );

      apci.updateRecvFromFrame(
        iFrame(1, 0)
      );

      apci.ackSent();

      assert.strictEqual(
        apci.shouldSendAck(),
        false
      );
    });
  });

  describe('ACK validation', function () {

    it('accepts ACK for already acknowledged sequence', function () {
      const apci = new APCI();

      apci.sendSeq = 5;
      apci.ackSeq = 2;

      assert.strictEqual(
        apci.isAckValid(2),
        true
      );
    });

    it('accepts ACK up to current send sequence', function () {
      const apci = new APCI();

      apci.sendSeq = 5;
      apci.ackSeq = 2;

      assert.strictEqual(
        apci.isAckValid(5),
        true
      );
    });

    it('rejects ACK beyond current send sequence', function () {
      const apci = new APCI();

      apci.sendSeq = 5;
      apci.ackSeq = 2;

      assert.strictEqual(
        apci.isAckValid(6),
        false
      );
    });

    it('handles ACK validation across sequence wraparound', function () {
      const apci = new APCI();

      apci.ackSeq = 0x7FFE;
      apci.sendSeq = 1;

      assert.strictEqual(
        apci.isAckValid(0x7FFF),
        true
      );

      assert.strictEqual(
        apci.isAckValid(0),
        true
      );

      assert.strictEqual(
        apci.isAckValid(1),
        true
      );

      assert.strictEqual(
        apci.isAckValid(2),
        false
      );
    });
  });

  describe('validation', function () {

    it('rejects unexpected receive sequence', function () {
      const apci = new APCI();

      assert.throws(
        () => {
          apci.updateRecvFromFrame(
            iFrame(1, 0)
          );
        },
        /Unexpected N\(S\)/
      );
    });

    it('rejects invalid ack sequence', function () {
      const apci = new APCI();

      assert.throws(
        () => {
          apci.updateRecvFromFrame(
            sFrame(5)
          );
        },
        /Invalid ACK sequence/
      );
    });
  });

  describe('I-frame builder', function () {

    it('builds an I-frame containing ASDU', function () {
      const apci = new APCI();

      const asdu = Buffer.from([
        0x11,
        0x22,
        0x33
      ]);

      const frame =
        apci.buildIFrame(asdu);

      assert.strictEqual(
        frame[0],
        IEC104.START
      );

      assert.strictEqual(
        frame[1],
        asdu.length + 4
      );

      assert.deepStrictEqual(
        frame.slice(6),
        asdu
      );
    });

    it('writes send and receive sequence numbers', function () {
      const apci = new APCI();

      apci.sendSeq = 5;
      apci.recvSeq = 7;

      const frame =
        apci.buildIFrame(
          Buffer.alloc(0)
        );

      const ns =
        ((frame[2] | (frame[3] << 8)) >> 1) &
        0x7FFF;

      const nr =
        ((frame[4] | (frame[5] << 8)) >> 1) &
        0x7FFF;

      assert.strictEqual(ns, 5);
      assert.strictEqual(nr, 7);

      assert.strictEqual(
        apci.sendSeq,
        6
      );
    });
  });

  describe('interrogation frame builder', function () {

    it('builds global interrogation frame', function () {
      const apci = new APCI();

      const frame =
        apci.buildInterrogationFrame(
          IEC104.COT.ACT,
          1
        );

      assert.strictEqual(
        frame.length,
        16
      );

      assert.strictEqual(
        frame[0],
        IEC104.START
      );

      assert.strictEqual(
        frame[1],
        0x0E
      );

      assert.strictEqual(
        frame[6],
        TYPES.C_IC_NA_1.id
      );

      assert.strictEqual(
        frame[7],
        0x01
      );

      assert.strictEqual(
        frame[8],
        IEC104.COT.ACT
      );

      assert.strictEqual(
        frame[9],
        0x00
      );

      assert.strictEqual(
        frame[10],
        0x01
      );

      assert.strictEqual(
        frame[11],
        0x00
      );

      assert.strictEqual(
        frame[12],
        0x00
      );

      assert.strictEqual(
        frame[13],
        0x00
      );

      assert.strictEqual(
        frame[14],
        0x00
      );

      assert.strictEqual(
        frame[15],
        IEC104.QOI.GLOBAL
      );
    });

    it('encodes two-byte common address', function () {
      const apci = new APCI();

      const frame =
        apci.buildInterrogationFrame(
          IEC104.COT.ACT,
          0x1234
        );

      assert.strictEqual(
        frame[10],
        0x34
      );

      assert.strictEqual(
        frame[11],
        0x12
      );
    });

    it('uses supplied QOI', function () {
      const apci = new APCI();

      const frame =
        apci.buildInterrogationFrame(
          IEC104.COT.ACT,
          1,
          42
        );

      assert.strictEqual(
        frame[15],
        42
      );
    });

    it('applies current sequence numbers', function () {
      const apci = new APCI();

      apci.sendSeq = 3;
      apci.recvSeq = 7;

      const frame =
        apci.buildInterrogationFrame(
          IEC104.COT.ACT,
          1
        );

      const ns =
        ((frame[2] | (frame[3] << 8)) >> 1) &
        0x7FFF;

      const nr =
        ((frame[4] | (frame[5] << 8)) >> 1) &
        0x7FFF;

      assert.strictEqual(ns, 3);
      assert.strictEqual(nr, 7);

      assert.strictEqual(
        apci.sendSeq,
        4
      );
    });
  });

  describe('U-frame builder', function () {

    it('builds U-frame with supplied code', function () {
      const apci = new APCI();

      const frame =
        apci.buildUFrame(
          UCode()
        );

      assert.deepStrictEqual(
        frame,
        Buffer.from([
          IEC104.START,
          0x04,
          UCode(),
          0x00,
          0x00,
          0x00
        ])
      );
    });

    function UCode() {
      return IEC104.U?.STARTDT_ACT ?? 0x07;
    }
  });

  describe('S-frame builder', function () {

    it('builds S-frame', function () {
      const apci = new APCI();

      const frame =
        apci.buildSFrame();

      assert.deepStrictEqual(
        frame,
        Buffer.from([
          IEC104.START,
          0x04,
          0x01,
          0x00,
          0x00,
          0x00
        ])
      );
    });

    it('encodes current receive sequence', function () {
      const apci = new APCI();

      apci.recvSeq = 0x1234;

      const frame =
        apci.buildSFrame();

      const nr =
        ((frame[4] | (frame[5] << 8)) >> 1) &
        0x7FFF;

      assert.strictEqual(
        nr,
        0x1234
      );
    });

    it('does not change send sequence', function () {
      const apci = new APCI();

      apci.sendSeq = 5;

      apci.buildSFrame();

      assert.strictEqual(
        apci.sendSeq,
        5
      );
    });
  });

  describe('frame type detection', function () {

    it('recognizes I-frame', function () {
      const apci = new APCI();

      assert.strictEqual(
        apci.isIFrame(
          Buffer.from([
            0x68,
            0x04,
            0x00,
            0x00,
            0x00,
            0x00
          ])
        ),
        true
      );
    });

    it('rejects S-frame as I-frame', function () {
      const apci = new APCI();

      assert.strictEqual(
        apci.isIFrame(
          Buffer.from([
            0x68,
            0x04,
            0x01,
            0x00,
            0x00,
            0x00
          ])
        ),
        false
      );
    });

    it('recognizes S-frame', function () {
      const apci = new APCI();

      assert.strictEqual(
        apci.isSFrame(
          Buffer.from([
            0x68,
            0x04,
            0x01,
            0x00,
            0x00,
            0x00
          ])
        ),
        true
      );
    });

    it('rejects wrong length as S-frame', function () {
      const apci = new APCI();

      assert.strictEqual(
        apci.isSFrame(
          Buffer.from([
            0x68,
            0x04,
            0x01
          ])
        ),
        false
      );
    });

    it('rejects wrong APDU length field as S-frame', function () {
      const apci = new APCI();

      assert.strictEqual(
        apci.isSFrame(
          Buffer.from([
            0x68,
            0x05,
            0x01,
            0x00,
            0x00,
            0x00
          ])
        ),
        false
      );
    });

    it('rejects wrong control bits as S-frame', function () {
      const apci = new APCI();

      assert.strictEqual(
        apci.isSFrame(
          Buffer.from([
            0x68,
            0x04,
            0x03,
            0x00,
            0x00,
            0x00
          ])
        ),
        false
      );
    });

    it('recognizes U-frame', function () {
      const apci = new APCI();

      assert.strictEqual(
        apci.isUFrame(
          Buffer.from([
            0x68,
            0x04,
            0x07,
            0x00,
            0x00,
            0x00
          ])
        ),
        true
      );
    });

    it('rejects wrong length as U-frame', function () {
      const apci = new APCI();

      assert.strictEqual(
        apci.isUFrame(
          Buffer.from([
            0x68,
            0x04,
            0x07
          ])
        ),
        false
      );
    });

    it('rejects wrong APDU length field as U-frame', function () {
      const apci = new APCI();

      assert.strictEqual(
        apci.isUFrame(
          Buffer.from([
            0x68,
            0x05,
            0x07,
            0x00,
            0x00,
            0x00
          ])
        ),
        false
      );
    });

    it('rejects wrong control bits as U-frame', function () {
      const apci = new APCI();

      assert.strictEqual(
        apci.isUFrame(
          Buffer.from([
            0x68,
            0x04,
            0x01,
            0x00,
            0x00,
            0x00
          ])
        ),
        false
      );
    });
  });

  describe('reset', function () {

    it('clears all state', function () {
      const apci = new APCI();

      apci.buildIFrame(
        Buffer.alloc(0)
      );

      apci.updateRecvFromFrame(
        iFrame(0, 0)
      );

      apci.reset();

      const s = apci.getStatus();

      assert.strictEqual(s.sendSeq, 0);
      assert.strictEqual(s.recvSeq, 0);
      assert.strictEqual(s.ackSeq, 0);
      assert.strictEqual(s.unconfirmed, 0);
      assert.strictEqual(s.recvSinceLastAck, 0);
    });
  });
});