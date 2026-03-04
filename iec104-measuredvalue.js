// iec104_measuredvalue.js
module.exports = function (RED) {
  "use strict";

  function Iec104MeasuredValue(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const ioa = Number(config.ioa);
    const meType = String(config.meType || "M_ME_NC_1");
    const tsSource = String(config.tsSource || "now"); // now | msg

    // Quality Defaults (IEC 60870-5-104 / QDS bits)
    // BL  = Blocked
    // SB  = Substituted
    // INT = Not topical (old value / not up-to-date)
    // IV  = Invalid
    // OV  = Overflow
    const defaultQuality = {
      BL: !!config.qBL,
      SB: !!config.qSB,
      INT: !!config.qINT,
      IV: !!config.qIV,
      OV: !!config.qOV
    };

    function needsTimestamp(typeStr) {
      // Zeitvarianten für measured values (CP56Time2a): M_ME_TD_1 / M_ME_TE_1 / M_ME_TF_1
      return /^M_ME_T[D-F]_1$/.test(typeStr || "");
    }

    function parseNumberMaybe(v) {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") {
        const s = v.trim().replace(",", "."); // Komma erlauben
        if (s === "") return null;
        const n = Number(s);
        if (Number.isFinite(n)) return n;
      }
      return null;
    }

    node.on("input", function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };

      try {
        if (!Number.isFinite(ioa)) {
          node.status({ fill: "red", shape: "ring", text: "IOA ungültig" });
          done(new Error("iec104_measuredvalue: IOA (config.ioa) ist ungültig"));
          return;
        }

        // Payload -> Number
        const value = parseNumberMaybe(msg.payload);
        if (value == null) {
          node.status({ fill: "red", shape: "ring", text: "payload muss Zahl sein" });
          done(new Error("iec104_measuredvalue: msg.payload muss eine Zahl sein"));
          return;
        }

        // Quality: Defaults + optional msg.quality überschreibt (wenn Objekt)
        const incomingQuality = (msg.quality && typeof msg.quality === "object") ? msg.quality : null;
        const quality = Object.assign({}, defaultQuality, incomingQuality || {});

        const p = {
          type: meType,
          ioa: ioa,
          value: value,
          quality: {
            blocked: !!quality.BL,     // Blocked
            substituted: !!quality.SB,     // Substituted
            notTopical: !!quality.INT,   // Not topical
            invalid: !!quality.IV,     // Invalid
            overflow: !!quality.OV      // Overflow
          }
        };

        // Timestamp nur bei CP56-Varianten (TD/TE/TF)
        if (needsTimestamp(meType)) {
          if (tsSource === "msg" && msg.ts != null) {
            p.ts = msg.ts; // ISO oder epoch(ms)
          } else {
            p.ts = new Date().toISOString();
          }
        }

        msg.payload = p;

        node.status({
          fill: "green",
          shape: "dot",
          text: `${meType} ioa=${ioa} value=${value}`
        });

        send(msg);
        done();
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: "Fehler" });
        done(err);
      }
    });

    node.on("close", function (removed, done) {
      done();
    });
  }

  RED.nodes.registerType("iec104_measuredvalue", Iec104MeasuredValue);
};