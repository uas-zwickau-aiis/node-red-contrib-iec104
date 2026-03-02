module.exports = function (RED) {
  "use strict";

  function Iec104MeasuredValue(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const ioa = Number(config.ioa);
    const meType = String(config.meType || "M_ME_NC_1");
    const tsSource = String(config.tsSource || "now"); // now | msg

    // Hysterese
    const hystMode = String(config.hystMode || "none"); // none | absolute | percent
    const hystValue = Number(config.hystValue || 0);

    // normValue
    const normMode = String(config.normMode || "none"); // none | from-config | from-msg | compute
    const normValueCfg = Number(config.normValue);
    const normMin = Number(config.normMin);
    const normMax = Number(config.normMax);

    const defaultQuality = {
      BL: !!config.qBL,
      SB: !!config.qSB,
      INT: !!config.qINT,
      IV: !!config.qIV,
      OV: !!config.qOV
    };

    function needsTimestamp(typeStr) {
      // alles was M_ME_T?_* ist
      return /^M_ME_T[A-F]_1$/.test(typeStr);
    }

    function isNormalizedType(typeStr) {
      // normalized value Varianten
      return typeStr === "M_ME_NA_1" || typeStr === "M_ME_TA_1";
    }

    function parseNumberMaybe(v) {
      if (typeof v === "number" && Number.isFinite(v)) return v;
      if (typeof v === "string") {
        const s = v.trim().replace(",", "."); // falls Komma
        if (s === "") return null;
        const n = Number(s);
        if (Number.isFinite(n)) return n;
      }
      return null;
    }

    function computeNormValue(value) {
      if (!Number.isFinite(normMin) || !Number.isFinite(normMax)) return null;
      const range = normMax - normMin;
      if (!Number.isFinite(range) || range === 0) return null;
      let nv = (value - normMin) / range;
      // clamp 0..1
      if (nv < 0) nv = 0;
      if (nv > 1) nv = 1;
      return nv;
    }

    function passesHysteresis(value) {
      if (hystMode === "none") return true;

      if (!Number.isFinite(hystValue) || hystValue < 0) return true; // fail-open

      const lastSent = node.context().get("lastSentValue");

      // wenn es noch keinen lastSent gibt: immer senden
      if (lastSent == null || !Number.isFinite(lastSent)) return true;

      const delta = Math.abs(value - lastSent);

      if (hystMode === "absolute") {
        // 0 bedeutet: keine Unterdrückung (immer senden)
        if (hystValue === 0) return true;
        return delta >= hystValue;
      }

      if (hystMode === "percent") {
        // Prozent vom letzten gesendeten Wert
        if (hystValue === 0) return true;

        const base = Math.abs(lastSent);
        // wenn base == 0: Prozentrechnung unsinnig -> sende immer
        if (base === 0) return true;

        const threshold = base * (hystValue / 100);
        return delta >= threshold;
      }

      return true;
    }

    function hystText(value) {
      const lastSent = node.context().get("lastSentValue");
      if (lastSent == null) return "first";
      const delta = Math.abs(value - lastSent);
      if (hystMode === "absolute") return `abs Δ=${delta.toFixed(6)} thr=${hystValue}`;
      if (hystMode === "percent") return `pct Δ=${delta.toFixed(6)} thr=${hystValue}%`;
      return "";
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
          node.status({ fill: "red", shape: "ring", text: "payload muss number sein" });
          done(new Error("iec104_measuredvalue: msg.payload muss eine Zahl sein"));
          return;
        }

        // Hysterese: ggf. unterdrücken
        if (!passesHysteresis(value)) {
          node.status({
            fill: "yellow",
            shape: "ring",
            text: `suppressed (${hystText(value)})`
          });
          done();
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
            BL: !!quality.BL,
            SB: !!quality.SB,
            INT: !!quality.INT,
            IV: !!quality.IV,
            OV: !!quality.OV
          }
        };

        // Timestamp nur bei T*-Typen
        if (needsTimestamp(meType)) {
          if (tsSource === "msg" && msg.ts != null) {
            p.ts = msg.ts; // ISO oder epoch(ms) – später encoding
          } else {
            p.ts = new Date().toISOString();
          }
        }

        // normValue nur bei normalized Typen
        if (isNormalizedType(meType)) {
          let nv = null;

          if (normMode === "from-config") {
            nv = Number.isFinite(normValueCfg) ? normValueCfg : null;
          } else if (normMode === "from-msg") {
            const mv = parseNumberMaybe(msg.normValue);
            nv = mv == null ? null : mv;
          } else if (normMode === "compute") {
            nv = computeNormValue(value);
          }

          if (nv != null && Number.isFinite(nv)) {
            p.normValue = nv;
          }
        }

        // last sent updaten (nach erfolgreichem send)
        node.context().set("lastSentValue", value);

        msg.payload = p;

        node.status({
          fill: "green",
          shape: "dot",
          text: `${meType} ioa=${ioa} value=${value}`
        });

        send(msg);
        done();
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: "error" });
        done(err);
      }
    });

    node.on("close", function (removed, done) {
      // optional: Kontext aufräumen
      done();
    });
  }

  RED.nodes.registerType("iec104_measuredvalue", Iec104MeasuredValue);
};
