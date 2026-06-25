class IECTimers {
  constructor({ t1 = 15000, t2 = 10000, t3 = 20000, onT1, onT2, onT3 }) {
    this.t1Value = t1;
    this.onT1 = onT1;
    this.t1Handle = null;

    this.t2Value = t2;
    this.onT2 = onT2;
    this.t2Handle = null;

    this.t3Value = t3;
    this.onT3 = onT3;
    this.t3Handle = null;
  }

  startT1() {
    if (this.t1Value <= 0) return;
    if (this.t1Handle) return;

    this.t1Handle = setTimeout(() => {
      this.t1Handle = null;
      this.onT1?.();
    }, this.t1Value);
  }

  resetT1() {
    this.stopT1();
    this.startT1();
  }

  stopT1() {
    if (this.t1Handle) {
      clearTimeout(this.t1Handle);
      this.t1Handle = null;
    }
  }

  startT2() {
    if (this.t2Value <= 0) return;
    if (this.t2Handle) return;

    this.t2Handle = setTimeout(() => {
      this.t2Handle = null;
      this.onT2?.();
    }, this.t2Value);
  }

  resetT2() {
    this.stopT2();
    this.startT2();
  }

  stopT2() {
    if (this.t2Handle) {
      clearTimeout(this.t2Handle);
      this.t2Handle = null;
    }
  }

  startT3() {
    if (this.t3Value <= 0) return;

    this.stopT3();
    this.t3Handle = setTimeout(() => {
      this.t3Handle = null;
      this.onT3?.();
    }, this.t3Value);
  }

  resetT3() {
    this.startT3();
  }

  stopT3() {
    if (this.t3Handle) {
      clearTimeout(this.t3Handle);
      this.t3Handle = null;
    }
  }

  stopAll() {
    this.stopT1();
    this.stopT2();
    this.stopT3();
  }

  getStatus() {
    return {
      t1Running: !!this.t1Handle,
      t2Running: !!this.t2Handle,
      t3Running: !!this.t3Handle,
      t1Value: this.t1Value,
      t2Value: this.t2Value,
      t3Value: this.t3Value
    };
  }
}

module.exports = IECTimers;