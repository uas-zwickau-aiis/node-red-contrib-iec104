const { TYPES } = require("./lib/asdu/types");
const { TIME } = require("./lib/asdu/time");

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
      const ioa = (ioa0 << 16) | (ioa1 << 8) | ioa2;

      try {
        const value = parseNumberMaybe(msg.payload);
        if (value == null) {
          node.status({ fill: "red", shape: "ring", text: "payload muss Zahl sein" });
          done(new Error("iec104-measuredvalue: msg.payload muss eine Zahl sein"));
          return;
        }

        const incomingQuality = (msg.qds && typeof msg.qds === "object") ? msg.qds : {};

        const quality = {
          iv: resolveQualityBit(qInvalidMode, incomingQuality.iv),
          sb: resolveQualityBit(qSubstitutedMode, incomingQuality.sb),
          bl: resolveQualityBit(qBlockedMode, incomingQuality.bl),
          nt: resolveQualityBit(qNotTopicalMode, incomingQuality.nt),
          ov: resolveQualityBit(qOverflowMode, incomingQuality.ov)
        };

        const p = {
          type: meType,
          ioa: ioa,
          value: value,
          qds: quality
        };

        const typeMeta = TYPES[meType];
        if (typeMeta?.time !== TIME.NONE) {
          p.ts = (tsSource === "msg" && msg.ts != null)
            ? msg.ts
            : new Date().toISOString();
        }

        msg.payload = p;

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

  RED.nodes.registerType("iec104-measuredvalue", Iec104MeasuredValue);
};