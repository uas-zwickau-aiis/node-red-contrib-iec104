class IECTimers {
  constructor({ t1 = 15000, t3 = 20000, onT1, onT3 }) {
    this.t1Value = t1;
    this.onT1 = onT1;
    this.t1Handle = null;

    this.t3Value = t3;
    this.onT3 = onT3;
    this.t3Handle = null;
  }

  startT1() {
    if (this.t1Value <= 0) return; // deaktiviert
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

  startT3() {
    if (this.t3Value <= 0) return; // deaktiviert

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
}

module.exports = IECTimers;