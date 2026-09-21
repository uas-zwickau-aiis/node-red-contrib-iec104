'use strict';

const assert = require('assert');
const sinon = require('sinon');

const registerNode = require('../../../iec104-masteraddress');

describe('iec104-masteraddress node', function () {
  let NodeConstructor;
  let RED;
  let master;

  beforeEach(function () {
    master = {
      emit: sinon.spy()
    };

    RED = {
      nodes: {
        createNode(node) {
          node.on = sinon.stub();
          node.warn = sinon.spy();
        },

        getNode: sinon.stub().returns(master),

        registerType(name, ctor) {
          assert.strictEqual(name, 'iec104-masteraddress');
          NodeConstructor = ctor;
        }
      }
    };

    registerNode(RED);
  });

  function createNode(config = {}) {
    const node = new NodeConstructor({
      ca: 1,
      connection: 'master-1',
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
      assert.strictEqual(typeof NodeConstructor, 'function');
    });
  });

  describe('initialization', function () {
    it('stores configured common address', function () {
      const { node } = createNode({
        ca: 42
      });

      assert.strictEqual(node.ca, 42);
    });

    it('resolves configured master node', function () {
      createNode({
        connection: 'master-123'
      });

      assert.strictEqual(
        RED.nodes.getNode.calledOnceWith('master-123'),
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

    it('forwards message to master', function () {
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
        master.emit.calledOnceWith(
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
        master.emit.calledOnceWith(
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

    it('replaces primitive payload with object', function () {
      const { inputHandler } = createNode({
        ca: 7
      });

      const msg = {
        payload: 123
      };

      inputHandler(msg);

      assert.deepStrictEqual(
        msg.payload,
        {
          ca: 7
        }
      );
    });

    it('replaces string payload with object', function () {
      const { inputHandler } = createNode({
        ca: 7
      });

      const msg = {
        payload: 'value'
      };

      inputHandler(msg);

      assert.deepStrictEqual(
        msg.payload,
        {
          ca: 7
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

  describe('missing master', function () {
    it('warns when no master is configured', function () {
      RED.nodes.getNode.returns(null);

      const { node, inputHandler } = createNode();

      const msg = {
        payload: {
          value: 42
        }
      };

      inputHandler(msg);

      assert.strictEqual(
        node.warn.calledOnceWith(
          'Kein Master konfiguriert'
        ),
        true
      );
    });

    it('does not modify message when master is missing', function () {
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

    it('does not emit message when master is missing', function () {
      RED.nodes.getNode.returns(null);

      const { inputHandler } = createNode();

      inputHandler({
        payload: {
          value: 42
        }
      });

      assert.strictEqual(master.emit.called, false);
    });
  });
});