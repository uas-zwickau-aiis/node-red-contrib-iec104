'use strict';

const assert = require('assert');
const sinon = require('sinon');
const proxyquire = require('proxyquire').noCallThru();

describe('TcpClient', function () {
  let SocketStub;
  let socket;
  let FrameParserStub;
  let parser;

  let TcpClient;

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
      connect: sinon.stub(),
      setNoDelay: sinon.spy(),
      setKeepAlive: sinon.spy(),
      destroy: sinon.stub(),
      write: sinon.spy(),

      destroyed: false,
      writable: true
    };

    SocketStub = sinon.stub().returns(socket);

    TcpClient = proxyquire('../../../lib/tcp/client', {
      net: {
        Socket: SocketStub
      },
      '../protocol/frameParser': FrameParserStub
    });

    onFrame = sinon.spy();
    onConnect = sinon.spy();
    onDisconnect = sinon.spy();
    onError = sinon.spy();
  });

  function createClient(overrides = {}) {
    return new TcpClient({
      host: '127.0.0.1',
      port: 2404,

      onFrame,
      onConnect,
      onDisconnect,
      onError,

      reconnectDelay: 1000,
      maxRetries: 3,
      t0: 5000,

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

  describe('initialization', function () {
    it('stores configuration', function () {
      const client = createClient();

      assert.strictEqual(client.host, '127.0.0.1');
      assert.strictEqual(client.port, 2404);

      assert.strictEqual(client.reconnectDelay, 1000);
      assert.strictEqual(client.maxRetries, 3);
      assert.strictEqual(client.t0, 5000);

      assert.strictEqual(client.retryCount, 0);
      assert.strictEqual(client.retryTimer, null);
      assert.strictEqual(client.connectTimer, null);
      assert.strictEqual(client.socket, null);

      assert.strictEqual(client.stopped, true);
    });

    it('uses and executes default callbacks when omitted', function () {
        const client = new TcpClient({
            host: '127.0.0.1',
            port: 2404,
            onFrame
        });

        assert.strictEqual(typeof client.onConnect, 'function');
        assert.strictEqual(typeof client.onDisconnect, 'function');
        assert.strictEqual(typeof client.onError, 'function');

        assert.doesNotThrow(() => {
            client.onConnect();
            client.onDisconnect();
            client.onError();
        });
    });

    it('uses default timing configuration', function () {
      const client = new TcpClient({
        host: '127.0.0.1',
        port: 2404,
        onFrame
      });

      assert.strictEqual(client.reconnectDelay, 5000);
      assert.strictEqual(client.maxRetries, 10);
      assert.strictEqual(client.t0, 30000);
    });
  });

  describe('start', function () {
    it('starts client', function () {
      const client = createClient();

      const connectStub = sinon.stub(
        client,
        'connect'
      );

      client.start();

      assert.strictEqual(client.stopped, false);
      assert.strictEqual(client.retryCount, 0);

      assert.strictEqual(
        connectStub.calledOnce,
        true
      );
    });

    it('does nothing when already started', function () {
      const client = createClient();

      client.stopped = false;

      const connectStub = sinon.stub(
        client,
        'connect'
      );

      client.start();

      assert.strictEqual(
        connectStub.called,
        false
      );
    });
  });

  describe('connect', function () {
    it('does nothing while stopped', function () {
      const client = createClient();

      client.stopped = true;

      client.connect();

      assert.strictEqual(
        SocketStub.called,
        false
      );
    });

    it('does nothing when socket already exists', function () {
      const client = createClient();

      client.stopped = false;
      client.socket = {};

      client.connect();

      assert.strictEqual(
        SocketStub.called,
        false
      );
    });

    it('creates and configures socket', function () {
      const client = createClient();

      client.stopped = false;

      client.connect();

      assert.strictEqual(
        SocketStub.calledOnce,
        true
      );

      assert.strictEqual(
        client.socket,
        socket
      );

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
      const client = createClient();

      client.stopped = false;
      client.connect();

      assert.strictEqual(
        FrameParserStub.calledOnce,
        true
      );
    });

    it('forwards parsed frame', function () {
      const client = createClient();

      client.stopped = false;
      client.connect();

      const frame = Buffer.from([1, 2]);

      parser.callback(frame);

      assert.strictEqual(
        onFrame.calledOnceWith(frame),
        true
      );
    });

    it('forwards socket data to parser', function () {
      const client = createClient();

      client.stopped = false;
      client.connect();

      const handler =
        getSocketHandler('data');

      const data = Buffer.from([1, 2, 3]);

      handler(data);

      assert.strictEqual(
        parser.push.calledOnceWith(data),
        true
      );
    });

    it('connects using configured host and port', function () {
      const client = createClient();

      client.stopped = false;
      client.connect();

      assert.strictEqual(
        socket.connect.calledOnce,
        true
      );

      assert.strictEqual(
        socket.connect.firstCall.args[0],
        2404
      );

      assert.strictEqual(
        socket.connect.firstCall.args[1],
        '127.0.0.1'
      );

      assert.strictEqual(
        typeof socket.connect.firstCall.args[2],
        'function'
      );
    });
  });

  describe('successful connection', function () {
    it('resets retry count and calls onConnect', function () {
      const client = createClient();

      client.stopped = false;
      client.retryCount = 2;

      client.connect();

      const connectCallback =
        socket.connect.firstCall.args[2];

      connectCallback();

      assert.strictEqual(
        client.retryCount,
        0
      );

      assert.strictEqual(
        client.connectTimer,
        null
      );

      assert.strictEqual(
        onConnect.calledOnce,
        true
      );
    });
  });

  describe('cleanup', function () {
    it('cleans up on socket end', function () {
      const client = createClient();

      client.stopped = false;

      const reconnectStub = sinon.stub(
        client,
        'scheduleReconnect'
      );

      client.connect();

      const handler =
        getSocketHandler('end');

      handler();

      assert.strictEqual(
        parser.reset.calledOnce,
        true
      );

      assert.strictEqual(
        client.socket,
        null
      );

      assert.strictEqual(
        socket.destroy.calledOnce,
        true
      );

      assert.strictEqual(
        onDisconnect.calledOnceWith(
          'socket end'
        ),
        true
      );

      assert.strictEqual(
        reconnectStub.calledOnce,
        true
      );
    });

    it('cleans up on socket close', function () {
      const client = createClient();

      client.stopped = false;

      const reconnectStub = sinon.stub(
        client,
        'scheduleReconnect'
      );

      client.connect();

      getSocketHandler('close')();

      assert.strictEqual(
        onDisconnect.calledOnceWith(
          'socket close'
        ),
        true
      );

      assert.strictEqual(
        reconnectStub.calledOnce,
        true
      );
    });

    it('reports socket error', function () {
      const client = createClient();

      client.stopped = false;

      sinon.stub(
        client,
        'scheduleReconnect'
      );

      client.connect();

      const error =
        new Error('ECONNRESET');

      getSocketHandler('error')(error);

      assert.strictEqual(
        onDisconnect.calledOnceWith(
          'ECONNRESET'
        ),
        true
      );

      assert.strictEqual(
        onError.calledOnceWith(error),
        true
      );
    });

    it('uses default socket error reason', function () {
      const client = createClient();

      client.stopped = false;

      sinon.stub(
        client,
        'scheduleReconnect'
      );

      client.connect();

      getSocketHandler('error')({});

      assert.strictEqual(
        onDisconnect.calledOnceWith(
          'socket error'
        ),
        true
      );
    });

    it('cleans up on connect timeout', function () {
      const clock =
        sinon.useFakeTimers();

      try {
        const client = createClient({
          t0: 100
        });

        client.stopped = false;

        const reconnectStub = sinon.stub(
          client,
          'scheduleReconnect'
        );

        client.connect();

        clock.tick(100);

        assert.strictEqual(
          onDisconnect.calledOnceWith(
            'connect timeout'
          ),
          true
        );

        assert.strictEqual(
          reconnectStub.calledOnce,
          true
        );
      } finally {
        clock.restore();
      }
    });

    it('does cleanup only once', function () {
      const client = createClient();

      client.stopped = false;

      const reconnectStub = sinon.stub(
        client,
        'scheduleReconnect'
      );

      client.connect();

      getSocketHandler('end')();
      getSocketHandler('close')();

      assert.strictEqual(
        onDisconnect.callCount,
        1
      );

      assert.strictEqual(
        reconnectStub.callCount,
        1
      );
    });

    it('does not destroy already destroyed socket', function () {
      const client = createClient();

      socket.destroyed = true;

      client.stopped = false;

      sinon.stub(
        client,
        'scheduleReconnect'
      );

      client.connect();

      getSocketHandler('end')();

      assert.strictEqual(
        socket.destroy.called,
        false
      );
    });

    it('does not clear another socket reference', function () {
      const client = createClient();

      client.stopped = false;

      sinon.stub(
        client,
        'scheduleReconnect'
      );

      client.connect();

      const otherSocket = {};

      client.socket = otherSocket;

      getSocketHandler('end')();

      assert.strictEqual(
        client.socket,
        otherSocket
      );
    });
  });

  describe('scheduleReconnect', function () {
    it('does nothing when stopped', function () {
      const client = createClient();

      client.stopped = true;

      client.scheduleReconnect();

      assert.strictEqual(
        client.retryTimer,
        null
      );

      assert.strictEqual(
        client.retryCount,
        0
      );
    });

    it('reports error when retry limit is reached', function () {
      const client = createClient({
        maxRetries: 3
      });

      client.stopped = false;
      client.retryCount = 3;

      client.scheduleReconnect();

      assert.strictEqual(
        onError.calledOnce,
        true
      );

      assert.match(
        onError.firstCall.args[0].message,
        /Maximum reconnect attempts reached: 3/
      );
    });

    it('allows unlimited retries when maxRetries is negative', function () {
      const clock =
        sinon.useFakeTimers();

      try {
        const client = createClient({
          maxRetries: -1,
          reconnectDelay: 100
        });

        client.stopped = false;

        const connectStub = sinon.stub(
          client,
          'connect'
        );

        client.scheduleReconnect();

        assert.strictEqual(
          client.retryCount,
          1
        );

        clock.tick(100);

        assert.strictEqual(
          connectStub.calledOnce,
          true
        );
      } finally {
        clock.restore();
      }
    });

    it('schedules reconnect', function () {
      const clock =
        sinon.useFakeTimers();

      try {
        const client = createClient({
          reconnectDelay: 100
        });

        client.stopped = false;

        const connectStub = sinon.stub(
          client,
          'connect'
        );

        client.scheduleReconnect();

        assert.strictEqual(
          client.retryCount,
          1
        );

        assert.notStrictEqual(
          client.retryTimer,
          null
        );

        clock.tick(100);

        assert.strictEqual(
          client.retryTimer,
          null
        );

        assert.strictEqual(
          connectStub.calledOnce,
          true
        );
      } finally {
        clock.restore();
      }
    });
  });

  describe('send', function () {
    it('writes data when socket is writable', function () {
      const client = createClient();

      client.socket = socket;

      const data = Buffer.from([1]);

      const result = client.send(data);

      assert.strictEqual(
        result,
        true
      );

      assert.strictEqual(
        socket.write.calledOnceWith(data),
        true
      );
    });

    it('returns false when socket is missing', function () {
      const client = createClient();

      client.socket = null;

      assert.strictEqual(
        client.send(Buffer.from([1])),
        false
      );
    });

    it('returns false when socket is destroyed', function () {
      const client = createClient();

      socket.destroyed = true;
      client.socket = socket;

      assert.strictEqual(
        client.send(Buffer.from([1])),
        false
      );

      assert.strictEqual(
        socket.write.called,
        false
      );
    });

    it('returns false when socket is not writable', function () {
      const client = createClient();

      socket.writable = false;
      client.socket = socket;

      assert.strictEqual(
        client.send(Buffer.from([1])),
        false
      );

      assert.strictEqual(
        socket.write.called,
        false
      );
    });
  });

  describe('stop', function () {
    it('marks client as stopped', function () {
      const client = createClient();

      client.stopped = false;

      client.stop();

      assert.strictEqual(
        client.stopped,
        true
      );
    });

    it('clears retry timer', function () {
      const clock =
        sinon.useFakeTimers();

      try {
        const client = createClient();

        client.retryTimer =
          setTimeout(() => {}, 1000);

        client.stop();

        assert.strictEqual(
          client.retryTimer,
          null
        );
      } finally {
        clock.restore();
      }
    });

    it('clears connect timer', function () {
      const clock =
        sinon.useFakeTimers();

      try {
        const client = createClient();

        client.connectTimer =
          setTimeout(() => {}, 1000);

        client.stop();

        assert.strictEqual(
          client.connectTimer,
          null
        );
      } finally {
        clock.restore();
      }
    });

    it('destroys existing socket', function () {
      const client = createClient();

      client.socket = socket;

      client.stop();

      assert.strictEqual(
        socket.destroy.calledOnce,
        true
      );

      assert.strictEqual(
        client.socket,
        null
      );
    });

    it('calls callback', function () {
      const client = createClient();

      const cb = sinon.spy();

      client.stop(cb);

      assert.strictEqual(
        cb.calledOnce,
        true
      );
    });

    it('works without callback', function () {
      const client = createClient();

      assert.doesNotThrow(() => {
        client.stop();
      });
    });

    it('ignores socket destroy exception', function () {
      const client = createClient();

      socket.destroy.throws(
        new Error('destroy failed')
      );

      client.socket = socket;

      assert.doesNotThrow(() => {
        client.stop();
      });

      assert.strictEqual(
        client.socket,
        null
      );
    });
  });
});