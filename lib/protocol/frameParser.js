const IEC104 = require("../core/constants");

class FrameParser {
    constructor(onFrame) {
        this.buffer = Buffer.alloc(0);
        this.onFrame = onFrame;
    }

    push(data) {
        this.buffer = Buffer.concat([this.buffer, data]);

        while (this.buffer.length >= 2) {
            if (this.buffer[0] !== IEC104.START) {
                this.buffer = this.buffer.slice(1);
                continue;
            }

            const len = this.buffer[1];
            const frameLen = len + 2;

            if (this.buffer.length < frameLen) return;

            const frame = this.buffer.slice(0, frameLen);
            this.buffer = this.buffer.slice(frameLen);

            this.onFrame(frame);
        }
    }

    reset() {
        this.buffer = Buffer.alloc(0);
    }
}

module.exports = FrameParser;