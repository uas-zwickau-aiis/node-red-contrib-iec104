const hdr = require("hdr-histogram-js");
const DEFINITIONS = require("./benchmarkDefinitions");

const PHASE = Object.freeze({
    IDLE: "idle",
    WARMUP: "warmup",
    MEASUREMENT: "measurement",
    FINISHED: "finished"
});


class Benchmark {
    constructor(options = {}) {
        const warmupWindowSize =
            Number(options.warmupWindowSize);

        const warmupTolerance =
            Number(options.warmupTolerance);

        const measurementDurationMs =
            Number(options.measurementDurationMs);

        this.options = {
            lowestDiscernibleValue:
                options.lowestDiscernibleValue ?? 1,

            highestTrackableValue:
                options.highestTrackableValue ??
                10_000_000_000,

            numberOfSignificantValueDigits:
                options.numberOfSignificantValueDigits ?? 3,

            warmupWindowSize:
                Number.isFinite(warmupWindowSize) &&
                warmupWindowSize >= 2
                    ? Math.floor(warmupWindowSize)
                    : 10,

            warmupTolerance:
                Number.isFinite(warmupTolerance) &&
                warmupTolerance >= 0
                    ? warmupTolerance
                    : 0.05,

            measurementDurationMs:
                Number.isFinite(measurementDurationMs) &&
                measurementDurationMs > 0
                    ? measurementDurationMs
                    : 120_000
        };

        this.histograms =
            new Map();

        this.throughput =
            new Map();

        this.enabled =
            new Map();

        for (
            const definition
            of Object.values(DEFINITIONS)
        ) {
            this.histograms.set(
                definition.id,
                this.createHistogram()
            );

            this.throughput.set(
                definition.id,
                this.createThroughputState()
            );

            this.enabled.set(
                definition.id,
                false
            );
        }

        this.phase =
            PHASE.IDLE;

        this.runId =
            0;

        this.run =
            this.createRunState();

        this.warmup =
            this.createWarmupState();

        this.measurement =
            this.createMeasurementState();

        this.outboundBacklog =
            this.createOutboundBacklogState();
    }


    // ==========================================
    // Metric helpers
    // ==========================================

    assertMetric(metric) {
        if (
            !this.histograms.has(metric)
        ) {
            throw new Error(
                `Unknown benchmark metric: ${metric}`
            );
        }
    }


    getDefinition(metric) {
        this.assertMetric(metric);

        return Object.values(
            DEFINITIONS
        ).find(
            definition =>
                definition.id === metric
        );
    }


    enabledMetricIds() {
        return Object.values(
            DEFINITIONS
        )
            .filter(
                definition =>
                    this.isEnabled(
                        definition.id
                    )
            )
            .map(
                definition =>
                    definition.id
            );
    }


    hasEnabledMetrics() {
        return (
            this.enabledMetricIds()
                .length > 0
        );
    }


    isActive() {
        return (
            this.phase === PHASE.WARMUP ||
            this.phase === PHASE.MEASUREMENT
        );
    }


    // ==========================================
    // State factories
    // ==========================================

    createRunState() {
        return {
            startedAt: null,
            completedAt: null
        };
    }


    createWarmupState() {
        const samples =
            new Map();

        for (
            const definition
            of Object.values(DEFINITIONS)
        ) {
            samples.set(
                definition.id,
                []
            );
        }

        return {
            startedAt: null,
            completedAt: null,
            durationMs: null,
            samples
        };
    }


    createMeasurementState() {
        return {
            startedAt: null,
            completedAt: null,
            durationMs: null
        };
    }


    createThroughputState() {
        return {
            inputCount: 0,
            outputCount: 0,
            intervalStartMs: null,
            samples: []
        };
    }


    createOutboundBacklogState() {
        return {
            samples: []
        };
    }


    // ==========================================
    // Histogram
    // ==========================================

