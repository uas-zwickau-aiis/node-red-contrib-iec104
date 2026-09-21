'use strict';

const assert = require('assert');
const sinon = require('sinon');

const registerNode = require('../../../iec104-singlecommand');

describe('iec104-singlecommand node', function () {
  let NodeConstructor;
  let RED;

  beforeEach(function () {
    RED = {
      nodes: {
        createNode(node) {
          node.on = sinon.stub();
          node.status = sinon.spy();
          node.send = sinon.spy();
        },

        registerType(name, ctor) {
          assert.strictEqual(name, 'iec104-singlecommand');
          NodeConstructor = ctor;
        }
      },

      _(key) {
        return key;
      }
    };

    registerNode(RED);
  });

  function createNode(config = {}) {
    const node = new NodeConstructor(config);

    assert.strictEqual(node.on.calledOnce, true);
    assert.strictEqual(node.on.firstCall.args[0], 'input');

    const inputHandler = node.on.firstCall.args[1];

    assert.strictEqual(typeof inputHandler, 'function');

    return {
      node,
      inputHandler
    };
  }

  function execute({
    config = {},
    msg,
    provideSend = true
  }) {
    const { node, inputHandler } = createNode(config);

    const send = provideSend
      ? sinon.spy()
      : undefined;

    const done = sinon.spy();

    inputHandler(msg, send, done);

    return {
      node,
      send,
      done
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

  describe('successful processing', function () {
    it('creates and sends a true single command', function () {
      const msg = {
        payload: true,
        ioa: [0, 0, 1]
      };

      const { node, send, done } = execute({
        config: {
          objType: 'C_SC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(send.calledOnce, true);
      assert.strictEqual(done.calledOnce, true);

      assert.deepStrictEqual(
        send.firstCall.args[0].payload,
        {
          type: 'C_SC_NA_1',
          ioa: 1,
          value: true
        }
      );

      assert.strictEqual(node.status.calledOnce, true);
      assert.deepStrictEqual(
        node.status.firstCall.args[0],
        {}
      );
    });

    it('creates and sends a false single command', function () {
      const msg = {
        payload: false,
        ioa: [0, 0, 1]
      };

      const { send, done } = execute({
        config: {
          objType: 'C_SC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(send.calledOnce, true);
      assert.strictEqual(done.calledOnce, true);

      assert.strictEqual(
        send.firstCall.args[0].payload.value,
        false
      );
    });

    it('uses C_SC_NA_1 as default object type', function () {
      const msg = {
        payload: true,
        ioa: [0, 0, 1]
      };

      const { send } = execute({
        config: {
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(
        send.firstCall.args[0].payload.type,
        'C_SC_NA_1'
      );
    });
  });

  describe('IOA handling', function () {
    it('uses IOA from msg when configured', function () {
      const msg = {
        payload: true,
        ioa: [1, 2, 3]
      };

      const { send } = execute({
        config: {
          objType: 'C_SC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(
        send.firstCall.args[0].payload.ioa,
        0x010203
      );
    });

    it('uses IOA from msg when ioaFromMsg is string true', function () {
      const msg = {
        payload: true,
        ioa: [1, 2, 3]
      };

      const { send } = execute({
        config: {
          objType: 'C_SC_NA_1',
          ioaFromMsg: 'true'
        },
        msg
      });

      assert.strictEqual(
        send.firstCall.args[0].payload.ioa,
        0x010203
      );
    });

    it('uses configured IOA when ioaFromMsg is false', function () {
      const msg = {
        payload: true
      };

      const { send } = execute({
        config: {
          objType: 'C_SC_NA_1',
          ioaFromMsg: false,
          ioa0: 1,
          ioa1: 2,
          ioa2: 3
        },
        msg
      });

      assert.strictEqual(
        send.firstCall.args[0].payload.ioa,
        0x010203
      );
    });
  });

  describe('value validation', function () {
    it('rejects numeric value', function () {
      const msg = {
        payload: 1,
        ioa: [0, 0, 1]
      };

      const { node, send, done } = execute({
        config: {
          objType: 'C_SC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(send.called, false);
      assert.strictEqual(done.calledOnce, true);

      assert.deepStrictEqual(
        node.status.firstCall.args[0],
        {
          fill: 'red',
          shape: 'ring',
          text: 'iec104.error.value'
        }
      );
    });

    it('rejects string value', function () {
      const msg = {
        payload: 'true',
        ioa: [0, 0, 1]
      };

      const { send, done } = execute({
        config: {
          objType: 'C_SC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(send.called, false);
      assert.strictEqual(done.calledOnce, true);
    });

    it('rejects null value', function () {
      const msg = {
        payload: null,
        ioa: [0, 0, 1]
      };

      const { send, done } = execute({
        config: {
          objType: 'C_SC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(send.called, false);
      assert.strictEqual(done.calledOnce, true);
    });
  });

  describe('timestamp handling', function () {
    it('does not add timestamp for C_SC_NA_1', function () {
      const msg = {
        payload: true,
        ioa: [0, 0, 1]
      };

      const { send } = execute({
        config: {
          objType: 'C_SC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      const payload =
        send.firstCall.args[0].payload;

      assert.strictEqual(
        Object.prototype.hasOwnProperty.call(
          payload,
          'ts'
        ),
        false
      );
    });

    it('adds current timestamp for timed single command', function () {
      const before = Date.now();

      const msg = {
        payload: true,
        ioa: [0, 0, 1]
      };

      const { send } = execute({
        config: {
          objType: 'C_SC_TA_1',
          ioaFromMsg: true,
          tsSource: 'now'
        },
        msg
      });

      const after = Date.now();

      const timestamp =
        send.firstCall.args[0].payload.ts;

      const parsed = Date.parse(timestamp);

      assert.strictEqual(
        Number.isFinite(parsed),
        true
      );

      assert.ok(parsed >= before);
      assert.ok(parsed <= after);
    });

    it('uses timestamp from msg when configured', function () {
      const timestamp =
        '2026-01-02T03:04:05.000Z';

      const msg = {
        payload: true,
        ioa: [0, 0, 1],
        ts: timestamp
      };

      const { send } = execute({
        config: {
          objType: 'C_SC_TA_1',
          ioaFromMsg: true,
          tsSource: 'msg'
        },
        msg
      });

      assert.strictEqual(
        send.firstCall.args[0].payload.ts,
        timestamp
      );
    });

    it('falls back to current timestamp when msg.ts is missing', function () {
      const msg = {
        payload: true,
        ioa: [0, 0, 1]
      };

      const { send } = execute({
        config: {
          objType: 'C_SC_TA_1',
          ioaFromMsg: true,
          tsSource: 'msg'
        },
        msg
      });

      const timestamp =
        send.firstCall.args[0].payload.ts;

      assert.strictEqual(
        typeof timestamp,
        'string'
      );

      assert.strictEqual(
        Number.isFinite(Date.parse(timestamp)),
        true
      );
    });
  });

  describe('Node-RED send handling', function () {
    it('uses provided send function', function () {
      const msg = {
        payload: true,
        ioa: [0, 0, 1]
      };

      const { node, send } = execute({
        config: {
          objType: 'C_SC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(send.calledOnce, true);
      assert.strictEqual(node.send.called, false);
    });

    it('falls back to node.send when send is missing', function () {
      const msg = {
        payload: true,
        ioa: [0, 0, 1]
      };

      const { node, done } = execute({
        config: {
          objType: 'C_SC_NA_1',
          ioaFromMsg: true
        },
        msg,
        provideSend: false
      });

      assert.strictEqual(node.send.calledOnce, true);
      assert.strictEqual(done.calledOnce, true);

      assert.deepStrictEqual(
        node.send.firstCall.args[0].payload,
        {
          type: 'C_SC_NA_1',
          ioa: 1,
          value: true
        }
      );
    });
  });

  describe('status handling', function () {
    it('clears status after successful processing', function () {
      const msg = {
        payload: true,
        ioa: [0, 0, 1]
      };

      const { node } = execute({
        config: {
          objType: 'C_SC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(node.status.calledOnce, true);

      assert.deepStrictEqual(
        node.status.firstCall.args[0],
        {}
      );
    });

    it('sets value error status for non-boolean payload', function () {
      const msg = {
        payload: 1,
        ioa: [0, 0, 1]
      };

      const { node } = execute({
        config: {
          objType: 'C_SC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(node.status.calledOnce, true);

      assert.deepStrictEqual(
        node.status.firstCall.args[0],
        {
          fill: 'red',
          shape: 'ring',
          text: 'iec104.error.value'
        }
      );
    });
  });
});