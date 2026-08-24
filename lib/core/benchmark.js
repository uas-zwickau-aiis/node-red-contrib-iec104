const hdr = require("hdr-histogram-js");
const DEFINITIONS = require("./benchmarkDefinitions");

class Benchmark {
    constructor(options = {}) {
        this.maxFrames = Math.max(1, Number(options.maxFrames) || 100000);

        this.options = {
            lowestDiscernibleValue: options.lowestDiscernibleValue ?? 1,
            highestTrackableValue: options.highestTrackableValue ?? 10_000_000_000,
            numberOfSignificantValueDigits: options.numberOfSignificantValueDigits ?? 3
        };

        this.histograms = new Map();
        this.enabled = new Map();
        this.completed = new Map();

        for (const definition of Object.values(DEFINITIONS)) {
            this.histograms.set(definition.id, this.createHistogram());
            this.enabled.set(definition.id, false);
            this.completed.set(definition.id, false);
        }
    }

    // ==========================================
    // Histogram
    // ==========================================

    createHistogram() {
        return hdr.build({
            bitBucketSize: 32,
            autoResize: true,
            lowestDiscernibleValue: this.options.lowestDiscernibleValue,
            highestTrackableValue: this.options.highestTrackableValue,
            numberOfSignificantValueDigits: this.options.numberOfSignificantValueDigits,
            useWebAssembly: false
        });
    }

    assertMetric(metric) {
        if (!this.histograms.has(metric)) {
            throw new Error(`Unknown benchmark metric: ${metric}`);
        }
    }

    getDefinition(metric) {
        this.assertMetric(metric);

        return Object.values(DEFINITIONS)
            .find(definition => definition.id === metric);
    }

    // ==========================================
    // Measurement
    // ==========================================

    start(metric) {
        this.assertMetric(metric);

        if (!this.isEnabled(metric) || this.isComplete(metric)) {
            return null;
        }

        return process.hrtime.bigint();
    }

    result(metric, startNs) {
        this.assertMetric(metric);

        if (
            !this.isEnabled(metric) ||
            this.isComplete(metric) ||
            startNs === null ||
            startNs === undefined
        ) {
            return null;
        }

        const histogram = this.histograms.get(metric);

        const durationNs = Number(
            process.hrtime.bigint() - startNs
        );

        histogram.recordValue(
            Math.max(1, Math.round(durationNs))
        );

        const completed = histogram.totalCount >= this.maxFrames;

        if (completed) {
            this.completed.set(metric, true);
        }

        return {
            metric,
            durationNs,
            completed,
            count: histogram.totalCount,
            summary: completed
                ? this.buildSummary(histogram)
                : null
        };
    }

    // ==========================================
    // Summary
    // ==========================================

    buildSummary(histogram) {
        if (!histogram || histogram.totalCount === 0) {
            return null;
        }

        return {
            count: histogram.totalCount,
            min: histogram.minNonZeroValue,
            mean: histogram.mean,
            p50: histogram.getValueAtPercentile(50),
            p90: histogram.getValueAtPercentile(90),
            p95: histogram.getValueAtPercentile(95),
            p99: histogram.getValueAtPercentile(99),
            p999: histogram.getValueAtPercentile(99.9),
            max: histogram.maxValue
        };
    }

    summary(metric) {
        this.assertMetric(metric);
        return this.buildSummary(this.histograms.get(metric));
    }

    metricSnapshot(metric) {
        const definition = this.getDefinition(metric);

        return {
            metric,
            enabled: this.isEnabled(metric),
            completed: this.isComplete(metric),
            maxFrames: this.maxFrames,
            start: definition.start,
            end: definition.end,
            description: definition.description,
            unit: "ns",
            summary: this.summary(metric)
        };
    }

    snapshot() {
        const metrics = {};

        for (const definition of Object.values(DEFINITIONS)) {
            metrics[definition.id] = this.metricSnapshot(definition.id);
        }

        return {
            maxFrames: this.maxFrames,

            configuration: {
                unit: "ns",
                lowestDiscernibleValue: this.options.lowestDiscernibleValue,
                highestTrackableValue: this.options.highestTrackableValue,
                numberOfSignificantValueDigits: this.options.numberOfSignificantValueDigits
            },

            metrics
        };
    }

    // ==========================================
    // Reset
    // ==========================================

    reset(metric = null) {
        if (metric !== null) {
            this.assertMetric(metric);
            this.histograms.get(metric).reset();
            this.completed.set(metric, false);
            return;
        }

        for (const [id, histogram] of this.histograms.entries()) {
            histogram.reset();
            this.completed.set(id, false);
        }
    }

    // ==========================================
    // Enabled / Complete
    // ==========================================

    setEnabled(metric, enabled) {
        this.assertMetric(metric);
        this.enabled.set(metric, Boolean(enabled));
    }

    isEnabled(metric) {
        this.assertMetric(metric);
        return this.enabled.get(metric);
    }

    isComplete(metric) {
        this.assertMetric(metric);
        return this.completed.get(metric);
    }
}

module.exports = Benchmark;