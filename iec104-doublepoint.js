const { TYPES } = require("./lib/asdu/types");
const { TIME } = require("./lib/asdu/time");

module.exports = function (RED) {
  "use strict";

  function Iec104DoublePoint(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const ioa0 = Number(config.ioa0);
    const ioa1 = Number(config.ioa1);
    const ioa2 = Number(config.ioa2);

    const dpType = String(config.dpType || "M_DP_NA_1");
    const tsSource = String(config.tsSource || "now");

    const qInvalidMode = String(config.qInvalidMode || "msg");
    const qSubstitutedMode = String(config.qSubstitutedMode || "msg");
    const qBlockedMode = String(config.qBlockedMode || "msg");
    const qNotTopicalMode = String(config.qNotTopicalMode || "msg");

    function resolveQualityBit(mode, incomingValue) {
      if (mode === "true") return true;
      if (mode === "false") return false;
      return !!incomingValue;
    }

    function normalizeDpi(value) {
      if (typeof value === "string") {
        const s = value.trim();
        if (s === "") return null;
        if (!Number.isFinite(Number(s))) return null;
        value = Number(s);
      }
      
      if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) return null;
      if (value < 0 || value > 3) return null;
      return value;
    }

    node.on("input", function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      const ioa = (ioa0 << 16) | (ioa1 << 8) | ioa2;

      try {
        const dpi = normalizeDpi(msg.payload);

        if (dpi === null) {
          node.status({ fill: "red", shape: "ring", text: "payload muss 0..3 (int) sein" });
          done(new Error("iec104-doublepoint: msg.payload muss Integer 0..3 sein (DPI)"));
          return;
        }

        const incomingQuality = (msg.qds && typeof msg.qds === "object") ? msg.qds : {};

        const quality = {
          iv: resolveQualityBit(qInvalidMode, incomingQuality.iv),
          sb: resolveQualityBit(qSubstitutedMode, incomingQuality.sb),
          bl: resolveQualityBit(qBlockedMode, incomingQuality.bl),
          nt: resolveQualityBit(qNotTopicalMode, incomingQuality.nt)
        };

        const p = {
          type: dpType,
          ioa: ioa,
          value: dpi,
          qds: quality
        };

        const typeMeta = TYPES[dpType];
        if (typeMeta?.time !== TIME.NONE) {
          p.ts = (tsSource === "msg" && msg.ts != null)
            ? msg.ts
            : new Date().toISOString();
        }

        msg.payload = p;
        
        send(msg);
        done();
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: "error" });
        done(err);
      }
    });
  }

  RED.nodes.registerType("iec104-doublepoint", Iec104DoublePoint);
};