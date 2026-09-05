'use strict';

const net = require('net');
const assert = require('assert');
const IEC104StreamParser = require('./IEC104StreamParser');
const { sleep, hex, waitFor } = require('./helpers');
const F = require('./frames');

class IEC104Client {
    constructor({ host = '127.0.0.1', port = 2404 } = {}) {
        this.host = host;
        this.port = port;
        this.socket = null;
        this.parser = new IEC104StreamParser();
        this.rxQueue = [];
        this.errors = [];
        this.closed = true;
    }

    async connect(timeout = 2000) {
        this.parser.reset();
        this.rxQueue.length = 0;
        this.errors.length = 0;
        this.closed = false;

        const socket = new net.Socket();
        this.socket = socket;

        socket.on('data', data => {
            this.rxQueue.push(...this.parser.push(data));
        });
        socket.on('error', err => this.errors.push(err));
        socket.on('close', () => { this.closed = true; });

        await new Promise((resolve, reject) => {
            const timer = setTimeout(() => {
                socket.destroy();
                reject(new Error(`Connect timeout ${this.host}:${this.port}`));
            }, timeout);

            socket.once('connect', () => {
                clearTimeout(timer);
                resolve();
            });

            socket.once('error', err => {
                clearTimeout(timer);
                reject(err);
            });

            socket.connect(this.port, this.host);
        });
    }

    async disconnect() {
        if (!this.socket || this.socket.destroyed) return;

        const socket = this.socket;
        await new Promise(resolve => {
            socket.once('close', resolve);
            socket.end();
            setTimeout(() => socket.destroy(), 250).unref();
        });
    }

    destroy() {
        this.socket?.destroy();
    }

    async waitForClose(timeout = 2000) {
        await waitFor(
            () => this.closed || !this.socket || this.socket.destroyed,
            { timeout, message: 'Connection remained open' }
        );
    }

    async send(buffer) {
        assert(Buffer.isBuffer(buffer), 'send() requires a Buffer');
        if (!this.socket || this.socket.destroyed) {
            throw new Error('Socket is not connected');
        }

        await new Promise((resolve, reject) => {
            this.socket.write(buffer, err => err ? reject(err) : resolve());
        });
    }

    async sendFragmented(buffer, splitAt, delayMs = 10) {
        const cuts = [...splitAt]
            .filter(n => Number.isInteger(n) && n > 0 && n < buffer.length)
            .sort((a, b) => a - b);

        let from = 0;
        for (const to of [...cuts, buffer.length]) {
            await this.send(buffer.subarray(from, to));
            from = to;
            if (from < buffer.length) await sleep(delayMs);
        }
    }

    async sendCombined(...buffers) {
        await this.send(Buffer.concat(buffers));
    }

    async expect(expected, timeout = 1000) {
        await waitFor(
            () => this.rxQueue.length > 0,
            { timeout, message: `Expected ${hex(expected)}` }
        );

        const actual = this.rxQueue.shift();
        assert.deepStrictEqual(
            actual,
            expected,
            `Expected ${hex(expected)}, received ${hex(actual)}`
        );
        return actual;
    }

    async expectNoFrame(timeout = 200) {
        await sleep(timeout);
        assert.strictEqual(
            this.rxQueue.length,
            0,
            `Unexpected response: ${this.rxQueue.map(hex).join(' | ')}`
        );
    }

    async establishSession() {
        await this.connect();
        await this.send(F.STARTDT_ACT);
        await this.expect(F.STARTDT_CON);
    }

    async assertSessionUsable() {
        await this.send(F.TESTFR_ACT);
        await this.expect(F.TESTFR_CON);
    }
}

module.exports = IEC104Client;
