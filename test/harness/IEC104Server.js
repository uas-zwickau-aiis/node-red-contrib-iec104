'use strict';

const net = require('net');
const assert = require('assert');
const IEC104StreamParser = require('./IEC104StreamParser');
const { waitFor, hex } = require('./helpers');
const F = require('./frames');

class PeerConnection {
    constructor(socket) {
        this.socket = socket;
        this.parser = new IEC104StreamParser();
        this.rxQueue = [];
        this.closed = false;

        socket.on('data', data => {
            this.rxQueue.push(...this.parser.push(data));
        });
        socket.on('error', () => {});
        socket.on('close', () => { this.closed = true; });
    }

    async send(buffer) {
        await new Promise((resolve, reject) => {
            this.socket.write(buffer, err => err ? reject(err) : resolve());
        });
    }

    async expect(expected, timeout = 3000) {
        await waitFor(
            () => this.rxQueue.length > 0,
            { timeout, message: `Expected from SUT: ${hex(expected)}` }
        );

        const actual = this.rxQueue.shift();
        assert.deepStrictEqual(actual, expected);
        return actual;
    }

    destroy() {
        this.socket.destroy();
    }

    async waitForClose(timeout) {
        await waitFor(
            () => this.closed || this.socket.destroyed,
            { timeout, message: 'SUT did not close TCP connection' }
        );
    }

    async acceptStartDT() {
        await this.expect(F.STARTDT_ACT);
        await this.send(F.STARTDT_CON);
    }
}

class IEC104Server {
    constructor({ host = '127.0.0.1', port = 2405 } = {}) {
        this.host = host;
        this.port = port;
        this.server = null;
        this.pending = [];
        this.connections = [];
    }

    async listen() {
        this.server = net.createServer(socket => {
            const peer = new PeerConnection(socket);
            this.connections.push(peer);
            this.pending.push(peer);
        });

        await new Promise((resolve, reject) => {
            this.server.once('error', reject);
            this.server.listen(this.port, this.host, resolve);
        });
    }

    async nextConnection(timeout = 10000) {
        await waitFor(
            () => this.pending.length > 0,
            {
                timeout,
                message: `No connection from SUT to ${this.host}:${this.port}`
            }
        );
        return this.pending.shift();
    }

    async close() {
        for (const peer of this.connections) peer.destroy();

        if (this.server) {
            await new Promise(resolve => this.server.close(resolve));
            this.server = null;
        }
    }
}

module.exports = { IEC104Server, PeerConnection };
