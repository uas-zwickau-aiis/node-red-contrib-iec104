const assert = require("assert");
const APCI = require("../../lib/protocol/apci");
const IEC104 = require("../../lib/core/constants");

describe("APCI", () => {

  function iFrame(ns, nr) {
    return Buffer.from([
      IEC104.START, 0x04,
      (ns << 1) & 0xFF,
      (ns >> 7) & 0xFF,
      (nr << 1) & 0xFF,
      (nr >> 7) & 0xFF
    ]);
  }

  function sFrame(nr) {
    return Buffer.from([
      IEC104.START, 0x04,
      0x01, 0x00,
      (nr << 1) & 0xFF,
      (nr >> 7) & 0xFF
    ]);
  }

  describe("initial state", () => {

    it("starts with zero sequence numbers", () => {
      const apci = new APCI();

      const s = apci.getStatus();

      assert.strictEqual(s.sendSeq, 0);
      assert.strictEqual(s.recvSeq, 0);
      assert.strictEqual(s.ackSeq, 0);
      assert.strictEqual(s.unconfirmed, 0);
      assert.strictEqual(s.recvSinceLastAck, 0);
    });

    it("uses default k/w", () => {
      const apci = new APCI();

      assert.strictEqual(apci.k, 12);
      assert.strictEqual(apci.w, 8);
    });

    it("accepts custom k/w", () => {
      const apci = new APCI({
        k: 5,
        w: 3
      });

      assert.strictEqual(apci.k, 5);
      assert.strictEqual(apci.w, 3);
    });

  });

  describe("send sequence", () => {

    it("increments send sequence when building I-frame", () => {
      const apci = new APCI();

      apci.buildIFrame(Buffer.alloc(0));
      apci.buildIFrame(Buffer.alloc(0));

      assert.strictEqual(apci.getStatus().sendSeq, 2);
    });

    it("tracks unconfirmed frames", () => {
      const apci = new APCI();

      apci.buildIFrame(Buffer.alloc(0));
      apci.buildIFrame(Buffer.alloc(0));

      assert.strictEqual(apci.unconfirmedCount(), 2);
    });

    it("updates ack sequence from S-frame", () => {
      const apci = new APCI();

      apci.buildIFrame(Buffer.alloc(0));
      apci.buildIFrame(Buffer.alloc(0));

      apci.updateRecvFromFrame(sFrame(2));

      assert.strictEqual(apci.getStatus().ackSeq, 2);
      assert.strictEqual(apci.unconfirmedCount(), 0);
    });

  });

  describe("receive sequence", () => {

    it("increments recv sequence for I-frame", () => {
      const apci = new APCI();

      apci.updateRecvFromFrame(iFrame(0, 0));

      assert.strictEqual(apci.getStatus().recvSeq, 1);
    });

    it("counts received frames since last ack", () => {
      const apci = new APCI();

      apci.updateRecvFromFrame(iFrame(0, 0));
      apci.updateRecvFromFrame(iFrame(1, 0));

      assert.strictEqual(apci.getStatus().recvSinceLastAck, 2);
    });

    it("does not increment recv sequence for S-frame", () => {
      const apci = new APCI();

      apci.updateRecvFromFrame(sFrame(0));

      assert.strictEqual(apci.getStatus().recvSeq, 0);
    });

    it("resets receive counter after ackSent()", () => {
      const apci = new APCI();

      apci.updateRecvFromFrame(iFrame(0, 0));
      apci.updateRecvFromFrame(iFrame(1, 0));

      apci.ackSent();

      assert.strictEqual(apci.getStatus().recvSinceLastAck, 0);
    });

  });

  describe("window handling", () => {

    it("can send while k is not reached", () => {
      const apci = new APCI({ k: 2 });

      assert.strictEqual(apci.hasSendWindow(), true);

      apci.buildIFrame(Buffer.alloc(0));

      assert.strictEqual(apci.hasSendWindow(), true);

      apci.buildIFrame(Buffer.alloc(0));

      assert.strictEqual(apci.hasSendWindow(), false);
    });

    it("requires S-frame after w received frames", () => {
      const apci = new APCI({ w: 2 });

      apci.updateRecvFromFrame(iFrame(0,0));

      assert.strictEqual(apci.shouldSendAck(), false);

      apci.updateRecvFromFrame(iFrame(1,0));

      assert.strictEqual(apci.shouldSendAck(), true);
    });

    it("clears shouldSendAck after ackSent()", () => {
      const apci = new APCI({ w: 2 });

      apci.updateRecvFromFrame(iFrame(0,0));
      apci.updateRecvFromFrame(iFrame(1,0));

      apci.ackSent();

      assert.strictEqual(apci.shouldSendAck(), false);
    });

  });

  describe("validation", () => {

    it("rejects unexpected receive sequence", () => {
      const apci = new APCI();

      assert.throws(() => {
        apci.updateRecvFromFrame(iFrame(1,0));
      }, /Unexpected N\(S\)/);
    });

    it("rejects invalid ack sequence", () => {
      const apci = new APCI();

      assert.throws(() => {
        apci.updateRecvFromFrame(sFrame(5));
      }, /Invalid ACK sequence/);
    });

  });

  describe("reset", () => {

    it("clears all state", () => {
      const apci = new APCI();

      apci.buildIFrame(Buffer.alloc(0));
      apci.updateRecvFromFrame(iFrame(0,0));

      apci.reset();

      const s = apci.getStatus();

      assert.strictEqual(s.sendSeq, 0);
      assert.strictEqual(s.recvSeq, 0);
      assert.strictEqual(s.ackSeq, 0);
      assert.strictEqual(s.unconfirmed, 0);
      assert.strictEqual(s.recvSinceLastAck, 0);
    });

  });

});