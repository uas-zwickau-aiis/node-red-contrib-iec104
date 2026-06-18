module.exports = function(RED) {

    function IEC104MasterAddress(config) {
        RED.nodes.createNode(this, config);

        this.ca = config.ca;

        const node = this;
        const master = RED.nodes.getNode(config.connection);

        node.on("input", function (msg) {

            if (!master) {
                node.warn("Kein Master konfiguriert");
                return;
            }

            msg.payload = msg.payload || {};

            if (typeof msg.payload !== "object") {
                msg.payload = {};
            }

            msg.payload.ca = node.ca;

            master.emit("iec104:input", msg);
        });
    }

    RED.nodes.registerType("iec104-masteraddress", IEC104MasterAddress);
};