module.exports = function(RED) {

    function IEC104Station(config) {
        RED.nodes.createNode(this, config);
        this.ca = config.ca

        const node = this;

        const client = RED.nodes.getNode(config.connection);

        node.on("input", function (msg) {
            
            msg.payload.ca = node.ca
            client.emit("iec104:input", msg)
        });
    }
  RED.nodes.registerType("iec104-station", IEC104Station);
};