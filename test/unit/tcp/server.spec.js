'use strict';

const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

describe('TcpServer', function () {
  let netServer;
  let socket;

  let createServerStub;

  let FrameParserStub;
  let parser;

  let TcpServer;

  let onFrame;
  let onConnect;
  let onDisconnect;
  let onError;

  beforeEach(function () {
    parser = {
      push: sinon.spy(),
      reset: sinon.spy()
    };

    FrameParserStub = sinon.stub().callsFake(function (callback) {
      parser.callback = callback;
      return parser;
    });

    socket = {
      on: sinon.stub(),
      setNoDelay: sinon.spy(),
      setKeepAlive: sinon.spy(),
      write: sinon.spy(),
      destroy: sinon.stub()
    };

    netServer = {
      on: sinon.stub(),
      listen: sinon.spy(),
      close: sinon.spy()
    };

    createServerStub = sinon.stub().callsFake(function (callback) {
      netServer.connectionCallback = callback;
      return netServer;
    });

    TcpServer = proxyquire('../../../lib/tcp/server', {
      net: {
        createServer: createServerStub
      },
      '../protocol/frameParser': FrameParserStub
    });

    onFrame = sinon.spy();
    onConnect = sinon.spy();
    onDisconnect = sinon.spy();
    onError = sinon.spy();
  });

  function createTcpServer(overrides = {}) {
    return new TcpServer({
      port: 2404,
      onFrame,
      onConnect,
      onDisconnect,
      onError,
      ...overrides
    });
  }

  function getSocketHandler(eventName) {
    const call = socket.on
      .getCalls()
      .find(call => call.args[0] === eventName);

    assert.ok(
      call,
      `socket handler for ${eventName} not registered`
    );

    return call.args[1];
  }

  function getServerHandler(eventName) {
    const call = netServer.on
      .getCalls()
      .find(call => call.args[0] === eventName);

    assert.ok(
      call,
      `server handler for ${eventName} not registered`
    );

    return call.args[1];
  }

  function connectClient(server) {
    server.start();

    netServer.connectionCallback(socket);
  }

  describe('initialization', function () {
    it('stores port', function () {
      const server = createTcpServer();

      assert.strictEqual(
        server.port,
        2404
      );

      assert.strictEqual(
        server.server,
        null
      );

      assert.strictEqual(
        server.socket,
        null
      );
    });

    it('uses and executes default callbacks when omitted', function () {
        const server = new TcpServer({
            port: 2404,
            onFrame
        });

        assert.strictEqual(
            typeof server.onConnect,
            'function'
        );

        assert.strictEqual(
            typeof server.onDisconnect,
            'function'
        );

        assert.strictEqual(
            typeof server.onError,
            'function'
        );

        assert.doesNotThrow(() => {
            server.onConnect();
            server.onDisconnect();
            server.onError();
        });
    });
  });

  describe('start', function () {
    it('creates TCP server', function () {
      const server = createTcpServer();

      server.start();

      assert.strictEqual(
        createServerStub.calledOnce,
        true
      );

      assert.strictEqual(
        server.server,
        netServer
      );
    });

    it('listens on configured port', function () {
      const server = createTcpServer();

      server.start();

      assert.strictEqual(
        netServer.listen.calledOnceWith(2404),
        true
      );
    });

    it('registers server error handler', function () {
      const server = createTcpServer();

      server.start();

      const handler =
        getServerHandler('error');

      const error =
        new Error('EADDRINUSE');

      handler(error);

      assert.strictEqual(
        onError.calledOnceWith(error),
        true
      );
    });
  });

  describe('client connection', function () {
    it('stores connected socket', function () {
      const server = createTcpServer();

      connectClient(server);

      assert.strictEqual(
        server.socket,
        socket
      );
    });

    it('configures connected socket', function () {
      const server = createTcpServer();

      connectClient(server);

      assert.strictEqual(
        socket.setNoDelay.calledOnceWith(true),
        true
      );

      assert.strictEqual(
        socket.setKeepAlive.calledOnceWith(
          true,
          10000
        ),
        true
      );
    });

    it('creates frame parser', function () {
      const server = createTcpServer();

      connectClient(server);

      assert.strictEqual(
        FrameParserStub.calledOnce,
        true
      );
    });

    it('calls onConnect', function () {
      const server = createTcpServer();

      connectClient(server);

      assert.strictEqual(
        onConnect.calledOnce,
        true
      );
    });

    it('forwards decoded frame', function () {
      const server = createTcpServer();

      connectClient(server);

      const frame = Buffer.from([1, 2]);

      parser.callback(frame);

      assert.strictEqual(
        onFrame.calledOnceWith(frame),
        true
      );
    });

    it('forwards socket data to parser', function () {
      const server = createTcpServer();

      connectClient(server);

      const data = Buffer.from([1, 2]);

      getSocketHandler('data')(data);

      assert.strictEqual(
        parser.push.calledOnceWith(data),
        true
      );
    });
  });

  describe('connection cleanup', function () {
    it('cleans up on socket end', function () {
      const server = createTcpServer();

      connectClient(server);

      getSocketHandler('end')();

      assert.strictEqual(
        parser.reset.calledOnce,
        true
      );

      assert.strictEqual(
        server.socket,
        null
      );

      assert.strictEqual(
        onDisconnect.calledOnceWith(
          'socket.end'
        ),
        true
      );
    });

    it('cleans up on socket close', function () {
      const server = createTcpServer();

      connectClient(server);

      getSocketHandler('close')();

      assert.strictEqual(
        onDisconnect.calledOnceWith(
          'socket.close'
        ),
        true
      );
    });

    it('cleans up on socket error', function () {
      const server = createTcpServer();

      connectClient(server);

      getSocketHandler('error')(
        new Error('broken')
      );

      assert.strictEqual(
        onDisconnect.calledOnceWith(
          'broken'
        ),
        true
      );
    });

    it('uses default socket error reason', function () {
      const server = createTcpServer();

      connectClient(server);

      getSocketHandler('error')({});

      assert.strictEqual(
        onDisconnect.calledOnceWith(
          'socket.error'
        ),
        true
      );
    });

    it('cleans up only once', function () {
      const server = createTcpServer();

      connectClient(server);

      getSocketHandler('end')();
      getSocketHandler('close')();

      assert.strictEqual(
        onDisconnect.callCount,
        1
      );

      assert.strictEqual(
        parser.reset.callCount,
        1
      );
    });

    it('does not clear a different current socket', function () {
      const server = createTcpServer();

      connectClient(server);

      const otherSocket = {};

      server.socket = otherSocket;

      getSocketHandler('end')();

      assert.strictEqual(
        server.socket,
        otherSocket
      );
    });
  });

  describe('send', function () {
    it('writes data when socket exists', function () {
      const server = createTcpServer();

      server.socket = socket;

      const data = Buffer.from([1]);

      server.send(data);

      assert.strictEqual(
        socket.write.calledOnceWith(data),
        true
      );
    });

    it('does nothing when socket is missing', function () {
      const server = createTcpServer();

      server.socket = null;

      assert.doesNotThrow(() => {
        server.send(Buffer.from([1]));
      });

      assert.strictEqual(
        socket.write.called,
        false
      );
    });
  });

  describe('stop', function () {
    it('destroys connected socket', function () {
      const server = createTcpServer();

      server.socket = socket;

      server.stop();

      assert.strictEqual(
        socket.destroy.calledOnce,
        true
      );

      assert.strictEqual(
        server.socket,
        null
      );
    });

    it('ignores socket destroy exception', function () {
      const server = createTcpServer();

      socket.destroy.throws(
        new Error('destroy failed')
      );

      server.socket = socket;

      assert.doesNotThrow(() => {
        server.stop();
      });

      assert.strictEqual(
        server.socket,
        null
      );
    });

    it('closes running server with callback', function () {
      const server = createTcpServer();

      server.server = netServer;

      const cb = sinon.spy();

      server.stop(cb);

      assert.strictEqual(
        netServer.close.calledOnceWith(cb),
        true
      );
    });

    it('calls callback directly when server does not exist', function () {
      const server = createTcpServer();

      server.server = null;

      const cb = sinon.spy();

      server.stop(cb);

      assert.strictEqual(
        cb.calledOnce,
        true
      );
    });

    it('works without callback when server does not exist', function () {
      const server = createTcpServer();

      server.server = null;

      assert.doesNotThrow(() => {
        server.stop();
      });
    });
  });
});