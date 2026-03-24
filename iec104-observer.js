module.exports = function(RED) {

  function IEC104Observer(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const client = RED.nodes.getNode(config.connection);

    if (!client) {
        node.error("No IEC104 connection configured");
        return;
    }

    function onData(msg) {
        node.warn("DATA: " + JSON.stringify(msg));
    }

    function onStatus(msg) {
        node.warn("STATUS: " + JSON.stringify(msg));
    }

    client.on("iec104:data", onData);
    client.on("iec104:status", onStatus);

    node.on("close", function() {
        client.removeListener("iec104:data", onData);
        client.removeListener("iec104:status", onStatus);
    });
  }

  RED.nodes.registerType("iec104-observer", IEC104Observer);
};