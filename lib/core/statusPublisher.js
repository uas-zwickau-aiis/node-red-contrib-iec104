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

    // ==========================================
    // State
    // ==========================================

    publishState(state, reason) {
        this.node.currentState = state;
        this.node.currentReason = reason || "";
        this.node.currentTs = Date.now();

        const status = this.buildSnapshot();

        this.node.emit("iec104:status", {
            topic: "iec104/status",
            payload: status
        });

        this.publishSSE(status);
    }

    // ==========================================
    // Statistics
    // ==========================================

    publishStats() {
        this.node.currentSession =
            this.node.session?.bundleStatistics?.() || null;

        this.node.currentTs = Date.now();

        const status = this.buildSnapshot();
        this.publishSSE(status);
    }

    buildSnapshot() {
        return {
            state: this.node.currentState || "UNKNOWN",
            reason: this.node.currentReason || "",
            ts: this.node.currentTs || Date.now(),
            session:
                this.node.currentSession ||
                this.node.session?.bundleStatistics?.() ||
                null
        };
    }

    // ==========================================
    // Server Sent Events
    // ==========================================

    publishSSE(status) {
        const payload = JSON.stringify(status);

        for (const client of this.clients) {
            try {
                client.write("event: status\n");
                client.write(`data: ${payload}\n\n`);
            } catch {
                this.clients.delete(client);
            }
        }
    }

    // ==========================================
    // Close
    // ==========================================

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