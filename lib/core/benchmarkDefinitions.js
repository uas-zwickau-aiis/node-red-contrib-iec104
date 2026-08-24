const BENCHMARK = Object.freeze({
    OUTBOUND: Object.freeze({
        id: "outbound",
        start: "node_red_input",
        end: "tcp_send",
        description: "Node-RED input event to TCP send"
    }),

    INBOUND_COMMAND: Object.freeze({
        id: "inbound_command",
        start: "complete_apdu_received",
        end: "command_handling_completed",
        description: "Complete IEC-104 command APDU received to command handling completed"
    })
});

module.exports = BENCHMARK;