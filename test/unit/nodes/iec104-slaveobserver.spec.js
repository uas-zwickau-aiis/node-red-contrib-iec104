'use strict';

const assert = require('assert');
const sinon = require('sinon');

const registerNode = require('../../../iec104-slaveobserver');

describe('iec104-slaveobserver node', function () {
  let NodeConstructor;
  let RED;
  let client;

  beforeEach(function () {
    client = {
      on: sinon.spy(),
      removeListener: sinon.spy()
    };

    RED = {
      nodes: {
        createNode(node) {
          node.on = sinon.stub();
          node.send = sinon.spy();
          node.warn = sinon.spy();
        },

        getNode: sinon.stub().returns(client),

        registerType(name, ctor) {
          assert.strictEqual(name, 'iec104-slaveobserver');
          NodeConstructor = ctor;
        }
      }
    };

    registerNode(RED);
  });

  function createNode(config = {}) {
    const node = new NodeConstructor({
      connection: 'slave-1',
      ...config
    });

    return node;
  }

  function getClientHandler(eventName) {
    const call = client.on
      .getCalls()
      .find(call => call.args[0] === eventName);

    assert.ok(call, `client handler for ${eventName} not registered`);

    return call.args[1];
  }

  function getNodeHandler(node, eventName) {
    const call = node.on
      .getCalls()
      .find(call => call.args[0] === eventName);

    assert.ok(call, `node handler for ${eventName} not registered`);

    return call.args[1];
  }

  describe('registration', function () {
    it('registers the node type', function () {
      assert.strictEqual(
        typeof NodeConstructor,
        'function'
      );
    });
  });

  describe('initialization', function () {
    it('resolves configured slave node', function () {
      createNode({
        connection: 'slave-123'
      });

      assert.strictEqual(
        RED.nodes.getNode.calledOnceWith('slave-123'),
        true
      );
    });

    it('registers data listener on slave', function () {
      createNode();

      const call = client.on
        .getCalls()
        .find(call => call.args[0] === 'iec104:data');

      assert.ok(call);
      assert.strictEqual(typeof call.args[1], 'function');
    });

    it('registers status listener on slave', function () {
      createNode();

      const call = client.on
        .getCalls()
        .find(call => call.args[0] === 'iec104:status');

      assert.ok(call);
      assert.strictEqual(typeof call.args[1], 'function');
    });

    it('registers close handler', function () {
      const node = createNode();

      const call = node.on
        .getCalls()
        .find(call => call.args[0] === 'close');

      assert.ok(call);
      assert.strictEqual(typeof call.args[1], 'function');
    });
  });

  describe('data forwarding', function () {
    it('forwards iec104:data message to first output', function () {
      const node = createNode();

      const onData = getClientHandler('iec104:data');

      const msg = {
        topic: 'iec104/data',
        payload: {
          value: 42
        }
      };

      onData(msg);

      assert.strictEqual(
        node.send.calledOnceWith(msg),
        true
      );
    });

    it('forwards original data message unchanged', function () {
      const node = createNode();

      const onData = getClientHandler('iec104:data');

      const msg = {
        topic: 'iec104/data',
        payload: {
          ca: 1,
          ioa: 10,
          value: true
        }
      };

      onData(msg);

      assert.strictEqual(
        node.send.firstCall.args[0],
        msg
      );
    });
  });

  describe('status forwarding', function () {
    it('forwards iec104:status message to second output', function () {
      const node = createNode();

      const onStatus = getClientHandler('iec104:status');

      const msg = {
        topic: 'iec104/status',
        payload: {
          state: 'CONNECTED'
        }
      };

      onStatus(msg);

      assert.deepStrictEqual(
        node.send.firstCall.args[0],
        [null, msg]
      );
    });

    it('forwards original status message unchanged', function () {
      const node = createNode();

      const onStatus = getClientHandler('iec104:status');

      const msg = {
        topic: 'iec104/status',
        payload: {
          state: 'IDLE',
          reason: 'Disconnected'
        }
      };

      onStatus(msg);

      const sent = node.send.firstCall.args[0];

      assert.strictEqual(sent[0], null);
      assert.strictEqual(sent[1], msg);
    });
  });

  describe('close handling', function () {
    it('removes data listener on close', function () {
      const node = createNode();

      const onData = getClientHandler('iec104:data');
      const closeHandler = getNodeHandler(node, 'close');

      closeHandler();

      assert.strictEqual(
        client.removeListener.calledWith(
          'iec104:data',
          onData
        ),
        true
      );
    });

    it('removes status listener on close', function () {
      const node = createNode();

      const onStatus = getClientHandler('iec104:status');
      const closeHandler = getNodeHandler(node, 'close');

      closeHandler();

      assert.strictEqual(
        client.removeListener.calledWith(
          'iec104:status',
          onStatus
        ),
        true
      );
    });

    it('removes both listeners on close', function () {
      const node = createNode();

      const onData = getClientHandler('iec104:data');
      const onStatus = getClientHandler('iec104:status');
      const closeHandler = getNodeHandler(node, 'close');

      closeHandler();

      assert.strictEqual(
        client.removeListener.callCount,
        2
      );

      assert.strictEqual(
        client.removeListener.calledWith(
          'iec104:data',
          onData
        ),
        true
      );

      assert.strictEqual(
        client.removeListener.calledWith(
          'iec104:status',
          onStatus
        ),
        true
      );
    });
  });

  describe('missing slave', function () {
    it('warns when no slave is configured', function () {
      RED.nodes.getNode.returns(null);

      const node = createNode();

      assert.strictEqual(
        node.warn.calledOnceWith(
          'Kein Slave konfiguriert'
        ),
        true
      );
    });

    it('does not register slave listeners when slave is missing', function () {
      RED.nodes.getNode.returns(null);

      createNode();

      assert.strictEqual(
        client.on.called,
        false
      );
    });

    it('does not register close handler when slave is missing', function () {
      RED.nodes.getNode.returns(null);

      const node = createNode();

      assert.strictEqual(
        node.on.called,
        false
      );
    });
  });
});