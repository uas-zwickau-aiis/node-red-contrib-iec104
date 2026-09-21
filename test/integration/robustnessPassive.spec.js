'use strict';

const IEC104Client = require('../harness/IEC104Client');
const F = require('../harness/frames');
const { sleep } = require('../harness/helpers');

describe('IEC104 robustness - passive SUT', function () {
    const options = {
        host: process.env.IEC104_HOST || '127.0.0.1',
        port: Number(process.env.IEC104_PORT || 2404)
    };

    this.timeout(10000);

    it('remains available after an abrupt TCP disconnect', async function () {
        const first = new IEC104Client(options);
        await first.establishSession();
        first.destroy();

        await sleep(100);

        const second = new IEC104Client(options);
        await second.establishSession();
        await second.assertSessionUsable();
        await second.disconnect();
    });

    it('discards bytes with an invalid APDU start and resynchronises', async function () {
        const client = new IEC104Client(options);
        await client.establishSession();

        // Invalid bytes followed by a complete valid APDU in the same write.
        await client.send(Buffer.concat([
            Buffer.from([0x67, 0x01, 0xff, 0x00]),
            F.TESTFR_ACT
        ]));

        await client.expect(F.TESTFR_CON);
        await client.disconnect();
    });

    it('buffers a fragmented APDU until the missing bytes arrive', async function () {
        const client = new IEC104Client(options);
        await client.connect();

        const partial = F.STARTDT_ACT.subarray(0, 3);
        const remainder = F.STARTDT_ACT.subarray(3);

        await client.send(partial);
        await client.expectNoFrame(100);

        await client.send(remainder);
        await client.expect(F.STARTDT_CON);
        await client.disconnect();
    });

    it('does not carry an incomplete APDU into a new TCP connection', async function () {
        const first = new IEC104Client(options);
        await first.connect();

        // Announces a six-byte APDU but transmits only the first three bytes.
        await first.send(F.STARTDT_ACT.subarray(0, 3));
        first.destroy();

        await sleep(100);

        const second = new IEC104Client(options);
        await second.establishSession();
        await second.assertSessionUsable();
        await second.disconnect();
    });

    it('recovers from an APDU with a too-small length field', async function () {
        const client = new IEC104Client(options);
        await client.establishSession();

        /*
         * STARTDT-like bytes with length 0x02 instead of 0x04.
         * The SUT parser extracts four bytes, then must resynchronise on the
         * following valid TESTFR_ACT.
         */
        const malformed = Buffer.from([
            0x68, 0x02, 0x07, 0x00, 0x00, 0x00
        ]);

        await client.sendCombined(malformed, F.TESTFR_ACT);
        await client.expect(F.TESTFR_CON);
        await client.disconnect();
    });
});
