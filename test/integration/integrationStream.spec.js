'use strict';

const IEC104Client = require('../harness/IEC104Client');
const F = require('../harness/frames');

describe('IEC104 TCP stream integration', function () {
    const options = {
        host: process.env.IEC104_HOST || '127.0.0.1',
        port: Number(process.env.IEC104_PORT || 2404)
    };

    it('processes a fragmented valid APDU', async function () {
        const client = new IEC104Client(options);
        await client.connect();

        await client.sendFragmented(F.STARTDT_ACT, [1, 3], 10);
        await client.expect(F.STARTDT_CON);

        await client.assertSessionUsable();
        await client.disconnect();
    });

    it('processes multiple APDUs delivered in one TCP write', async function () {
        const client = new IEC104Client(options);
        await client.establishSession();

        await client.sendCombined(F.TESTFR_ACT, F.TESTFR_ACT);
        await client.expect(F.TESTFR_CON);
        await client.expect(F.TESTFR_CON);

        await client.disconnect();
    });
});
