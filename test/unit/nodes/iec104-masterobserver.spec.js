'use strict';

const assert = require('assert');
const sinon = require('sinon');

const registerNode = require('../../../iec104-masterobserver');

describe('iec104-masterobserver node', function () {
  let NodeConstructor;
  let RED;
  let master;

  beforeEach(function () {
    master = {
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

        getNode: sinon.stub().returns(master),

        registerType(name, ctor) {
          assert.strictEqual(name, 'iec104-masterobserver');
          NodeConstructor = ctor;
        }
      }
    };

    registerNode(RED);
  });

  function createNode(config = {}) {
    const node = new NodeConstructor({
      connection: 'master-1',
      ...config
    });

    return node;
  }

  function getMasterHandler(eventName) {
    const call = master.on
      .getCalls()
      .find(call => call.args[0] === eventName);

    assert.ok(
      call,
      `master handler for ${eventName} not registered`
    );

    return call.args[1];
  }

  function getNodeHandler(node, eventName) {
    const call = node.on
      .getCalls()
      .find(call => call.args[0] === eventName);

    assert.ok(
      call,
      `node handler for ${eventName} not registered`
    );

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
    it('resolves configured master node', function () {
      createNode({
        connection: 'master-123'
      });

      assert.strictEqual(
        RED.nodes.getNode.calledOnceWith('master-123'),
        true
      );
    });

    it('registers data listener on master', function () {
      createNode();

      const call = master.on
        .getCalls()
        .find(call => call.args[0] === 'iec104:data');

      assert.ok(call);
      assert.strictEqual(
        typeof call.args[1],
        'function'
      );
    });

    it('registers asdu listener on master', function () {
      createNode();

      const call = master.on
        .getCalls()
        .find(call => call.args[0] === 'iec104:asdu');

      assert.ok(call);
      assert.strictEqual(
        typeof call.args[1],
        'function'
      );
    });

    it('registers point listener on master', function () {
      createNode();

      const call = master.on
        .getCalls()
        .find(call => call.args[0] === 'iec104:point');

      assert.ok(call);
      assert.strictEqual(
        typeof call.args[1],
        'function'
      );
    });

    it('registers status listener on master', function () {
      createNode();

      const call = master.on
        .getCalls()
        .find(call => call.args[0] === 'iec104:status');

      assert.ok(call);
      assert.strictEqual(
        typeof call.args[1],
        'function'
      );
    });

    it('registers gi-complete listener on master', function () {
      createNode();

      const call = master.on
        .getCalls()
        .find(call => call.args[0] === 'iec104:gi-complete');

      assert.ok(call);
      assert.strictEqual(
        typeof call.args[1],
        'function'
      );
    });

    it('registers close handler', function () {
      const node = createNode();

      const call = node.on
        .getCalls()
        .find(call => call.args[0] === 'close');

      assert.ok(call);
      assert.strictEqual(
        typeof call.args[1],
        'function'
      );
    });

    it('registers all master listeners', function () {
      createNode();

      assert.strictEqual(
        master.on.callCount,
        5
      );

      const events = master.on
        .getCalls()
        .map(call => call.args[0]);

      assert.deepStrictEqual(
        events,
        [
          'iec104:data',
          'iec104:asdu',
          'iec104:point',
          'iec104:status',
          'iec104:gi-complete'
        ]
      );
    });
  });

  describe('data forwarding', function () {
    it('forwards iec104:data message to first output', function () {
      const node = createNode();

      const onData =
        getMasterHandler('iec104:data');

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

      const onData =
        getMasterHandler('iec104:data');

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

    it('forwards iec104:asdu message to first output', function () {
      const node = createNode();

      const onASDU =
        getMasterHandler('iec104:asdu');

      const msg = {
        topic: 'iec104/asdu',
        payload: {
          typeId: 1,
          cot: 3,
          ca: 1
        }
      };

      onASDU(msg);

      assert.strictEqual(
        node.send.calledOnceWith(msg),
        true
      );
    });

    it('forwards original asdu message unchanged', function () {
      const node = createNode();

      const onASDU =
        getMasterHandler('iec104:asdu');

      const msg = {
        topic: 'iec104/asdu',
        payload: {
          typeId: 13,
          objects: []
        }
      };

      onASDU(msg);

      assert.strictEqual(
        node.send.firstCall.args[0],
        msg
      );
    });

    it('forwards iec104:point message to first output', function () {
      const node = createNode();

      const onPoint =
        getMasterHandler('iec104:point');

      const msg = {
        topic: 'iec104/point',
        payload: {
          ca: 1,
          ioa: 100,
          value: 12.5
        }
      };

      onPoint(msg);

      assert.strictEqual(
        node.send.calledOnceWith(msg),
        true
      );
    });

    it('forwards original point message unchanged', function () {
      const node = createNode();

      const onPoint =
        getMasterHandler('iec104:point');

      const msg = {
        topic: 'iec104/point',
        payload: {
          ca: 2,
          ioa: 200,
          value: false,
          qds: {
            iv: false
          }
        }
      };

      onPoint(msg);

      assert.strictEqual(
        node.send.firstCall.args[0],
        msg
      );
    });
  });

  describe('status forwarding', function () {
    it('forwards iec104:status message to second output', function () {
      const node = createNode();

      const onStatus =
        getMasterHandler('iec104:status');

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

      const onStatus =
        getMasterHandler('iec104:status');

      const msg = {
        topic: 'iec104/status',
        payload: {
          state: 'IDLE',
          reason: 'Disconnected'
        }
      };

      onStatus(msg);

      const sent =
        node.send.firstCall.args[0];

      assert.strictEqual(
        sent[0],
        null
      );

      assert.strictEqual(
        sent[1],
        msg
      );
    });

    it('forwards gi-complete message to second output', function () {
      const node = createNode();

      const onGIComplete =
        getMasterHandler('iec104:gi-complete');

      const msg = {
        topic: 'iec104/gi-complete',
        payload: {
          ca: 1,
          points: [
            {
              ca: 1,
              ioa: 10,
              value: true
            }
          ]
        }
      };

      onGIComplete(msg);

      assert.deepStrictEqual(
        node.send.firstCall.args[0],
        [null, msg]
      );
    });

    it('forwards original gi-complete message unchanged', function () {
      const node = createNode();

      const onGIComplete =
        getMasterHandler('iec104:gi-complete');

      const msg = {
        topic: 'iec104/gi-complete',
        payload: {
          ca: 65535,
          points: []
        }
      };

      onGIComplete(msg);

      const sent =
        node.send.firstCall.args[0];

      assert.strictEqual(
        sent[0],
        null
      );

      assert.strictEqual(
        sent[1],
        msg
      );
    });
  });

  describe('output routing', function () {
    it('routes data, asdu and point to first output', function () {
      const node = createNode();

      const dataMsg = {
        topic: 'iec104/data'
      };

      const asduMsg = {
        topic: 'iec104/asdu'
      };

      const pointMsg = {
        topic: 'iec104/point'
      };

      getMasterHandler('iec104:data')(
        dataMsg
      );

      getMasterHandler('iec104:asdu')(
        asduMsg
      );

      getMasterHandler('iec104:point')(
        pointMsg
      );

      assert.strictEqual(
        node.send.callCount,
        3
      );

      assert.strictEqual(
        node.send.getCall(0).args[0],
        dataMsg
      );

      assert.strictEqual(
        node.send.getCall(1).args[0],
        asduMsg
      );

      assert.strictEqual(
        node.send.getCall(2).args[0],
        pointMsg
      );
    });

    it('routes status and gi-complete to second output', function () {
      const node = createNode();

      const statusMsg = {
        topic: 'iec104/status'
      };

      const giMsg = {
        topic: 'iec104/gi-complete'
      };

      getMasterHandler('iec104:status')(
        statusMsg
      );

      getMasterHandler(
        'iec104:gi-complete'
      )(giMsg);

      assert.deepStrictEqual(
        node.send.getCall(0).args[0],
        [null, statusMsg]
      );

      assert.deepStrictEqual(
        node.send.getCall(1).args[0],
        [null, giMsg]
      );
    });
  });

  describe('close handling', function () {
    it('removes data listener on close', function () {
      const node = createNode();

      const onData =
        getMasterHandler('iec104:data');

      const closeHandler =
        getNodeHandler(node, 'close');

      closeHandler();

      assert.strictEqual(
        master.removeListener.calledWith(
          'iec104:data',
          onData
        ),
        true
      );
    });

    it('removes asdu listener on close', function () {
      const node = createNode();

      const onASDU =
        getMasterHandler('iec104:asdu');

      const closeHandler =
        getNodeHandler(node, 'close');

      closeHandler();

      assert.strictEqual(
        master.removeListener.calledWith(
          'iec104:asdu',
          onASDU
        ),
        true
      );
    });

    it('removes point listener on close', function () {
      const node = createNode();

      const onPoint =
        getMasterHandler('iec104:point');

      const closeHandler =
        getNodeHandler(node, 'close');

      closeHandler();

      assert.strictEqual(
        master.removeListener.calledWith(
          'iec104:point',
          onPoint
        ),
        true
      );
    });

    it('removes status listener on close', function () {
      const node = createNode();

      const onStatus =
        getMasterHandler('iec104:status');

      const closeHandler =
        getNodeHandler(node, 'close');

      closeHandler();

      assert.strictEqual(
        master.removeListener.calledWith(
          'iec104:status',
          onStatus
        ),
        true
      );
    });

    it('removes gi-complete listener on close', function () {
      const node = createNode();

      const onGIComplete =
        getMasterHandler('iec104:gi-complete');

      const closeHandler =
        getNodeHandler(node, 'close');

      closeHandler();

      assert.strictEqual(
        master.removeListener.calledWith(
          'iec104:gi-complete',
          onGIComplete
        ),
        true
      );
    });

    it('removes all listeners on close', function () {
      const node = createNode();

      const onData =
        getMasterHandler('iec104:data');

      const onASDU =
        getMasterHandler('iec104:asdu');

      const onPoint =
        getMasterHandler('iec104:point');

      const onStatus =
        getMasterHandler('iec104:status');

      const onGIComplete =
        getMasterHandler('iec104:gi-complete');

      const closeHandler =
        getNodeHandler(node, 'close');

      closeHandler();

      assert.strictEqual(
        master.removeListener.callCount,
        5
      );

      assert.strictEqual(
        master.removeListener.calledWith(
          'iec104:data',
          onData
        ),
        true
      );

      assert.strictEqual(
        master.removeListener.calledWith(
          'iec104:asdu',
          onASDU
        ),
        true
      );

      assert.strictEqual(
        master.removeListener.calledWith(
          'iec104:point',
          onPoint
        ),
        true
      );

      assert.strictEqual(
        master.removeListener.calledWith(
          'iec104:status',
          onStatus
        ),
        true
      );

      assert.strictEqual(
        master.removeListener.calledWith(
          'iec104:gi-complete',
          onGIComplete
        ),
        true
      );
    });
  });

  describe('missing master', function () {
    it('warns when no master is configured', function () {
      RED.nodes.getNode.returns(null);

      const node = createNode();

      assert.strictEqual(
        node.warn.calledOnceWith(
          'Kein Master konfiguriert'
        ),
        true
      );
    });

    it('does not register master listeners when master is missing', function () {
      RED.nodes.getNode.returns(null);

      createNode();

      assert.strictEqual(
        master.on.called,
        false
      );
    });

    it('does not register close handler when master is missing', function () {
      RED.nodes.getNode.returns(null);

      const node = createNode();

      assert.strictEqual(
        node.on.called,
        false
      );
    });
  });
});