    createHistogram() {
        return hdr.build({
            bitBucketSize: 32,
            autoResize: true,

            lowestDiscernibleValue:
                this.options
                    .lowestDiscernibleValue,

            highestTrackableValue:
                this.options
                    .highestTrackableValue,

            numberOfSignificantValueDigits:
                this.options
                    .numberOfSignificantValueDigits,

            useWebAssembly: false
        });
    }


    // ==========================================
    // Benchmark lifecycle
    // ==========================================

    startRun(
        nowMs = Date.now()
    ) {
        if (
            this.isActive()
        ) {
            throw new Error(
                `Benchmark already running (${this.phase})`
            );
        }

        if (
            !this.hasEnabledMetrics()
        ) {
            throw new Error(
                "No benchmark metric is enabled"
            );
        }

        this.reset();

        this.runId += 1;

        this.phase =
            PHASE.WARMUP;

        this.run.startedAt =
            nowMs;

        this.warmup.startedAt =
            nowMs;

        for (
            const metric
            of this.enabledMetricIds()
        ) {
            this.throughput
                .get(metric)
                .intervalStartMs =
                    nowMs;
        }

        return this.status(
            nowMs
        );
    }


    startMeasurement(nowMs) {
        this.warmup.completedAt =
            nowMs;

        this.warmup.durationMs =
            nowMs -
            this.warmup.startedAt;

        /*
         * Nur die eigentlichen Messdaten
         * werden zurückgesetzt.
         *
         * Die Warm-up-Daten bleiben erhalten
         * und werden später zusammen mit den
         * Messergebnissen ausgegeben.
         */
        this.resetMeasurementData(
            nowMs
        );

        this.phase =
            PHASE.MEASUREMENT;

        this.measurement.startedAt =
            nowMs;

        this.measurement.completedAt =
            null;

        this.measurement.durationMs =
            null;
    }


    finishMeasurement(nowMs) {
        this.phase =
            PHASE.FINISHED;

        this.measurement.completedAt =
            nowMs;

        this.measurement.durationMs =
            nowMs -
            this.measurement.startedAt;

        this.run.completedAt =
            nowMs;
    }


    resetMeasurementData(
        intervalStartMs = null
    ) {
        for (
            const [id, histogram]
            of this.histograms.entries()
        ) {
            histogram.reset();

            const state =
                this.createThroughputState();

            if (
                this.isEnabled(id)
            ) {
                state.intervalStartMs =
                    intervalStartMs;
            }

            this.throughput.set(
                id,
                state
            );
        }

        this.outboundBacklog =
            this.createOutboundBacklogState();
    }


    reset() {
        this.phase =
            PHASE.IDLE;

        this.run =
            this.createRunState();

        this.warmup =
            this.createWarmupState();

        this.measurement =
            this.createMeasurementState();

        this.resetMeasurementData();
    }


    // ==========================================
    // Measurement context
    // ==========================================

    start(metric) {
        this.assertMetric(metric);

        if (
            !this.isEnabled(metric) ||
            !this.isActive()
        ) {
            return null;
        }

        return {
            runId:
                this.runId,

            phase:
                this.phase,

            startedNs:
                process.hrtime.bigint()
        };
    }


    isContextCurrent(context) {
        return (
            context &&
            context.runId ===
                this.runId &&
            context.phase ===
                this.phase
        );
    }


    // ==========================================
    // Latency
    // ==========================================

    result(
        metric,
        context
    ) {
        this.assertMetric(metric);

        if (
            !this.isEnabled(metric) ||
            !context ||
            typeof context.startedNs !==
                "bigint"
        ) {
            return null;
        }

        const durationNs =
            Number(
                process.hrtime.bigint() -
                context.startedNs
            );

        /*
         * Ein Vorgang wird nur aufgezeichnet,
         * wenn er innerhalb derselben
         * MEASUREMENT-Phase begonnen und
         * beendet wurde.
         */
        if (
            this.phase !==
                PHASE.MEASUREMENT ||
            !this.isContextCurrent(
                context
            )
        ) {
            return {
                metric,
                durationNs,
                recorded: false
            };
        }

        const histogram =
            this.histograms.get(
                metric
            );

        histogram.recordValue(
            Math.max(
                1,
                Math.round(
                    durationNs
                )
            )
        );

        return {
            metric,
            durationNs,
            recorded: true,

            count:
                histogram.totalCount
        };
    }


