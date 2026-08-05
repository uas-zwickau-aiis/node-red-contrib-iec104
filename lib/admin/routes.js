module.exports = function registerRoutes(RED) {
    if (RED.httpAdmin._iec104StatusRouteRegistered) return;

    RED.httpAdmin._iec104StatusRouteRegistered = true;

    function getPayload(node) {
        return {
            state: node.currentState || "UNKNOWN",
            reason: node.currentReason || "",
            ts: node.currentTs || Date.now(),
            session: node.currentSession || node.session?.bundleStatistics?.() || null
        };
    }

    RED.httpAdmin.get("/iec104/:id/status", (req, res) => {
        const node = RED.nodes.getNode(req.params.id);
        if (!node) return res.sendStatus(404);

        res.json(getPayload(node));
    });

    RED.httpAdmin.get("/iec104/:id/events", (req, res) => {
        const node = RED.nodes.getNode(req.params.id);
        if (!node) return res.sendStatus(404);

        res.setHeader("Content-Type", "text/event-stream");
        res.setHeader("Cache-Control", "no-cache, no-transform");
        res.setHeader("Connection", "keep-alive");

        if (typeof res.flushHeaders === "function") {
            res.flushHeaders();
        }

        node.statusPub.addClient(res);

        res.write(`event: status\n`);
        res.write(`data: ${JSON.stringify(getPayload(node))}\n\n`);

        req.on("close", () => {
            node.statusPub.removeClient(res);
        });
    });
};