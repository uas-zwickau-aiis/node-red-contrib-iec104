'use strict';

const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

const IEC104 = require('../../../lib/core/constants');

describe('iec104-master node', function () {
  let RED;
  let NodeConstructor;

  let sessionInstance;
  let tcpInstance;
  let statusPublisherInstance;

  let SessionStub;
  let TcpClientStub;
  let StatusPublisherStub;
  let registerRoutesStub;
  let isValidPointStub;

  let registerNode;

  beforeEach(function () {
    sessionInstance = {
      start: sinon.spy(),
      stop: sinon.spy(),
      handleFrame: sinon.stub().resolves(),
      sendInterrogation: sinon.stub().returns(true),
      sendStopDt: sinon.spy(),
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

    TcpClientStub = sinon.stub().callsFake(function (options) {
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

    registerRoutesStub = sinon.spy();
    isValidPointStub = sinon.stub();

    RED = {
      nodes: {
        createNode(node) {
          node.on = sinon.stub();
          node.emit = sinon.spy();
          node.error = sinon.spy();
          node.warn = sinon.spy();
        },

        registerType(name, ctor) {
          assert.strictEqual(name, 'iec104-master');
          NodeConstructor = ctor;
        }
      }
    };

    registerNode = proxyquire('../../../iec104-master', {
      './lib/protocol/masterSession': SessionStub,
      './lib/core/statusPublisher': StatusPublisherStub,
      './lib/tcp/client': TcpClientStub,
      './lib/admin/routes': registerRoutesStub,
      './lib/core/validators': {
        isValidPoint: isValidPointStub
      }
    });

    registerNode(RED);
  });

  function createNode(overrides = {}) {
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

      assert.strictEqual(node.host, '127.0.0.1');
      assert.strictEqual(node.port, 2404);

      assert.strictEqual(node.t0, 30000);
      assert.strictEqual(node.t1, 15000);
      assert.strictEqual(node.t2, 10000);
      assert.strictEqual(node.t3, 20000);

      assert.strictEqual(node.k, 12);
      assert.strictEqual(node.w, 8);

      assert.strictEqual(node.autoGI, false);
      assert.strictEqual(node.giCA, 1);

      assert.strictEqual(node.reconnectDelay, 5000);
      assert.strictEqual(node.maxRetries, 10);

      assert.strictEqual(node.currentState, 'IDLE');
      assert.strictEqual(
        node.currentReason,
        'Nicht verbunden'
      );

      assert.strictEqual(
        typeof node.currentTs,
        'number'
      );

      assert.ok(node.processImage instanceof Map);
    });

    it('accepts autoGI as boolean true', function () {
      const node = createNode({
        autoGI: true
      });

      assert.strictEqual(node.autoGI, true);
    });

    it('accepts autoGI as string true', function () {
      const node = createNode({
        autoGI: 'true'
      });

      assert.strictEqual(node.autoGI, true);
    });

    it('uses broadcast CA as default GI address', function () {
      const node = createNode({
        gi_ca: undefined
      });

      assert.strictEqual(
        node.giCA,
        IEC104.CA.BROADCAST
      );
    });

    it('uses default maxRetries', function () {
      const node = createNode({
        maxRetries: undefined
      });

      assert.strictEqual(node.maxRetries, 10);
    });

    it('starts TCP client during initialization', function () {
      createNode();

      assert.strictEqual(
        tcpInstance.start.calledOnce,
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

      const opts = TcpClientStub.firstCall.args[0];

      assert.strictEqual(opts.host, '127.0.0.1');
      assert.strictEqual(opts.port, 2404);
      assert.strictEqual(opts.reconnectDelay, 5000);
      assert.strictEqual(opts.maxRetries, 10);
      assert.strictEqual(opts.t0, 30000);
    });
  });

  describe('session callbacks', function () {
    it('sends session data through TCP and emits data event', function () {
      const node = createNode();

      const data = Buffer.from([1, 2, 3]);

      sessionInstance.options.send(data);

      assert.strictEqual(
        tcpInstance.send.calledOnceWith(data),
        true
      );

      assert.strictEqual(
        node.emit.calledOnce,
        true
      );

      const [eventName, msg] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:data'
      );

      assert.strictEqual(
        msg.topic,
        'iec104/data'
      );

      assert.strictEqual(
        msg.payload,
        data
      );

      assert.strictEqual(
        typeof msg.ts,
        'number'
      );
    });

    it('publishes session state changes', function () {
      createNode();

      sessionInstance.options.onStateChange(
        'CONNECTED',
        'ok'
      );

      assert.strictEqual(
        statusPublisherInstance.publishState.calledOnceWith(
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

      sessionInstance.options.onStateChange(
        IEC104.STATE.DATA_TRANSFER,
        'ready'
      );

      assert.strictEqual(
        sessionInstance.sendInterrogation.calledOnceWith(7),
        true
      );
    });

    it('does not send automatic GI when autoGI is disabled', function () {
      createNode({
        autoGI: false
      });

      sessionInstance.options.onStateChange(
        IEC104.STATE.DATA_TRANSFER,
        'ready'
      );

      assert.strictEqual(
        sessionInstance.sendInterrogation.called,
        false
      );
    });

    it('does not send automatic GI for other states', function () {
      createNode({
        autoGI: true
      });

      sessionInstance.options.onStateChange(
        'CONNECTED',
        'ready'
      );

      assert.strictEqual(
        sessionInstance.sendInterrogation.called,
        false
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

    it('emits received ASDU', function () {
      const node = createNode();

      const asdu = {
        type: 'M_SP_NA_1'
      };

      sessionInstance.options.onASDU(asdu);

      const [eventName, msg] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:asdu'
      );

      assert.strictEqual(
        msg.topic,
        'iec104/asdu'
      );

      assert.strictEqual(
        msg.payload,
        asdu
      );

      assert.strictEqual(
        typeof msg.ts,
        'number'
      );
    });

    it('stores valid point in process image and emits it', function () {
      const node = createNode();

      const point = {
        ca: 1,
        ioa: 42,
        value: true
      };

      sessionInstance.options.onPoint(point);

      assert.deepStrictEqual(
        node.processImage.get('1:42'),
        point
      );

      const [eventName, msg] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:point'
      );

      assert.strictEqual(
        msg.topic,
        'iec104/point'
      );

      assert.strictEqual(
        msg.payload,
        point
      );
    });

    it('does not store null point in process image', function () {
      const node = createNode();

      sessionInstance.options.onPoint(null);

      assert.strictEqual(
        node.processImage.size,
        0
      );

      assert.strictEqual(
        node.emit.firstCall.args[0],
        'iec104:point'
      );
    });

    it('does not store point without CA', function () {
      const node = createNode();

      const point = {
        ioa: 42
      };

      sessionInstance.options.onPoint(point);

      assert.strictEqual(
        node.processImage.size,
        0
      );
    });

    it('does not store point without IOA', function () {
      const node = createNode();

      const point = {
        ca: 1
      };

      sessionInstance.options.onPoint(point);

      assert.strictEqual(
        node.processImage.size,
        0
      );
    });

    it('emits GI start event', function () {
      const node = createNode();

      sessionInstance.options.onGIStart(3);

      const [eventName, msg] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:status'
      );

      assert.strictEqual(
        msg.topic,
        'iec104/gi-start'
      );

      assert.deepStrictEqual(
        msg.payload,
        { ca: 3 }
      );
    });

    it('creates sorted GI snapshot for selected CA', function () {
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

      sessionInstance.options.onGIEnd(1);

      const [eventName, msg] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:gi-complete'
      );

      assert.strictEqual(
        msg.topic,
        'iec104/gi-complete'
      );

      assert.strictEqual(
        msg.payload.ca,
        1
      );

      assert.deepStrictEqual(
        msg.payload.points.map(point => point.ioa),
        [2, 10]
      );

      assert.strictEqual(
        msg.payload.points.every(point => point.ca === 1),
        true
      );
    });

    it('creates GI snapshot for broadcast CA', function () {
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

      sessionInstance.options.onGIEnd(
        IEC104.CA.BROADCAST
      );

      const [eventName, msg] =
        node.emit.firstCall.args;

      assert.strictEqual(
        eventName,
        'iec104:gi-complete'
      );

      assert.strictEqual(
        msg.payload.ca,
        IEC104.CA.BROADCAST
      );

      assert.strictEqual(
        msg.payload.points.length,
        3
      );

      assert.deepStrictEqual(
        msg.payload.points.map(point => point.ioa),
        [2, 5, 10]
      );
    });
  });

  describe('TCP callbacks', function () {
    it('forwards incoming frame to session', async function () {
      const node = createNode();

      const frame = Buffer.from([1, 2]);

      tcpInstance.options.onFrame(frame);

      await Promise.resolve();

      assert.strictEqual(
        sessionInstance.handleFrame.calledOnceWith(frame),
        true
      );

      assert.strictEqual(
        node.error.called,
        false
      );
    });

    it('reports frame handling errors', async function () {
      const node = createNode();

      const error = new Error('broken frame');

      sessionInstance.handleFrame.rejects(error);

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

    it('stops session and publishes idle on disconnect', function () {
      createNode();

      tcpInstance.options.onDisconnect(
        'connection lost'
      );

      assert.strictEqual(
        sessionInstance.stop.calledOnceWith(
          'connection lost'
        ),
        true
      );

      assert.strictEqual(
        statusPublisherInstance.publishState.calledOnceWith(
          'IDLE',
          'Verbindung unterbrochen: connection lost'
        ),
        true
      );
    });

    it('publishes TCP error message', function () {
      createNode();

      tcpInstance.options.onError(
        new Error('ECONNREFUSED')
      );

      assert.strictEqual(
        statusPublisherInstance.publishState.calledOnceWith(
          'IDLE',
          'ECONNREFUSED'
        ),
        true
      );
    });

    it('uses default TCP error text when error message is missing', function () {
      createNode();

      tcpInstance.options.onError({});

      assert.strictEqual(
        statusPublisherInstance.publishState.calledOnceWith(
          'IDLE',
          'TCP-Fehler'
        ),
        true
      );
    });

    it('uses default TCP error text when error is null', function () {
      createNode();

      tcpInstance.options.onError(null);

      assert.strictEqual(
        statusPublisherInstance.publishState.calledOnceWith(
          'IDLE',
          'TCP-Fehler'
        ),
        true
      );
    });
  });

  describe('iec104:input handling', function () {
    it('sends GI command using supplied CA', function () {
      const node = createNode({
        gi_ca: '5'
      });

      const handler =
        getHandler(node, 'iec104:input');

      sessionInstance.sendInterrogation.returns(true);

      handler({
        payload: {
          command: 'gi',
          ca: 7
        }
      });

      assert.strictEqual(
        sessionInstance.sendInterrogation.calledOnceWith(7),
        true
      );
    });

    it('supports GI type alias', function () {
      const node = createNode({
        gi_ca: '5'
      });

      const handler =
        getHandler(node, 'iec104:input');

      handler({
        payload: {
          type: 'gi'
        }
      });

      assert.strictEqual(
        sessionInstance.sendInterrogation.calledOnceWith(5),
        true
      );
    });

    it('uses configured GI address when payload CA is missing', function () {
      const node = createNode({
        gi_ca: '12'
      });

      const handler =
        getHandler(node, 'iec104:input');

      handler({
        payload: {
          command: 'gi'
        }
      });

      assert.strictEqual(
        sessionInstance.sendInterrogation.calledOnceWith(12),
        true
      );
    });

    it('uses broadcast GI address when no GI address is configured', function () {
      const node = createNode({
        gi_ca: undefined
      });

      const handler =
        getHandler(node, 'iec104:input');

      handler({
        payload: {
          command: 'gi'
        }
      });

      assert.strictEqual(
        node.giCA,
        IEC104.CA.BROADCAST
      );

      assert.strictEqual(
        sessionInstance.sendInterrogation.calledOnceWith(
          IEC104.CA.BROADCAST
        ),
        true
      );
    });

    it('warns when GI cannot be sent', function () {
      const node = createNode();

      const handler =
        getHandler(node, 'iec104:input');

      sessionInstance.sendInterrogation.returns(false);

      handler({
        payload: {
          command: 'gi'
        }
      });

      assert.strictEqual(
        node.warn.calledOnceWith(
          'GI konnte nicht gesendet werden'
        ),
        true
      );
    });

    it('sends STOPDT command', function () {
      const node = createNode();

      const handler =
        getHandler(node, 'iec104:input');

      handler({
        payload: {
          command: 'stopdt'
        }
      });

      assert.strictEqual(
        sessionInstance.sendStopDt.calledOnce,
        true
      );
    });

    it('supports STOPDT type alias', function () {
      const node = createNode();

      const handler =
        getHandler(node, 'iec104:input');

      handler({
        payload: {
          type: 'stopdt'
        }
      });

      assert.strictEqual(
        sessionInstance.sendStopDt.calledOnce,
        true
      );
    });

    it('rejects invalid point', function () {
      const node = createNode();

      const handler =
        getHandler(node, 'iec104:input');

      isValidPointStub.returns(false);

      const point = {
        value: 1
      };

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
    });

    it('sends valid point with ACT cause', function () {
      const node = createNode();

      const handler =
        getHandler(node, 'iec104:input');

      isValidPointStub.returns(true);

      const point = {
        type: 'C_SC_NA_1',
        ioa: 1,
        value: true
      };

      handler({
        payload: point
      });

      assert.strictEqual(
        sessionInstance.sendPoint.calledOnceWith(
          point,
          IEC104.COT.ACT
        ),
        true
      );
    });

    it('handles missing payload as empty object', function () {
      const node = createNode();

      const handler =
        getHandler(node, 'iec104:input');

      isValidPointStub.returns(false);

      handler({});

      assert.strictEqual(
        isValidPointStub.calledOnceWith({}),
        true
      );

      assert.strictEqual(
        node.error.calledOnceWith(
          'Invalid IEC104 point'
        ),
        true
      );
    });
  });

  describe('close handling', function () {
    it('closes status publisher and stops TCP client', function () {
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

    it('calls done directly when TCP client is missing', function () {
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