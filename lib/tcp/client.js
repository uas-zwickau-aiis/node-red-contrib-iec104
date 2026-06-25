const net = require("net");
const FrameParser = require("../protocol/frameParser");

class TcpClient {
    constructor({ host, port, onFrame, onConnect, onDisconnect, onError }) {
        this.host = host;
        this.port = port;
        this.socket = null;

        this.onFrame = onFrame;
        this.onConnect = onConnect || (() => {});
        this.onDisconnect = onDisconnect || (() => {});
        this.onError = onError || (() => {});
    }

    start() {
        const sock = new net.Socket();
        this.socket = sock;

        sock.setNoDelay(true);
        sock.setKeepAlive(true, 10000);

        const parser = new FrameParser(frame => {
            this.onFrame(frame);
        });

        const cleanup = (reason) => {
            parser.reset();

            if (this.socket === sock) {
                this.socket = null;
            }

            this.onDisconnect(reason);
        };

        sock.on("data", data => parser.push(data));
        sock.on("end", () => cleanup("socket end"));
        sock.on("close", () => cleanup("socket close"));
        sock.on("timeout", () => cleanup("socket timeout"));
        sock.on("error", err => {
            cleanup(err?.message || "socket error");
            this.onError(err);
        });

        sock.connect(this.port, this.host, () => {
            this.onConnect();
        });
    }

    send(data) {
        if (this.socket) {
            this.socket.write(data);
        }
    }

    stop(cb) {
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