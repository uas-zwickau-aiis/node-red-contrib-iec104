module.exports = function(RED) {

  function IEC104MasterObserver(config) {
    RED.nodes.createNode(this, config);
    const node = this;

    const master = RED.nodes.getNode(config.connection);

    if (!master) {
      node.warn("Kein Master konfiguriert");
      return;
    }

    function onData(msg) {
      node.send(msg);
    }

    function onASDU(msg) {
      node.send(msg);
    }

    function onPoint(msg) {
      node.send(msg);
    }

    function onStatus(msg) {
      node.send([null, msg]);
    }

    function onGIComplete(msg) {
      node.send([null, msg]);
    }

    master.on("iec104:data", onData);
    master.on("iec104:asdu", onASDU);
    master.on("iec104:point", onPoint);

    master.on("iec104:status", onStatus);
    master.on("iec104:gi-complete", onGIComplete);

    node.on("close", function() {
      master.removeListener("iec104:data", onData);
      master.removeListener("iec104:asdu", onASDU);
      master.removeListener("iec104:point", onPoint);

      master.removeListener("iec104:status", onStatus);
      master.removeListener("iec104:gi-complete", onGIComplete);
    });
  }

  RED.nodes.registerType(
    "iec104-masterobserver",
    IEC104MasterObserver
  );
};