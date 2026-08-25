'use strict';

const assert = require('assert');
const sinon = require('sinon');

const registerNode = require('../../../iec104-slaveaddress');

describe('iec104-slaveaddress node', function () {
  let NodeConstructor;
  let RED;
  let client;

  beforeEach(function () {
    client = {
      emit: sinon.spy()
    };

    RED = {
      nodes: {
        createNode(node) {
          node.on = sinon.stub();
          node.warn = sinon.spy();
        },

        getNode: sinon.stub().returns(client),

        registerType(name, ctor) {
          assert.strictEqual(name, 'iec104-slaveaddress');
          NodeConstructor = ctor;
        }
      }
    };

    registerNode(RED);
  });

  function createNode(config = {}) {
    const node = new NodeConstructor({
      ca: 1,
      connection: 'slave-1',
      ...config
    });

    assert.strictEqual(node.on.calledOnce, true);
    assert.strictEqual(node.on.firstCall.args[0], 'input');

    const inputHandler = node.on.firstCall.args[1];

    assert.strictEqual(typeof inputHandler, 'function');

    return {
      node,
      inputHandler
    };
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
    it('stores configured common address', function () {
      const { node } = createNode({
        ca: 42
      });

      assert.strictEqual(node.ca, 42);
    });

    it('resolves configured slave node', function () {
      createNode({
        connection: 'slave-123'
      });

      assert.strictEqual(
        RED.nodes.getNode.calledOnceWith('slave-123'),
        true
      );
    });
  });

  describe('input handling', function () {
    it('adds configured CA to existing payload', function () {
      const { inputHandler } = createNode({
        ca: 12
      });

      const msg = {
        payload: {
          value: 42
        }
      };

      inputHandler(msg);

      assert.deepStrictEqual(
        msg.payload,
        {
          value: 42,
          ca: 12
        }
      );
    });

    it('forwards message to slave', function () {
      const { inputHandler } = createNode({
        ca: 12
      });

      const msg = {
        payload: {
          value: 42
        }
      };

      inputHandler(msg);

      assert.strictEqual(
        client.emit.calledOnceWith(
          'iec104:input',
          msg
        ),
        true
      );
    });

    it('creates payload when payload is missing', function () {
      const { inputHandler } = createNode({
        ca: 5
      });

      const msg = {};

      inputHandler(msg);

      assert.deepStrictEqual(
        msg.payload,
        {
          ca: 5
        }
      );

      assert.strictEqual(
        client.emit.calledOnceWith(
          'iec104:input',
          msg
        ),
        true
      );
    });

    it('creates payload when payload is null', function () {
      const { inputHandler } = createNode({
        ca: 5
      });

      const msg = {
        payload: null
      };

      inputHandler(msg);

      assert.deepStrictEqual(
        msg.payload,
        {
          ca: 5
        }
      );
    });

    it('overwrites existing CA with configured CA', function () {
      const { inputHandler } = createNode({
        ca: 99
      });

      const msg = {
        payload: {
          ca: 1,
          value: true
        }
      };

      inputHandler(msg);

      assert.deepStrictEqual(
        msg.payload,
        {
          ca: 99,
          value: true
        }
      );
    });
  });

  describe('missing slave', function () {
    it('warns when no slave is configured', function () {
      RED.nodes.getNode.returns(null);

      const { node, inputHandler } = createNode();

      inputHandler({
        payload: {
          value: 42
        }
      });

      assert.strictEqual(
        node.warn.calledOnceWith(
          'Kein Slave konfiguriert'
        ),
        true
      );
    });

    it('does not modify message when slave is missing', function () {
      RED.nodes.getNode.returns(null);

      const { inputHandler } = createNode({
        ca: 10
      });

      const msg = {
        payload: {
          value: 42
        }
      };

      inputHandler(msg);

      assert.deepStrictEqual(
        msg.payload,
        {
          value: 42
        }
      );
    });

    it('does not emit message when slave is missing', function () {
      RED.nodes.getNode.returns(null);

      const { inputHandler } = createNode();

      inputHandler({
        payload: {
          value: 42
        }
      });

      assert.strictEqual(
        client.emit.called,
        false
      );
    });
  });
});