    buildLatencySummary(
        histogram
    ) {
        if (
            !histogram ||
            histogram.totalCount === 0
        ) {
            return null;
        }

        return {
            count:
                histogram.totalCount,

            min:
                histogram.minNonZeroValue,

            mean:
                histogram.mean,

            p50:
                histogram
                    .getValueAtPercentile(
                        50
                    ),

            p90:
                histogram
                    .getValueAtPercentile(
                        90
                    ),

            p95:
                histogram
                    .getValueAtPercentile(
                        95
                    ),

            p99:
                histogram
                    .getValueAtPercentile(
                        99
                    ),

            p999:
                histogram
                    .getValueAtPercentile(
                        99.9
                    ),

            max:
                histogram.maxValue
        };
    }


    latencySummary(metric) {
        this.assertMetric(metric);

        return this
            .buildLatencySummary(
                this.histograms.get(
                    metric
                )
            );
    }


    // ==========================================
    // Throughput recording
    // ==========================================

    normalizeCount(count) {
        const value =
            Number(count);

        if (
            !Number.isFinite(value) ||
            value <= 0
        ) {
            return 0;
        }

        return value;
    }


    recordInput(
        metric,
        count = 1,
        context = null
    ) {
        this.assertMetric(metric);

        if (
            !this.isEnabled(metric) ||
            !this.isActive()
        ) {
            return false;
        }

        if (
            context !== null &&
            !this.isContextCurrent(
                context
            )
        ) {
            return false;
        }

        const state =
            this.throughput.get(
                metric
            );

        if (
            state.intervalStartMs ===
            null
        ) {
            state.intervalStartMs =
                Date.now();
        }

        state.inputCount +=
            this.normalizeCount(
                count
            );

        return true;
    }


    recordOutput(
        metric,
        count = 1,
        context = null
    ) {
        this.assertMetric(metric);

        if (
            !this.isEnabled(metric) ||
            !this.isActive()
        ) {
            return false;
        }

        if (
            context !== null &&
            !this.isContextCurrent(
                context
            )
        ) {
            return false;
        }

        const state =
            this.throughput.get(
                metric
            );

        if (
            state.intervalStartMs ===
            null
        ) {
            state.intervalStartMs =
                Date.now();
        }

        state.outputCount +=
            this.normalizeCount(
                count
            );

        return true;
    }


    // ==========================================
    // Throughput sampling
    // ==========================================

    sampleThroughput(
        metric,
        nowMs = Date.now()
    ) {
        this.assertMetric(metric);

        if (
            !this.isEnabled(metric) ||
            !this.isActive()
        ) {
            return null;
        }

        const state =
            this.throughput.get(
                metric
            );

        if (
            state.intervalStartMs ===
            null
        ) {
            state.intervalStartMs =
                nowMs;

            return null;
        }

        const durationMs =
            nowMs -
            state.intervalStartMs;

        if (
            durationMs <= 0
        ) {
            return null;
        }

        const durationSeconds =
            durationMs / 1000;

        const sample = {
            startMs:
                state.intervalStartMs,

            endMs:
                nowMs,

            durationMs,

            inputCount:
                state.inputCount,

            outputCount:
                state.outputCount,

            inputRate:
                state.inputCount /
                durationSeconds,

            outputRate:
                state.outputCount /
                durationSeconds
        };

        state.inputCount = 0;
        state.outputCount = 0;

        state.intervalStartMs =
            nowMs;

        if (
            this.phase ===
            PHASE.WARMUP
        ) {
            this.warmup.samples
                .get(metric)
                .push(sample);
        } else if (
            this.phase ===
            PHASE.MEASUREMENT
        ) {
            state.samples.push(
                sample
            );
        }

        return sample;
    }


