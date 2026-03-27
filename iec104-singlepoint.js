module.exports = function (RED) {
  "use strict";

  function Iec104SinglePoint(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const ioa0 = Number(config.ioa0);
    const ioa1 = Number(config.ioa1);
    const ioa2 = Number(config.ioa2);

    const spType = String(config.spType || "M_SP_NA_1"); // M_SP_NA_1 | M_SP_TA_1 | M_SP_TB_1
    const tsSource = String(config.tsSource || "now");   // now | msg

    const qInvalidMode = String(config.qInvalidMode || "msg");
    const qSubstitutedMode = String(config.qSubstitutedMode || "msg");
    const qBlockedMode = String(config.qBlockedMode || "msg");
    const qNotTopicalMode = String(config.qNotTopicalMode || "msg");

    function needsTimestamp(typeStr) {
      return typeStr === "M_SP_TA_1" || typeStr === "M_SP_TB_1";
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

        if (!isByte(ioa0) || !isByte(ioa1) || !isByte(ioa2)) {
          node.status({ fill: "red", shape: "ring", text: "IOA ungültig" });
          done(new Error("iec104-singlepoint: IOA-Bytes müssen zwischen 0 und 255 liegen"));
          return;
        }

        const incomingQuality = (msg.quality && typeof msg.quality === "object") ? msg.quality : {};

        const quality = {
          invalid: resolveQualityBit(qInvalidMode, incomingQuality.invalid),
          substituted: resolveQualityBit(qSubstitutedMode, incomingQuality.substituted),
          blocked: resolveQualityBit(qBlockedMode, incomingQuality.blocked),
          notTopical: resolveQualityBit(qNotTopicalMode, incomingQuality.notTopical)
        };

        msg.quality = quality;

        const p = {
          type: spType,
          ioa: [ioa0, ioa1, ioa2],
          value: value,
          quality: quality
        };

        if (needsTimestamp(spType)) {
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
          text: `${spType} ioa=[${ioa0},${ioa1},${ioa2}] value=${value ? "ON" : "OFF"}`
        });

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