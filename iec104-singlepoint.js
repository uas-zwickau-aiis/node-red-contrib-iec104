const { TYPES } = require("./lib/asdu/types");
const { TIME } = require("./lib/asdu/time");
const {
  parseBoolConfig,
  resolveIoa,
  buildQuality,
  applyTimestamp
} = require("./lib/admin/node-helpers");

module.exports = function (RED) {
  "use strict";

  function Iec104SinglePoint(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const spType = String(config.spType || "M_SP_NA_1");
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
        done(new Error("iec104-singlepoint: msg.ioa muss ein Big-Endian Byte-Array [b0,b1,b2] mit Werten 0..255 sein"));
        return;
      }

      let value = msg.payload;

      if (typeof value === "string") {
        const s = value.trim().toLowerCase();
        if (s === "true") value = true;
        else if (s === "false") value = false;
      }

      if (typeof value !== "boolean") {
        node.status({ fill: "red", shape: "ring", text: "payload muss boolean sein" });
        done(new Error("iec104-singlepoint: msg.payload muss boolean (true/false) sein"));
        return;
      }

      const payload = {
        type: spType,
        ioa,
        value,
        qds: buildQuality(msg, qualityModes, ["iv", "sb", "bl", "nt"])
      };

      applyTimestamp(payload, TYPES[spType], TIME, tsSource, msg);

      msg.payload = payload;
      send(msg);
      done();
    });
  }

  RED.nodes.registerType("iec104-singlepoint", Iec104SinglePoint);
};