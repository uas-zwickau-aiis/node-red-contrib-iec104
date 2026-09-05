'use strict';

/*
 * TCP is a byte stream and does not preserve IEC-104 APDU boundaries.
 * This parser is used only by the test harness to reconstruct complete
 * responses from the SUT.
 */
class IEC104StreamParser {
    constructor() {
        this.buffer = Buffer.alloc(0);
    }

    push(data) {
        this.buffer = Buffer.concat([this.buffer, Buffer.from(data)]);
        const frames = [];

        while (this.buffer.length >= 2) {
            const start = this.buffer.indexOf(0x68);

            if (start < 0) {
                this.buffer = Buffer.alloc(0);
                break;
            }

            if (start > 0) {
                this.buffer = this.buffer.subarray(start);
            }

            if (this.buffer.length < 2) break;

            const frameLength = this.buffer[1] + 2;

            if (this.buffer.length < frameLength) break;

            frames.push(Buffer.from(this.buffer.subarray(0, frameLength)));
            this.buffer = this.buffer.subarray(frameLength);
        }

        return frames;
    }

    reset() {
        this.buffer = Buffer.alloc(0);
    }
}

module.exports = IEC104StreamParser;
