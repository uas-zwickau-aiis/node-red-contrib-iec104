const { TYPES } = require("./lib/asdu/types");
const { TIME } = require("./lib/asdu/time");

module.exports = function (RED) {
  "use strict";

  function Iec104IntegratedTotal(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const ioa0 = Number(config.ioa0);
    const ioa1 = Number(config.ioa1);
    const ioa2 = Number(config.ioa2);

    const itType = String(config.itType || "M_IT_NA_1");
    const tsSource = String(config.tsSource || "now");

    const qInvalidMode = String(config.qInvalidMode || "msg");

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

        if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed !== "") {
            value = Number(trimmed);
          }
        }

        if (!Number.isFinite(value)) {
          node.status({ fill: "red", shape: "ring", text: "payload muss Zahl sein" });
          done(new Error("iec104-integratedtotal: msg.payload muss eine Zahl sein"));
          return;
        }
        const incomingQuality = (msg.qds && typeof msg.qds === "object") ? msg.qds : {};

        const quality = {
          iv: resolveQualityBit(qInvalidMode, incomingQuality.iv)
        };

        const p = {
          type: itType,
          ioa: ioa,
          value: Math.floor(value),
          qds: quality
        };

        const typeMeta = TYPES[itType];
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

  RED.nodes.registerType("iec104-integratedtotal", Iec104IntegratedTotal);
};