const { TYPES } = require("./lib/asdu/types");
const { TIME } = require("./lib/asdu/time");

module.exports = function (RED) {
  "use strict";

  function Iec104SinglePoint(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const ioa0 = Number(config.ioa0);
    const ioa1 = Number(config.ioa1);
    const ioa2 = Number(config.ioa2);

    const spType = String(config.spType || "M_SP_NA_1");
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

    node.on("input", function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };
      const ioa = (ioa0 << 16) | (ioa1 << 8) | ioa2;


      try {
        let value = msg.payload;

        // Optional String "true"/"false" akzeptieren
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

        const incomingQuality = (msg.qds && typeof msg.qds === "object") ? msg.qds : {};

        const quality = {
          invalid: resolveQualityBit(qInvalidMode, incomingQuality.invalid),
          substituted: resolveQualityBit(qSubstitutedMode, incomingQuality.substituted),
          blocked: resolveQualityBit(qBlockedMode, incomingQuality.blocked),
          notTopical: resolveQualityBit(qNotTopicalMode, incomingQuality.notTopical)
        };

        const p = {
          type: spType,
          ioa: ioa,
          value: value,
          qds: quality
        };

        const typeMeta = TYPES[spType];
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

  RED.nodes.registerType("iec104-singlepoint", Iec104SinglePoint);
};