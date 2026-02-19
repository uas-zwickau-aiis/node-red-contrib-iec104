module.exports = function (RED) {
  "use strict";

  function Iec104DoublePoint(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Konfig lesen (aus der HTML defaults)
    const ioa = Number(config.ioa);
    const dpType = String(config.dpType || "M_DP_NA_1"); // M_DP_NA_1 | M_DP_TA_1 | M_DP_TB_1
    const tsSource = String(config.tsSource || "now");   // now | msg

    const defaultQuality = {
      invalid: !!config.qInvalid,
      substituted: !!config.qSubstituted,
      blocked: !!config.qBlocked,
      notTopical: !!config.qNotTopical
    };

    function needsTimestamp(typeStr) {
      return typeStr === "M_DP_TA_1" || typeStr === "M_DP_TB_1";
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
          done(new Error("iec104_doublepoint: msg.payload muss Integer 0..3 sein (DPI)"));
          return;
        }

        if (!Number.isFinite(ioa)) {
          node.status({ fill: "red", shape: "ring", text: "IOA ungültig" });
          done(new Error("iec104_doublepoint: IOA (config.ioa) ist ungültig"));
          return;
        }

        // Quality: Defaults + optional msg.quality überschreibt (wenn Objekt)
        const incomingQuality = (msg.quality && typeof msg.quality === "object") ? msg.quality : null;
        const quality = Object.assign({}, defaultQuality, incomingQuality || {});

        const p = {
          type: dpType,
          ioa: ioa,
          value: dpi,
          quality: {
            invalid: !!quality.invalid,
            substituted: !!quality.substituted,
            blocked: !!quality.blocked,
            notTopical: !!quality.notTopical
          }
        };

        // Timestamp nur wenn Typ TA/TB
        if (needsTimestamp(dpType)) {
          if (tsSource === "msg" && msg.ts != null) {
            // msg.ts kann ISO-String oder epoch(ms) sein – später in CP24/CP56 umsetzen
            p.ts = msg.ts;
          } else {
            p.ts = new Date().toISOString();
          }
        }

        msg.payload = p;

        node.status({
          fill: "green",
          shape: "dot",
          text: `${dpType} ioa=${ioa} dpi=${dpi} (${dpiText(dpi)})`
        });

        send(msg);
        done();
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: "error" });
        done(err);
      }
    });
  }

  RED.nodes.registerType("iec104_doublepoint", Iec104DoublePoint);
};
