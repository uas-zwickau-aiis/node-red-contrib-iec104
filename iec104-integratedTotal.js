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
    const qAdjustedMode = String(config.qAdjustedMode || "msg");
    const qCarryMode = String(config.qCarryMode || "msg");

    function needsTimestamp(typeStr) {
      return typeStr === "M_IT_TA_1" || typeStr === "M_IT_TB_1";
    }

    function isByte(value) {
      return Number.isInteger(value) && value >= 0 && value <= 255;
    }

    function resolveQualityBit(mode, incomingValue) {
      if (mode === "true") return true;
      if (mode === "false") return false;
      return !!incomingValue;
    }

    node.on("input", function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };

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
          done(new Error("iec104_integratedtotal: msg.payload muss eine Zahl sein"));
          return;
        }

        if (!isByte(ioa0) || !isByte(ioa1) || !isByte(ioa2)) {
          node.status({ fill: "red", shape: "ring", text: "IOA ungültig" });
          done(new Error("iec104_integratedtotal: IOA-Bytes müssen zwischen 0 und 255 liegen"));
          return;
        }

        const incomingQuality = (msg.quality && typeof msg.quality === "object") ? msg.quality : {};

        const quality = {
          invalid: resolveQualityBit(qInvalidMode, incomingQuality.invalid),
          adjusted: resolveQualityBit(qAdjustedMode, incomingQuality.adjusted),
          carry: resolveQualityBit(qCarryMode, incomingQuality.carry)
        };

        msg.quality = quality;

        const p = {
          type: itType,
          ioa: [ioa0, ioa1, ioa2],
          value: value,
          quality: quality
        };

        if (needsTimestamp(itType)) {
          if (tsSource === "msg" && msg.ts != null) {
            p.ts = msg.ts;
          } else {
            p.ts = new Date().toISOString();
          }
        }

        msg.payload = p;

        node.status({
          fill: "green",
          shape: "dot",
          text: `${itType} ioa=[${ioa0},${ioa1},${ioa2}] value=${value}`
        });

        send(msg);
        done();
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: "error" });
        done(err);
      }
    });
  }

  RED.nodes.registerType("iec104_integratedtotal", Iec104IntegratedTotal);
};