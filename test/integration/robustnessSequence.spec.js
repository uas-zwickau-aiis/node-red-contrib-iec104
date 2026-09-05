'use strict';

const IEC104Client = require('../harness/IEC104Client');
const F = require('../harness/frames');

describe('IEC104 robustness - unexpected protocol sequence', function () {
    const options = {
        host: process.env.IEC104_HOST || '127.0.0.1',
        port: Number(process.env.IEC104_PORT || 2404)
    };

    it('handles repeated STARTDT_ACT while data transfer is already active', async function () {
        const client = new IEC104Client(options);
        await client.establishSession();

        // Current SlaveSession behaviour: acknowledge STARTDT_ACT again.
        await client.send(F.STARTDT_ACT);
        await client.expect(F.STARTDT_CON);

        // Post-condition: ordinary session operation remains possible.
        await client.assertSessionUsable();
        await client.disconnect();
    });
});
