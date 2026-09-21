const { TYPES } = require("./lib/asdu/types");
const { TIME } = require("./lib/asdu/time");
const {
  resolveIoa,
  applyTimestamp,
  normalizeDpi
} = require("./lib/admin/node-helpers");

module.exports = function (RED) {
  "use strict";

  function Iec104DoubleCommand(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const objType = String(config.objType || "C_DC_NA_1");
    const tsSource = String(config.tsSource || "now");

    node.on("input", function (msg, send, done) {
        send = send || function () { node.send.apply(node, arguments); };

        const ioa = resolveIoa(config, msg);
        const dcs = normalizeDpi(msg.payload);
        if (dcs === null) {
            node.status({ fill: "red", shape: "ring", text: RED._("iec104.error.value") });
            done();
            return;
        }

        const payload = {
            type: objType,
            ioa,
            dcs
        };

        applyTimestamp(payload, TYPES[objType], TIME, tsSource, msg);

        msg.payload = payload;
        send(msg);
        node.status({});
        done();
    });
  }

  RED.nodes.registerType("iec104-doublecommand", Iec104DoubleCommand);
};