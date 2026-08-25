'use strict';

const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

const {
  STATE,
  CA,
  FRAME,
  U
} = require('../../../lib/core/constants');

describe('BaseSession', function () {
  let APCIStub;
  let TimersStub;
  let isValidFrameStub;
  let buildASDUStub;
  let parseASDUStub;

  let apci;
  let timers;

  let BaseSession;

  let onStateChange;
  let onStats;
  let onSessionStop;
  let onInboundComplete;
  let send;

  beforeEach(function () {
    apci = {
      ackSeq: 0,

      reset: sinon.spy(),

      updateRecvFromFrame: sinon.stub(),

      unconfirmedCount: sinon.stub().returns(0),
      hasSendWindow: sinon.stub().returns(true),
      shouldSendAck: sinon.stub().returns(false),

      ackSent: sinon.spy(),

      isIFrame: sinon.stub().returns(false),
      isSFrame: sinon.stub().returns(false),
      isUFrame: sinon.stub().returns(false),

      buildSFrame: sinon.stub().returns(
        Buffer.from([0x53])
      ),

      buildUFrame: sinon.stub().callsFake(code =>
        Buffer.from([code])
      ),

      buildIFrame: sinon.stub().returns(
        Buffer.from([0x49])
      ),

      getStatus: sinon.stub().returns({
        sendSeq: 1,
        recvSeq: 2
      })
    };

    APCIStub = sinon.stub().callsFake(function () {
      return apci;
    });

    timers = {
      startT1: sinon.spy(),
      stopT1: sinon.spy(),
      resetT1: sinon.spy(),

      startT2: sinon.spy(),
      stopT2: sinon.spy(),

      startT3: sinon.spy(),
      stopT3: sinon.spy(),
      resetT3: sinon.spy()
    };

    TimersStub = sinon.stub().callsFake(function (opts) {
      timers.options = opts;
      return timers;
    });

    isValidFrameStub = sinon.stub().returns(true);

    buildASDUStub = sinon.stub().returns(
      Buffer.from([1, 2, 3])
    );

    parseASDUStub = sinon.stub().returns({
      typeId: 1,
      cot: 3,
      ca: 1,
      objects: []
    });

    BaseSession = proxyquire(
      '../../../lib/protocol/baseSession',
      {
        './apci': APCIStub,
        './timers': TimersStub,
        '../core/validators': {
          isValidFrame: isValidFrameStub
        },
        '../asdu/asduBuilder': {
          buildASDU: buildASDUStub
        },
        '../asdu/asduParser': {
          parseASDU: parseASDUStub
        }
      }
    );

    onStateChange = sinon.spy();
    onStats = sinon.spy();
    onSessionStop = sinon.spy();
    onInboundComplete = sinon.spy();
    send = sinon.spy();
  });

  function createSession(overrides = {}) {
    return new BaseSession({
      k: 12,
      w: 8,
      t1: 15000,
      t2: 10000,
      t3: 20000,

      send,
      onStateChange,
      onStats,
      onSessionStop,
      onInboundComplete,

      ...overrides
    });
  }

  describe('initialization', function () {
    it('creates APCI with configured window sizes', function () {
      createSession();

      assert.strictEqual(
        APCIStub.calledOnce,
        true
      );

      assert.deepStrictEqual(
        APCIStub.firstCall.args[0],
        {
          k: 12,
          w: 8
        }
      );
    });

    it('creates timers with configured values', function () {
      createSession();

      const opts =
        TimersStub.firstCall.args[0];

      assert.strictEqual(opts.t1, 15000);
      assert.strictEqual(opts.t2, 10000);
      assert.strictEqual(opts.t3, 20000);

      assert.strictEqual(
        typeof opts.onT1,
        'function'
      );

      assert.strictEqual(
        typeof opts.onT2,
        'function'
      );

      assert.strictEqual(
        typeof opts.onT3,
        'function'
      );
    });

    it('initializes state as IDLE', function () {
      const session = createSession();

      assert.strictEqual(
        session.state,
        STATE.IDLE
      );

      assert.strictEqual(
        onStateChange.calledOnceWith(
          STATE.IDLE,
          'tcp.socket.init'
        ),
        true
      );
    });

    it('initializes runtime state', function () {
      const session = createSession();

      assert.deepStrictEqual(
        session.sendQueue,
        []
      );

      assert.strictEqual(
        session.awaitingTestCon,
        false
      );

      assert.strictEqual(
        session.lastStatsPublish,
        0
      );

      assert.ok(
        session.activeInterrogations instanceof Set
      );
    });

    it('uses safe default callbacks', function () {
      const session = new BaseSession();

      assert.doesNotThrow(() => {
        session.send();
        session.onStateChange();
        session.onStats();
        session.onSessionStop();
        session.onInboundComplete();
      });
    });
  });

  describe('timer callback wiring', function () {
    it('executes T1 timer callback', function () {
      const session = createSession();

      const handleT1Timeout = sinon.stub(
        session,
        'handleT1Timeout'
      );

      timers.options.onT1();

      assert.strictEqual(
        handleT1Timeout.calledOnce,
        true
      );
    });

    it('executes T2 timer callback', function () {
      const session = createSession();

      const handleT2Timeout = sinon.stub(
        session,
        'handleT2Timeout'
      );

      timers.options.onT2();

      assert.strictEqual(
        handleT2Timeout.calledOnce,
        true
      );
    });

    it('executes T3 timer callback', function () {
      const session = createSession();

      const handleT3Timeout = sinon.stub(
        session,
        'handleT3Timeout'
      );

      timers.options.onT3();

      assert.strictEqual(
        handleT3Timeout.calledOnce,
        true
      );
    });
  });

  describe('state handling', function () {
    it('changes state and publishes callback', function () {
      const session = createSession();

      onStateChange.resetHistory();

      session.setState(
        STATE.CONNECTED,
        'connected'
      );

      assert.strictEqual(
        session.state,
        STATE.CONNECTED
      );

      assert.strictEqual(
        onStateChange.calledOnceWith(
          STATE.CONNECTED,
          'connected'
        ),
        true
      );
    });

    it('does not publish unchanged state', function () {
      const session = createSession();

      onStateChange.resetHistory();

      session.setState(
        STATE.IDLE,
        'ignored'
      );

      assert.strictEqual(
        onStateChange.called,
        false
      );
    });

    it('reports active data transfer', function () {
      const session = createSession();

      session.state =
        STATE.DATA_TRANSFER;

      assert.strictEqual(
        session.isDataTransferActive(),
        true
      );

      session.state =
        STATE.CONNECTED;

      assert.strictEqual(
        session.isDataTransferActive(),
        false
      );
    });

    it('starts session', function () {
      const clock = sinon.useFakeTimers({
        now: 123456
      });

      try {
        const session = createSession();

        onStateChange.resetHistory();

        session.start();

        assert.strictEqual(
          session.stats.connectionStartedAt,
          123456
        );

        assert.strictEqual(
          session.state,
          STATE.CONNECTED
        );
      } finally {
        clock.restore();
      }
    });
  });

  describe('stop', function () {
    it('does nothing when already IDLE', function () {
      const session = createSession();

      session.stop('test');

      assert.strictEqual(
        onSessionStop.called,
        false
      );

      assert.strictEqual(
        apci.reset.called,
        false
      );
    });

    it('stops active session completely', function () {
      const session = createSession();

      session.state =
        STATE.DATA_TRANSFER;

      session.sendQueue.push({
        asdu: Buffer.from([1])
      });

      session.awaitingTestCon = true;

      session.activeInterrogations.add(1);

      session.stop('manual');

      assert.strictEqual(
        timers.stopT1.calledOnce,
        true
      );

      assert.strictEqual(
        timers.stopT2.calledOnce,
        true
      );

      assert.strictEqual(
        timers.stopT3.calledOnce,
        true
      );

      assert.strictEqual(
        apci.reset.calledOnce,
        true
      );

      assert.strictEqual(
        session.sendQueue.length,
        0
      );

      assert.strictEqual(
        session.awaitingTestCon,
        false
      );

      assert.strictEqual(
        session.activeInterrogations.size,
        0
      );

      assert.strictEqual(
        session.state,
        STATE.IDLE
      );
    });

    it('publishes session summary', function () {
      const session = createSession();

      session.state =
        STATE.DATA_TRANSFER;

      session.stop('manual');

      assert.strictEqual(
        onSessionStop.calledOnce,
        true
      );

      const summary =
        onSessionStop.firstCall.args[0];

      assert.strictEqual(
        summary.reason,
        'manual'
      );

      assert.strictEqual(
        summary.state,
        STATE.DATA_TRANSFER
      );

      assert.strictEqual(
        typeof summary.stoppedAt,
        'number'
      );
    });

    it('uses empty stop reason when omitted', function () {
      const session = createSession();

      session.state =
        STATE.CONNECTED;

      session.stop();

      assert.strictEqual(
        onSessionStop.firstCall.args[0].reason,
        ''
      );
    });
  });

  describe('remote ACK processing', function () {
    it('returns false when ACK does not change', function () {
      const session = createSession();

      apci.ackSeq = 5;

      apci.updateRecvFromFrame.callsFake(() => {
        apci.ackSeq = 5;
      });

      assert.strictEqual(
        session.processRemoteAck(
          Buffer.from([1])
        ),
        false
      );
    });

    it('stops T1 when all frames are acknowledged', function () {
      const session = createSession();

      apci.ackSeq = 1;

      apci.updateRecvFromFrame.callsFake(() => {
        apci.ackSeq = 2;
      });

      apci.unconfirmedCount.returns(0);

      sinon.stub(
        session,
        'flushSendQueue'
      );

      assert.strictEqual(
        session.processRemoteAck(
          Buffer.from([1])
        ),
        true
      );

      assert.strictEqual(
        timers.stopT1.calledOnce,
        true
      );
    });

    it('resets T1 when unconfirmed frames remain', function () {
      const session = createSession();

      apci.ackSeq = 1;

      apci.updateRecvFromFrame.callsFake(() => {
        apci.ackSeq = 2;
      });

      apci.unconfirmedCount.returns(2);

      sinon.stub(
        session,
        'flushSendQueue'
      );

      session.processRemoteAck(
        Buffer.from([1])
      );

      assert.strictEqual(
        timers.resetT1.calledOnce,
        true
      );
    });

    it('flushes send queue after new ACK', function () {
      const session = createSession();

      apci.ackSeq = 1;

      apci.updateRecvFromFrame.callsFake(() => {
        apci.ackSeq = 2;
      });

      const flush = sinon.stub(
        session,
        'flushSendQueue'
      );

      session.processRemoteAck(
        Buffer.from([1])
      );

      assert.strictEqual(
        flush.calledOnce,
        true
      );
    });
  });

  describe('frame handling', function () {
    it('rejects invalid frame', async function () {
      const session = createSession();

      isValidFrameStub.returns(false);

      const result =
        await session.handleFrame(
          Buffer.from([1])
        );

      assert.strictEqual(
        result,
        false
      );
    });

    it('handles U frame', async function () {
      const session = createSession();

      apci.isUFrame.returns(true);

      const handle = sinon.stub(
        session,
        'handleUFrame'
      ).resolves();

      const buf = Buffer.from([1]);

      const result =
        await session.handleFrame(buf);

      assert.strictEqual(result, true);

      assert.strictEqual(
        handle.calledOnceWith(buf),
        true
      );
    });

    it('handles S frame', async function () {
      const session = createSession();

      apci.isSFrame.returns(true);

      const handle = sinon.stub(
        session,
        'handleSFrame'
      );

      const result =
        await session.handleFrame(
          Buffer.from([1])
        );

      assert.strictEqual(result, true);

      assert.strictEqual(
        handle.calledOnce,
        true
      );
    });

    it('handles I frame with benchmark start', async function () {
      const session = createSession();

      apci.isIFrame.returns(true);

      const handle = sinon.stub(
        session,
        'handleIFrame'
      ).resolves();

      const buf = Buffer.from([1]);

      const result =
        await session.handleFrame(
          buf,
          123
        );

      assert.strictEqual(result, true);

      assert.strictEqual(
        handle.calledOnceWith(
          buf,
          123
        ),
        true
      );
    });

    it('returns false for unknown valid frame type', async function () {
      const session = createSession();

      const result =
        await session.handleFrame(
          Buffer.from([1])
        );

      assert.strictEqual(
        result,
        false
      );
    });
  });

  describe('S frame handling', function () {
    it('processes ACK and publishes stats', function () {
      const session = createSession();

      const ack = sinon.stub(
        session,
        'processRemoteAck'
      );

      const publish = sinon.stub(
        session,
        'publishStats'
      );

      const buf = Buffer.from([1]);

      session.handleSFrame(buf);

      assert.strictEqual(
        ack.calledOnceWith(buf),
        true
      );

      assert.strictEqual(
        publish.calledOnce,
        true
      );
    });
  });

  describe('abstract methods', function () {
    it('throws when handleUFrame is not implemented', function () {
      const session = createSession();

      assert.throws(
        () => session.handleUFrame(),
        /BaseSession must implement handleUFrame/
      );
    });

    it('throws when handleASDU is not implemented', function () {
      const session = createSession();

      assert.throws(
        () => session.handleASDU(),
        /BaseSession must implement handleASDU/
      );
    });
  });

  describe('I frame handling', function () {
    it('sends S frame when ACK threshold is reached', async function () {
      const session = createSession();

      apci.shouldSendAck.returns(true);

      sinon.stub(
        session,
        'processRemoteAck'
      );

      sinon.stub(
        session,
        'publishStats'
      );

      const sendFrame = sinon.stub(
        session,
        'sendFrame'
      );

      sinon.stub(
        session,
        'handleASDU'
      ).resolves();

      await session.handleIFrame(
        Buffer.from([1])
      );

      assert.strictEqual(
        apci.buildSFrame.calledOnce,
        true
      );

      assert.strictEqual(
        sendFrame.calledOnceWith(
          Buffer.from([0x53]),
          FRAME.S
        ),
        true
      );
    });

    it('starts T2 when immediate ACK is not required', async function () {
      const session = createSession();

      apci.shouldSendAck.returns(false);

      sinon.stub(
        session,
        'processRemoteAck'
      );

      sinon.stub(
        session,
        'publishStats'
      );

      sinon.stub(
        session,
        'handleASDU'
      ).resolves();

      await session.handleIFrame(
        Buffer.from([1])
      );

      assert.strictEqual(
        timers.startT2.calledOnce,
        true
      );
    });

    it('parses ASDU and forwards benchmark value', async function () {
      const session = createSession();

      sinon.stub(
        session,
        'processRemoteAck'
      );

      sinon.stub(
        session,
        'publishStats'
      );

      const handle = sinon.stub(
        session,
        'handleASDU'
      ).resolves();

      const buf = Buffer.from([1]);

      await session.handleIFrame(
        buf,
        777
      );

      assert.strictEqual(
        parseASDUStub.calledOnceWith(buf),
        true
      );

      assert.strictEqual(
        handle.calledOnceWith(
          parseASDUStub.firstCall.returnValue,
          buf,
          777
        ),
        true
      );
    });
  });

  describe('timer callbacks', function () {
    it('stops session on T1 timeout', function () {
      const session = createSession();

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

    it('does nothing on T2 timeout outside DATA_TRANSFER', function () {
      const session = createSession();

      session.state =
        STATE.CONNECTED;

      session.handleT2Timeout();

      assert.strictEqual(
        send.called,
        false
      );
    });

    it('sends S frame on T2 timeout during DATA_TRANSFER', function () {
      const session = createSession();

      session.state =
        STATE.DATA_TRANSFER;

      const sendFrame = sinon.stub(
        session,
        'sendFrame'
      );

      session.handleT2Timeout();

      assert.strictEqual(
        sendFrame.calledOnceWith(
          Buffer.from([0x53]),
          FRAME.S
        ),
        true
      );
    });

    it('stops session on repeated T3 timeout', function () {
      const session = createSession();

      session.awaitingTestCon = true;

      const stop = sinon.stub(
        session,
        'stop'
      );

      session.handleT3Timeout();

      assert.strictEqual(
        stop.calledOnceWith(
          'T3 Timeout'
        ),
        true
      );
    });

    it('sends TESTFR_ACT on first T3 timeout', function () {
      const session = createSession();

      const sendFrame = sinon.stub(
        session,
        'sendFrame'
      );

      session.handleT3Timeout();

      assert.strictEqual(
        session.awaitingTestCon,
        true
      );

      assert.strictEqual(
        session.stats.testFrActSent,
        1
      );

      assert.strictEqual(
        apci.buildUFrame.calledOnceWith(
          U.TESTFR_ACT
        ),
        true
      );

      assert.strictEqual(
        sendFrame.calledOnce,
        true
      );
    });
  });

  describe('sending', function () {
    it('acks received frames for I frame transmission', function () {
      const session = createSession();

      session.sendFrame(
        Buffer.from([1]),
        FRAME.I
      );

      assert.strictEqual(
        apci.ackSent.calledOnce,
        true
      );

      assert.strictEqual(
        timers.stopT2.calledOnce,
        true
      );
    });

    it('acks received frames for S frame transmission', function () {
      const session = createSession();

      session.sendFrame(
        Buffer.from([1]),
        FRAME.S
      );

      assert.strictEqual(
        apci.ackSent.calledOnce,
        true
      );
    });

    it('does not call ackSent for U frame', function () {
      const session = createSession();

      session.sendFrame(
        Buffer.from([1]),
        FRAME.U
      );

      assert.strictEqual(
        apci.ackSent.called,
        false
      );
    });

    it('updates transmit statistics', function () {
      const clock = sinon.useFakeTimers({
        now: 1234
      });

      try {
        const session = createSession();

        session.sendFrame(
          Buffer.from([1]),
          FRAME.I
        );

        assert.strictEqual(
          session.stats.iTx,
          1
        );

        assert.strictEqual(
          session.stats.lastTxAt,
          1234
        );

        assert.strictEqual(
          session.stats.lastFrameType,
          'I-TX'
        );
      } finally {
        clock.restore();
      }
    });

    it('forwards benchmark and message to send callback', function () {
      const session = createSession();

      const frame =
        Buffer.from([1]);

      const msg = {
        payload: 1
      };

      session.sendFrame(
        frame,
        FRAME.I,
        123,
        msg
      );

      assert.strictEqual(
        send.calledOnceWith(
          frame,
          123,
          msg
        ),
        true
      );
    });
  });

  describe('sendPoint', function () {
    it('rejects point when ASDU cannot be built', function () {
      const session = createSession();

      buildASDUStub.returns(null);

      assert.strictEqual(
        session.sendPoint(
          {},
          3
        ),
        false
      );

      assert.strictEqual(
        session.sendQueue.length,
        0
      );
    });

    it('queues valid point and flushes queue', function () {
      const session = createSession();

      const flush = sinon.stub(
        session,
        'flushSendQueue'
      );

      const point = {
        type: 'M_SP_NA_1'
      };

      const msg = {
        payload: point
      };

      const result =
        session.sendPoint(
          point,
          3,
          123,
          msg
        );

      assert.strictEqual(
        result,
        true
      );

      assert.strictEqual(
        session.sendQueue.length,
        1
      );

      assert.deepStrictEqual(
        session.sendQueue[0],
        {
          asdu: Buffer.from([1, 2, 3]),
          benchStart: 123,
          msg
        }
      );

      assert.strictEqual(
        flush.calledOnce,
        true
      );
    });
  });

  describe('flushSendQueue', function () {
    it('does nothing outside DATA_TRANSFER', function () {
      const session = createSession();

      session.state =
        STATE.CONNECTED;

      session.sendQueue.push({
        asdu: Buffer.from([1])
      });

      session.flushSendQueue();

      assert.strictEqual(
        session.sendQueue.length,
        1
      );
    });

    it('does not send when send window is full', function () {
      const session = createSession();

      session.state =
        STATE.DATA_TRANSFER;

      apci.hasSendWindow.returns(false);

      session.sendQueue.push({
        asdu: Buffer.from([1])
      });

      session.flushSendQueue();

      assert.strictEqual(
        send.called,
        false
      );
    });

    it('flushes queued I frame', function () {
      const session = createSession();

      session.state =
        STATE.DATA_TRANSFER;

      session.sendQueue.push({
        asdu: Buffer.from([1]),
        benchStart: 99,
        msg: {
          id: 1
        }
      });

      const sendFrame = sinon.stub(
        session,
        'sendFrame'
      );

      apci.unconfirmedCount.returns(2);

      session.flushSendQueue();

      assert.strictEqual(
        apci.buildIFrame.calledOnce,
        true
      );

      assert.strictEqual(
        sendFrame.calledOnceWith(
          Buffer.from([0x49]),
          FRAME.I,
          99,
          sinon.match({
            id: 1
          })
        ),
        true
      );

      assert.strictEqual(
        session.sendQueue.length,
        0
      );

      assert.strictEqual(
        timers.resetT3.calledOnce,
        true
      );
    });

    it('starts T1 for first unconfirmed I frame', function () {
      const session = createSession();

      session.state =
        STATE.DATA_TRANSFER;

      session.sendQueue.push({
        asdu: Buffer.from([1])
      });

      sinon.stub(
        session,
        'sendFrame'
      );

      apci.unconfirmedCount.returns(1);

      session.flushSendQueue();

      assert.strictEqual(
        timers.startT1.calledOnce,
        true
      );
    });
  });

  describe('statistics', function () {
    it('publishes statistics', function () {
      const session = createSession();

      onStats.resetHistory();

      session.publishStats(true);

      assert.strictEqual(
        onStats.calledOnce,
        true
      );
    });

    it('throttles repeated statistics publication', function () {
      const clock = sinon.useFakeTimers({
        now: 1000
      });

      try {
        const session = createSession();

        onStats.resetHistory();

        session.publishStats();
        session.publishStats();

        assert.strictEqual(
          onStats.callCount,
          1
        );
      } finally {
        clock.restore();
      }
    });

    it('publishes when throttle interval has elapsed', function () {
      const clock = sinon.useFakeTimers({
        now: 1000
      });

      try {
        const session = createSession();

        onStats.resetHistory();

        session.publishStats();

        clock.tick(251);

        session.publishStats();

        assert.strictEqual(
          onStats.callCount,
          2
        );
      } finally {
        clock.restore();
      }
    });

    it('force overrides statistics throttle', function () {
      const clock = sinon.useFakeTimers({
        now: 1000
      });

      try {
        const session = createSession();

        onStats.resetHistory();

        session.publishStats();
        session.publishStats(true);

        assert.strictEqual(
          onStats.callCount,
          2
        );
      } finally {
        clock.restore();
      }
    });

    it('resets statistics', function () {
      const session = createSession();

      session.stats.iTx = 10;
      session.stats.giCount = 3;

      session.resetStats();

      assert.strictEqual(
        session.stats.iTx,
        0
      );

      assert.strictEqual(
        session.stats.giCount,
        0
      );

      assert.strictEqual(
        session.stats.connectionStartedAt,
        null
      );
    });

    it('records received I frame', function () {
      const session = createSession();

      apci.isIFrame.returns(true);

      session.recordReceivedFrame(
        Buffer.from([1])
      );

      assert.strictEqual(
        session.stats.iRx,
        1
      );

      assert.strictEqual(
        session.stats.lastFrameType,
        'I-RX'
      );
    });

    it('records received S frame', function () {
      const session = createSession();

      apci.isSFrame.returns(true);

      session.recordReceivedFrame(
        Buffer.from([1])
      );

      assert.strictEqual(
        session.stats.sRx,
        1
      );

      assert.strictEqual(
        session.stats.lastFrameType,
        'S-RX'
      );
    });

    it('records received U frame', function () {
      const session = createSession();

      apci.isUFrame.returns(true);

      session.recordReceivedFrame(
        Buffer.from([1])
      );

      assert.strictEqual(
        session.stats.uRx,
        1
      );

      assert.strictEqual(
        session.stats.lastFrameType,
        'U-RX'
      );
    });

    it('bundles APCI, stats, timers and GI state', function () {
      const session = createSession();

      session.awaitingTestCon = true;

      session.activeInterrogations.add(
        CA.BROADCAST
      );

      session.activeInterrogations.add(3);

      const result =
        session.bundleStatistics();

      assert.deepStrictEqual(
        result.apci,
        {
          sendSeq: 1,
          recvSeq: 2
        }
      );

      assert.strictEqual(
        result.timers.awaitingTestCon,
        true
      );

      assert.strictEqual(
        result.gi.active,
        true
      );

      assert.deepStrictEqual(
        result.gi.cas,
        [
          'BROADCAST',
          3
        ]
      );
    });

    it('reports GI as inactive when none are active', function () {
      const session = createSession();

      const result =
        session.bundleStatistics();

      assert.strictEqual(
        result.gi.active,
        false
      );

      assert.deepStrictEqual(
        result.gi.cas,
        []
      );
    });
  });

  describe('GI state', function () {
    it('begins GI', function () {
      const session = createSession();

      assert.strictEqual(
        session.beginGI(1),
        true
      );

      assert.strictEqual(
        session.isGIActive(1),
        true
      );
    });

    it('rejects duplicate GI', function () {
      const session = createSession();

      session.beginGI(1);

      assert.strictEqual(
        session.beginGI(1),
        false
      );
    });

    it('ends GI', function () {
      const session = createSession();

      session.beginGI(1);
      session.endGI(1);

      assert.strictEqual(
        session.isGIActive(1),
        false
      );
    });
  });
});