    // ==========================================
    // Outbound backlog sampling
    // ==========================================

    sampleOutboundBacklog(
        state,
        nowMs = Date.now()
    ) {
        /*
         * Backlog wird ausschließlich während
         * der eigentlichen Messphase erfasst.
         *
         * Warm-up-Werte beeinflussen die
         * Queue-Auswertung damit nicht.
         */
        if (
            this.phase !==
                PHASE.MEASUREMENT ||
            !state
        ) {
            return null;
        }

        const queueLength =
            Number(
                state.queueLength
            );

        const unconfirmedCount =
            Number(
                state.unconfirmedCount
            );

        if (
            !Number.isFinite(queueLength) ||
            !Number.isFinite(unconfirmedCount)
        ) {
            return null;
        }

        const sample = {
            timestampMs:
                nowMs,

            queueLength:
                Math.max(
                    0,
                    queueLength
                ),

            unconfirmedCount:
                Math.max(
                    0,
                    unconfirmedCount
                )
        };

        this.outboundBacklog
            .samples
            .push(sample);

        return sample;
    }


    // ==========================================
    // Generic value statistics
    // ==========================================

    calculateValueSummary(values) {
        if (
            !Array.isArray(values) ||
            values.length === 0
        ) {
            return null;
        }

        const sorted =
            [...values].sort(
                (a, b) =>
                    a - b
            );

        const percentile =
            p => {
                const index =
                    Math.min(
                        sorted.length - 1,

                        Math.max(
                            0,

                            Math.ceil(
                                p / 100 *
                                sorted.length
                            ) - 1
                        )
                    );

                return sorted[index];
            };

        const sum =
            values.reduce(
                (total, value) =>
                    total + value,
                0
            );

        return {
            min:
                sorted[0],

            mean:
                sum /
                values.length,

            p50:
                percentile(50),

            p95:
                percentile(95),

            p99:
                percentile(99),

            max:
                sorted[
                    sorted.length - 1
                ]
        };
    }


    // ==========================================
    // Linear queue growth
    // ==========================================

    calculateLinearGrowthRate(
        samples,
        valueKey
    ) {
        if (
            !Array.isArray(samples) ||
            samples.length < 2
        ) {
            return null;
        }

        /*
         * Zeit wird relativ zum ersten Sample
         * und in Sekunden betrachtet.
         *
         * Ergebnis:
         * Einheiten pro Sekunde.
         */
        const t0 =
            samples[0]
                .timestampMs;

        const points =
            samples.map(
                sample => ({
                    x:
                        (
                            sample.timestampMs -
                            t0
                        ) / 1000,

                    y:
                        Number(
                            sample[valueKey]
                        )
                })
            );

        const n =
            points.length;

        const meanX =
            points.reduce(
                (sum, point) =>
                    sum + point.x,
                0
            ) / n;

        const meanY =
            points.reduce(
                (sum, point) =>
                    sum + point.y,
                0
            ) / n;

        let numerator =
            0;

        let denominator =
            0;

        for (
            const point
            of points
        ) {
            const dx =
                point.x -
                meanX;

            numerator +=
                dx *
                (
                    point.y -
                    meanY
                );

            denominator +=
                dx * dx;
        }

        return denominator > 0
            ? numerator /
              denominator
            : 0;
    }


    // ==========================================
    // Outbound backlog summary
    // ==========================================

