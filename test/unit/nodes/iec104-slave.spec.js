'use strict';

const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

const IEC104 = require('../../../lib/core/constants');
const BENCHMARK = require('../../../lib/core/benchmarkDefinitions');

describe('iec104-slave node', function () {
  let RED;
  let NodeConstructor;

  let sessionInstance;
  let tcpInstance;
  let statusPublisherInstance;
  let benchmarkInstance;

  let SessionStub;
  let TcpServerStub;
  let StatusPublisherStub;
  let BenchmarkStub;
  let registerRoutesStub;
  let isValidPointStub;

  let registerNode;

  beforeEach(function () {
    sessionInstance = {
      start: sinon.spy(),
      stop: sinon.spy(),
      handleFrame: sinon.stub().resolves(),
      sendPoint: sinon.spy()
    };

    SessionStub = sinon.stub().callsFake(function (options) {
      sessionInstance.options = options;
      return sessionInstance;
    });

    tcpInstance = {
      start: sinon.spy(),
      stop: sinon.spy(),
      send: sinon.spy()
    };

    TcpServerStub = sinon.stub().callsFake(function (options) {
      tcpInstance.options = options;
      return tcpInstance;
    });

    statusPublisherInstance = {
      publishState: sinon.spy(),
      publishStats: sinon.spy(),
      closeAll: sinon.spy()
    };

    StatusPublisherStub = sinon.stub().callsFake(function () {
      return statusPublisherInstance;
    });

    benchmarkInstance = {
      setEnabled: sinon.spy(),
      start: sinon.stub(),
      result: sinon.stub(),
      metricSnapshot: sinon.stub()
    };

    BenchmarkStub = sinon.stub().callsFake(function (options) {
      benchmarkInstance.options = options;
      return benchmarkInstance;
    });

    registerRoutesStub = sinon.spy();
    isValidPointStub = sinon.stub();

    RED = {
      nodes: {
        createNode(node) {
          node.on = sinon.stub();
          node.emit = sinon.spy();
          node.error = sinon.spy();
        },

        registerType(name, ctor) {
          assert.strictEqual(name, 'iec104-slave');
          NodeConstructor = ctor;
        }
      }
    };

    registerNode = proxyquire('../../../iec104-slave', {
      './lib/protocol/slaveSession': SessionStub,
      './lib/core/statusPublisher': StatusPublisherStub,
      './lib/tcp/server': TcpServerStub,
      './lib/core/benchmark': BenchmarkStub,
      './lib/admin/routes': registerRoutesStub,
      './lib/core/validators': {
        isValidPoint: isValidPointStub
      }
    });

    registerNode(RED);
  });

  function createNode(overrides = {}) {
    const config = {
      port: '2404',

      t1: '15',
      t2: '10',
      t3: '20',

      k_win: '12',
      w_win: '8',

      benchmark_max_frames: '1000',
      benchmark_outbound: false,
      benchmark_inbound_command: false,

      ...overrides
    };

    return new NodeConstructor(config);
  }

  function getHandler(node, eventName) {
    const call = node.on
      .getCalls()
      .find(call => call.args[0] === eventName);

    assert.ok(
      call,
      `handler for ${eventName} not registered`
    );

    return call.args[1];
  }

  describe('registration', function () {
    it('registers routes and node type', function () {
      assert.strictEqual(
        registerRoutesStub.calledOnceWith(RED),
        true
      );

      assert.strictEqual(
        typeof NodeConstructor,
        'function'
      );
    });
  });

  describe('initialization', function () {
    it('initializes configuration correctly', function () {
      const node = createNode();

      assert.strictEqual(node.port, 2404);

      assert.strictEqual(node.t1, 15000);
      assert.strictEqual(node.t2, 10000);
      assert.strictEqual(node.t3, 20000);

      assert.strictEqual(node.k, 12);
      assert.strictEqual(node.w, 8);

      assert.strictEqual(node.currentState, 'IDLE');
      assert.strictEqual(
        node.currentReason,
        'tcp.socket.init'
      );

      assert.strictEqual(
        typeof node.currentTs,
        'number'
      );

      assert.ok(node.processImage instanceof Map);
    });

    it('creates benchmark with configured options', function () {
      createNode({
        benchmark_max_frames: '500'
      });

      const opts = BenchmarkStub.firstCall.args[0];

      assert.strictEqual(opts.maxFrames, 500);
      assert.strictEqual(
        opts.lowestDiscernibleValue,
        1
      );
      assert.strictEqual(
        opts.highestTrackableValue,
        10_000_000_000
      );
      assert.strictEqual(
        opts.numberOfSignificantValueDigits,
        3
      );
    });

    it('enables outbound benchmark when configured', function () {
      createNode({
        benchmark_outbound: true
      });

      assert.strictEqual(
        benchmarkInstance.setEnabled.calledWith(
          BENCHMARK.OUTBOUND.id,
          true
        ),
        true
      );
    });

    it('disables outbound benchmark by default', function () {
      createNode();

      assert.strictEqual(
        benchmarkInstance.setEnabled.calledWith(
          BENCHMARK.OUTBOUND.id,
          false
        ),
        true
      );
    });

    it('enables inbound command benchmark when configured', function () {
      createNode({
        benchmark_inbound_command: true
      });

      assert.strictEqual(
        benchmarkInstance.setEnabled.calledWith(
          BENCHMARK.INBOUND_COMMAND.id,
          true
        ),
        true
      );
    });

    it('disables inbound command benchmark by default', function () {
      createNode();

      assert.strictEqual(
        benchmarkInstance.setEnabled.calledWith(
          BENCHMARK.INBOUND_COMMAND.id,
          false
        ),
        true
      );
    });

    it('passes session configuration', function () {
      createNode();

      const opts = SessionStub.firstCall.args[0];

      assert.strictEqual(opts.t1, 15000);
      assert.strictEqual(opts.t2, 10000);
      assert.strictEqual(opts.t3, 20000);
      assert.strictEqual(opts.k, 12);
      assert.strictEqual(opts.w, 8);
    });

    it('passes TCP configuration', function () {
      createNode();

      const opts = TcpServerStub.firstCall.args[0];

      assert.strictEqual(opts.port, 2404);
    });

    it('starts TCP server', function () {
      createNode();

      assert.strictEqual(
        tcpInstance.start.calledOnce,
        true
      );
    });
  });

  describe('session send callback', function () {
    it('sends data through TCP', function () {
      createNode();

      const data = Buffer.from([1, 2, 3]);

      benchmarkInstance.result.returns({
        completed: false
      });

      sessionInstance.options.send(
        data,
        123,
        null
      );

      assert.strictEqual(
        tcpInstance.send.calledOnceWith(data),
        true
      );
    });

    it('evaluates outbound benchmark result', function () {
      createNode();

      benchmarkInstance.result.returns({
        completed: false
      });

      sessionInstance.options.send(
        Buffer.from([1]),
        123,
        null
      );

      assert.strictEqual(
        benchmarkInstance.result.calledOnceWith(
          BENCHMARK.OUTBOUND.id,
          123
        ),
        true
      );
    });

    it('uses default benchStart and msg when omitted', function () {
      const node = createNode();

      benchmarkInstance.result.returns({
        completed: false
      });

      const data = Buffer.from([1, 2, 3]);

      sessionInstance.options.send(data);

      assert.strictEqual(
        benchmarkInstance.result.calledOnceWith(
          BENCHMARK.OUTBOUND.id,
          null
        ),
        true
      );

      assert.strictEqual(
        tcpInstance.send.calledOnceWith(data),
        true
      );

      const [eventName, msg] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:data'
      );

      assert.strictEqual(
        msg.asdu,
        data
      );

      assert.strictEqual(
        typeof msg.ts,
        'number'
      );
    });

    it('emits data event with existing msg', function () {
      const node = createNode();

      benchmarkInstance.result.returns({
        completed: false
      });

      const msg = {
        topic: 'original'
      };

      const data = Buffer.from([1, 2, 3]);

      sessionInstance.options.send(
        data,
        123,
        msg
      );

      const [eventName, emittedMsg] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:data'
      );

      assert.strictEqual(
        emittedMsg,
        msg
      );

      assert.strictEqual(
        emittedMsg.asdu,
        data
      );

      assert.strictEqual(
        typeof emittedMsg.ts,
        'number'
      );
    });

    it('creates message when msg is null', function () {
      const node = createNode();

      benchmarkInstance.result.returns({
        completed: false
      });

      const data = Buffer.from([1]);

      sessionInstance.options.send(
        data,
        null,
        null
      );

      const [eventName, msg] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:data'
      );

      assert.strictEqual(
        msg.asdu,
        data
      );

      assert.strictEqual(
        typeof msg.ts,
        'number'
      );
    });
  });

  describe('benchmark result handling', function () {
    it('does not emit benchmark event when result is incomplete', function () {
      const node = createNode();

      benchmarkInstance.result.returns({
        completed: false
      });

      sessionInstance.options.send(
        Buffer.from([1]),
        123,
        null
      );

      const benchmarkEvents = node.emit
        .getCalls()
        .filter(call =>
          call.args[1]?.topic === 'benchmark'
        );

      assert.strictEqual(
        benchmarkEvents.length,
        0
      );
    });

    it('does not emit benchmark event when result is null', function () {
      const node = createNode();

      benchmarkInstance.result.returns(null);

      sessionInstance.options.send(
        Buffer.from([1]),
        123,
        null
      );

      const benchmarkEvents = node.emit
        .getCalls()
        .filter(call =>
          call.args[1]?.topic === 'benchmark'
        );

      assert.strictEqual(
        benchmarkEvents.length,
        0
      );
    });

    it('emits outbound benchmark result when completed', function () {
      const node = createNode();

      benchmarkInstance.result.returns({
        completed: true
      });

      benchmarkInstance.metricSnapshot.returns({
        count: 100
      });

      sessionInstance.options.send(
        Buffer.from([1]),
        123,
        null
      );

      const benchmarkCall = node.emit
        .getCalls()
        .find(call =>
          call.args[1]?.topic === 'benchmark'
        );

      assert.ok(benchmarkCall);

      assert.strictEqual(
        benchmarkCall.args[0],
        'iec104:status'
      );

      assert.deepStrictEqual(
        benchmarkCall.args[1].payload,
        {
          count: 100
        }
      );

      assert.strictEqual(
        benchmarkInstance.metricSnapshot.calledOnceWith(
          BENCHMARK.OUTBOUND.id
        ),
        true
      );
    });

    it('handles completed inbound command benchmark', function () {
      const node = createNode();

      benchmarkInstance.result.returns({
        completed: true
      });

      benchmarkInstance.metricSnapshot.returns({
        count: 5
      });

      sessionInstance.options.onInboundComplete(
        555
      );

      assert.strictEqual(
        benchmarkInstance.result.calledOnceWith(
          BENCHMARK.INBOUND_COMMAND.id,
          555
        ),
        true
      );

      const benchmarkCall = node.emit
        .getCalls()
        .find(call =>
          call.args[1]?.topic === 'benchmark'
        );

      assert.ok(benchmarkCall);

      assert.deepStrictEqual(
        benchmarkCall.args[1].payload,
        {
          count: 5
        }
      );
    });

    it('does not emit incomplete inbound benchmark', function () {
      const node = createNode();

      benchmarkInstance.result.returns({
        completed: false
      });

      sessionInstance.options.onInboundComplete(
        555
      );

      assert.strictEqual(
        node.emit.called,
        false
      );
    });
  });

  describe('session callbacks', function () {
    it('publishes state changes', function () {
      createNode();

      sessionInstance.options.onStateChange(
        'DATA_TRANSFER',
        'ready'
      );

      assert.strictEqual(
        statusPublisherInstance.publishState.calledOnceWith(
          'DATA_TRANSFER',
          'ready'
        ),
        true
      );
    });

    it('publishes stats', function () {
      createNode();

      sessionInstance.options.onStats();

      assert.strictEqual(
        statusPublisherInstance.publishStats.calledOnce,
        true
      );
    });

    it('emits session summary', function () {
      const node = createNode();

      const summary = {
        frames: 10
      };

      sessionInstance.options.onSessionStop(summary);

      const [eventName, msg] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:status'
      );

      assert.strictEqual(
        msg.topic,
        'iec104/session-summary'
      );

      assert.deepStrictEqual(
        msg.payload,
        summary
      );

      assert.strictEqual(
        typeof msg.ts,
        'number'
      );
    });
  });

  describe('GI handling', function () {
    it('sends points for selected CA sorted by IOA', async function () {
      const node = createNode();

      node.processImage.set('1:10', {
        ca: 1,
        ioa: 10
      });

      node.processImage.set('1:2', {
        ca: 1,
        ioa: 2
      });

      node.processImage.set('2:1', {
        ca: 2,
        ioa: 1
      });

      const sendPoint = sinon.stub().resolves();

      await sessionInstance.options.onGI(
        1,
        sendPoint
      );

      assert.strictEqual(
        sendPoint.callCount,
        2
      );

      assert.strictEqual(
        sendPoint.firstCall.args[0].ioa,
        2
      );

      assert.strictEqual(
        sendPoint.secondCall.args[0].ioa,
        10
      );
    });

    it('sends all points for broadcast CA', async function () {
      const node = createNode();

      node.processImage.set('1:10', {
        ca: 1,
        ioa: 10
      });

      node.processImage.set('2:2', {
        ca: 2,
        ioa: 2
      });

      node.processImage.set('3:5', {
        ca: 3,
        ioa: 5
      });

      const sendPoint = sinon.stub().resolves();

      await sessionInstance.options.onGI(
        IEC104.CA.BROADCAST,
        sendPoint
      );

      assert.strictEqual(
        sendPoint.callCount,
        3
      );

      assert.deepStrictEqual(
        sendPoint.getCalls().map(
          call => call.args[0].ioa
        ),
        [2, 5, 10]
      );
    });

    it('sends no points when selected CA has no entries', async function () {
      const node = createNode();

      node.processImage.set('1:1', {
        ca: 1,
        ioa: 1
      });

      const sendPoint = sinon.stub().resolves();

      await sessionInstance.options.onGI(
        2,
        sendPoint
      );

      assert.strictEqual(
        sendPoint.called,
        false
      );
    });
  });

  describe('command callback', function () {
    it('handles inbound command callback', async function () {
      createNode();

      const logStub = sinon.stub(
        console,
        'log'
      );

      try {
        const asdu = {
          type: 'C_SC_NA_1'
        };

        await sessionInstance.options.onCommand(
          asdu
        );

        assert.strictEqual(
          logStub.calledOnceWith(asdu),
          true
        );
      } finally {
        logStub.restore();
      }
    });
  });

  describe('TCP callbacks', function () {
    it('starts inbound benchmark and forwards frame', async function () {
      const node = createNode();

      benchmarkInstance.start
        .withArgs(BENCHMARK.INBOUND_COMMAND.id)
        .returns(12345);

      const frame = Buffer.from([1, 2]);

      tcpInstance.options.onFrame(frame);

      await Promise.resolve();

      assert.strictEqual(
        benchmarkInstance.start.calledOnceWith(
          BENCHMARK.INBOUND_COMMAND.id
        ),
        true
      );

      assert.strictEqual(
        sessionInstance.handleFrame.calledOnceWith(
          frame,
          12345
        ),
        true
      );

      assert.strictEqual(
        node.error.called,
        false
      );
    });

    it('reports frame handling errors', async function () {
      const node = createNode();

      const error = new Error(
        'broken frame'
      );

      benchmarkInstance.start.returns(123);

      sessionInstance.handleFrame.rejects(
        error
      );

      tcpInstance.options.onFrame(
        Buffer.from([1])
      );

      await Promise.resolve();
      await Promise.resolve();

      assert.strictEqual(
        node.error.calledOnceWith(error),
        true
      );
    });

    it('starts session on TCP connect', function () {
      createNode();

      tcpInstance.options.onConnect();

      assert.strictEqual(
        sessionInstance.start.calledOnce,
        true
      );
    });

    it('stops session with tcp-prefixed reason on disconnect', function () {
      createNode();

      tcpInstance.options.onDisconnect(
        'close'
      );

      assert.strictEqual(
        sessionInstance.stop.calledOnceWith(
          'tcp.close'
        ),
        true
      );
    });
  });

  describe('iec104:input handling', function () {
    it('starts outbound benchmark for valid point', function () {
      const node = createNode();

      const handler =
        getHandler(node, 'iec104:input');

      const point = {
        ca: 1,
        ioa: 2,
        value: true
      };

      isValidPointStub.returns(true);
      benchmarkInstance.start.returns(987);

      handler({
        payload: point
      });

      assert.strictEqual(
        benchmarkInstance.start.calledOnceWith(
          BENCHMARK.OUTBOUND.id
        ),
        true
      );
    });

    it('rejects invalid point', function () {
      const node = createNode();

      const handler =
        getHandler(node, 'iec104:input');

      const point = {
        value: true
      };

      isValidPointStub.returns(false);

      handler({
        payload: point
      });

      assert.strictEqual(
        node.error.calledOnceWith(
          'Invalid IEC104 point'
        ),
        true
      );

      assert.strictEqual(
        sessionInstance.sendPoint.called,
        false
      );

      assert.strictEqual(
        node.processImage.size,
        0
      );
    });

    it('stores valid point in process image', function () {
      const node = createNode();

      const handler =
        getHandler(node, 'iec104:input');

      const point = {
        ca: 2,
        ioa: 10,
        value: 42
      };

      isValidPointStub.returns(true);
      benchmarkInstance.start.returns(123);

      handler({
        payload: point
      });

      assert.deepStrictEqual(
        node.processImage.get('2:10'),
        point
      );
    });

    it('sends valid point as spontaneous transmission', function () {
      const node = createNode();

      const handler =
        getHandler(node, 'iec104:input');

      const point = {
        ca: 2,
        ioa: 10,
        value: 42
      };

      const msg = {
        payload: point
      };

      isValidPointStub.returns(true);
      benchmarkInstance.start.returns(123);

      handler(msg);

      assert.strictEqual(
        sessionInstance.sendPoint.calledOnceWith(
          point,
          IEC104.COT.SPONT,
          123,
          msg
        ),
        true
      );
    });

    it('overwrites existing process image point with same CA and IOA', function () {
      const node = createNode();

      const handler =
        getHandler(node, 'iec104:input');

      const first = {
        ca: 1,
        ioa: 5,
        value: 1
      };

      const second = {
        ca: 1,
        ioa: 5,
        value: 2
      };

      isValidPointStub.returns(true);
      benchmarkInstance.start.returns(1);

      handler({
        payload: first
      });

      handler({
        payload: second
      });

      assert.deepStrictEqual(
        node.processImage.get('1:5'),
        second
      );

      assert.strictEqual(
        node.processImage.size,
        1
      );
    });
  });

  describe('close handling', function () {
    it('closes status publisher and stops TCP server', function () {
      const node = createNode();

      const handler =
        getHandler(node, 'close');

      const done = sinon.spy();

      handler(done);

      assert.strictEqual(
        statusPublisherInstance.closeAll.calledOnce,
        true
      );

      assert.strictEqual(
        tcpInstance.stop.calledOnceWith(done),
        true
      );
    });

    it('calls done directly when TCP server is missing', function () {
      const node = createNode();

      const handler =
        getHandler(node, 'close');

      node.tcp = null;

      const done = sinon.spy();

      handler(done);

      assert.strictEqual(
        statusPublisherInstance.closeAll.calledOnce,
        true
      );

      assert.strictEqual(
        done.calledOnce,
        true
      );

      assert.strictEqual(
        tcpInstance.stop.called,
        false
      );
    });
  });
});