'use strict';

const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

const IEC104 =
  require('../../../lib/core/constants');

const BENCHMARK =
  require('../../../lib/core/benchmarkDefinitions');


describe('iec104-master node', function () {
  let RED;
  let NodeConstructor;

  let sessionInstance;
  let tcpInstance;
  let statusPublisherInstance;
  let benchmarkInstance;

  let SessionStub;
  let TcpClientStub;
  let StatusPublisherStub;
  let BenchmarkStub;
  let registerRoutesStub;
  let isValidPointStub;

  let intervalCallback;
  let intervalHandle;

  beforeEach(function () {
    /*
     * Der Node erzeugt während seiner Initialisierung
     * einen dauerhaften Benchmark-Timer.
     *
     * Im Unit-Test wird setInterval deshalb vollständig
     * kontrolliert. Dadurch bleiben keine offenen Handles
     * zurück und Mocha kann nicht mehr wegen des Timers
     * hängen bleiben.
     */
    intervalHandle = {
      id: 'benchmark-timer'
    };

    intervalCallback = null;

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

    /*
     * Session
     */
    sessionInstance = {
      start: sinon.spy(),
      stop: sinon.spy(),

      handleFrame:
        sinon.stub().resolves(true),

      sendInterrogation:
        sinon.stub().returns(true),

      sendStopDt:
        sinon.spy(),

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

    /*
     * TCP
     */
    tcpInstance = {
      start: sinon.spy(),
      stop: sinon.spy(),

      /*
       * Der echte TcpClient.send()-Aufruf liefert einen
       * Erfolgsstatus. Deshalb muss auch der Default-Stub
       * true liefern.
       */
      send:
        sinon.stub().returns(true)
    };

    TcpClientStub =
      sinon.stub().callsFake(
        function (options) {
          tcpInstance.options =
            options;

          return tcpInstance;
        }
      );

    /*
     * Status Publisher
     */
    statusPublisherInstance = {
      publishState: sinon.spy(),
      publishStats: sinon.spy(),
      closeAll: sinon.spy()
    };

    StatusPublisherStub =
      sinon.stub().callsFake(
        function () {
          return statusPublisherInstance;
        }
      );

    /*
     * Benchmark
     */
    benchmarkInstance = {
      setEnabled: sinon.spy(),

      start:
        sinon.stub().returns(null),

      recordInput:
        sinon.spy(),

      recordOutput:
        sinon.spy(),

      result:
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

    /*
     * Minimaler Node-RED Stub
     */
    RED = {
      nodes: {
        createNode(node) {
          node.on = sinon.stub();
          node.emit = sinon.spy();
          node.error = sinon.spy();
          node.warn = sinon.spy();
        },

        registerType(name, ctor) {
          assert.strictEqual(
            name,
            'iec104-master'
          );

          NodeConstructor = ctor;
        }
      }
    };

    const registerNode =
      proxyquire(
        '../../../iec104-master',
        {
          './lib/protocol/masterSession':
            SessionStub,

          './lib/core/statusPublisher':
            StatusPublisherStub,

          './lib/tcp/client':
            TcpClientStub,

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
      host: '127.0.0.1',
      port: '2404',

      t0: '30',
      t1: '15',
      t2: '10',
      t3: '20',

      k_win: '12',
      w_win: '8',

      autoGI: false,
      gi_ca: '1',

      reconnectDelay: '5',
      maxRetries: '10',

      benchmark_measurement_duration:
        '120',

      benchmark_outbound: false,

      benchmark_inbound_report: false,

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
        node.host,
        '127.0.0.1'
      );

      assert.strictEqual(
        node.port,
        2404
      );

      assert.strictEqual(
        node.t0,
        30000
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
        node.autoGI,
        false
      );

      assert.strictEqual(
        node.giCA,
        1
      );

      assert.strictEqual(
        node.reconnectDelay,
        5000
      );

      assert.strictEqual(
        node.maxRetries,
        10
      );

      assert.strictEqual(
        node.currentState,
        'IDLE'
      );

      assert.strictEqual(
        node.currentReason,
        'Nicht verbunden'
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


    it('accepts autoGI as boolean true', function () {
      const node =
        createNode({
          autoGI: true
        });

      assert.strictEqual(
        node.autoGI,
        true
      );
    });


    it('accepts autoGI as string true', function () {
      const node =
        createNode({
          autoGI: 'true'
        });

      assert.strictEqual(
        node.autoGI,
        true
      );
    });


    it('uses broadcast CA as default GI address', function () {
      const node =
        createNode({
          gi_ca: undefined
        });

      assert.strictEqual(
        node.giCA,
        IEC104.CA.BROADCAST
      );
    });


    it('uses default maxRetries', function () {
      const node =
        createNode({
          maxRetries: undefined
        });

      assert.strictEqual(
        node.maxRetries,
        10
      );
    });


    it('creates benchmark with configured duration', function () {
      createNode({
        benchmark_measurement_duration:
          '45'
      });

      assert.strictEqual(
        BenchmarkStub.calledOnce,
        true
      );

      assert.strictEqual(
        benchmarkInstance.options
          .measurementDurationMs,
        45000
      );
    });


    it('enables outbound benchmark when configured', function () {
      createNode({
        benchmark_outbound: true
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


    it('disables outbound benchmark when not configured', function () {
      createNode({
        benchmark_outbound: false
      });

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


    it('enables inbound report benchmark when configured', function () {
      createNode({
        benchmark_inbound_report:
          true
      });

      assert.strictEqual(
        benchmarkInstance
          .setEnabled
          .calledWith(
            BENCHMARK
              .INBOUND_REPORT.id,
            true
          ),
        true
      );
    });


    it('disables inbound report benchmark when not configured', function () {
      createNode({
        benchmark_inbound_report:
          false
      });

      assert.strictEqual(
        benchmarkInstance
          .setEnabled
          .calledWith(
            BENCHMARK
              .INBOUND_REPORT.id,
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


    it('passes TCP configuration', function () {
      createNode();

      const opts =
        TcpClientStub
          .firstCall
          .args[0];

      assert.strictEqual(
        opts.host,
        '127.0.0.1'
      );

      assert.strictEqual(
        opts.port,
        2404
      );

      assert.strictEqual(
        opts.reconnectDelay,
        5000
      );

      assert.strictEqual(
        opts.maxRetries,
        10
      );

      assert.strictEqual(
        opts.t0,
        30000
      );
    });


    it('starts TCP client', function () {
      createNode();

      assert.strictEqual(
        tcpInstance
          .start
          .calledOnce,
        true
      );
    });


    it('starts benchmark timer with one second interval', function () {
      const node =
        createNode();

      assert.strictEqual(
        global.setInterval
          .calledOnce,
        true
      );

      assert.strictEqual(
        node.benchmarkTimer,
        intervalHandle
      );

      assert.strictEqual(
        typeof intervalCallback,
        'function'
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
          .send(data);

      assert.strictEqual(
        result,
        true
      );

      assert.strictEqual(
        tcpInstance
          .send
          .calledOnceWith(data),
        true
      );
    });


    it('emits successfully sent data', function () {
      const node =
        createNode();

      const data =
        Buffer.from([
          1,
          2,
          3
        ]);

      sessionInstance
        .options
        .send(data);

      assert.strictEqual(
        node.emit.calledOnce,
        true
      );

      const [
        eventName,
        message
      ] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:data'
      );

      assert.strictEqual(
        message.topic,
        'iec104/data'
      );

      assert.strictEqual(
        message.payload,
        data
      );

      assert.strictEqual(
        typeof message.ts,
        'number'
      );
    });


    it('records outbound benchmark output when benchmark start exists', function () {
      createNode();

      const data =
        Buffer.from([1]);

      sessionInstance
        .options
        .send(
          data,
          12345
        );

      assert.strictEqual(
        benchmarkInstance
          .recordOutput
          .calledOnceWith(
            BENCHMARK.OUTBOUND.id,
            1,
            12345
          ),
        true
      );

      assert.strictEqual(
        benchmarkInstance
          .result
          .calledOnceWith(
            BENCHMARK.OUTBOUND.id,
            12345
          ),
        true
      );
    });


    it('does not record outbound throughput output without benchmark start', function () {
      createNode();

      sessionInstance
        .options
        .send(
          Buffer.from([1]),
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


    it('returns false when TCP send fails', function () {
      const node =
        createNode();

      tcpInstance
        .send
        .returns(false);

      const msg = {
        _msgid: '1'
      };

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
            'TCP-Telegramm konnte nicht gesendet werden',
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


    it('reports TCP send failure without message object', function () {
      const node =
        createNode();

      tcpInstance
        .send
        .returns(false);

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
        node.error.firstCall
          .args[0],
        'TCP-Telegramm konnte nicht gesendet werden'
      );

      assert.strictEqual(
        node.error.firstCall
          .args[1],
        undefined
      );
    });
  });


  // ============================================================
  // Session benchmark callbacks
  // ============================================================

  describe('session benchmark callbacks', function () {
    it('records inbound report start', function () {
      createNode();

      sessionInstance
        .options
        .onInboundStart(
          111
        );

      assert.strictEqual(
        benchmarkInstance
          .recordInput
          .calledOnceWith(
            BENCHMARK
              .INBOUND_REPORT.id,
            1,
            111
          ),
        true
      );
    });


    it('ignores inbound report start without benchmark value', function () {
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


    it('records inbound report completion', function () {
      createNode();

      sessionInstance
        .options
        .onInboundComplete(
          222
        );

      assert.strictEqual(
        benchmarkInstance
          .recordOutput
          .calledOnceWith(
            BENCHMARK
              .INBOUND_REPORT.id,
            1,
            222
          ),
        true
      );

      assert.strictEqual(
        benchmarkInstance
          .result
          .calledOnceWith(
            BENCHMARK
              .INBOUND_REPORT.id,
            222
          ),
        true
      );
    });


    it('evaluates inbound result without benchmark start', function () {
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
              .INBOUND_REPORT.id,
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
    it('publishes session state changes', function () {
      createNode();

      sessionInstance
        .options
        .onStateChange(
          'CONNECTED',
          'ok'
        );

      assert.strictEqual(
        statusPublisherInstance
          .publishState
          .calledOnceWith(
            'CONNECTED',
            'ok'
          ),
        true
      );
    });


    it('sends automatic GI when entering DATA_TRANSFER', function () {
      createNode({
        autoGI: true,
        gi_ca: '7'
      });

      sessionInstance
        .options
        .onStateChange(
          IEC104.STATE
            .DATA_TRANSFER,
          'ready'
        );

      assert.strictEqual(
        sessionInstance
          .sendInterrogation
          .calledOnceWith(7),
        true
      );
    });


    it('does not send automatic GI when autoGI is disabled', function () {
      createNode({
        autoGI: false
      });

      sessionInstance
        .options
        .onStateChange(
          IEC104.STATE
            .DATA_TRANSFER,
          'ready'
        );

      assert.strictEqual(
        sessionInstance
          .sendInterrogation
          .called,
        false
      );
    });


    it('does not send automatic GI for other state', function () {
      createNode({
        autoGI: true
      });

      sessionInstance
        .options
        .onStateChange(
          'CONNECTED',
          'ready'
        );

      assert.strictEqual(
        sessionInstance
          .sendInterrogation
          .called,
        false
      );
    });


    it('publishes statistics', function () {
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

      const [
        eventName,
        message
      ] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:status'
      );

      assert.strictEqual(
        message.topic,
        'iec104/session-summary'
      );

      assert.deepStrictEqual(
        message.payload,
        summary
      );

      assert.strictEqual(
        typeof message.ts,
        'number'
      );
    });


    it('emits received ASDU', function () {
      const node =
        createNode();

      const asdu = {
        type: 'M_SP_NA_1'
      };

      sessionInstance
        .options
        .onASDU(asdu);

      const [
        eventName,
        message
      ] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:asdu'
      );

      assert.strictEqual(
        message.topic,
        'iec104/asdu'
      );

      assert.strictEqual(
        message.payload,
        asdu
      );

      assert.strictEqual(
        typeof message.ts,
        'number'
      );
    });


    it('stores point in process image and emits it', function () {
      const node =
        createNode();

      const point = {
        ca: 1,
        ioa: 42,
        value: true
      };

      sessionInstance
        .options
        .onPoint(point);

      assert.deepStrictEqual(
        node.processImage
          .get('1:42'),
        point
      );

      const [
        eventName,
        message
      ] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:point'
      );

      assert.strictEqual(
        message.topic,
        'iec104/point'
      );

      assert.strictEqual(
        message.payload,
        point
      );

      assert.strictEqual(
        typeof message.ts,
        'number'
      );
    });


    it('emits null point without storing it', function () {
      const node =
        createNode();

      sessionInstance
        .options
        .onPoint(null);

      assert.strictEqual(
        node.processImage.size,
        0
      );

      assert.strictEqual(
        node.emit
          .calledOnce,
        true
      );

      assert.strictEqual(
        node.emit.firstCall
          .args[1]
          .payload,
        null
      );
    });


    it('does not store point without CA', function () {
      const node =
        createNode();

      const point = {
        ioa: 42
      };

      sessionInstance
        .options
        .onPoint(point);

      assert.strictEqual(
        node.processImage.size,
        0
      );
    });


    it('does not store point without IOA', function () {
      const node =
        createNode();

      const point = {
        ca: 1
      };

      sessionInstance
        .options
        .onPoint(point);

      assert.strictEqual(
        node.processImage.size,
        0
      );
    });


    it('accepts zero CA and zero IOA', function () {
      const node =
        createNode();

      const point = {
        ca: 0,
        ioa: 0,
        value: false
      };

      sessionInstance
        .options
        .onPoint(point);

      assert.deepStrictEqual(
        node.processImage
          .get('0:0'),
        point
      );
    });


    it('emits GI start event', function () {
      const node =
        createNode();

      sessionInstance
        .options
        .onGIStart(3);

      const [
        eventName,
        message
      ] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:status'
      );

      assert.strictEqual(
        message.topic,
        'iec104/gi-start'
      );

      assert.deepStrictEqual(
        message.payload,
        {
          ca: 3
        }
      );

      assert.strictEqual(
        typeof message.ts,
        'number'
      );
    });


    it('creates sorted GI snapshot for selected CA', function () {
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

      sessionInstance
        .options
        .onGIEnd(1);

      const [
        eventName,
        message
      ] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:gi-complete'
      );

      assert.strictEqual(
        message.topic,
        'iec104/gi-complete'
      );

      assert.strictEqual(
        message.payload.ca,
        1
      );

      assert.deepStrictEqual(
        message.payload
          .points
          .map(
            point =>
              point.ioa
          ),
        [
          2,
          10
        ]
      );

      assert.strictEqual(
        message.payload
          .points
          .every(
            point =>
              point.ca === 1
          ),
        true
      );

      assert.strictEqual(
        typeof message.ts,
        'number'
      );
    });


    it('creates sorted GI snapshot for broadcast CA', function () {
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

      sessionInstance
        .options
        .onGIEnd(
          IEC104.CA.BROADCAST
        );

      const message =
        node.emit.firstCall
          .args[1];

      assert.strictEqual(
        message.payload.ca,
        IEC104.CA.BROADCAST
      );

      assert.deepStrictEqual(
        message.payload
          .points
          .map(
            point =>
              point.ioa
          ),
        [
          2,
          5,
          10
        ]
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
            .INBOUND_REPORT.id
        )
        .returns(12345);

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
              .INBOUND_REPORT.id
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
        node.warn.called,
        false
      );

      assert.strictEqual(
        node.error.called,
        false
      );
    });


    it('warns when frame is invalid or unsupported', async function () {
      const node =
        createNode();

      benchmarkInstance
        .start
        .returns(123);

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


    it('reports frame handling error', async function () {
      const node =
        createNode();

      const error =
        new Error(
          'broken frame'
        );

      benchmarkInstance
        .start
        .returns(123);

      sessionInstance
        .handleFrame
        .rejects(error);

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


    it('stops session and publishes idle state on disconnect', function () {
      createNode();

      tcpInstance
        .options
        .onDisconnect(
          'connection lost'
        );

      assert.strictEqual(
        sessionInstance
          .stop
          .calledOnceWith(
            'connection lost'
          ),
        true
      );

      assert.strictEqual(
        statusPublisherInstance
          .publishState
          .calledOnceWith(
            'IDLE',
            'Verbindung unterbrochen: connection lost'
          ),
        true
      );
    });


    it('publishes TCP error message', function () {
      const node =
        createNode();

      const error =
        new Error(
          'ECONNREFUSED'
        );

      tcpInstance
        .options
        .onError(error);

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
            'ECONNREFUSED'
          ),
        true
      );
    });


    it('uses default TCP error text when message is missing', function () {
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
        .onError(null);

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
    it('passes outbound backlog status to benchmark tick', function () {
      createNode();

      const backlog = {
        queueLength: 3,
        unconfirmedCount: 2
      };

      sessionInstance
        .getOutboundBacklogStatus
        .returns(backlog);

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


    it('returns without event when benchmark is not finished', function () {
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


    it('emits benchmark state on transition', function () {
      const node =
        createNode();

      const status = {
        state: 'MEASUREMENT'
      };

      benchmarkInstance
        .status
        .returns(status);

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
        node.emit.calledOnce,
        true
      );

      const [
        eventName,
        message
      ] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:status'
      );

      assert.strictEqual(
        message.topic,
        'benchmark/state'
      );

      assert.strictEqual(
        message.payload,
        status
      );

      assert.strictEqual(
        typeof message.ts,
        'number'
      );
    });


    it('emits final benchmark result when finished', function () {
      const node =
        createNode();

      const snapshot = {
        durationMs: 1000,
        measurements: 42
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
        node.emit.calledOnce,
        true
      );

      const [
        eventName,
        message
      ] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:status'
      );

      assert.strictEqual(
        message.topic,
        'benchmark'
      );

      assert.strictEqual(
        message.payload,
        snapshot
      );

      assert.strictEqual(
        typeof message.ts,
        'number'
      );
    });


    it('emits transition and final result in same tick when both flags are set', function () {
      const node =
        createNode();

      benchmarkInstance
        .tick
        .returns({
          transition: true,
          finished: true,
          snapshot: {
            finished: true
          }
        });

      intervalCallback();

      assert.strictEqual(
        node.emit.callCount,
        2
      );

      assert.strictEqual(
        node.emit.firstCall
          .args[1]
          .topic,
        'benchmark/state'
      );

      assert.strictEqual(
        node.emit.secondCall
          .args[1]
          .topic,
        'benchmark'
      );
    });


    it('logs inbound benchmark sample', function () {
      createNode();

      const logStub =
        sinon.stub(
          console,
          'log'
        );

      benchmarkInstance
        .tick
        .returns({
          transition: false,
          finished: false,

          samples: {
            [
              BENCHMARK
                .INBOUND_REPORT.id
            ]: {
              durationMs: 1000,
              inputCount: 20,
              outputCount: 17,
              inputRate: 20,
              outputRate: 17
            }
          }
        });

      intervalCallback();

      assert.strictEqual(
        logStub.calledOnce,
        true
      );

      const text =
        logStub.firstCall
          .args[0];

      assert.strictEqual(
        text.includes(
          'duration=1000ms'
        ),
        true
      );

      assert.strictEqual(
        text.includes(
          'in=20'
        ),
        true
      );

      assert.strictEqual(
        text.includes(
          'out=17'
        ),
        true
      );

      assert.strictEqual(
        text.includes(
          'inputRate=20.00/s'
        ),
        true
      );

      assert.strictEqual(
        text.includes(
          'outputRate=17.00/s'
        ),
        true
      );

      assert.strictEqual(
        text.includes(
          'delta=3'
        ),
        true
      );
    });


    it('handles missing samples object', function () {
      const node =
        createNode();

      benchmarkInstance
        .tick
        .returns({
          transition: false,
          finished: false
        });

      assert.doesNotThrow(
        () =>
          intervalCallback()
      );

      assert.strictEqual(
        node.emit.called,
        false
      );
    });
  });


  // ============================================================
  // Node-RED input
  // ============================================================

  describe('iec104:input handling', function () {
    it('sends GI using supplied CA', function () {
      const node =
        createNode({
          gi_ca: '5'
        });

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      handler({
        payload: {
          command: 'gi',
          ca: 7
        }
      });

      assert.strictEqual(
        sessionInstance
          .sendInterrogation
          .calledOnceWith(7),
        true
      );
    });


    it('supports GI type alias', function () {
      const node =
        createNode({
          gi_ca: '5'
        });

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      handler({
        payload: {
          type: 'gi'
        }
      });

      assert.strictEqual(
        sessionInstance
          .sendInterrogation
          .calledOnceWith(5),
        true
      );
    });


    it('uses configured GI address when payload CA is missing', function () {
      const node =
        createNode({
          gi_ca: '12'
        });

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      handler({
        payload: {
          command: 'gi'
        }
      });

      assert.strictEqual(
        sessionInstance
          .sendInterrogation
          .calledOnceWith(12),
        true
      );
    });


    it('uses broadcast GI address when no GI address is configured', function () {
      const node =
        createNode({
          gi_ca: undefined
        });

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      handler({
        payload: {
          command: 'gi'
        }
      });

      assert.strictEqual(
        sessionInstance
          .sendInterrogation
          .calledOnceWith(
            IEC104.CA.BROADCAST
          ),
        true
      );
    });


    it('warns when GI cannot be sent', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      sessionInstance
        .sendInterrogation
        .returns(false);

      handler({
        payload: {
          command: 'gi'
        }
      });

      assert.strictEqual(
        node.warn
          .calledOnceWith(
            'GI konnte nicht gesendet werden'
          ),
        true
      );
    });


    it('sends STOPDT command', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      handler({
        payload: {
          command: 'stopdt'
        }
      });

      assert.strictEqual(
        sessionInstance
          .sendStopDt
          .calledOnce,
        true
      );
    });


    it('supports STOPDT type alias', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      handler({
        payload: {
          type: 'stopdt'
        }
      });

      assert.strictEqual(
        sessionInstance
          .sendStopDt
          .calledOnce,
        true
      );
    });


    it('rejects invalid point', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      isValidPointStub
        .returns(false);

      const msg = {
        payload: {
          value: 1
        }
      };

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
    });


    it('handles missing payload as empty object', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      isValidPointStub
        .returns(false);

      handler({});

      assert.strictEqual(
        isValidPointStub
          .calledOnceWith({}),
        true
      );

      assert.strictEqual(
        node.error.calledOnce,
        true
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
        type: 'C_SC_NA_1',
        ca: 1,
        ioa: 1,
        value: true
      };

      const msg = {
        payload: point
      };

      isValidPointStub
        .returns(true);

      benchmarkInstance
        .start
        .withArgs(
          BENCHMARK.OUTBOUND.id
        )
        .returns(987);

      handler(msg);

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

      assert.strictEqual(
        sessionInstance
          .sendPoint
          .calledOnceWith(
            point,
            IEC104.COT.ACT,
            987,
            msg
          ),
        true
      );
    });


    it('does not record outbound benchmark input when benchmark is disabled', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      const point = {
        ca: 1,
        ioa: 1,
        value: true
      };

      isValidPointStub
        .returns(true);

      benchmarkInstance
        .start
        .returns(null);

      handler({
        payload: point
      });

      assert.strictEqual(
        benchmarkInstance
          .recordInput
          .called,
        false
      );

      assert.strictEqual(
        sessionInstance
          .sendPoint
          .calledOnce,
        true
      );

      assert.strictEqual(
        sessionInstance
          .sendPoint
          .firstCall
          .args[2],
        null
      );
    });


    it('reports point encoding failure', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'iec104:input'
        );

      const point = {
        ca: 1,
        ioa: 1,
        value: true
      };

      const msg = {
        payload: point
      };

      isValidPointStub
        .returns(true);

      sessionInstance
        .sendPoint
        .returns(false);

      handler(msg);

      assert.strictEqual(
        node.error
          .calledOnceWith(
            'IEC104 point could not be encoded',
            msg
          ),
        true
      );
    });


    it('does not report error when point is sent successfully', function () {
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
        .returns(true);

      handler({
        payload: {
          ca: 1,
          ioa: 2,
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
  // Close
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


    it('closes status publisher and TCP client', function () {
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


    it('does not clear timer when benchmark timer is already missing', function () {
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


    it('calls done directly when TCP client is missing', function () {
      const node =
        createNode();

      const handler =
        getHandler(
          node,
          'close'
        );

      node.tcp = null;

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