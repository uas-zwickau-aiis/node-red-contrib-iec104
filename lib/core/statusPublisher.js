class StatusPublisher {
    constructor(node) {
        this.node = node;
        this.clients = new Set();
    }

    addClient(res) {
        this.clients.add(res);
    }

    removeClient(res) {
        this.clients.delete(res);
    }

    publish(state, reason) {
        const ts = Date.now();
        const session = this.node.session?.getStatus?.() || null;

        this.node.currentState = state;
        this.node.currentReason = reason || "";
        this.node.currentTs = ts;
        this.node.currentSession = session;

        const event = {
            topic: "iec104/status",
            state,
            reason: reason || "",
            ts,
            session
        };

        this.node.emit("iec104:status", event);

        const payload = JSON.stringify(event);

        for (const client of this.clients) {
            try {
                client.write(`event: status\n`);
                client.write(`data: ${payload}\n\n`);
            } catch {
                this.clients.delete(client);
            }
        }
    }

    closeAll() {
        for (const client of this.clients) {
            try {
                client.end();
            } catch {}
        }
        this.clients.clear();
    }
}

module.exports = StatusPublisher;