const { TYPES } = require("./lib/asdu/types");
const { TIME } = require("./lib/asdu/time");
const {
  parseBoolConfig,
  resolveIoa,
  buildQuality,
  applyTimestamp,
  normalizeDpi
} = require("./lib/admin/node-helpers");

module.exports = function (RED) {
  "use strict";

  function Iec104DoublePoint(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const dpType = String(config.dpType || "M_DP_NA_1");
    const tsSource = String(config.tsSource || "now");

    const qualityModes = {
      iv: parseBoolConfig(config.qInvalidMode),
      sb: parseBoolConfig(config.qSubstitutedMode),
      bl: parseBoolConfig(config.qBlockedMode),
      nt: parseBoolConfig(config.qNotTopicalMode)
    };

    node.on("input", function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };

      const ioa = resolveIoa(config, msg);
      if (ioa === null) {
        node.status({ fill: "red", shape: "ring", text: "msg.ioa muss [b0,b1,b2] sein" });
        done(new Error("iec104-doublepoint: msg.ioa muss ein Big-Endian Byte-Array [b0,b1,b2] mit Werten 0..255 sein"));
        return;
      }

      const dpi = normalizeDpi(msg.payload);
      if (dpi === null) {
        node.status({ fill: "red", shape: "ring", text: "payload muss 0..3 sein" });
        done(new Error("iec104-doublepoint: msg.payload muss Integer 0..3 sein"));
        return;
      }

      const payload = {
        type: dpType,
        ioa,
        value: dpi,
        qds: buildQuality(msg, qualityModes, ["iv", "sb", "bl", "nt"])
      };

      applyTimestamp(payload, TYPES[dpType], TIME, tsSource, msg);

      msg.payload = payload;
      send(msg);
      done();
    });
  }

  RED.nodes.registerType("iec104-doublepoint", Iec104DoublePoint);
};