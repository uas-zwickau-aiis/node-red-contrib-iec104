'use strict';

const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

const {
  STATE,
  FRAME,
  U,
  COT
} = require('../../../lib/core/constants');

const {
  TYPES
} = require('../../../lib/asdu/types');

describe('SlaveSession', function () {
  let SlaveSession;
  let buildASDUStub;

  let session;

  let send;
  let onStateChange;
  let onStats;
  let onSessionStop;
  let onGI;
  let onCommand;
  let onInboundComplete;

  beforeEach(function () {
    buildASDUStub = sinon.stub().returns(
      Buffer.from([1, 2, 3])
    );

    SlaveSession = proxyquire(
      '../../../lib/protocol/slaveSession',
      {
        '../asdu/asduBuilder': {
          buildASDU: buildASDUStub
        }
      }
    );

    send = sinon.spy();
    onStateChange = sinon.spy();
    onStats = sinon.spy();
    onSessionStop = sinon.spy();
    onGI = sinon.stub().resolves();
    onCommand = sinon.stub().resolves();
    onInboundComplete = sinon.spy();

    session = new SlaveSession({
      send,
      onStateChange,
      onStats,
      onSessionStop,
      onGI,
      onCommand,
      onInboundComplete,

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

  afterEach(function () {
    session?.timers?.stopAll();
    sinon.restore();
  });

  describe('initialization', function () {
    it('stores supplied callbacks', function () {
      assert.strictEqual(
        session.onGI,
        onGI
      );

      assert.strictEqual(
        session.onCommand,
        onCommand
      );

      assert.strictEqual(
        session.onInboundComplete,
        onInboundComplete
      );
    });

    it('uses safe default callbacks', async function () {
      const s =
        new SlaveSession();

      await assert.doesNotReject(
        async () => {
          await s.onGI();
          await s.onCommand();
          s.onInboundComplete();
        }
      );
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

      sinon.stub(
        session.timers,
        'startT3'
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
        session.sendFrame.calledWith(
          sinon.match.instanceOf(Buffer),
          FRAME.U
        ),
        true
      );

      assert.strictEqual(
        session.state,
        STATE.DATA_TRANSFER
      );

      assert.strictEqual(
        session.timers.startT3.calledOnce,
        true
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

    it('ignores unknown U frame', function () {
      assert.doesNotThrow(() => {
        session.handleUFrame(
          frame(0xFF)
        );
      });
    });
  });

  describe('ASDU dispatch', function () {
    it('handles interrogation activation', async function () {
      const handle = sinon.stub(
        session,
        'handleInterrogation'
      ).resolves();

      const asdu = {
        typeId:
          TYPES.C_IC_NA_1.id,
        cot: COT.ACT
      };

      await session.handleASDU(
        asdu,
        Buffer.from([1]),
        123
      );

      assert.strictEqual(
        handle.calledOnceWith(asdu),
        true
      );
    });

    it('handles single command activation', async function () {
      const handle = sinon.stub(
        session,
        'handleSingleCommand'
      ).resolves();

      const asdu = {
        typeId:
          TYPES.C_SC_NA_1.id,
        cot: COT.ACT
      };

      await session.handleASDU(
        asdu,
        Buffer.from([1]),
        777
      );

      assert.strictEqual(
        handle.calledOnceWith(
          asdu,
          777
        ),
        true
      );
    });

    it('ignores unrelated ASDU', async function () {
      const interrogation = sinon.stub(
        session,
        'handleInterrogation'
      );

      const command = sinon.stub(
        session,
        'handleSingleCommand'
      );

      await session.handleASDU(
        {
          typeId: 255,
          cot: 255
        },
        Buffer.from([1])
      );

      assert.strictEqual(
        interrogation.called,
        false
      );

      assert.strictEqual(
        command.called,
        false
      );
    });

    it('does not treat interrogation with wrong COT as GI request', async function () {
      const handle = sinon.stub(
        session,
        'handleInterrogation'
      );

      await session.handleASDU(
        {
          typeId:
            TYPES.C_IC_NA_1.id,
          cot: COT.SPONT
        },
        Buffer.from([1])
      );

      assert.strictEqual(
        handle.called,
        false
      );
    });

    it('does not treat command with wrong COT as command', async function () {
      const handle = sinon.stub(
        session,
        'handleSingleCommand'
      );

      await session.handleASDU(
        {
          typeId:
            TYPES.C_SC_NA_1.id,
          cot: COT.SPONT
        },
        Buffer.from([1])
      );

      assert.strictEqual(
        handle.called,
        false
      );
    });
  });

  describe('interrogation handling', function () {
    beforeEach(function () {
      sinon.stub(
        session,
        'sendInterrogationResponse'
      ).returns(true);

      sinon.stub(
        session,
        'sendIFrame'
      ).returns(true);
    });

    it('immediately responds when GI is already active', async function () {
      session.beginGI(5);

      await session.handleInterrogation({
        ca: 5
      });

      assert.strictEqual(
        session.sendInterrogationResponse.callCount,
        2
      );

      assert.strictEqual(
        session.sendInterrogationResponse.firstCall.calledWith(
          COT.ACTCON,
          5
        ),
        true
      );

      assert.strictEqual(
        session.sendInterrogationResponse.secondCall.calledWith(
          COT.ACTTERM,
          5
        ),
        true
      );

      assert.strictEqual(
        onGI.called,
        false
      );
    });

    it('increments GI counter', async function () {
      await session.handleInterrogation({
        ca: 5
      });

      assert.strictEqual(
        session.stats.giCount,
        1
      );
    });

    it('sends ACTCON before GI data', async function () {
      await session.handleInterrogation({
        ca: 5
      });

      assert.strictEqual(
        session.sendInterrogationResponse.firstCall.calledWith(
          COT.ACTCON,
          5
        ),
        true
      );
    });

    it('invokes GI callback with CA', async function () {
      await session.handleInterrogation({
        ca: 5
      });

      assert.strictEqual(
        onGI.calledOnce,
        true
      );

      assert.strictEqual(
        onGI.firstCall.args[0],
        5
      );

      assert.strictEqual(
        typeof onGI.firstCall.args[1],
        'function'
      );
    });

    it('sends GI point using INROGEN cause', async function () {
      onGI.callsFake(
        async (ca, sendPoint) => {
          await sendPoint({
            type: 'M_SP_NA_1',
            ca,
            ioa: 1,
            value: true
          });
        }
      );

      sinon.stub(
        session.apci,
        'hasSendWindow'
      ).returns(true);

      await session.handleInterrogation({
        ca: 5
      });

      assert.strictEqual(
        buildASDUStub.calledOnceWith(
          sinon.match({
            ca: 5,
            ioa: 1
          }),
          COT.INROGEN
        ),
        true
      );

      assert.strictEqual(
        session.sendIFrame.calledOnceWith(
          Buffer.from([1, 2, 3])
        ),
        true
      );
    });

    it('returns false for point that cannot be encoded', async function () {
      let result;

      onGI.callsFake(
        async (ca, sendPoint) => {
          result = await sendPoint({
            type: 'INVALID'
          });
        }
      );

      sinon.stub(
        session.apci,
        'hasSendWindow'
      ).returns(true);

      buildASDUStub.returns(null);

      await session.handleInterrogation({
        ca: 1
      });

      assert.strictEqual(
        result,
        false
      );

      assert.strictEqual(
        session.sendIFrame.called,
        false
      );
    });

    it('returns false while waiting if data transfer becomes inactive', async function () {
      let result;

      onGI.callsFake(
        async (ca, sendPoint) => {
          result = await sendPoint({
            type: 'M_SP_NA_1'
          });
        }
      );

      sinon.stub(
        session.apci,
        'hasSendWindow'
      ).returns(false);

      sinon.stub(
        session,
        'isDataTransferActive'
      ).returns(false);

      await session.handleInterrogation({
        ca: 1
      });

      assert.strictEqual(
        result,
        false
      );

      assert.strictEqual(
        buildASDUStub.called,
        false
      );
    });

    it('waits for available send window', async function () {
      const clock = sinon.useFakeTimers();

      try {
        let sendPromise;

        onGI.callsFake(
          async (ca, sendPoint) => {
            sendPromise = sendPoint({
              type: 'M_SP_NA_1',
              ca,
              ioa: 1
            });

            return sendPromise;
          }
        );

        sinon.stub(
          session,
          'isDataTransferActive'
        ).returns(true);

        const windowStub = sinon.stub(
          session.apci,
          'hasSendWindow'
        );

        windowStub
          .onFirstCall()
          .returns(false);

        windowStub
          .onSecondCall()
          .returns(true);

        const interrogation =
          session.handleInterrogation({
            ca: 1
          });

        await clock.tickAsync(5);

        await interrogation;

        assert.strictEqual(
          buildASDUStub.called,
          true
        );
      } finally {
        clock.restore();
      }
    });

    it('sends ACTTERM after GI callback', async function () {
      await session.handleInterrogation({
        ca: 8
      });

      assert.strictEqual(
        session.sendInterrogationResponse.lastCall.calledWith(
          COT.ACTTERM,
          8
        ),
        true
      );
    });

    it('always ends GI in finally block', async function () {
      onGI.rejects(
        new Error('GI failed')
      );

      await assert.rejects(
        () =>
          session.handleInterrogation({
            ca: 9
          }),
        /GI failed/
      );

      assert.strictEqual(
        session.isGIActive(9),
        false
      );

      assert.strictEqual(
        session.publishStats.calledWith(true),
        true
      );
    });
  });

  describe('single command handling', function () {
    it('invokes command callback', async function () {
      const asdu = {
        typeId:
          TYPES.C_SC_NA_1.id
      };

      await session.handleSingleCommand(
        asdu,
        123
      );

      assert.strictEqual(
        onCommand.calledOnceWith(asdu),
        true
      );
    });

    it('completes inbound benchmark with start value', async function () {
      await session.handleSingleCommand(
        {},
        999
      );

      assert.strictEqual(
        onInboundComplete.calledOnceWith(
          999
        ),
        true
      );
    });

    it('uses null benchmark start by default', async function () {
      await session.handleSingleCommand({});

      assert.strictEqual(
        onInboundComplete.calledOnceWith(
          null
        ),
        true
      );
    });
  });

  describe('sendInterrogationResponse', function () {
    it('builds and sends interrogation response', function () {
      sinon.stub(
        session.apci,
        'buildInterrogationFrame'
      ).returns(
        Buffer.from([4])
      );

      const sendFrame = sinon.stub(
        session,
        'sendFrame'
      );

      const after = sinon.stub(
        session,
        'afterIFrameSent'
      );

      const result =
        session.sendInterrogationResponse(
          COT.ACTCON,
          5
        );

      assert.strictEqual(
        result,
        true
      );

      assert.strictEqual(
        session.apci.buildInterrogationFrame.calledOnceWith(
          COT.ACTCON,
          5
        ),
        true
      );

      assert.strictEqual(
        sendFrame.calledOnceWith(
          Buffer.from([4]),
          FRAME.I
        ),
        true
      );

      assert.strictEqual(
        after.calledOnce,
        true
      );
    });
  });

  describe('sendIFrame', function () {
    beforeEach(function () {
      sinon.stub(
        session.apci,
        'hasSendWindow'
      ).returns(true);

      sinon.stub(
        session.apci,
        'buildIFrame'
      ).returns(
        Buffer.from([5])
      );

      sinon.stub(
        session,
        'sendFrame'
      );

      sinon.stub(
        session,
        'afterIFrameSent'
      );
    });

    it('returns false outside DATA_TRANSFER', function () {
      session.state =
        STATE.CONNECTED;

      assert.strictEqual(
        session.sendIFrame(
          Buffer.from([1])
        ),
        false
      );
    });

    it('returns false when send window is full', function () {
      session.state =
        STATE.DATA_TRANSFER;

      session.apci.hasSendWindow.returns(
        false
      );

      assert.strictEqual(
        session.sendIFrame(
          Buffer.from([1])
        ),
        false
      );
    });

    it('builds and sends I frame', function () {
      session.state =
        STATE.DATA_TRANSFER;

      const asdu = Buffer.from([1]);

      assert.strictEqual(
        session.sendIFrame(asdu),
        true
      );

      assert.strictEqual(
        session.apci.buildIFrame.calledOnceWith(
          asdu
        ),
        true
      );

      assert.strictEqual(
        session.sendFrame.calledOnceWith(
          Buffer.from([5]),
          FRAME.I
        ),
        true
      );

      assert.strictEqual(
        session.afterIFrameSent.calledOnce,
        true
      );
    });
  });

  describe('afterIFrameSent', function () {
    it('starts T1 for first unconfirmed frame', function () {
      sinon.stub(
        session.apci,
        'unconfirmedCount'
      ).returns(1);

      sinon.stub(
        session.timers,
        'startT1'
      );

      sinon.stub(
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

      sinon.stub(
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
});