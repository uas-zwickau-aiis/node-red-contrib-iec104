'use strict';

const IEC104Client = require('../harness/IEC104Client');
const F = require('../harness/frames');
const { sleep } = require('../harness/helpers');

describe('IEC104 robustness - ASDU processing', function () {
    const options = {
        host: process.env.IEC104_HOST || '127.0.0.1',
        port: Number(process.env.IEC104_PORT || 2404)
    };

    this.timeout(10000);

    async function established() {
        const client = new IEC104Client(options);
        await client.establishSession();
        return client;
    }

    it('rejects an unknown ASDU Type-ID and remains usable', async function () {
        const client = await established();

        const unknownType =
            Number(process.env.IEC104_UNKNOWN_TYPE_ID || 255);

        await client.send(F.unknownTypeFrame(unknownType));

        // The SUT does not send a dedicated negative response in the supplied
        // implementation; post-error functionality is the external oracle.
        await sleep(50);
        await client.assertSessionUsable();
        await client.disconnect();
    });

    it('survives a syntactically truncated known ASDU', async function () {
        // M_ME_NB_1 (0x0B) uses measuredScaled/readInt16LE.
        const typeId = 0x0B;

        const client = await established();

        await client.send(F.truncatedKnownTypeFrame(typeId));
        await sleep(50);

        // handleFrame() is caught at the Node level; the Node-RED process and
        // the session should remain responsive after the malformed ASDU.
        await client.assertSessionUsable();
        await client.disconnect();
    });

    it('observes handling of a known but session-unsupported ASDU', async function () {
        // M_SP_NA_1 (0x01) is known to the ASDU parser but is not
        // handled by SlaveSession.handleASDU().
        const typeId = 0x01;

        const client = await established();

        await client.send(
            F.unsupportedKnownOneByteTypeFrame(typeId)
        );

        /*
         * Current implementation may return success implicitly for a known
         * ASDU that SlaveSession does not handle. This test therefore does
         * not assert a warning; it checks that subsequent communication is
         * still correct. The Node-RED log/status should be recorded as an
         * additional observation during the robustness evaluation.
         */
        await sleep(50);
        await client.assertSessionUsable();
        await client.disconnect();
    });
});
