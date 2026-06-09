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

  function Iec104IntegratedTotal(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const itType = String(config.itType || "M_IT_NA_1");
    const tsSource = String(config.tsSource || "now");

    const qualityModes = {
      iv: parseBoolConfig(config.qInvalidMode)
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
        type: itType,
        ioa,
        value: Math.floor(value),
        qds: buildQuality(msg, qualityModes, ["iv"])
      };

      applyTimestamp(payload, TYPES[itType], TIME, tsSource, msg);

      msg.payload = payload;
      send(msg);
      node.status({});
      done();
    });
  }

  RED.nodes.registerType("iec104-integratedtotal", Iec104IntegratedTotal);
};