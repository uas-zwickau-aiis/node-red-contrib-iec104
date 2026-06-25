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

    publishState(state, reason) {
        this.node.currentState = state;
        this.node.currentReason = reason || "";
        this.node.currentTs = Date.now();

        this.publishSnapshot();
    }

    publishStats() {
        this.node.currentSession = this.node.session?.getStatus?.() || null;
        this.node.currentTs = Date.now();

        this.publishSnapshot();
    }

    publishSnapshot() {
        const status = {
            state: this.node.currentState || "UNKNOWN",
            reason: this.node.currentReason || "",
            ts: this.node.currentTs || Date.now(),
            session: this.node.currentSession || this.node.session?.getStatus?.() || null
        };

        this.node.emit("iec104:status", {
            topic: "iec104/status",
            payload: status
        });

        const payload = JSON.stringify(status);

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