    outboundBacklogSummary() {
        const samples =
            this.outboundBacklog
                .samples;

        if (
            !Array.isArray(samples) ||
            samples.length === 0
        ) {
            return null;
        }

        const queueLengths =
            samples.map(
                sample =>
                    sample.queueLength
            );

        const unconfirmedCounts =
            samples.map(
                sample =>
                    sample.unconfirmedCount
            );

        return {
            sampleCount:
                samples.length,

            startQueueLength:
                samples[0]
                    .queueLength,

            endQueueLength:
                samples[
                    samples.length - 1
                ].queueLength,

            /*
             * Lineare Regressionssteigung der
             * Queue-Länge.
             *
             * Einheit:
             * messages / second
             *
             * ~0:
             * kein langfristiger Aufbau
             *
             * >0:
             * Queue wächst langfristig
             */
            queueGrowthRate:
                this.calculateLinearGrowthRate(
                    samples,
                    "queueLength"
                ),

            queueLength:
                this.calculateValueSummary(
                    queueLengths
                ),

            unconfirmedCount:
                this.calculateValueSummary(
                    unconfirmedCounts
                )
        };
    }


    // ==========================================
    // Periodic benchmark tick
    // ==========================================

    tick(
        nowMs = Date.now(),
        runtimeState = null
    ) {
        if (
            !this.isActive()
        ) {
            return {
                phase:
                    this.phase,

                transition:
                    null,

                finished:
                    false,

                samples:
                    {}
            };
        }

        const samples =
            {};

        /*
         * Die Methode selbst stellt sicher,
         * dass Backlog-Samples ausschließlich
         * während MEASUREMENT gespeichert werden.
         */
        this.sampleOutboundBacklog(
            runtimeState
                ?.outboundBacklog,
            nowMs
        );

        for (
            const metric
            of this.enabledMetricIds()
        ) {
            const sample =
                this.sampleThroughput(
                    metric,
                    nowMs
                );

            if (
                sample !== null
            ) {
                samples[metric] =
                    sample;
            }
        }


        // ======================================
        // Warm-up
        // ======================================

        if (
            this.phase ===
            PHASE.WARMUP
        ) {
            if (
                this.isWarmupStable()
            ) {
                this.startMeasurement(
                    nowMs
                );

                return {
                    phase:
                        this.phase,

                    transition:
                        PHASE.MEASUREMENT,

                    finished:
                        false,

                    samples
                };
            }

            return {
                phase:
                    this.phase,

                transition:
                    null,

                finished:
                    false,

                samples
            };
        }


        // ======================================
        // Measurement
        // ======================================

        if (
            this.phase ===
                PHASE.MEASUREMENT &&
            nowMs -
                this.measurement
                    .startedAt >=
                this.options
                    .measurementDurationMs
        ) {
            this.finishMeasurement(
                nowMs
            );

            return {
                phase:
                    this.phase,

                transition:
                    PHASE.FINISHED,

                finished:
                    true,

                samples,

                snapshot:
                    this.snapshot()
            };
        }

        return {
            phase:
                this.phase,

            transition:
                null,

            finished:
                false,

            samples
        };
    }


    // ==========================================
    // Warm-up
    // ==========================================

    isWarmupStable() {
        const metrics =
            this.enabledMetricIds();

        if (
            metrics.length === 0
        ) {
            return false;
        }

        for (
            const metric
            of metrics
        ) {
            const samples =
                this.warmup.samples
                    .get(metric);

            if (
                samples.length <
                this.options
                    .warmupWindowSize
            ) {
                return false;
            }

            const rates =
                samples
                    .slice(
                        -this.options
                            .warmupWindowSize
                    )
                    .map(
                        sample =>
                            sample.outputRate
                    );

            const stats =
                this.calculateRateStatistics(
                    rates
                );

            /*
             * Eine stabile Nullrate beendet
             * das Warm-up nicht.
             */
            if (
                !stats ||
                stats.mean <= 0 ||
                stats.relativeRange >
                    this.options
                        .warmupTolerance
            ) {
                return false;
            }
        }

        return true;
    }


