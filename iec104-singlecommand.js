module.exports = function (RED) {
  "use strict";

  function Iec104SingleCommand(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    node.on("input", function (msg, send, done) {
   
    });
  }

  RED.nodes.registerType("iec104-singlecommand", Iec104SingleCommand);
};