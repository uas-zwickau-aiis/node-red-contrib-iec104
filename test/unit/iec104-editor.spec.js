'use strict';

const assert = require('assert');
const sinon = require('sinon');

describe('iec104Editor', function () {
  let elements;
  let RED;

  function createElement(initial = {}) {
    return {
      value: initial.value ?? '',
      checked: initial.checked ?? false,
      disabled: initial.disabled ?? false,
      textValue: initial.text ?? '',

      handlers: {},

      val(value) {
        if (arguments.length === 0) {
          return this.value;
        }

        this.value = value;
        return this;
      },

      prop(name, value) {
        if (arguments.length === 1) {
          return this[name];
        }

        this[name] = value;
        return this;
      },

      text(value) {
        if (arguments.length === 0) {
          return this.textValue;
        }

        this.textValue = value;
        return this;
      },

      off() {
        return this;
      },

      on(events, handler) {
        for (const event of events.split(' ')) {
          this.handlers[event] = handler;
        }

        return this;
      },

      trigger(event) {
        const handler =
          this.handlers[event] ||
          this.handlers[`${event}.iec104Ioa`] ||
          this.handlers[`${event}.iec104Timestamp`];

        if (handler) {
          handler();
        }

        return this;
      }
    };
  }

  function jquery(selector) {
    if (selector.includes(',')) {
      const selectors = selector
        .split(',')
        .map(s => s.trim());

      return {
        prop(name, value) {
          selectors.forEach(s => {
            elements[s].prop(name, value);
          });

          return this;
        },

        off() {
          return this;
        },

        on(events, handler) {
          selectors.forEach(s => {
            elements[s].on(events, handler);
          });

          return this;
        }
      };
    }

    assert.ok(
      elements[selector],
      `unknown selector ${selector}`
    );

    return elements[selector];
  }

  function loadEditor() {
    delete require.cache[
      require.resolve('../../resources/iec104-editor')
    ];

    global.window = {};

    global.RED = RED;
    global.$ = jquery;

    require('../../resources/iec104-editor');

    return global.window.iec104Editor;
  }

  beforeEach(function () {
    elements = {
      '#node-input-ioa0': createElement(),
      '#node-input-ioa1': createElement(),
      '#node-input-ioa2': createElement(),

      '#node-input-ioaFromMsg': createElement({
        checked: false
      }),

      '#node-ioa-preview': createElement(),

      '#node-input-objType': createElement(),
      '#node-input-tsSource': createElement({
        value: 'msg'
      })
    };

    RED = {
      validators: {
        number: sinon.stub().returns(value => {
          if (
            value === null ||
            value === undefined ||
            value === ''
          ) {
            return false;
          }

          return Number.isFinite(
            Number(value)
          );
        })
      }
    };
  });

  afterEach(function () {
    delete global.window;
    delete global.RED;
    delete global.$;
  });

  describe('byteValidator', function () {
    it('accepts zero', function () {
      const editor = loadEditor();

      assert.strictEqual(
        editor.byteValidator(0),
        true
      );
    });

    it('accepts 255', function () {
      const editor = loadEditor();

      assert.strictEqual(
        editor.byteValidator(255),
        true
      );
    });

    it('accepts numeric string in range', function () {
      const editor = loadEditor();

      assert.strictEqual(
        editor.byteValidator('42'),
        true
      );
    });

    it('rejects values below zero', function () {
      const editor = loadEditor();

      assert.strictEqual(
        editor.byteValidator(-1),
        false
      );
    });

    it('rejects values above 255', function () {
      const editor = loadEditor();

      assert.strictEqual(
        editor.byteValidator(256),
        false
      );
    });

    it('rejects non-numeric values', function () {
      const editor = loadEditor();

      assert.strictEqual(
        editor.byteValidator('invalid'),
        false
      );
    });
  });

  describe('initIoaEditor', function () {
    it('shows IOA preview from configured bytes', function () {
      const editor = loadEditor();

      elements['#node-input-ioa0'].value = '1';
      elements['#node-input-ioa1'].value = '2';
      elements['#node-input-ioa2'].value = '3';

      editor.initIoaEditor();

      assert.strictEqual(
        elements['#node-ioa-preview'].textValue,
        'IOA: 66051 | Hex: 0x010203'
      );
    });

    it('uses zero for invalid byte input in preview', function () {
      const editor = loadEditor();

      elements['#node-input-ioa0'].value = 'invalid';
      elements['#node-input-ioa1'].value = '2';
      elements['#node-input-ioa2'].value = '3';

      editor.initIoaEditor();

      assert.strictEqual(
        elements['#node-ioa-preview'].textValue,
        'IOA: 515 | Hex: 0x000203'
      );
    });

    it('pads hexadecimal IOA to six digits', function () {
      const editor = loadEditor();

      elements['#node-input-ioa0'].value = '0';
      elements['#node-input-ioa1'].value = '0';
      elements['#node-input-ioa2'].value = '1';

      editor.initIoaEditor();

      assert.strictEqual(
        elements['#node-ioa-preview'].textValue,
        'IOA: 1 | Hex: 0x000001'
      );
    });

    it('disables IOA inputs when IOA is taken from msg', function () {
      const editor = loadEditor();

      elements['#node-input-ioaFromMsg'].checked = true;

      editor.initIoaEditor();

      assert.strictEqual(
        elements['#node-input-ioa0'].disabled,
        true
      );

      assert.strictEqual(
        elements['#node-input-ioa1'].disabled,
        true
      );

      assert.strictEqual(
        elements['#node-input-ioa2'].disabled,
        true
      );

      assert.strictEqual(
        elements['#node-ioa-preview'].textValue,
        'IOA wird aus msg.ioa übernommen'
      );
    });

    it('enables IOA inputs when IOA is configured locally', function () {
      const editor = loadEditor();

      elements['#node-input-ioaFromMsg'].checked = false;

      elements['#node-input-ioa0'].value = '1';
      elements['#node-input-ioa1'].value = '2';
      elements['#node-input-ioa2'].value = '3';

      editor.initIoaEditor();

      assert.strictEqual(
        elements['#node-input-ioa0'].disabled,
        false
      );

      assert.strictEqual(
        elements['#node-input-ioa1'].disabled,
        false
      );

      assert.strictEqual(
        elements['#node-input-ioa2'].disabled,
        false
      );

      assert.strictEqual(
        elements['#node-ioa-preview'].textValue,
        'IOA: 66051 | Hex: 0x010203'
      );
    });

    it('updates preview when IOA byte changes', function () {
      const editor = loadEditor();

      elements['#node-input-ioa0'].value = '0';
      elements['#node-input-ioa1'].value = '0';
      elements['#node-input-ioa2'].value = '1';

      editor.initIoaEditor();

      elements['#node-input-ioa2'].value = '2';

      elements['#node-input-ioa2']
        .trigger('input');

      assert.strictEqual(
        elements['#node-ioa-preview'].textValue,
        'IOA: 2 | Hex: 0x000002'
      );
    });

    it('updates preview when IOA byte change event fires', function () {
      const editor = loadEditor();

      elements['#node-input-ioa0'].value = '0';
      elements['#node-input-ioa1'].value = '1';
      elements['#node-input-ioa2'].value = '0';

      editor.initIoaEditor();

      elements['#node-input-ioa1'].value = '2';

      elements['#node-input-ioa1']
        .trigger('change');

      assert.strictEqual(
        elements['#node-ioa-preview'].textValue,
        'IOA: 512 | Hex: 0x000200'
      );
    });

    it('switches to msg IOA when checkbox changes', function () {
      const editor = loadEditor();

      editor.initIoaEditor();

      elements['#node-input-ioaFromMsg'].checked = true;

      elements['#node-input-ioaFromMsg']
        .trigger('change');

      assert.strictEqual(
        elements['#node-input-ioa0'].disabled,
        true
      );

      assert.strictEqual(
        elements['#node-ioa-preview'].textValue,
        'IOA wird aus msg.ioa übernommen'
      );
    });

    it('switches back to configured IOA when checkbox is cleared', function () {
      const editor = loadEditor();

      elements['#node-input-ioaFromMsg'].checked = true;

      editor.initIoaEditor();

      elements['#node-input-ioa0'].value = '1';
      elements['#node-input-ioa1'].value = '2';
      elements['#node-input-ioa2'].value = '3';

      elements['#node-input-ioaFromMsg'].checked = false;

      elements['#node-input-ioaFromMsg']
        .trigger('change');

      assert.strictEqual(
        elements['#node-input-ioa0'].disabled,
        false
      );

      assert.strictEqual(
        elements['#node-ioa-preview'].textValue,
        'IOA: 66051 | Hex: 0x010203'
      );
    });
  });

  describe('labelWithIoa', function () {
    it('returns node name when present', function () {
      const editor = loadEditor();

      const result =
        editor.labelWithIoa(
          {
            name: 'My Node',
            ioaFromMsg: false,
            ioa0: 1,
            ioa1: 2,
            ioa2: 3
          },
          'Double Point'
        );

      assert.strictEqual(
        result,
        'My Node'
      );
    });

    it('returns msg.ioa label when IOA comes from msg', function () {
      const editor = loadEditor();

      const result =
        editor.labelWithIoa(
          {
            name: '',
            ioaFromMsg: true
          },
          'Double Point'
        );

      assert.strictEqual(
        result,
        'Double Point [msg.ioa]'
      );
    });

    it('returns configured IOA bytes in label', function () {
      const editor = loadEditor();

      const result =
        editor.labelWithIoa(
          {
            name: '',
            ioaFromMsg: false,
            ioa0: 1,
            ioa1: 2,
            ioa2: 3
          },
          'Double Point'
        );

      assert.strictEqual(
        result,
        'Double Point [1, 2, 3]'
      );
    });
  });

  describe('initTimestampEditor', function () {
    it('uses disabled type when object type is empty', function () {
      const editor = loadEditor();

      elements['#node-input-objType'].value = '';

      editor.initTimestampEditor(
        'M_SP_NA_1'
      );

      assert.strictEqual(
        elements['#node-input-objType'].value,
        'M_SP_NA_1'
      );
    });

    it('disables timestamp source for disabled type', function () {
      const editor = loadEditor();

      elements['#node-input-objType'].value =
        'M_SP_NA_1';

      elements['#node-input-tsSource'].value =
        'msg';

      editor.initTimestampEditor(
        'M_SP_NA_1'
      );

      assert.strictEqual(
        elements['#node-input-tsSource'].disabled,
        true
      );
    });

    it('forces timestamp source to now for disabled type', function () {
      const editor = loadEditor();

      elements['#node-input-objType'].value =
        'M_SP_NA_1';

      elements['#node-input-tsSource'].value =
        'msg';

      editor.initTimestampEditor(
        'M_SP_NA_1'
      );

      assert.strictEqual(
        elements['#node-input-tsSource'].value,
        'now'
      );
    });

    it('enables timestamp source for timed type', function () {
      const editor = loadEditor();

      elements['#node-input-objType'].value =
        'M_SP_TB_1';

      editor.initTimestampEditor(
        'M_SP_NA_1'
      );

      assert.strictEqual(
        elements['#node-input-tsSource'].disabled,
        false
      );
    });

    it('does not overwrite timestamp source for timed type', function () {
      const editor = loadEditor();

      elements['#node-input-objType'].value =
        'M_SP_TB_1';

      elements['#node-input-tsSource'].value =
        'msg';

      editor.initTimestampEditor(
        'M_SP_NA_1'
      );

      assert.strictEqual(
        elements['#node-input-tsSource'].value,
        'msg'
      );
    });

    it('updates timestamp state when object type changes to disabled type', function () {
      const editor = loadEditor();

      elements['#node-input-objType'].value =
        'M_SP_TB_1';

      elements['#node-input-tsSource'].value =
        'msg';

      editor.initTimestampEditor(
        'M_SP_NA_1'
      );

      elements['#node-input-objType'].value =
        'M_SP_NA_1';

      elements['#node-input-objType']
        .trigger('change');

      assert.strictEqual(
        elements['#node-input-tsSource'].disabled,
        true
      );

      assert.strictEqual(
        elements['#node-input-tsSource'].value,
        'now'
      );
    });

    it('updates timestamp state when object type changes to timed type', function () {
      const editor = loadEditor();

      elements['#node-input-objType'].value =
        'M_SP_NA_1';

      editor.initTimestampEditor(
        'M_SP_NA_1'
      );

      assert.strictEqual(
        elements['#node-input-tsSource'].disabled,
        true
      );

      elements['#node-input-objType'].value =
        'M_SP_TB_1';

      elements['#node-input-objType']
        .trigger('change');

      assert.strictEqual(
        elements['#node-input-tsSource'].disabled,
        false
      );
    });
  });
});