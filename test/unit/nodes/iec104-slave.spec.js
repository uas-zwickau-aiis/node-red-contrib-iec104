'use strict';

const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

const IEC104 =
  require('../../../lib/core/constants');

const BENCHMARK =
  require('../../../lib/core/benchmarkDefinitions');


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

  let intervalCallback;
  let intervalHandle;


  beforeEach(function () {
    intervalCallback = null;

    intervalHandle = {
      id: 'benchmark-timer'
    };

    /*
     * Der produktive Node erzeugt einen dauerhaften
     * Benchmark-Timer. Im Test kontrollieren wir diesen
     * vollständig, damit keine offenen Handles entstehen.
     */
    sinon.stub(
      global,
      'setInterval'
    ).callsFake((callback, timeout) => {
      intervalCallback = callback;

      assert.strictEqual(
        timeout,
        1000
      );

      return intervalHandle;
    });

    sinon.stub(
      global,
      'clearInterval'
    );


    // ==========================================================
    // Session
    // ==========================================================

    sessionInstance = {
      start:
        sinon.spy(),

      stop:
        sinon.spy(),

      handleFrame:
        sinon.stub().resolves(true),

      /*
       * Wichtig:
       *
       * Der produktive iec104-slave schreibt einen Punkt
       * erst dann in das Process Image, wenn sendPoint()
       * erfolgreich war.
       *
       * Deshalb muss der Default-Teststub true liefern.
       */
      sendPoint:
        sinon.stub().returns(true),

      getOutboundBacklogStatus:
        sinon.stub().returns({
          queueLength: 0,
          unconfirmedCount: 0
        })
    };

    SessionStub =
      sinon.stub().callsFake(
        function (options) {
          sessionInstance.options =
            options;

          return sessionInstance;
        }
      );


    // ==========================================================
    // TCP Server
    // ==========================================================

    tcpInstance = {
      start:
        sinon.spy(),

      stop:
        sinon.spy(),

      send:
        sinon.stub()
    };

    TcpServerStub =
      sinon.stub().callsFake(
        function (options) {
          tcpInstance.options =
            options;

          return tcpInstance;
        }
      );


    // ==========================================================
    // Status Publisher
    // ==========================================================

    statusPublisherInstance = {
      publishState:
        sinon.spy(),

      publishStats:
        sinon.spy(),

      closeAll:
        sinon.spy()
    };

    StatusPublisherStub =
      sinon.stub().callsFake(
        function () {
          return statusPublisherInstance;
        }
      );


    // ==========================================================
    // Benchmark
    // ==========================================================

    benchmarkInstance = {
      setEnabled:
        sinon.spy(),

      start:
        sinon.stub().returns(null),

      result:
        sinon.stub(),

      recordInput:
        sinon.spy(),

      recordOutput:
        sinon.spy(),

      metricSnapshot:
        sinon.stub(),

      tick:
        sinon.stub().returns({
          transition: false,
          finished: false
        }),

      status:
        sinon.stub().returns({
          state: 'IDLE'
        })
    };

    BenchmarkStub =
      sinon.stub().callsFake(
        function (options) {
          benchmarkInstance.options =
            options;

          return benchmarkInstance;
        }
      );


    registerRoutesStub =
      sinon.spy();

    isValidPointStub =
      sinon.stub();


    // ==========================================================
    // Minimaler Node-RED Stub
    // ==========================================================

    RED = {
      nodes: {
        createNode(node) {
          node.on =
            sinon.stub();

          node.emit =
            sinon.spy();

          node.error =
            sinon.spy();

          node.warn =
            sinon.spy();
        },

        registerType(name, ctor) {
          assert.strictEqual(
            name,
            'iec104-slave'
          );

          NodeConstructor =
            ctor;
        }
      }
    };


    const registerNode =
      proxyquire(
        '../../../iec104-slave',
        {
          './lib/protocol/slaveSession':
            SessionStub,

          './lib/core/statusPublisher':
            StatusPublisherStub,

          './lib/tcp/server':
            TcpServerStub,

          './lib/core/benchmark':
            BenchmarkStub,

          './lib/admin/routes':
            registerRoutesStub,

          './lib/core/validators': {
            isValidPoint:
              isValidPointStub
          }
        }
      );

    registerNode(RED);
  });


  afterEach(function () {
    sinon.restore();
  });


  function createNode(
    overrides = {}
  ) {
    const config = {
      port: '2404',

      t1: '15',
      t2: '10',
      t3: '20',

      k_win: '12',
      w_win: '8',

      benchmark_measurement_duration:
        '120',

      benchmark_outbound:
        false,

      benchmark_inbound_command:
        false,

      ...overrides
    };

    return new NodeConstructor(
      config
    );
  }


  function getHandler(
    node,
    eventName
  ) {
    const call =
      node.on
        .getCalls()
        .find(
          current =>
            current.args[0] ===
            eventName
        );

    assert.ok(
      call,
      `handler for ${eventName} not registered`
    );

    return call.args[1];
  }


  // ============================================================
  // Registration
  // ============================================================

  describe('registration', function () {
    it('registers routes and node type', function () {
      assert.strictEqual(
        registerRoutesStub
          .calledOnceWith(RED),
        true
      );

      assert.strictEqual(
        typeof NodeConstructor,
        'function'
      );
    });
  });


  // ============================================================
  // Initialization
  // ============================================================

  describe('initialization', function () {
    it('initializes configuration correctly', function () {
      const node =
        createNode();

      assert.strictEqual(
        node.port,
        2404
      );

      assert.strictEqual(
        node.t1,
        15000
      );

      assert.strictEqual(
        node.t2,
        10000
      );

      assert.strictEqual(
        node.t3,
        20000
      );

      assert.strictEqual(
        node.k,
        12
      );

      assert.strictEqual(
        node.w,
        8
      );

      assert.strictEqual(
        node.currentState,
        'IDLE'
      );

      assert.strictEqual(
        node.currentReason,
        'tcp.socket.init'
      );

      assert.strictEqual(
        typeof node.currentTs,
        'number'
      );

      assert.ok(
        node.processImage
          instanceof Map
      );
    });


    it('creates benchmark with configured measurement duration', function () {
      createNode({
        benchmark_measurement_duration:
          '45'
      });

      assert.strictEqual(
        benchmarkInstance
          .options
          .measurementDurationMs,
        45000
      );
    });


    it('enables outbound benchmark when configured', function () {
      createNode({
        benchmark_outbound:
          true
      });

      assert.strictEqual(
        benchmarkInstance
          .setEnabled
          .calledWith(
            BENCHMARK.OUTBOUND.id,
            true
          ),
        true
      );
    });


    it('disables outbound benchmark by default', function () {
      createNode();

      assert.strictEqual(
        benchmarkInstance
          .setEnabled
          .calledWith(
            BENCHMARK.OUTBOUND.id,
            false
          ),
        true
      );
    });


    it('enables inbound command benchmark when configured', function () {
      createNode({
        benchmark_inbound_command:
          true
      });

      assert.strictEqual(
        benchmarkInstance
          .setEnabled
          .calledWith(
            BENCHMARK
              .INBOUND_COMMAND.id,
            true
          ),
        true
      );
    });


    it('disables inbound command benchmark by default', function () {
      createNode();

      assert.strictEqual(
        benchmarkInstance
          .setEnabled
          .calledWith(
            BENCHMARK
              .INBOUND_COMMAND.id,
            false
          ),
        true
      );
    });


    it('passes session configuration', function () {
      createNode();

      const opts =
        SessionStub
          .firstCall
          .args[0];

      assert.strictEqual(
        opts.t1,
        15000
      );

      assert.strictEqual(
        opts.t2,
        10000
      );

      assert.strictEqual(
        opts.t3,
        20000
      );

      assert.strictEqual(
        opts.k,
        12
      );

      assert.strictEqual(
        opts.w,
        8
      );
    });


    it('passes TCP server configuration', function () {
      createNode();

      const opts =
        TcpServerStub
          .firstCall
          .args[0];

      assert.strictEqual(
        opts.port,
        2404
      );
    });


    it('starts TCP server', function () {
      createNode();

      assert.strictEqual(
        tcpInstance
          .start
          .calledOnce,
        true
      );
    });


    it('creates benchmark timer', function () {
      const node =
        createNode();

      assert.strictEqual(
        global.setInterval
          .calledOnce,
        true
      );

      assert.strictEqual(
        typeof intervalCallback,
        'function'
      );

      assert.strictEqual(
        node.benchmarkTimer,
        intervalHandle
      );
    });
  });


  // ============================================================
  // Session send callback
  // ============================================================

  describe('session send callback', function () {
    it('sends data through TCP', function () {
      createNode();

      const data =
        Buffer.from([
          1,
          2,
          3
        ]);

      const result =
        sessionInstance
          .options
          .send(
            data,
            null,
            null
          );

      assert.strictEqual(
        result,
        true
      );

      assert.strictEqual(
        tcpInstance
          .send
          .calledOnceWith(
            data
          ),
        true
      );
    });


    it('records outbound benchmark output', function () {
      createNode();

      const data =
        Buffer.from([1]);

      sessionInstance
        .options
        .send(
          data,
          123,
          null
        );

      assert.strictEqual(
        benchmarkInstance
          .recordOutput
          .calledOnceWith(
            BENCHMARK.OUTBOUND.id,
            1,
            123
          ),
        true
      );

      assert.strictEqual(
        benchmarkInstance
          .result
          .calledOnceWith(
            BENCHMARK.OUTBOUND.id,
            123
          ),
        true
      );
    });


    it('does not record throughput output when benchmark start is null', function () {
      createNode();

      sessionInstance
        .options
        .send(
          Buffer.from([1]),
          null,
          null
        );

      assert.strictEqual(
        benchmarkInstance
          .recordOutput
          .called,
        false
      );

      assert.strictEqual(
        benchmarkInstance
          .result
          .calledOnceWith(
            BENCHMARK.OUTBOUND.id,
            null
          ),
        true
      );
    });


    it('emits IEC104 data using supplied message', function () {
      const node =
        createNode();

      const data =
        Buffer.from([
          1,
          2,
          3
        ]);

      const msg = {
        topic: 'original'
      };

      sessionInstance
        .options
        .send(
          data,
          123,
          msg
        );

      assert.strictEqual(
        node.emit
          .calledOnce,
        true
      );

      const [
        eventName,
        emittedMsg
      ] =
        node.emit
          .firstCall
          .args;

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

      assert.strictEqual(
        emittedMsg.topic,
        'original'
      );
    });


    it('creates message when msg is omitted', function () {
      const node =
        createNode();

      const data =
        Buffer.from([1]);

      sessionInstance
        .options
        .send(data);

      assert.strictEqual(
        node.emit.calledOnce,
        true
      );

      const emitted =
        node.emit
          .firstCall
          .args[1];

      assert.strictEqual(
        emitted.asdu,
        data
      );

      assert.strictEqual(
        typeof emitted.ts,
        'number'
      );
    });


    it('creates message when msg is null', function () {
      const node =
        createNode();

      const data =
        Buffer.from([1]);

      sessionInstance
        .options
        .send(
          data,
          null,
          null
        );

      const emitted =
        node.emit
          .firstCall
          .args[1];

      assert.strictEqual(
        emitted.asdu,
        data
      );

      assert.strictEqual(
        typeof emitted.ts,
        'number'
      );
    });


    it('returns false and reports TCP send exception', function () {
      const node =
        createNode();

      const error =
        new Error(
          'send failed'
        );

      const msg = {
        _msgid: '123'
      };

      tcpInstance
        .send
        .throws(error);

      const result =
        sessionInstance
          .options
          .send(
            Buffer.from([1]),
            123,
            msg
          );

      assert.strictEqual(
        result,
        false
      );

      assert.strictEqual(
        node.error
          .calledOnceWith(
            error,
            msg
          ),
        true
      );

      assert.strictEqual(
        benchmarkInstance
          .recordOutput
          .called,
        false
      );

      assert.strictEqual(
        benchmarkInstance
          .result
          .called,
        false
      );

      assert.strictEqual(
        node.emit.called,
        false
      );
    });


    it('reports TCP send exception without message', function () {
      const node =
        createNode();

      const error =
        new Error(
          'send failed'
        );

      tcpInstance
        .send
        .throws(error);

      sessionInstance
        .options
        .send(
          Buffer.from([1])
        );

      assert.strictEqual(
        node.error.calledOnce,
        true
      );

      assert.strictEqual(
        node.error
          .firstCall
          .args[0],
        error
      );

      assert.strictEqual(
        node.error
          .firstCall
          .args[1],
        undefined
      );
    });
  });


  // ============================================================
  // Benchmark callbacks
  // ============================================================

  describe('benchmark callbacks', function () {
    it('records inbound command benchmark start', function () {
      createNode();

      sessionInstance
        .options
        .onInboundStart(
          555
        );

      assert.strictEqual(
        benchmarkInstance
          .recordInput
          .calledOnceWith(
            BENCHMARK
              .INBOUND_COMMAND.id,
            1,
            555
          ),
        true
      );
    });


    it('does not record inbound command start when value is null', function () {
      createNode();

      sessionInstance
        .options
        .onInboundStart(
          null
        );

      assert.strictEqual(
        benchmarkInstance
          .recordInput
          .called,
        false
      );
    });


    it('records inbound command benchmark completion', function () {
      createNode();

      sessionInstance
        .options
        .onInboundComplete(
          777
        );

      assert.strictEqual(
        benchmarkInstance
          .recordOutput
          .calledOnceWith(
            BENCHMARK
              .INBOUND_COMMAND.id,
            1,
            777
          ),
        true
      );

      assert.strictEqual(
        benchmarkInstance
          .result
          .calledOnceWith(
            BENCHMARK
              .INBOUND_COMMAND.id,
            777
          ),
        true
      );
    });


    it('evaluates inbound command result when start value is null', function () {
      createNode();

      sessionInstance
        .options
        .onInboundComplete(
          null
        );

      assert.strictEqual(
        benchmarkInstance
          .recordOutput
          .called,
        false
      );

      assert.strictEqual(
        benchmarkInstance
          .result
          .calledOnceWith(
            BENCHMARK
              .INBOUND_COMMAND.id,
            null
          ),
        true
      );
    });
  });


  // ============================================================
  // Session callbacks
  // ============================================================

  describe('session callbacks', function () {
    it('publishes state changes', function () {
      createNode();

      sessionInstance
        .options
        .onStateChange(
          'DATA_TRANSFER',
          'ready'
        );

      assert.strictEqual(
        statusPublisherInstance
          .publishState
          .calledOnceWith(
            'DATA_TRANSFER',
            'ready'
          ),
        true
      );
    });


    it('publishes stats', function () {
      createNode();

      sessionInstance
        .options
        .onStats();

      assert.strictEqual(
        statusPublisherInstance
          .publishStats
          .calledOnce,
        true
      );
    });


    it('emits session summary', function () {
      const node =
        createNode();

      const summary = {
        frames: 10
      };

      sessionInstance
        .options
        .onSessionStop(
          summary
        );

      assert.strictEqual(
        node.emit.calledOnce,
        true
      );

      const [
        eventName,
        msg
      ] =
        node.emit
          .firstCall
          .args;

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


  // ============================================================
  // GI handling
  // ============================================================

  describe('GI handling', function () {
    it('sends points for selected CA sorted by IOA', async function () {
      const node =
        createNode();

      node.processImage.set(
        '1:10',
        {
          ca: 1,
          ioa: 10
        }
      );

      node.processImage.set(
        '1:2',
        {
          ca: 1,
          ioa: 2
        }
      );

      node.processImage.set(
        '2:1',
        {
          ca: 2,
          ioa: 1
        }
      );

      const sendPoint =
        sinon.stub().resolves();

      await sessionInstance
        .options
        .onGI(
          1,
          sendPoint
        );

      assert.strictEqual(
        sendPoint.callCount,
        2
      );

      assert.strictEqual(
        sendPoint
          .firstCall
          .args[0]
          .ioa,
        2
      );

      assert.strictEqual(
        sendPoint
          .secondCall
          .args[0]
          .ioa,
        10
      );
    });


    it('sends all points for broadcast CA sorted by IOA', async function () {
      const node =
        createNode();

      node.processImage.set(
        '1:10',
        {
          ca: 1,
          ioa: 10
        }
      );

      node.processImage.set(
        '2:2',
        {
          ca: 2,
          ioa: 2
        }
      );

      node.processImage.set(
        '3:5',
        {
          ca: 3,
          ioa: 5
        }
      );

      const sendPoint =
        sinon.stub().resolves();

      await sessionInstance
        .options
        .onGI(
          IEC104.CA.BROADCAST,
          sendPoint
        );

      assert.strictEqual(
        sendPoint.callCount,
        3
      );

      assert.deepStrictEqual(
        sendPoint
          .getCalls()
          .map(
            call =>
              call.args[0].ioa
          ),
        [
          2,
          5,
          10
        ]
      );
    });


    it('sends no points when selected CA has no entries', async function () {
      const node =
        createNode();

      node.processImage.set(
        '1:1',
        {
          ca: 1,
          ioa: 1
        }
      );

      const sendPoint =
        sinon.stub().resolves();

      await sessionInstance
        .options
        .onGI(
          2,
          sendPoint
        );

      assert.strictEqual(
        sendPoint.called,
        false
      );
    });


    it('waits for every sendPoint call', async function () {
      const node =
        createNode();

      node.processImage.set(
        '1:1',
        {
          ca: 1,
          ioa: 1
        }
      );

      node.processImage.set(
        '1:2',
        {
          ca: 1,
          ioa: 2
        }
      );

      const order = [];

      const sendPoint =
        sinon.stub()
          .callsFake(
            async point => {
              order.push(
                point.ioa
              );
            }
          );

      await sessionInstance
        .options
        .onGI(
          1,
          sendPoint
        );

      assert.deepStrictEqual(
        order,
        [
          1,
          2
        ]
      );
    });
  });


  // ============================================================
  // Command callback
  // ============================================================

  describe('command callback', function () {
    it('handles inbound command callback without throwing', async function () {
      createNode();

      const asdu = {
        type:
          'C_SC_NA_1'
      };

      await assert.doesNotReject(
        async () => {
          await sessionInstance
            .options
            .onCommand(
              asdu
            );
        }
      );
    });
  });


  // ============================================================
  // TCP callbacks
  // ============================================================

  describe('TCP callbacks', function () {
    it('starts inbound benchmark and forwards frame', async function () {
      const node =
        createNode();

      benchmarkInstance
        .start
        .withArgs(
          BENCHMARK
            .INBOUND_COMMAND.id
        )
        .returns(
          12345
        );

      const frame =
        Buffer.from([
          1,
          2
        ]);

      tcpInstance
        .options
        .onFrame(frame);

      await Promise.resolve();

      assert.strictEqual(
        benchmarkInstance
          .start
          .calledOnceWith(
            BENCHMARK
              .INBOUND_COMMAND.id
          ),
        true
      );

      assert.strictEqual(
        sessionInstance
          .handleFrame
          .calledOnceWith(
            frame,
            12345
          ),
        true
      );

      assert.strictEqual(
        node.error.called,
        false
      );

      assert.strictEqual(
        node.warn.called,
        false
      );
    });


    it('warns when frame is invalid or unsupported', async function () {
      const node =
        createNode();

      benchmarkInstance
        .start
        .returns(
          123
        );

      sessionInstance
        .handleFrame
        .resolves(false);

      tcpInstance
        .options
        .onFrame(
          Buffer.from([1])
        );

      await Promise.resolve();
      await Promise.resolve();

      assert.strictEqual(
        node.warn
          .calledOnceWith(
            'Ungültiges oder nicht unterstütztes IEC-104-Telegramm verworfen'
          ),
        true
      );
    });


    it('reports frame handling errors', async function () {
      const node =
        createNode();

      const error =
        new Error(
          'broken frame'
        );

      benchmarkInstance
        .start
        .returns(
          123
        );

      sessionInstance
        .handleFrame
        .rejects(
          error
        );

      tcpInstance
        .options
        .onFrame(
          Buffer.from([1])
        );

      await Promise.resolve();
      await Promise.resolve();

      assert.strictEqual(
        node.error
          .calledOnceWith(
            error
          ),
        true
      );
    });


    it('starts session on TCP connect', function () {
      createNode();

      tcpInstance
        .options
        .onConnect();

      assert.strictEqual(
        sessionInstance
          .start
          .calledOnce,
        true
      );
    });


    it('stops session with tcp-prefixed reason on disconnect', function () {
      createNode();

      tcpInstance
        .options
        .onDisconnect(
          'close'
        );

      assert.strictEqual(
        sessionInstance
          .stop
          .calledOnceWith(
            'tcp.close'
          ),
        true
      );
    });


    it('reports TCP error and publishes error state', function () {
      const node =
        createNode();

      const error =
        new Error(
          'ECONNRESET'
        );

      tcpInstance
        .options
        .onError(
          error
        );

      assert.strictEqual(
        node.error
          .calledOnceWith(
            error
          ),
        true
      );

      assert.strictEqual(
        statusPublisherInstance
          .publishState
          .calledOnceWith(
            'IDLE',
            'ECONNRESET'
          ),
        true
      );
    });


    it('uses default TCP error text when error has no message', function () {
      createNode();

      tcpInstance
        .options
        .onError({});

      assert.strictEqual(
        statusPublisherInstance
          .publishState
          .calledOnceWith(
            'IDLE',
            'TCP-Fehler'
          ),
        true
      );
    });


    it('uses default TCP error text when error is null', function () {
      createNode();

      tcpInstance
        .options
        .onError(
          null
        );

      assert.strictEqual(
        statusPublisherInstance
          .publishState
          .calledOnceWith(
            'IDLE',
            'TCP-Fehler'
          ),
        true
      );
    });
  });


  // ============================================================
  // Benchmark timer
  // ============================================================

  describe('benchmark timer', function () {
    it('passes outbound backlog to benchmark tick', function () {
      createNode();

      const backlog = {
        queueLength: 5,
        unconfirmedCount: 2
      };

      sessionInstance
        .getOutboundBacklogStatus
        .returns(
          backlog
        );

      intervalCallback();

      assert.strictEqual(
        sessionInstance
          .getOutboundBacklogStatus
          .calledOnce,
        true
      );

      assert.strictEqual(
        benchmarkInstance
          .tick
          .calledOnce,
        true
      );

      const [
        now,
        options
      ] =
        benchmarkInstance
          .tick
          .firstCall
          .args;

      assert.strictEqual(
        typeof now,
        'number'
      );

      assert.deepStrictEqual(
        options,
        {
          outboundBacklog:
            backlog
        }
      );
    });


    it('does not emit event when benchmark is neither transitioning nor finished', function () {
      const node =
        createNode();

      benchmarkInstance
        .tick
        .returns({
          transition: false,
          finished: false
        });

      intervalCallback();

      assert.strictEqual(
        node.emit.called,
        false
      );
    });


    it('emits benchmark state event on transition', function () {
      const node =
        createNode();

      const status = {
        state:
          'MEASUREMENT'
      };

      benchmarkInstance
        .status
        .returns(
          status
        );

      benchmarkInstance
        .tick
        .returns({
          transition: true,
          finished: false
        });

      intervalCallback();

      assert.strictEqual(
        benchmarkInstance
          .status
          .calledOnce,
        true
      );

      assert.strictEqual(
        node.emit
          .calledOnce,
        true
      );

      const [
        eventName,
        msg
      ] =
        node.emit
          .firstCall
          .args;

      assert.strictEqual(
        eventName,
        'iec104:status'
      );

      assert.strictEqual(
        msg.topic,
        'benchmark/state'
      );

      assert.strictEqual(
        msg.payload,
        status
      );

      assert.strictEqual(
        typeof msg.ts,
        'number'
      );
    });


    it('emits final benchmark snapshot when finished', function () {
      const node =
        createNode();

      const snapshot = {
        measurement:
          'done'
      };

      benchmarkInstance
        .tick
        .returns({
          transition: false,
          finished: true,
          snapshot
        });

      intervalCallback();

      assert.strictEqual(
        node.emit
          .calledOnce,
        true
      );

      const [
        eventName,
        msg
      ] =
        node.emit
          .firstCall
          .args;

      assert.strictEqual(
        eventName,
        'iec104:status'
      );

      assert.strictEqual(
        msg.topic,
        'benchmark'
      );

      assert.strictEqual(
        msg.payload,
        snapshot
      );

      assert.strictEqual(
        typeof msg.ts,
        'number'
      );
    });


    it('emits state and final result when transition and finished are both true', function () {
      const node =
        createNode();

      benchmarkInstance
        .tick
        .returns({
          transition: true,
          finished: true,
          snapshot: {
            done: true
          }
        });

      intervalCallback();

      assert.strictEqual(
        node.emit.callCount,
        2
      );

      assert.strictEqual(
        node.emit
          .firstCall
          .args[1]
          .topic,
        'benchmark/state'
      );

      assert.strictEqual(
        node.emit
          .secondCall
          .args[1]
          .topic,
        'benchmark'
      );
    });
  });


  // ============================================================
  // Node-RED input
  // ============================================================

  describe('iec104:input handling', function () {
    it('rejects invalid point', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      const point = {
        value: true
      };

      const msg = {
        payload:
          point
      };

      isValidPointStub
        .returns(false);

      handler(msg);

      assert.strictEqual(
        node.error
          .calledOnceWith(
            'Invalid IEC104 point',
            msg
          ),
        true
      );

      assert.strictEqual(
        sessionInstance
          .sendPoint
          .called,
        false
      );

      assert.strictEqual(
        node.processImage.size,
        0
      );
    });


    it('starts outbound benchmark for valid point', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      const point = {
        ca: 1,
        ioa: 2,
        value: true
      };

      isValidPointStub
        .returns(true);

      benchmarkInstance
        .start
        .withArgs(
          BENCHMARK.OUTBOUND.id
        )
        .returns(
          987
        );

      handler({
        payload:
          point
      });

      assert.strictEqual(
        benchmarkInstance
          .start
          .calledOnceWith(
            BENCHMARK.OUTBOUND.id
          ),
        true
      );

      assert.strictEqual(
        benchmarkInstance
          .recordInput
          .calledOnceWith(
            BENCHMARK.OUTBOUND.id,
            1,
            987
          ),
        true
      );
    });


    it('does not record benchmark input when benchmark start is null', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      const point = {
        ca: 1,
        ioa: 2,
        value: true
      };

      isValidPointStub
        .returns(true);

      benchmarkInstance
        .start
        .returns(
          null
        );

      handler({
        payload:
          point
      });

      assert.strictEqual(
        benchmarkInstance
          .recordInput
          .called,
        false
      );
    });


    it('sends valid point as spontaneous transmission', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      const point = {
        ca: 2,
        ioa: 10,
        value: 42
      };

      const msg = {
        payload:
          point
      };

      isValidPointStub
        .returns(true);

      benchmarkInstance
        .start
        .returns(
          123
        );

      handler(msg);

      assert.strictEqual(
        sessionInstance
          .sendPoint
          .calledOnceWith(
            point,
            IEC104.COT.SPONT,
            123,
            msg
          ),
        true
      );
    });


    it('stores valid point in process image', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      const point = {
        ca: 2,
        ioa: 10,
        value: 42
      };

      isValidPointStub
        .returns(true);

      benchmarkInstance
        .start
        .returns(
          123
        );

      sessionInstance
        .sendPoint
        .returns(
          true
        );

      handler({
        payload:
          point
      });

      assert.deepStrictEqual(
        node.processImage
          .get('2:10'),
        point
      );

      assert.strictEqual(
        node.processImage.size,
        1
      );
    });


    it('overwrites existing process image point with same CA and IOA', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

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

      isValidPointStub
        .returns(true);

      benchmarkInstance
        .start
        .returns(
          1
        );

      sessionInstance
        .sendPoint
        .returns(
          true
        );

      handler({
        payload:
          first
      });

      handler({
        payload:
          second
      });

      assert.deepStrictEqual(
        node.processImage
          .get('1:5'),
        second
      );

      assert.strictEqual(
        node.processImage.size,
        1
      );
    });


    it('stores different CA and IOA combinations separately', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      const first = {
        ca: 1,
        ioa: 5,
        value: 1
      };

      const second = {
        ca: 2,
        ioa: 5,
        value: 2
      };

      isValidPointStub
        .returns(true);

      sessionInstance
        .sendPoint
        .returns(
          true
        );

      handler({
        payload:
          first
      });

      handler({
        payload:
          second
      });

      assert.strictEqual(
        node.processImage.size,
        2
      );

      assert.deepStrictEqual(
        node.processImage
          .get('1:5'),
        first
      );

      assert.deepStrictEqual(
        node.processImage
          .get('2:5'),
        second
      );
    });


    it('does not store point when sendPoint fails', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      const point = {
        ca: 2,
        ioa: 10,
        value: 42
      };

      const msg = {
        payload:
          point
      };

      isValidPointStub
        .returns(true);

      sessionInstance
        .sendPoint
        .returns(
          false
        );

      handler(msg);

      assert.strictEqual(
        node.processImage.size,
        0
      );

      assert.strictEqual(
        node.error
          .calledOnceWith(
            'IEC104 point could not be encoded',
            msg
          ),
        true
      );
    });


    it('does not report error when valid point is sent successfully', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      isValidPointStub
        .returns(true);

      sessionInstance
        .sendPoint
        .returns(
          true
        );

      handler({
        payload: {
          ca: 1,
          ioa: 1,
          value: true
        }
      });

      assert.strictEqual(
        node.error.called,
        false
      );
    });
  });


  // ============================================================
  // Close handling
  // ============================================================

  describe('close handling', function () {
    it('clears benchmark timer', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'close'
        );

      const done =
        sinon.spy();

      handler(done);

      assert.strictEqual(
        global.clearInterval
          .calledOnceWith(
            intervalHandle
          ),
        true
      );

      assert.strictEqual(
        node.benchmarkTimer,
        null
      );
    });


    it('closes status publisher and stops TCP server', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'close'
        );

      const done =
        sinon.spy();

      handler(done);

      assert.strictEqual(
        statusPublisherInstance
          .closeAll
          .calledOnce,
        true
      );

      assert.strictEqual(
        tcpInstance
          .stop
          .calledOnceWith(
            done
          ),
        true
      );
    });


    it('does not clear timer when timer is already missing', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'close'
        );

      node.benchmarkTimer =
        null;

      handler(
        sinon.spy()
      );

      assert.strictEqual(
        global.clearInterval
          .called,
        false
      );
    });


    it('calls done directly when TCP server is missing', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'close'
        );

      node.tcp =
        null;

      const done =
        sinon.spy();

      handler(done);

      assert.strictEqual(
        statusPublisherInstance
          .closeAll
          .calledOnce,
        true
      );

      assert.strictEqual(
        done.calledOnce,
        true
      );

      assert.strictEqual(
        tcpInstance
          .stop
          .called,
        false
      );
    });
  });
});