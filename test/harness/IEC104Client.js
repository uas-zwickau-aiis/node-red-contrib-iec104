'use strict';

const net = require('net');
const assert = require('assert');

const { sleep, hex, bufferEquals } = require('./helpers');

const {
    STARTDT_ACT,
    STARTDT_CON,
    STOPDT_ACT,
    STOPDT_CON,
    TESTFR_ACT,
    TESTFR_CON
} = require('./frames');

class IEC104Client {

    constructor(options = {}) {

        this.host = options.host || '127.0.0.1';
        this.port = options.port || 2404;

        this.socket = null;

        this.rxQueue = [];

        this.stats = {
            connects: 0,
            disconnects: 0,
            sentFrames: 0,
            receivedFrames: 0
        };
    }

    async connect() {

        this.socket = new net.Socket();

        this.socket.on('data', data => {

            this.rxQueue.push(Buffer.from(data));

            this.stats.receivedFrames++;
        });

        this.socket.on('error', err => {
            console.error('[CLIENT SOCKET ERROR]', err.message);
        });

        await new Promise((resolve, reject) => {

            this.socket.connect(this.port, this.host, () => {
                this.stats.connects++;
                resolve();
            });

            this.socket.once('error', reject);

        });
    }

    async disconnect() {

        if (!this.socket)
            return;

        await new Promise(resolve => {

            this.socket.end(() => {
                this.stats.disconnects++;
                resolve();
            });

        });

        this.socket.destroy();

        this.socket = null;
    }

    async send(buffer) {

        assert(Buffer.isBuffer(buffer), 'send() requires a Buffer');

        this.socket.write(buffer);

        this.stats.sentFrames++;
    }

    async expect(expectedBuffer, timeout = 1000) {

        const start = Date.now();

        while (Date.now() - start < timeout) {

            const frame = this.rxQueue.shift();

            if (frame) {

                if (bufferEquals(frame, expectedBuffer)) {
                    return frame;
                }
            }

            await sleep(10);
        }

        throw new Error(
            `Timeout waiting for frame: ${hex(expectedBuffer)}`
        );
    }

    // -----------------------------
    // IEC104 U-Frame helpers
    // -----------------------------

    async sendStartDTAct() {
        await this.send(STARTDT_ACT);
    }

    async expectStartDTCon() {
        return this.expect(STARTDT_CON);
    }

    async sendStopDTAct() {
        await this.send(STOPDT_ACT);
    }

    async expectStopDTCon() {
        return this.expect(STOPDT_CON);
    }

    async sendTestFRAct() {
        await this.send(TESTFR_ACT);
    }

    async expectTestFRCon() {
        return this.expect(TESTFR_CON);
    }
}

module.exports = IEC104Client;
