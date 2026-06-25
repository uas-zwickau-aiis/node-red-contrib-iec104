( function () {
  "use strict";

  window.iec104Editor = window.iec104Editor || {};

  function byteValidator(v) {
    return RED.validators.number()(v) &&
      Number(v) >= 0 &&
      Number(v) <= 255;
  }

  function parseByte(selector) {
    const value = parseInt($(selector).val(), 10);
    return Number.isNaN(value) ? 0 : value;
  }

  function updateIoaPreview() {
    const b0 = parseByte("#node-input-ioa0");
    const b1 = parseByte("#node-input-ioa1");
    const b2 = parseByte("#node-input-ioa2");

    const ioa = (b0 << 16) | (b1 << 8) | b2;
    const hex = `0x${ioa.toString(16).toUpperCase().padStart(6, "0")}`;

    $("#node-ioa-preview").text(`IOA: ${ioa} | Hex: ${hex}`);
  }

  function toggleIoaInputs() {
    const fromMsg = $("#node-input-ioaFromMsg").prop("checked");

    $("#node-input-ioa0, #node-input-ioa1, #node-input-ioa2")
      .prop("disabled", fromMsg);

    if (fromMsg) {
      $("#node-ioa-preview").text("IOA wird aus msg.ioa übernommen");
    } else {
      updateIoaPreview();
    }
  }

  function initIoaEditor() {
    $("#node-input-ioa0, #node-input-ioa1, #node-input-ioa2")
      .off(".iec104Ioa")
      .on("input.iec104Ioa change.iec104Ioa", updateIoaPreview);

    $("#node-input-ioaFromMsg")
      .off(".iec104Ioa")
      .on("change.iec104Ioa", toggleIoaInputs);

    toggleIoaInputs();
  }

  function labelWithIoa(node, fallbackLabel) {
    return node.name || (
      fallbackLabel +
      (
        node.ioaFromMsg
          ? " [msg.ioa]"
          : ` [${node.ioa0}, ${node.ioa1}, ${node.ioa2}]`
      )
    );
  }

  function initTimestampEditor(disabledType) {
    function updateState() {
      let objType = $("#node-input-objType").val();

      if (!objType) {
        objType = disabledType;
        $("#node-input-objType").val(objType);
      }

      const disable = objType === disabledType;

      $("#node-input-tsSource").prop("disabled", disable);

      if (disable) {
        $("#node-input-tsSource").val("now");
      }
    }

  $("#node-input-objType")
    .off(".iec104Timestamp")
    .on("change.iec104Timestamp", updateState);

  updateState();
  }

  window.iec104Editor.byteValidator = byteValidator;
  window.iec104Editor.initIoaEditor = initIoaEditor;
  window.iec104Editor.labelWithIoa = labelWithIoa;
  window.iec104Editor.initTimestampEditor = initTimestampEditor;
})();