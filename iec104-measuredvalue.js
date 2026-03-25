module.exports = function (RED) {
  "use strict";

  function Iec104MeasuredValue(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const ioa0 = Number(config.ioa0);
    const ioa1 = Number(config.ioa1);
    const ioa2 = Number(config.ioa2);

    const meType = String(config.meType || "M_ME_NC_1");
    const tsSource = String(config.tsSource || "now");

    const qBlockedMode = String(config.qBlockedMode || "msg");
    const qSubstitutedMode = String(config.qSubstitutedMode || "msg");
    const qNotTopicalMode = String(config.qNotTopicalMode || "msg");
    const qInvalidMode = String(config.qInvalidMode || "msg");
    const qOverflowMode = String(config.qOverflowMode || "msg");

    function needsTimestamp(typeStr) {
      return /^M_ME_T[D-F]_1$/.test(typeStr || "");
    }

    function isByte(value) {
      return Number.isInteger(value) && value >= 0 && value <= 255;
    }

    function resolveQualityBit(mode, incomingValue) {
      if (mode === "true") return true;
      if (mode === "false") return false;
      return !!incomingValue;
    }

    function parseNumberMaybe(v) {
      if (typeof v === "number" && Number.isFinite(v)) return v;

      if (typeof v === "string") {
        const s = v.trim().replace(",", ".");
        if (s === "") return null;
        const n = Number(s);
        if (Number.isFinite(n)) return n;
      }

      return null;
    }

    node.on("input", function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };

      try {
        if (!isByte(ioa0) || !isByte(ioa1) || !isByte(ioa2)) {
          node.status({ fill: "red", shape: "ring", text: "IOA ungültig" });
          done(new Error("iec104_measuredvalue: IOA-Bytes müssen zwischen 0 und 255 liegen"));
          return;
        }

        const value = parseNumberMaybe(msg.payload);
        if (value == null) {
          node.status({ fill: "red", shape: "ring", text: "payload muss Zahl sein" });
          done(new Error("iec104_measuredvalue: msg.payload muss eine Zahl sein"));
          return;
        }

        const incomingQuality = (msg.quality && typeof msg.quality === "object") ? msg.quality : {};

        const quality = {
          blocked: resolveQualityBit(qBlockedMode, incomingQuality.blocked),
          substituted: resolveQualityBit(qSubstitutedMode, incomingQuality.substituted),
          notTopical: resolveQualityBit(qNotTopicalMode, incomingQuality.notTopical),
          invalid: resolveQualityBit(qInvalidMode, incomingQuality.invalid),
          overflow: resolveQualityBit(qOverflowMode, incomingQuality.overflow)
        };

        msg.quality = quality;

        const p = {
          type: meType,
          ioa: [ioa0, ioa1, ioa2],
          value: value,
          quality: quality
        };

        if (needsTimestamp(meType)) {
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
          text: `${meType} ioa=[${ioa0},${ioa1},${ioa2}] value=${value}`
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