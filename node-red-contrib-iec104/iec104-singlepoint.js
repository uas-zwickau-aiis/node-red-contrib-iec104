module.exports = function (RED) {
  "use strict";

  function Iec104SinglePoint(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    // Konfig lesen (aus der HTML defaults)
    const ioa = Number(config.ioa);
    const spType = String(config.spType || "M_SP_NA_1"); // M_SP_NA_1 | M_SP_TA_1 | M_SP_TB_1
    const tsSource = String(config.tsSource || "now");   // now | msg

    const defaultQuality = {
      invalid: !!config.qInvalid,
      substituted: !!config.qSubstituted,
      blocked: !!config.qBlocked,
      notTopical: !!config.qNotTopical
    };

    function needsTimestamp(typeStr) {
      return typeStr === "M_SP_TA_1" || typeStr === "M_SP_TB_1";
    }

    node.on("input", function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };

      try {
        // Payload muss boolean sein (optional: "true"/"false" Strings)
        let value = msg.payload;

        if (typeof value === "string") {
          const s = value.trim().toLowerCase();
          if (s === "true") value = true;
          else if (s === "false") value = false;
        }

        if (typeof value !== "boolean") {
          node.status({ fill: "red", shape: "ring", text: "payload muss boolean sein" });
          done(new Error("iec104_singlepoint: msg.payload muss boolean (true/false) sein"));
          return;
        }

        if (!Number.isFinite(ioa)) {
          node.status({ fill: "red", shape: "ring", text: "IOA ungültig" });
          done(new Error("iec104_singlepoint: IOA (config.ioa) ist ungültig"));
          return;
        }

        // Quality: Defaults + optional msg.quality überschreibt (wenn Objekt)
        const incomingQuality = (msg.quality && typeof msg.quality === "object") ? msg.quality : null;
        const quality = Object.assign({}, defaultQuality, incomingQuality || {});

        const p = {
          type: spType,
          ioa: ioa,
          value: value,
          quality: {
            invalid: !!quality.invalid,
            substituted: !!quality.substituted,
            blocked: !!quality.blocked,
            notTopical: !!quality.notTopical
          }
        };

        // Timestamp nur wenn Typ TA/TB
        if (needsTimestamp(spType)) {
          if (tsSource === "msg" && msg.ts != null) {
            // msg.ts kann ISO-String oder epoch(ms) sein – du definierst später, wie du's encodest
            p.ts = msg.ts;
          } else {
            p.ts = new Date().toISOString();
          }
        }

        msg.payload = p;

        node.status({
          fill: "green",
          shape: "dot",
          text: `${spType} ioa=${ioa} value=${value ? "ON" : "OFF"}`
        });

        send(msg);
        done();
      } catch (err) {
        node.status({ fill: "red", shape: "ring", text: "error" });
        done(err);
      }
    });
  }

  RED.nodes.registerType("iec104_singlepoint", Iec104SinglePoint);
};
