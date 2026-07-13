const { TYPES } = require("./lib/asdu/types");
const { TIME } = require("./lib/asdu/time");
const {
  resolveIoa,
  applyTimestamp
} = require("./lib/admin/node-helpers");

module.exports = function (RED) {
  "use strict";

  function Iec104SingleCommand(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const objType = String(config.objType || "C_SC_NA_1");
    const tsSource = String(config.tsSource || "now");

    node.on("input", function (msg, send, done) {
      send = send || function () { node.send.apply(node, arguments); };

      const ioa = resolveIoa(config, msg);

      let value = msg.payload;

      if (typeof value !== "boolean") {
        node.status({ fill: "red", shape: "ring", text: RED._("iec104.error.value") });
        done();
        return;
      }

      const payload = {
        type: objType,
        ioa,
        value
      };

      applyTimestamp(payload, TYPES[objType], TIME, tsSource, msg);

      msg.payload = payload;
      send(msg);
      node.status({});
      done();

    });
  }

  RED.nodes.registerType("iec104-singlecommand", Iec104SingleCommand);
};