    calculateRateStatistics(
        values
    ) {
        if (
            !Array.isArray(values) ||
            values.length === 0
        ) {
            return null;
        }

        const min =
            Math.min(...values);

        const max =
            Math.max(...values);

        const mean =
            values.reduce(
                (sum, value) =>
                    sum + value,
                0
            ) /
            values.length;

        const variance =
            values.reduce(
                (sum, value) => {
                    const delta =
                        value - mean;

                    return (
                        sum +
                        delta * delta
                    );
                },
                0
            ) /
            values.length;

        const standardDeviation =
            Math.sqrt(
                variance
            );

        return {
            count:
                values.length,

            min,
            max,
            mean,

            range:
                max - min,

            relativeRange:
                mean > 0
                    ? (max - min) /
                      mean
                    : null,

            standardDeviation,

            relativeStdDev:
                mean > 0
                    ? standardDeviation /
                      mean
                    : null
        };
    }


    warmupSummary() {
        const metrics =
            {};

        for (
            const metric
            of this.enabledMetricIds()
        ) {
            const samples =
                this.warmup.samples
                    .get(metric);

            const rates =
                samples.map(
                    sample =>
                        sample.outputRate
                );

            const finalRates =
                rates.slice(
                    -this.options
                        .warmupWindowSize
                );

            metrics[metric] = {
                sampleCount:
                    samples.length,

                statistics:
                    this
                        .calculateRateStatistics(
                            rates
                        ),

                finalWindow: {
                    size:
                        finalRates.length,

                    rates:
                        finalRates,

                    statistics:
                        this
                            .calculateRateStatistics(
                                finalRates
                            )
                },

                samples: [
                    ...samples
                ]
            };
        }

        return {
            startedAt:
                this.warmup
                    .startedAt,

            completedAt:
                this.warmup
                    .completedAt,

            durationMs:
                this.warmup
                    .durationMs,

            windowSize:
                this.options
                    .warmupWindowSize,

            tolerance:
                this.options
                    .warmupTolerance,

            metrics
        };
    }


    // ==========================================
    // Throughput summary
    // ==========================================

    throughputSamples(metric) {
        this.assertMetric(metric);

        return [
            ...this.throughput
                .get(metric)
                .samples
        ];
    }


    throughputSummary(metric) {
        this.assertMetric(metric);

        const samples =
            this.throughput
                .get(metric)
                .samples;

        if (
            samples.length === 0
        ) {
            return null;
        }

        const totalDurationMs =
            samples.reduce(
                (sum, sample) =>
                    sum +
                    sample.durationMs,
                0
            );

        const totalInput =
            samples.reduce(
                (sum, sample) =>
                    sum +
                    sample.inputCount,
                0
            );

        const totalOutput =
            samples.reduce(
                (sum, sample) =>
                    sum +
                    sample.outputCount,
                0
            );

        const durationSeconds =
            totalDurationMs /
            1000;

        return {
            sampleCount:
                samples.length,

            durationMs:
                totalDurationMs,

            totalInput,
            totalOutput,

            inputRate:
                durationSeconds > 0
                    ? totalInput /
                      durationSeconds
                    : 0,

            outputRate:
                durationSeconds > 0
                    ? totalOutput /
                      durationSeconds
                    : 0
        };
    }


    // ==========================================
    // Snapshot
    // ==========================================

    metricSnapshot(metric) {
        const definition =
            this.getDefinition(
                metric
            );

        return {
            metric,

            enabled:
                this.isEnabled(
                    metric
                ),

            start:
                definition.start,

            end:
                definition.end,

            description:
                definition.description,

            latency: {
                unit:
                    "ns",

                summary:
                    this.latencySummary(
                        metric
                    )
            },

            throughput: {
                unit:
                    "1/s",

                summary:
                    this
                        .throughputSummary(
                            metric
                        ),

                samples:
                    this
                        .throughputSamples(
                            metric
                        )
            }
        };
    }


