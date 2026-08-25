'use strict';

const assert = require('assert');
const sinon = require('sinon');

const registerNode = require('../../../iec104-doublecommand');

describe('iec104-doublecommand node', function () {
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
          assert.strictEqual(
            name,
            'iec104-doublecommand'
          );

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
    assert.strictEqual(
      node.on.firstCall.args[0],
      'input'
    );

    const inputHandler =
      node.on.firstCall.args[1];

    assert.strictEqual(
      typeof inputHandler,
      'function'
    );

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
    const { node, inputHandler } =
      createNode(config);

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
    it('creates a double command', function () {
      const msg = {
        payload: 2,
        ioa: [0, 0, 1]
      };

      const { node, send, done } =
        execute({
          config: {
            objType: 'C_DC_NA_1',
            ioaFromMsg: true
          },
          msg
        });

      assert.strictEqual(
        send.calledOnce,
        true
      );

      assert.strictEqual(
        done.calledOnce,
        true
      );

      assert.deepStrictEqual(
        send.firstCall.args[0].payload,
        {
          type: 'C_DC_NA_1',
          ioa: 1,
          dcs: 2
        }
      );

      assert.deepStrictEqual(
        node.status.firstCall.args[0],
        {}
      );
    });

    it('uses C_DC_NA_1 as default object type', function () {
      const msg = {
        payload: 1,
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
        'C_DC_NA_1'
      );
    });

    it('accepts numeric DCS values', function () {
      const msg = {
        payload: 3,
        ioa: [0, 0, 1]
      };

      const { send } = execute({
        config: {
          objType: 'C_DC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(
        send.firstCall.args[0].payload.dcs,
        3
      );
    });

    it('accepts string DCS values', function () {
      const msg = {
        payload: '2',
        ioa: [0, 0, 1]
      };

      const { send } = execute({
        config: {
          objType: 'C_DC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(
        send.firstCall.args[0].payload.dcs,
        2
      );
    });
  });

  describe('IOA handling', function () {
    it('uses IOA from msg when ioaFromMsg is true', function () {
      const msg = {
        payload: 2,
        ioa: [1, 2, 3]
      };

      const { send } = execute({
        config: {
          objType: 'C_DC_NA_1',
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
        payload: 2,
        ioa: [1, 2, 3]
      };

      const { send } = execute({
        config: {
          objType: 'C_DC_NA_1',
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
        payload: 2
      };

      const { send } = execute({
        config: {
          objType: 'C_DC_NA_1',
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

  describe('validation', function () {
    it('accepts all valid DCS values', function () {
      for (const value of [0, 1, 2, 3]) {
        const msg = {
          payload: value,
          ioa: [0, 0, 1]
        };

        const { send, done } = execute({
          config: {
            objType: 'C_DC_NA_1',
            ioaFromMsg: true
          },
          msg
        });

        assert.strictEqual(
          send.calledOnce,
          true
        );

        assert.strictEqual(
          send.firstCall.args[0].payload.dcs,
          value
        );

        assert.strictEqual(
          done.calledOnce,
          true
        );
      }
    });

    it('rejects DCS below valid range', function () {
      const msg = {
        payload: -1,
        ioa: [0, 0, 1]
      };

      const { node, send, done } =
        execute({
          config: {
            objType: 'C_DC_NA_1',
            ioaFromMsg: true
          },
          msg
        });

      assert.strictEqual(
        send.called,
        false
      );

      assert.strictEqual(
        done.calledOnce,
        true
      );

      assert.deepStrictEqual(
        node.status.firstCall.args[0],
        {
          fill: 'red',
          shape: 'ring',
          text: 'iec104.error.value'
        }
      );
    });

    it('rejects DCS above valid range', function () {
      const msg = {
        payload: 4,
        ioa: [0, 0, 1]
      };

      const { node, send, done } =
        execute({
          config: {
            objType: 'C_DC_NA_1',
            ioaFromMsg: true
          },
          msg
        });

      assert.strictEqual(
        send.called,
        false
      );

      assert.strictEqual(
        done.calledOnce,
        true
      );

      assert.deepStrictEqual(
        node.status.firstCall.args[0],
        {
          fill: 'red',
          shape: 'ring',
          text: 'iec104.error.value'
        }
      );
    });

    it('rejects non-integer DCS', function () {
      const msg = {
        payload: 1.5,
        ioa: [0, 0, 1]
      };

      const { send, done } = execute({
        config: {
          objType: 'C_DC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(
        send.called,
        false
      );

      assert.strictEqual(
        done.calledOnce,
        true
      );
    });

    it('rejects empty string DCS', function () {
      const msg = {
        payload: '   ',
        ioa: [0, 0, 1]
      };

      const { send, done } = execute({
        config: {
          objType: 'C_DC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(
        send.called,
        false
      );

      assert.strictEqual(
        done.calledOnce,
        true
      );
    });

    it('rejects non-numeric string DCS', function () {
      const msg = {
        payload: 'invalid',
        ioa: [0, 0, 1]
      };

      const { send, done } = execute({
        config: {
          objType: 'C_DC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(
        send.called,
        false
      );

      assert.strictEqual(
        done.calledOnce,
        true
      );
    });
  });

  describe('timestamp handling', function () {
    it('does not add timestamp for C_DC_NA_1', function () {
      const msg = {
        payload: 2,
        ioa: [0, 0, 1]
      };

      const { send } = execute({
        config: {
          objType: 'C_DC_NA_1',
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

    it('adds current timestamp for timed type', function () {
      const before = Date.now();

      const msg = {
        payload: 2,
        ioa: [0, 0, 1]
      };

      const { send } = execute({
        config: {
          objType: 'C_DC_TA_1',
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

    it('uses timestamp from msg', function () {
      const timestamp =
        '2026-01-02T03:04:05.000Z';

      const msg = {
        payload: 2,
        ioa: [0, 0, 1],
        ts: timestamp
      };

      const { send } = execute({
        config: {
          objType: 'C_DC_TA_1',
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
        payload: 2,
        ioa: [0, 0, 1]
      };

      const { send } = execute({
        config: {
          objType: 'C_DC_TA_1',
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
        payload: 2,
        ioa: [0, 0, 1]
      };

      const { node, send } = execute({
        config: {
          objType: 'C_DC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(
        send.calledOnce,
        true
      );

      assert.strictEqual(
        node.send.called,
        false
      );
    });

    it('falls back to node.send when send is missing', function () {
      const msg = {
        payload: 2,
        ioa: [0, 0, 1]
      };

      const { node, done } = execute({
        config: {
          objType: 'C_DC_NA_1',
          ioaFromMsg: true
        },
        msg,
        provideSend: false
      });

      assert.strictEqual(
        node.send.calledOnce,
        true
      );

      assert.strictEqual(
        done.calledOnce,
        true
      );

      assert.deepStrictEqual(
        node.send.firstCall.args[0].payload,
        {
          type: 'C_DC_NA_1',
          ioa: 1,
          dcs: 2
        }
      );
    });
  });

  describe('status handling', function () {
    it('clears status after successful processing', function () {
      const msg = {
        payload: 2,
        ioa: [0, 0, 1]
      };

      const { node } = execute({
        config: {
          objType: 'C_DC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(
        node.status.calledOnce,
        true
      );

      assert.deepStrictEqual(
        node.status.firstCall.args[0],
        {}
      );
    });

    it('sets error status after invalid payload', function () {
      const msg = {
        payload: 99,
        ioa: [0, 0, 1]
      };

      const { node } = execute({
        config: {
          objType: 'C_DC_NA_1',
          ioaFromMsg: true
        },
        msg
      });

      assert.strictEqual(
        node.status.calledOnce,
        true
      );

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