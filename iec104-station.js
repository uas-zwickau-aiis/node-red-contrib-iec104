module.exports = function(RED) {

    function IEC104Station(config) {
        RED.nodes.createNode(this, config);
        const node = this;

        const client = RED.nodes.getNode(config.connection);

        node.on("input", function (msg) {
            
            console.log(msg)

            client.emit("iec104:input")
        });
    }
  RED.nodes.registerType("iec104-station", IEC104Station);
};