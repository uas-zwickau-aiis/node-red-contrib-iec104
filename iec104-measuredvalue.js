const { TYPES } = require("./lib/asdu/types");
const { TIME } = require("./lib/asdu/time");
const {
  parseBoolConfig,
  resolveIoa,
  buildQuality,
  applyTimestamp,
  parseNumberMaybe
} = require("./lib/admin/node-helpers");

module.exports = function (RED) {
  "use strict";

  function Iec104MeasuredValue(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const objType = String(config.objType || "M_ME_NC_1");
    const tsSource = String(config.tsSource || "now");

    const qualityModes = {
      iv: parseBoolConfig(config.qInvalidMode),
      sb: parseBoolConfig(config.qSubstitutedMode),
      bl: parseBoolConfig(config.qBlockedMode),
      nt: parseBoolConfig(config.qNotTopicalMode),
      ov: parseBoolConfig(config.qOverflowMode)
    };

    node.on("input", function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };

      const ioa = resolveIoa(config, msg);
      if (ioa === null) {
        node.status({ fill: "red", shape: "ring", text: RED._("iec104.error.ioa") });
        done();
        return;
      }

      const value = parseNumberMaybe(msg.payload);
      if (value === null) {
        node.status({ fill: "red", shape: "ring", text: RED._("iec104.error.value") });
        done();
        return;
      }

      const payload = {
        type: objType,
        ioa,
        value,
        qds: buildQuality(msg, qualityModes, ["iv", "sb", "bl", "nt", "ov"])
      };

      applyTimestamp(payload, TYPES[objType], TIME, tsSource, msg);

      msg.payload = payload;
      send(msg);
      node.status({});
      done();
    });
  }

  RED.nodes.registerType("iec104-measuredvalue", Iec104MeasuredValue);
};