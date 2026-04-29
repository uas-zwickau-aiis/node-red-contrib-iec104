(function() {

  function readByte(id) {
    const value = parseInt($(id).val(), 10);
    return Number.isNaN(value) ? 0 : value;
  }

  function updateIoaPreview() {
    const b0 = readByte("#node-input-ioa0");
    const b1 = readByte("#node-input-ioa1");
    const b2 = readByte("#node-input-ioa2");

    const ioa = (b0 << 16) + (b1 << 8) + b2;
    const hex = "0x" + ioa.toString(16).toUpperCase().padStart(6, "0");

    $("#node-ioa-preview").text(`Dezimal (Hex): ${ioa} (${hex})`);
  }

  function initIoaPreview() {
    $("#node-input-ioa0, #node-input-ioa1, #node-input-ioa2")
      .on("input change", updateIoaPreview);

    updateIoaPreview();
  }

  // global export
  window.iec104 = window.iec104 || {};
  window.iec104.initIoaPreview = initIoaPreview;

})();