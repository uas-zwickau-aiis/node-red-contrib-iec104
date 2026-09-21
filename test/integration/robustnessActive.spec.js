'use strict';

const assert = require('assert');
const { IEC104Server } = require('../harness/IEC104Server');
const F = require('../harness/frames');
const { sleep } = require('../harness/helpers');

const enabled = process.env.IEC104_ACTIVE_TESTS === '1';
const describeActive = enabled ? describe : describe.skip;

describeActive('IEC104 robustness - active SUT', function () {
    const options = {
        host: process.env.IEC104_ACTIVE_PEER_HOST || '127.0.0.1',
        port: Number(process.env.IEC104_ACTIVE_PEER_PORT || 2405)
    };

    this.timeout(40000);

    it('connects after an initially unavailable peer becomes available', async function () {
        /*
         * Start this test while the active SUT is already running and points
         * to options.port. Initially no harness server is listening there.
         * TcpClient therefore reaches cleanup() and scheduleReconnect().
         */
        const unavailableMs =
            Number(process.env.IEC104_PEER_UNAVAILABLE_MS || 1000);

        await sleep(unavailableMs);

        const server = new IEC104Server(options);
        await server.listen();

        try {
            const timeout =
                Number(process.env.IEC104_RECONNECT_TIMEOUT_MS || 10000);

            const peer = await server.nextConnection(timeout);
            assert(peer, 'SUT did not connect after peer became available');
            await peer.acceptStartDT();
        } finally {
            await server.close();
        }
    });

    it('automatically reconnects after abrupt TCP connection loss', async function () {
        const server = new IEC104Server(options);
        await server.listen();

        try {
            const first = await server.nextConnection();
            await first.acceptStartDT();

            first.destroy();

            const timeout =
                Number(process.env.IEC104_RECONNECT_TIMEOUT_MS || 10000);

            // This second TCP connection must originate from the SUT.
            const second = await server.nextConnection(timeout);
            assert(second, 'SUT did not reconnect automatically');
            await second.acceptStartDT();
        } finally {
            await server.close();
        }
    });

    it('reconnects after STARTDT t1 timeout', async function () {
        const server = new IEC104Server(options);
        await server.listen();

        try {
            const first = await server.nextConnection();

            // MasterSession.start(): STARTDT_ACT + t1.
            await first.expect(F.STARTDT_ACT);

            // STARTDT_CON absichtlich nicht senden.
            const t1 =
                Number(process.env.IEC104_T1_MS || 15000);

            const margin =
                Number(process.env.IEC104_T1_MARGIN_MS || 500);

            await sleep(t1 + margin);

            /*
            * Nach Ablauf von t1 muss die fehlerhafte
            * Verbindung beendet werden.
            */
            const reconnectTimeout =
                Number(
                    process.env.IEC104_RECONNECT_TIMEOUT_MS ||
                    10000
                );

            await first.waitForClose(reconnectTimeout);

            /*
            * Anschließend muss der TcpClient über seinen
            * normalen Reconnect-Pfad eine neue Verbindung
            * herstellen.
            */
            const second =
                await server.nextConnection(reconnectTimeout);

            assert(
                second,
                'SUT did not reconnect after STARTDT timeout'
            );

            /*
            * Auf der neuen TCP-Verbindung muss auch die
            * IEC-104-Sitzung vollständig neu aufgebaut werden.
            */
            await second.acceptStartDT();

            /*
            * Abschließend reguläre Kommunikation prüfen.
            */
            await second.send(F.TESTFR_ACT);
            await second.expect(F.TESTFR_CON);

        } finally {
            await server.close();
        }
    });
});
