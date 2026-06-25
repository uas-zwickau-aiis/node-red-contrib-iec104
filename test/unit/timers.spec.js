const assert = require("assert");
const sinon = require("sinon");

const IECTimers = require("../../lib/protocol/timers")

describe("IECTimers", () => {
  let clock;

  beforeEach(() => {
    clock = sinon.useFakeTimers();
  });

  afterEach(() => {
    clock.restore();
  });

  it("starts T1 and calls onT1 after timeout", async () => {
    const onT1 = sinon.spy();

    const timers = new IECTimers({
      t1: 15000,
      onT1
    });

    timers.startT1();

    await clock.tickAsync(14999);
    assert.strictEqual(onT1.called, false);

    await clock.tickAsync(1);
    assert.strictEqual(onT1.calledOnce, true);
  });
  
  it("does not start T1 twice", async () => {
    const onT1 = sinon.spy();

    const timers = new IECTimers({
      t1: 15000,
      onT1
    });

    timers.startT1();
    timers.startT1();

    await clock.tickAsync(15000);

    assert.strictEqual(onT1.calledOnce, true);
  });

  it("resets T1", async () => {
    const onT1 = sinon.spy();

    const timers = new IECTimers({
      t1: 15000,
      onT1
    });

    timers.startT1();

    await clock.tickAsync(10000);
    timers.resetT1();

    await clock.tickAsync(14999);
    assert.strictEqual(onT1.called, false);

    await clock.tickAsync(1);
    assert.strictEqual(onT1.calledOnce, true);
  });

  it("stops T1", async () => {
    const onT1 = sinon.spy();

    const timers = new IECTimers({
      t1: 15000,
      onT1
    });

    timers.startT1();
    timers.stopT1();

    await clock.tickAsync(15000);

    assert.strictEqual(onT1.called, false);
  });

  it("does not start disabled T1", async () => {
    const onT1 = sinon.spy();

    const timers = new IECTimers({
      t1: 0,
      onT1
    });

    timers.startT1();

    await clock.tickAsync(60000);

    assert.strictEqual(onT1.called, false);
  });

  it("starts T2 and calls onT2 after timeout", async () => {
    const onT2 = sinon.spy();

    const timers = new IECTimers({
      t2: 10000,
      onT2
    });

    timers.startT2();

    await clock.tickAsync(9999);
    assert.strictEqual(onT2.called, false);

    await clock.tickAsync(1);
    assert.strictEqual(onT2.calledOnce, true);
  });

  it("does not start T2 twice", async () => {
    const onT2 = sinon.spy();

    const timers = new IECTimers({
      t2: 10000,
      onT2
    });

    timers.startT2();
    timers.startT2();

    await clock.tickAsync(10000);

    assert.strictEqual(onT2.calledOnce, true);
  });

  it("resets T2", async () => {
    const onT2 = sinon.spy();

    const timers = new IECTimers({
      t2: 10000,
      onT2
    });

    timers.startT2();

    await clock.tickAsync(5000);
    timers.resetT2();

    await clock.tickAsync(9999);
    assert.strictEqual(onT2.called, false);

    await clock.tickAsync(1);
    assert.strictEqual(onT2.calledOnce, true);
  });

  it("stops T2", async () => {
    const onT2 = sinon.spy();

    const timers = new IECTimers({
      t2: 10000,
      onT2
    });

    timers.startT2();
    timers.stopT2();

    await clock.tickAsync(10000);

    assert.strictEqual(onT2.called, false);
  });

  it("does not start disabled T2", async () => {
    const onT2 = sinon.spy();

    const timers = new IECTimers({
      t2: 0,
      onT2
    });

    timers.startT2();

    await clock.tickAsync(60000);

    assert.strictEqual(onT2.called, false);
  });

  it("starts T3 and calls onT3 after timeout", async () => {
    const onT3 = sinon.spy();

    const timers = new IECTimers({
      t3: 20000,
      onT3
    });

    timers.startT3();

    await clock.tickAsync(19999);
    assert.strictEqual(onT3.called, false);

    await clock.tickAsync(1);
    assert.strictEqual(onT3.calledOnce, true);
  });

  it("restarts T3 when startT3 is called again", async () => {
    const onT3 = sinon.spy();

    const timers = new IECTimers({
      t3: 20000,
      onT3
    });

    timers.startT3();

    await clock.tickAsync(10000);
    timers.startT3();

    await clock.tickAsync(19999);
    assert.strictEqual(onT3.called, false);

    await clock.tickAsync(1);
    assert.strictEqual(onT3.calledOnce, true);
  });

  it("resets T3", async () => {
    const onT3 = sinon.spy();

    const timers = new IECTimers({
      t3: 20000,
      onT3
    });

    timers.startT3();

    await clock.tickAsync(10000);
    timers.resetT3();

    await clock.tickAsync(19999);
    assert.strictEqual(onT3.called, false);

    await clock.tickAsync(1);
    assert.strictEqual(onT3.calledOnce, true);
  });

  it("stops T3", async () => {
    const onT3 = sinon.spy();

    const timers = new IECTimers({
      t3: 20000,
      onT3
    });

    timers.startT3();
    timers.stopT3();

    await clock.tickAsync(20000);

    assert.strictEqual(onT3.called, false);
  });

  it("does not start disabled T3", async () => {
    const onT3 = sinon.spy();

    const timers = new IECTimers({
      t3: 0,
      onT3
    });

    timers.startT3();

    await clock.tickAsync(60000);

    assert.strictEqual(onT3.called, false);
  });

  it("stopAll stops T1, T2 and T3", async () => {
    const onT1 = sinon.spy();
    const onT2 = sinon.spy();
    const onT3 = sinon.spy();

    const timers = new IECTimers({
      t1: 15000,
      t2: 10000,
      t3: 20000,
      onT1,
      onT2,
      onT3
    });

    timers.startT1();
    timers.startT2();
    timers.startT3();

    timers.stopAll();

    await clock.tickAsync(60000);

    assert.strictEqual(onT1.called, false);
    assert.strictEqual(onT2.called, false);
    assert.strictEqual(onT3.called, false);
  });

  it("getStatus reports running timers", () => {
    const timers = new IECTimers({
      t1: 15000,
      t2: 10000,
      t3: 20000
    });

    timers.startT1();
    timers.startT2();

    const status = timers.getStatus();

    assert.strictEqual(status.t1Running, true);
    assert.strictEqual(status.t2Running, true);
    assert.strictEqual(status.t3Running, false);

    assert.strictEqual(status.t1Value, 15000);
    assert.strictEqual(status.t2Value, 10000);
    assert.strictEqual(status.t3Value, 20000);
  });
});