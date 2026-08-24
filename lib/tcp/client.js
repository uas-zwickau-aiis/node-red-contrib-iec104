const net = require("net");
const FrameParser = require("../protocol/frameParser");

class TcpClient {
    constructor({
        host,
        port,
        onFrame,
        onConnect,
        onDisconnect,
        onError,

        reconnectDelay = 5000,
        maxRetries = 10,
        t0 = 30000
    }) {
        this.host = host;
        this.port = port;
        this.socket = null;

        this.onFrame = onFrame;
        this.onConnect = onConnect || (() => {});
        this.onDisconnect = onDisconnect || (() => {});
        this.onError = onError || (() => {});

        this.reconnectDelay = reconnectDelay;
        this.maxRetries = maxRetries;
        this.t0 = t0;

        this.retryCount = 0;
        this.retryTimer = null;
        this.connectTimer = null;

        this.stopped = true;
    }

    start() {
        if (!this.stopped) {
            return;
        }

        this.stopped = false;
        this.retryCount = 0;

        this.connect();
    }

    connect() {
        if (this.stopped || this.socket) {
            return;
        }

        const sock = new net.Socket();
        this.socket = sock;

        sock.setNoDelay(true);
        sock.setKeepAlive(true, 10000);

        const parser = new FrameParser(frame => {
            this.onFrame(frame);
        });

        let cleanedUp = false;

        const cleanup = (reason, err = null) => {
            if (cleanedUp) {
                return;
            }

            cleanedUp = true;

            clearTimeout(this.connectTimer);
            this.connectTimer = null;

            parser.reset();

            if (this.socket === sock) {
                this.socket = null;
            }

            if (!sock.destroyed) {
                sock.destroy();
            }

            this.onDisconnect(reason);

            if (err) {
                this.onError(err);
            }

            this.scheduleReconnect();
        };

        sock.on("data", data => parser.push(data));

        sock.on("end", () => {
            cleanup("socket end");
        });

        sock.on("close", () => {
            cleanup("socket close");
        });

        sock.on("error", err => {
            cleanup(err?.message || "socket error", err);
        });

        this.connectTimer = setTimeout(() => {
            cleanup("connect timeout");
        }, this.t0);

        sock.connect(this.port, this.host, () => {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;

            // Erfolgreiche Verbindung:
            // Fehlerzähler zurücksetzen.
            this.retryCount = 0;

            this.onConnect();
        });
    }

    scheduleReconnect() {
        if (this.stopped) {
            return;
        }

        if (
            this.maxRetries >= 0 &&
            this.retryCount >= this.maxRetries
        ) {
            this.onError(
                new Error(
                    `Maximum reconnect attempts reached: ${this.maxRetries}`
                )
            );

            return;
        }

        this.retryCount++;

        this.retryTimer = setTimeout(() => {
            this.retryTimer = null;
            this.connect();
        }, this.reconnectDelay);
    }

    send(data) {
        if (
            this.socket &&
            !this.socket.destroyed &&
            this.socket.writable
        ) {
            this.socket.write(data);
            return true;
        }

        return false;
    }

    stop(cb) {
        this.stopped = true;

        if (this.retryTimer) {
            clearTimeout(this.retryTimer);
            this.retryTimer = null;
        }

        if (this.connectTimer) {
            clearTimeout(this.connectTimer);
            this.connectTimer = null;
        }

        if (this.socket) {
            try {
                this.socket.destroy();
            } catch (_) {}

            this.socket = null;
        }

        cb?.();
    }
}

module.exports = TcpClient;