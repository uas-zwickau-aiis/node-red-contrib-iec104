module.exports = function (RED) {
  "use strict";

  function Iec104DoublePoint(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const ioa0 = Number(config.ioa0);
    const ioa1 = Number(config.ioa1);
    const ioa2 = Number(config.ioa2);

    const dpType = String(config.dpType || "M_DP_NA_1"); // M_DP_NA_1 | M_DP_TA_1 | M_DP_TB_1
    const tsSource = String(config.tsSource || "now");   // now | msg

    const qInvalidMode = String(config.qInvalidMode || "msg");
    const qSubstitutedMode = String(config.qSubstitutedMode || "msg");
    const qBlockedMode = String(config.qBlockedMode || "msg");
    const qNotTopicalMode = String(config.qNotTopicalMode || "msg");

    function needsTimestamp(typeStr) {
      return typeStr === "M_DP_TA_1" || typeStr === "M_DP_TB_1";
    }

    function isByte(value) {
      return Number.isInteger(value) && value >= 0 && value <= 255;
    }

    function resolveQualityBit(mode, incomingValue) {
      if (mode === "true") return true;
      if (mode === "false") return false;
      return !!incomingValue;
    }

    function normalizeDpi(value) {
      // akzeptiert number oder string "0".."3"
      if (typeof value === "string") {
        const s = value.trim();
        if (s === "") return null;
        if (!Number.isFinite(Number(s))) return null;
        value = Number(s);
      }

      // DPI muss Integer 0..3 sein
      if (typeof value !== "number" || !Number.isFinite(value) || !Number.isInteger(value)) return null;
      if (value < 0 || value > 3) return null;
      return value;
    }

    function dpiText(dpi) {
      switch (dpi) {
        case 0: return "INTERMEDIATE";
        case 1: return "OFF";
        case 2: return "ON";
        case 3: return "INDETERMINATE";
        default: return String(dpi);
      }
    }

    node.on("input", function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };

      try {
        const dpi = normalizeDpi(msg.payload);

        if (dpi === null) {
          node.status({ fill: "red", shape: "ring", text: "payload muss 0..3 (int) sein" });
          done(new Error("iec104-doublepoint: msg.payload muss Integer 0..3 sein (DPI)"));
          return;
        }

        if (!isByte(ioa0) || !isByte(ioa1) || !isByte(ioa2)) {
          node.status({ fill: "red", shape: "ring", text: "IOA ungültig" });
          done(new Error("iec104-doublepoint: IOA-Bytes müssen zwischen 0 und 255 liegen"));
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
          type: dpType,
          ioa: [ioa0, ioa1, ioa2],
          value: dpi,
          quality: quality
        };

        if (needsTimestamp(dpType)) {
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
          text: `${dpType} ioa=[${ioa0},${ioa1},${ioa2}] dpi=${dpi} (${dpiText(dpi)})`
        });

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