    snapshot() {
        const metrics =
            {};

        for (
            const metric
            of this.enabledMetricIds()
        ) {
            metrics[metric] =
                this.metricSnapshot(
                    metric
                );
        }

        return {
            runId:
                this.runId,

            phase:
                this.phase,

            configuration: {
                latencyUnit:
                    "ns",

                throughputUnit:
                    "1/s",

                warmupWindowSize:
                    this.options
                        .warmupWindowSize,

                warmupTolerance:
                    this.options
                        .warmupTolerance,

                measurementDurationMs:
                    this.options
                        .measurementDurationMs,

                lowestDiscernibleValue:
                    this.options
                        .lowestDiscernibleValue,

                highestTrackableValue:
                    this.options
                        .highestTrackableValue,

                numberOfSignificantValueDigits:
                    this.options
                        .numberOfSignificantValueDigits
            },

            run: {
                startedAt:
                    this.run
                        .startedAt,

                completedAt:
                    this.run
                        .completedAt
            },

            warmup:
                this.warmupSummary(),

            measurement: {
                startedAt:
                    this.measurement
                        .startedAt,

                completedAt:
                    this.measurement
                        .completedAt,

                durationMs:
                    this.measurement
                        .durationMs,

                configuredDurationMs:
                    this.options
                        .measurementDurationMs
            },

            /*
             * Outbound-Backlog wird bewusst
             * separat von den Benchmark-Metriken
             * ausgegeben.
             *
             * Er beschreibt den internen Zustand
             * des IEC-104-Sendepfades.
             */
            outboundBacklog: {
                unit:
                    "messages",

                sampleIntervalMs:
                    1000,

                summary:
                    this
                        .outboundBacklogSummary()
            },

            metrics
        };
    }


    status(
        nowMs = Date.now()
    ) {
        return {
            runId:
                this.runId,

            phase:
                this.phase,

            enabledMetrics:
                this.enabledMetricIds(),

            warmup: {
                startedAt:
                    this.warmup
                        .startedAt,

                completedAt:
                    this.warmup
                        .completedAt,

                elapsedMs:
                    this.phase ===
                        PHASE.WARMUP &&
                    this.warmup
                        .startedAt !==
                        null
                        ? nowMs -
                          this.warmup
                              .startedAt
                        : this.warmup
                            .durationMs,

                windowSize:
                    this.options
                        .warmupWindowSize,

                tolerance:
                    this.options
                        .warmupTolerance
            },

            measurement: {
                startedAt:
                    this.measurement
                        .startedAt,

                completedAt:
                    this.measurement
                        .completedAt,

                elapsedMs:
                    this.phase ===
                        PHASE.MEASUREMENT &&
                    this.measurement
                        .startedAt !==
                        null
                        ? nowMs -
                          this.measurement
                              .startedAt
                        : this.measurement
                            .durationMs,

                configuredDurationMs:
                    this.options
                        .measurementDurationMs
            }
        };
    }


    // ==========================================
    // Enabled / phase
    // ==========================================

    setEnabled(
        metric,
        enabled
    ) {
        this.assertMetric(metric);

        if (
            this.isActive()
        ) {
            throw new Error(
                "Benchmark metrics cannot be changed while a run is active"
            );
        }

        this.enabled.set(
            metric,
            Boolean(enabled)
        );
    }


    isEnabled(metric) {
        this.assertMetric(metric);

        return this.enabled.get(
            metric
        );
    }

    getPhase() { return this.phase; }
    isIdle() { return (this.phase === PHASE.IDLE); }
    isWarmup() { return (this.phase === PHASE.WARMUP); }
    isMeasuring() { return (this.phase === PHASE.MEASUREMENT); }
    isFinished() { return (this.phase === PHASE.FINISHED); }
}


Benchmark.PHASE =
    PHASE;

module.exports =
    Benchmark;