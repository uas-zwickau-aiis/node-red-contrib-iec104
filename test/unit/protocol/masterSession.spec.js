'use strict';

const assert = require('assert');
const sinon = require('sinon');

const MasterSession =
  require('../../../lib/protocol/masterSession');

const {
  STATE,
  FRAME,
  U,
  COT,
  CA
} = require('../../../lib/core/constants');

const {
  TYPES
} = require('../../../lib/asdu/types');

describe('MasterSession', function () {
  let session;

  let send;
  let onStateChange;
  let onStats;
  let onSessionStop;
  let onASDU;
  let onPoint;
  let onGIStart;
  let onGIEnd;

  beforeEach(function () {
    send = sinon.spy();
    onStateChange = sinon.spy();
    onStats = sinon.spy();
    onSessionStop = sinon.spy();
    onASDU = sinon.spy();
    onPoint = sinon.spy();
    onGIStart = sinon.spy();
    onGIEnd = sinon.spy();

    session = new MasterSession({
      send,
      onStateChange,
      onStats,
      onSessionStop,
      onASDU,
      onPoint,
      onGIStart,
      onGIEnd,

      k: 12,
      w: 8,
      t1: 15000,
      t2: 10000,
      t3: 20000
    });

    sinon.stub(
      session,
      'publishStats'
    );

    sinon.stub(
      session,
      'flushSendQueue'
    );
  });

  describe('initialization', function () {
    it('initializes awaitingStartCon as false', function () {
      assert.strictEqual(
        session.awaitingStartCon,
        false
      );
    });

    it('uses safe default callbacks', function () {
      const s =
        new MasterSession();

      assert.doesNotThrow(() => {
        s.onASDU();
        s.onPoint();
        s.onGIStart();
        s.onGIEnd();
      });
    });

    it('initializes master statistics', function () {
      assert.strictEqual(
        session.stats.giActConReceived,
        0
      );

      assert.strictEqual(
        session.stats.giActTermReceived,
        0
      );

      assert.strictEqual(
        session.stats.pointsReceived,
        0
      );
    });
  });

  describe('start', function () {
    it('starts base session and sends STARTDT_ACT', function () {
      const sendFrame = sinon.stub(
        session,
        'sendFrame'
      );

      sinon.stub(
        session.apci,
        'buildUFrame'
      ).returns(
        Buffer.from([1])
      );

      sinon.spy(
        session.timers,
        'startT1'
      );

      session.start();

      assert.strictEqual(
        session.awaitingStartCon,
        true
      );

      assert.strictEqual(
        session.apci.buildUFrame.calledWith(
          U.STARTDT_ACT
        ),
        true
      );

      assert.strictEqual(
        sendFrame.calledWith(
          Buffer.from([1]),
          FRAME.U
        ),
        true
      );

      assert.strictEqual(
        session.timers.startT1.called,
        true
      );
    });
  });

  describe('T1 timeout', function () {
    it('stops with STARTDT timeout while awaiting confirmation', function () {
      session.awaitingStartCon = true;

      const stop = sinon.stub(
        session,
        'stop'
      );

      session.handleT1Timeout();

      assert.strictEqual(
        session.awaitingStartCon,
        false
      );

      assert.strictEqual(
        stop.calledOnceWith(
          'STARTDT Timeout'
        ),
        true
      );
    });

    it('delegates ordinary T1 timeout to base implementation', function () {
      session.awaitingStartCon = false;

      const stop = sinon.stub(
        session,
        'stop'
      );

      session.handleT1Timeout();

      assert.strictEqual(
        stop.calledOnceWith(
          'T1 Timeout'
        ),
        true
      );
    });
  });

  describe('sendStopDt', function () {
    it('returns false while IDLE', function () {
      session.state = STATE.IDLE;

      assert.strictEqual(
        session.sendStopDt(),
        false
      );
    });

    it('sends STOPDT_ACT and enters STOPPING', function () {
      session.state =
        STATE.DATA_TRANSFER;

      sinon.stub(
        session.apci,
        'buildUFrame'
      ).returns(
        Buffer.from([2])
      );

      const sendFrame = sinon.stub(
        session,
        'sendFrame'
      );

      assert.strictEqual(
        session.sendStopDt(),
        true
      );

      assert.strictEqual(
        session.apci.buildUFrame.calledWith(
          U.STOPDT_ACT
        ),
        true
      );

      assert.strictEqual(
        sendFrame.calledWith(
          Buffer.from([2]),
          FRAME.U
        ),
        true
      );

      assert.strictEqual(
        session.state,
        STATE.STOPPING
      );
    });
  });

  describe('sendInterrogation', function () {
    beforeEach(function () {
      sinon.stub(
        session.apci,
        'hasSendWindow'
      ).returns(true);

      sinon.stub(
        session.apci,
        'buildInterrogationFrame'
      ).returns(
        Buffer.from([3])
      );

      sinon.stub(
        session.apci,
        'unconfirmedCount'
      ).returns(2);

      sinon.stub(
        session,
        'sendFrame'
      );
    });

    it('rejects GI outside DATA_TRANSFER', function () {
      session.state =
        STATE.CONNECTED;

      assert.strictEqual(
        session.sendInterrogation(1),
        false
      );
    });

    it('rejects GI when send window is full', function () {
      session.state =
        STATE.DATA_TRANSFER;

      session.apci.hasSendWindow.returns(
        false
      );

      assert.strictEqual(
        session.sendInterrogation(1),
        false
      );
    });

    it('rejects duplicate GI', function () {
      session.state =
        STATE.DATA_TRANSFER;

      session.beginGI(1);

      assert.strictEqual(
        session.sendInterrogation(1),
        false
      );
    });

    it('sends GI request', function () {
      session.state =
        STATE.DATA_TRANSFER;

      const result =
        session.sendInterrogation(7);

      assert.strictEqual(
        result,
        true
      );

      assert.strictEqual(
        session.stats.giCount,
        1
      );

      assert.strictEqual(
        session.apci.buildInterrogationFrame.calledOnceWith(
          COT.ACT,
          7
        ),
        true
      );

      assert.strictEqual(
        onGIStart.calledOnceWith(7),
        true
      );

      assert.strictEqual(
        session.isGIActive(7),
        true
      );
    });

    it('uses broadcast CA by default', function () {
      session.state =
        STATE.DATA_TRANSFER;

      session.sendInterrogation();

      assert.strictEqual(
        session.apci.buildInterrogationFrame.calledOnceWith(
          COT.ACT,
          CA.BROADCAST
        ),
        true
      );
    });
  });

  describe('finishInterrogation', function () {
    it('finishes exact CA interrogation', function () {
      session.beginGI(5);

      session.finishInterrogation(5);

      assert.strictEqual(
        session.isGIActive(5),
        false
      );
    });

    it('finishes broadcast interrogation for matching response', function () {
      session.beginGI(
        CA.BROADCAST
      );

      session.finishInterrogation(5);

      assert.strictEqual(
        session.isGIActive(
          CA.BROADCAST
        ),
        false
      );
    });

    it('does nothing when no interrogation is active', function () {
      assert.doesNotThrow(() => {
        session.finishInterrogation(5);
      });
    });
  });

  describe('U frame handling', function () {
    function frame(code) {
      const buf = Buffer.alloc(3);
      buf[2] = code;
      return buf;
    }

    beforeEach(function () {
      sinon.stub(
        session,
        'sendFrame'
      );

      sinon.stub(
        session.apci,
        'buildUFrame'
      ).callsFake(code =>
        Buffer.from([code])
      );

      sinon.spy(
        session.timers,
        'stopT1'
      );

      sinon.spy(
        session.timers,
        'startT3'
      );
    });

    it('handles STARTDT_CON', function () {
      session.awaitingStartCon = true;

      session.handleUFrame(
        frame(U.STARTDT_CON)
      );

      assert.strictEqual(
        session.awaitingStartCon,
        false
      );

      assert.strictEqual(
        session.timers.stopT1.called,
        true
      );

      assert.strictEqual(
        session.state,
        STATE.DATA_TRANSFER
      );

      assert.strictEqual(
        session.timers.startT3.called,
        true
      );

      assert.strictEqual(
        session.flushSendQueue.calledOnce,
        true
      );
    });

    it('handles STARTDT_ACT', function () {
      session.handleUFrame(
        frame(U.STARTDT_ACT)
      );

      assert.strictEqual(
        session.apci.buildUFrame.calledWith(
          U.STARTDT_CON
        ),
        true
      );

      assert.strictEqual(
        session.state,
        STATE.DATA_TRANSFER
      );

      assert.strictEqual(
        session.flushSendQueue.calledOnce,
        true
      );
    });

    it('handles TESTFR_ACT', function () {
      session.handleUFrame(
        frame(U.TESTFR_ACT)
      );

      assert.strictEqual(
        session.apci.buildUFrame.calledWith(
          U.TESTFR_CON
        ),
        true
      );
    });

    it('handles TESTFR_CON', function () {
      session.awaitingTestCon = true;

      session.handleUFrame(
        frame(U.TESTFR_CON)
      );

      assert.strictEqual(
        session.awaitingTestCon,
        false
      );

      assert.strictEqual(
        session.stats.testFrConReceived,
        1
      );

      assert.strictEqual(
        session.publishStats.calledWith(true),
        true
      );
    });

    it('handles STOPDT_ACT', function () {
      session.state =
        STATE.DATA_TRANSFER;

      session.handleUFrame(
        frame(U.STOPDT_ACT)
      );

      assert.strictEqual(
        session.apci.buildUFrame.calledWith(
          U.STOPDT_CON
        ),
        true
      );

      assert.strictEqual(
        session.state,
        STATE.CONNECTED
      );
    });

    it('handles STOPDT_CON', function () {
      session.state =
        STATE.STOPPING;

      session.handleUFrame(
        frame(U.STOPDT_CON)
      );

      assert.strictEqual(
        session.state,
        STATE.CONNECTED
      );
    });

    it('ignores unknown U frame', function () {
      assert.doesNotThrow(() => {
        session.handleUFrame(
          frame(0xFF)
        );
      });
    });
  });

  describe('ASDU handling', function () {
    it('always publishes raw ASDU callback', async function () {
      const asdu = {
        typeId: 1,
        cot: 3,
        ca: 1,
        objects: []
      };

      const buf = Buffer.from([1]);

      await session.handleASDU(
        asdu,
        buf
      );

      assert.strictEqual(
        onASDU.calledOnceWith(
          asdu,
          buf
        ),
        true
      );
    });

    it('handles GI activation confirmation', async function () {
      const asdu = {
        typeId:
          TYPES.C_IC_NA_1.id,
        cot: COT.ACTCON,
        ca: 1,
        objects: []
      };

      await session.handleASDU(
        asdu,
        Buffer.from([1])
      );

      assert.strictEqual(
        session.stats.giActConReceived,
        1
      );

      assert.strictEqual(
        session.publishStats.calledWith(true),
        true
      );
    });

    it('handles GI termination', async function () {
      session.beginGI(1);

      const finish = sinon.spy(
        session,
        'finishInterrogation'
      );

      const asdu = {
        typeId:
          TYPES.C_IC_NA_1.id,
        cot: COT.ACTTERM,
        ca: 1,
        objects: []
      };

      await session.handleASDU(
        asdu,
        Buffer.from([1])
      );

      assert.strictEqual(
        session.stats.giActTermReceived,
        1
      );

      assert.strictEqual(
        finish.calledOnceWith(1),
        true
      );

      assert.strictEqual(
        onGIEnd.calledOnceWith(1),
        true
      );
    });

    it('returns when ASDU has no objects', async function () {
      const asdu = {
        typeId: 1,
        cot: 3,
        ca: 1
      };

      await session.handleASDU(
        asdu,
        Buffer.from([1])
      );

      assert.strictEqual(
        onPoint.called,
        false
      );
    });

    it('returns when objects array is empty', async function () {
      await session.handleASDU(
        {
          typeId: 1,
          cot: 3,
          ca: 1,
          objects: []
        },
        Buffer.from([1])
      );

      assert.strictEqual(
        onPoint.called,
        false
      );
    });

    it('publishes each received point', async function () {
      const objects = [
        {
          ioa: 2,
          value: true
        },
        {
          ioa: 3,
          value: false
        }
      ];

      await session.handleASDU(
        {
          typeId: 1,
          cot: COT.SPONT,
          ca: 7,
          objects
        },
        Buffer.from([1])
      );

      assert.strictEqual(
        session.stats.pointsReceived,
        2
      );

      assert.strictEqual(
        onPoint.callCount,
        2
      );

      assert.deepStrictEqual(
        onPoint.firstCall.args[0],
        {
          typeId: 1,
          cot: COT.SPONT,
          ca: 7,
          ioa: 2,
          value: true
        }
      );
    });
  });

  describe('afterIFrameSent', function () {
    it('starts T1 for first unconfirmed frame', function () {
      sinon.stub(
        session.apci,
        'unconfirmedCount'
      ).returns(1);

      sinon.spy(
        session.timers,
        'startT1'
      );

      sinon.spy(
        session.timers,
        'resetT3'
      );

      session.afterIFrameSent();

      assert.strictEqual(
        session.timers.startT1.calledOnce,
        true
      );

      assert.strictEqual(
        session.timers.resetT3.calledOnce,
        true
      );
    });

    it('does not start T1 for later unconfirmed frames', function () {
      sinon.stub(
        session.apci,
        'unconfirmedCount'
      ).returns(2);

      sinon.spy(
        session.timers,
        'startT1'
      );

      session.afterIFrameSent();

      assert.strictEqual(
        session.timers.startT1.called,
        false
      );
    });
  });

  describe('stop', function () {
    it('clears awaitingStartCon', function () {
      session.awaitingStartCon = true;

      session.state =
        STATE.CONNECTED;

      session.stop('done');

      assert.strictEqual(
        session.awaitingStartCon,
        false
      );
    });
  });

  describe('resetStats', function () {
    it('resets master-specific counters', function () {
      session.stats.giActConReceived = 3;
      session.stats.giActTermReceived = 4;
      session.stats.pointsReceived = 5;

      session.resetStats();

      assert.strictEqual(
        session.stats.giActConReceived,
        0
      );

      assert.strictEqual(
        session.stats.giActTermReceived,
        0
      );

      assert.strictEqual(
        session.stats.pointsReceived,
        0
      );
    });
  });
});