module.exports = function registerRoutes(RED) {
    if (RED.httpAdmin._iec104StatusRouteRegistered) { return; }

    RED.httpAdmin._iec104StatusRouteRegistered = true;

    // ==========================================
    // Helpers
    // ==========================================

    function getPayload(node) {
        return {
            state: node.currentState || "UNKNOWN",
            reason: node.currentReason || "",
            ts: node.currentTs || Date.now(),
            session: node.currentSession || node.session?.bundleStatistics?.() || null
        };
    }

    function getNode(req,res) {
        const node =
            RED.nodes.getNode(
                req.params.id
            );

        if (!node) {
            res.sendStatus(404);
            return null;
        }

        return node;
    }

    function getBenchmarkNode(
        req,
        res
    ) {
        const node =
            getNode(
                req,
                res
            );

        if (!node) {
            return null;
        }

        if (
            !node.benchmark
        ) {
            res.status(404)
                .json({
                    error:
                        "Benchmark not available"
                });

            return null;
        }

        return node;
    }

    // ==========================================
    // Status
    // ==========================================

    RED.httpAdmin.get(
        "/iec104/:id/status",
        (req, res) => {
            const node =
                getNode(
                    req,
                    res
                );

            if (!node) {
                return;
            }

            res.json(
                getPayload(node)
            );
        }
    );

    // ==========================================
    // Status Events
    // ==========================================

    RED.httpAdmin.get(
        "/iec104/:id/events",
        (req, res) => {
            const node =
                getNode(
                    req,
                    res
                );

            if (!node) {
                return;
            }

            res.setHeader(
                "Content-Type",
                "text/event-stream"
            );

            res.setHeader(
                "Cache-Control",
                "no-cache, no-transform"
            );

            res.setHeader(
                "Connection",
                "keep-alive"
            );

            if (
                typeof res.flushHeaders ===
                "function"
            ) {
                res.flushHeaders();
            }

            node.statusPub
                .addClient(res);

            res.write(
                "event: status\n"
            );

            res.write(
                `data: ${JSON.stringify(
                    getPayload(node)
                )}\n\n`
            );

            req.on(
                "close",
                () => {
                    node.statusPub
                        .removeClient(
                            res
                        );
                }
            );
        }
    );

    // ==========================================
    // Benchmark Snapshot
    // ==========================================

    RED.httpAdmin.get(
        "/iec104/:id/benchmark",
        (req, res) => {
            const node =
                getBenchmarkNode(
                    req,
                    res
                );

            if (!node) {
                return;
            }

            res.json(
                node.benchmark
                    .snapshot()
            );
        }
    );

    // ==========================================
    // Benchmark Status
    // ==========================================

    RED.httpAdmin.get(
        "/iec104/:id/benchmark/status",
        (req, res) => {
            const node =
                getBenchmarkNode(
                    req,
                    res
                );

            if (!node) {
                return;
            }

            res.json(
                node.benchmark
                    .status()
            );
        }
    );

    // ==========================================
    // Benchmark Start
    // ==========================================

    RED.httpAdmin.post(
        "/iec104/:id/benchmark/start",
        (req, res) => {
            const node =
                getBenchmarkNode(
                    req,
                    res
                );

            if (!node) {
                return;
            }

            try {
                const status =
                    node.benchmark
                        .startRun();

                node.emit(
                    "iec104:status",
                    {
                        topic:
                            "benchmark/state",

                        payload:
                            status,

                        ts:
                            Date.now()
                    }
                );

                res.json(
                    status
                );
            } catch (err) {
                res.status(409)
                    .json({
                        error:
                            err.message
                    });
            }
        }
    );

    // ==========================================
    // Benchmark Reset
    // ==========================================

    RED.httpAdmin.post(
        "/iec104/:id/benchmark/reset",
        (req, res) => {
            const node =
                getBenchmarkNode(
                    req,
                    res
                );

            if (!node) {
                return;
            }

            /*
             * Kein metrikspezifischer Reset mehr.
             *
             * Ein Reset beendet den aktuellen
             * Benchmark-Lauf vollständig und
             * setzt ihn zurück auf IDLE.
             */
            node.benchmark.reset();

            const status =
                node.benchmark
                    .status();

            node.emit(
                "iec104:status",
                {
                    topic:
                        "benchmark/state",

                    payload:
                        status,

                    ts:
                        Date.now()
                }
            );

            res.json({
                success: true,
                benchmark: status
            });
        }
    );

    // ==========================================
    // Benchmark Enable / Disable
    // ==========================================

    RED.httpAdmin.put(
        "/iec104/:id/benchmark/:metric/enabled",

        (req, res) => {
            const node =
                getBenchmarkNode(
                    req,
                    res
                );

            if (!node) {
                return;
            }

            const metric =
                req.params.metric;

            if (
                typeof req.body
                    ?.enabled !==
                "boolean"
            ) {
                return res
                    .status(400)
                    .json({
                        error:
                            "'enabled' must be boolean"
                    });
            }

            try {
                node.benchmark
                    .setEnabled(
                        metric,
                        req.body.enabled
                    );
            } catch (err) {
                return res
                    .status(400)
                    .json({
                        error:
                            err.message
                    });
            }

            res.json(
                node.benchmark
                    .snapshot()
            );
        }
    );
};