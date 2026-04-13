const net = require("net");
const FrameParser = require("../protocol/frameParser");

class TcpConnection {
    constructor({ port, onFrame, onConnect, onDisconnect, onError }) {
        this.port = port;
        this.server = null;
        this.socket = null;

        this.onFrame = onFrame;
        this.onConnect = onConnect || (() => {});
        this.onDisconnect = onDisconnect || (() => {});
        this.onError = onError || (() => {});
    }

    start() {
        this.server = net.createServer(sock => {
            this.socket = sock;

            sock.setNoDelay(true);
            sock.setKeepAlive(true, 10000);

            const parser = new FrameParser(frame => {
                this.onFrame(frame);
            });

            const cleanup = (reason) => {
                parser.reset();
                this.socket = null;
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

            this.onConnect();
        });

        this.server.on("error", err => {
            this.onError(err);
        });

        this.server.listen(this.port);
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

        if (this.server) {
            this.server.close(cb);
        } else {
            cb?.();
        }
    }
}

module.exports = TcpConnection;