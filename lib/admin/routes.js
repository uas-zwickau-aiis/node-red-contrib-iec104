module.exports = function registerRoutes(RED) {
    if (RED.httpAdmin._iec104StatusRouteRegistered) return;

    RED.httpAdmin._iec104StatusRouteRegistered = true;

    RED.httpAdmin.get("/iec104/:id/status", (req, res) => {
        const node = RED.nodes.getNode(req.params.id);
        if (!node) return res.sendStatus(404);

        res.json({
            state: node.currentState || "UNKNOWN",
            reason: node.currentReason || "",
            ts: node.currentTs || Date.now()
        });
    });

    RED.httpAdmin.get("/iec104/:id/events", (req, res) => {
        const node = RED.nodes.getNode(req.params.id);
        if (!node) return res.sendStatus(404);

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");
        res.flushHeaders?.();

        node.statusPub.addClient(res);

        const payload = JSON.stringify({
            state: node.currentState || "UNKNOWN",
            reason: node.currentReason || "",
            ts: node.currentTs || Date.now()
        });

        res.write(`event: status\n`);
        res.write(`data: ${payload}\n\n`);

        req.on("close", () => {
            node.statusPub.removeClient(res);
        });
    });
};