'use strict';

const IEC104Client = require('../harness/IEC104Client');

describe('IEC104 Session Lifecycle', function () {

    it('should establish and close a session cleanly', async function () {

        const client = new IEC104Client({
            host: '127.0.0.1',
            port: 2404
        });

        await client.connect();

        await client.sendStartDTAct();
        await client.expectStartDTCon();

        await client.sendTestFRAct();
        await client.expectTestFRCon();

        await client.sendStopDTAct();
        await client.expectStopDTCon();

        await client.disconnect();
    });
    it('should survive 1000 session cycles', async function () {

    this.timeout(60000);

    for (let i = 0; i < 1000; i++) {

        const client = new IEC104Client();

        await client.connect();

        await client.sendStartDTAct();
        await client.expectStartDTCon();

        await client.disconnect();

        if (i % 100 === 0) {
            console.log('cycle', i);
            console.log(process.memoryUsage().heapUsed);
            console.log(process._getActiveHandles().length);
        }
    }
});

});
describe('IEC104 TESTFR Stability', function () {

    this.timeout(60000);

    it('should survive 1000 TESTFR cycles', async function () {

        const client = new IEC104Client({
            host: '127.0.0.1',
            port: 2404
        });

        await client.connect();

        await client.sendStartDTAct();
        await client.expectStartDTCon();

        for (let i = 0; i < 1000; i++) {

            await client.sendTestFRAct();

            await client.expectTestFRCon();

            if (i % 100 === 0) {

                console.log('cycle', i);

                console.log(
                    'heap',
                    process.memoryUsage().heapUsed
                );

                console.log(
                    'handles',
                    process._getActiveHandles().length
                );
            }
        }

        await client.disconnect();
    });

});
describe('IEC104 Abrupt Disconnect', function () {

    this.timeout(60000);

    it('should survive 1000 abrupt disconnects', async function () {

        for (let i = 0; i < 1000; i++) {

            const client = new IEC104Client();

            await client.connect();

            await client.sendStartDTAct();

            await client.expectStartDTCon();

            client.socket.destroy();

            await new Promise(r => setTimeout(r, 5));

            if (i % 100 === 0) {

                console.log('cycle', i);

                console.log(
                    'heap',
                    process.memoryUsage().heapUsed
                );

                console.log(
                    'handles',
                    process._getActiveHandles().length
                );
            }
        }
    });
});
describe('IEC104 Idle Stability', function () {

    this.timeout(120000);

    it('should keep a session alive during idle periods', async function () {

        const client = new IEC104Client({
            host: '127.0.0.1',
            port: 2404
        });

        await client.connect();

        await client.sendStartDTAct();

        await client.expectStartDTCon();

        console.log('session established - entering idle phase');

        await new Promise(resolve => setTimeout(resolve, 30000));

        console.log('sending TESTFR after idle');

        await client.sendTestFRAct();

        await client.expectTestFRCon();

        await client.disconnect();
    });

});
describe('IEC104 Reconnect Stress', function () {

    this.timeout(120000);

    it('should survive rapid reconnect cycles', async function () {

        for (let i = 0; i < 1000; i++) {

            const client = new IEC104Client({
                host: '127.0.0.1',
                port: 2404
            });

            await client.connect();

            await client.sendStartDTAct();

            await client.expectStartDTCon();

            await client.disconnect();

            if (i % 100 === 0) {

                console.log('cycle', i);

                console.log(
                    'heap',
                    process.memoryUsage().heapUsed
                );

                console.log(
                    'handles',
                    process._getActiveHandles().length
                );
            }
        }
    });

});
