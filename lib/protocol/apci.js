const { TYPES } = require("../asdu/types");
const IEC104 = require("../core/constants");

const SEQ_MOD = 0x8000; // 32768

class APCI {
    constructor(opts = {}) {
        this.k = opts.k || 12;
        this.w = opts.w || 8;
        this.reset();
    }

    reset() {
        this.sendSeq = 0;
        this.recvSeq = 0;
        this.ackSeq  = 0;

        this.recvSinceLastAck = 0;
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

    shouldSendAck() {
        return this.recvSinceLastAck >= this.w;
    }

    canSend() {
        return this.unconfirmedCount() < this.k;
    }

   updateRecvFromFrame(buf) {

        // ----- ACK auswerten (für t1) -----
        const nr = this.getAckFromFrame(buf);
        this.ackSeq = nr;

        // ----- Nur bei I-Frames recvSeq erhöhen -----
        if (this.isIFrame(buf)) {
            const ns = ((buf[2] | (buf[3] << 8)) >> 1) & 0x7FFF;
            this.recvSeq = this.incSeq(ns);

            this.recvSinceLastAck++;
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

    buildInterrogationFrame(cot, ca, qoi = IEC104.QOI.GLOBAL) {
        const caLo = ca & 0xFF;
        const caHi = (ca >> 8) & 0xFF;

        const buf = Buffer.from([
            IEC104.START, 0x0E,
            0x00, 0x00,   // N(S)
            0x00, 0x00,   // N(R)

            TYPES.C_IC_NA_1.id,
            0x01,                 // VSQ
            cot, 0x00,
            caLo, caHi,
            0x00, 0x00, 0x00,     // IOA
            qoi
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

    buildSFrame() {
        const buf = Buffer.alloc(6);

        buf[0] = IEC104.START;
        buf[1] = 0x04;

        buf[2] = 0x01;
        buf[3] = 0x00;

        buf[4] = (this.recvSeq << 1) & 0xFF;
        buf[5] = (this.recvSeq >> 7) & 0xFF;

        this.recvSinceLastAck = 0;

        return buf;
    }

    // -------- FRAME CHECK --------

    isIFrame(buf) {
        return (buf[2] & 0x01) === 0;
    } 

    isSFrame(buf) {
        return buf.length === 6 && buf[1] === 0x04 && (buf[2] & 0x03) === 0x01;
    }

    isUFrame(buf) {
        return buf.length === 6 && buf[1] === 0x04 && (buf[2] & 0x03) === 0x03;
    }

}

module.exports = APCI;