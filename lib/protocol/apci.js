const IEC104 = require("../core/constants");

const SEQ_MOD = 0x8000; // 32768

class APCI {
    constructor() {
        this.reset();
    }

    reset() {
        this.sendSeq = 0;
        this.recvSeq = 0;
        this.ackSeq  = 0;
    }

    incSeq(v) {
        return (v + 1) % SEQ_MOD;
    }

    getAckFromFrame(buf) {
        return ((buf[4] | (buf[5] << 8)) >> 1) & 0x7FFF;
    }

    unconfirmedCount() {
        return (this.sendSeq - this.ackSeq + SEQ_MOD) % SEQ_MOD;
    }

   updateRecvFromFrame(buf) {

        // ----- ACK auswerten (für t1) -----
        const nr = this.getAckFromFrame(buf);
        this.ackSeq = nr;

        // ----- Nur bei I-Frames recvSeq erhöhen -----
        if (this.isIFrame(buf)) {
            const ns = ((buf[2] | (buf[3] << 8)) >> 1) & 0x7FFF;
            this.recvSeq = this.incSeq(ns);
        }
    }

    applySeq(buf) {
        buf[2] = (this.sendSeq << 1) & 0xFF;
        buf[3] = (this.sendSeq >> 7) & 0xFF;
        buf[4] = (this.recvSeq << 1) & 0xFF;
        buf[5] = (this.recvSeq >> 7) & 0xFF;

        this.sendSeq = this.incSeq(this.sendSeq);
    }

    // -------- FRAME BUILDERS --------

    buildIFrame(asdu) {
        const len = asdu.length + 4;
        const buf = Buffer.alloc(len + 2);

        buf[0] = IEC104.START;
        buf[1] = len;

        this.applySeq(buf);
        asdu.copy(buf, 6);

        return buf;
    }

    buildInterrogationFrame(cot, asduLo, asduHi) {
        const buf = Buffer.from([
            IEC104.START, 0x0E,
            0x00, 0x00,   // N(S)
            0x00, 0x00,   // N(R)

            IEC104.ASDU.C_IC_NA_1,
            0x01,                 // VSQ
            cot, 0x00,
            asduLo, asduHi,
            0x00, 0x00, 0x00,     // IOA
            IEC104.QOI.GLOBAL
        ]);

        this.applySeq(buf);
        return buf;
    }

    buildUFrame(code) {
        return Buffer.from([
            IEC104.START,
            0x04,
            code,
            0x00,
            0x00,
            0x00
        ]);
    }

    // -------- FRAME CHECK --------

    isIFrame(buf) {
        return (buf[2] & 0x01) === 0;
    } 

    isUFrame(buf) {
        return buf.length === 6 && buf[1] === 0x04;
    }

    isSFrame(buf) {
    return (buf[2] & 0x01) === 1 &&
           (buf[2] & 0x02) === 0;
}

}

module.exports = APCI;