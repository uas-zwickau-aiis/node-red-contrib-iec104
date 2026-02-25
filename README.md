# node-red-contrib-iec104

Node-RED nodes for **IEC 60870-5-104** (IEC 104) communication. This package implements a virtual RTU (controlled station / server) that lets you expose process data from a Node-RED flow to any IEC 104 SCADA master.

## Features

- **Gateway node** — TCP server that manages an IEC 104 session (STARTDT/STOPDT, General Interrogation, spontaneous updates).
- **Single Point** — format boolean values as Single Point Information (`M_SP_NA_1` / `M_SP_TA_1` / `M_SP_TB_1`).
- **Double Point** — format 2-bit state values as Double Point Information (`M_DP_NA_1` / `M_DP_TA_1` / `M_DP_TB_1`).
- **Measured Value** — format numeric values as Measured Value (`M_ME_NA_1`, `M_ME_NC_1`, and timestamped variants) with hysteresis filtering and normalisation support.

## Installation

Install via the Node-RED **Manage Palette** UI, or from your Node-RED user directory:

```bash
npm install node-red-contrib-iec104
```

Then restart Node-RED.

## Quick Start

1. Drag an **iec104-gateway** node onto the canvas and configure the TCP port and Common Address (CA).
2. Add one or more data point nodes (**iec104-singlepoint**, **iec104-doublepoint**, or **iec104-measuredvalue**) and wire their outputs into the gateway.
3. Feed your process values into the data point nodes via `msg.payload`.
4. Connect your SCADA master to the configured TCP port.

## Nodes

### iec104-gateway

Opens a TCP listener and manages a single IEC 104 session. Maintains a process image of all data points and responds to General Interrogation.

| Config | Description |
|---|---|
| Port | TCP listen port |
| Common Address | IEC 104 Common Address |

**Outputs:** data frames (output 1), connection status (output 2).

### iec104-singlepoint

Converts a boolean `msg.payload` into a Single Point Information ASDU.

| Config | Description |
|---|---|
| IOA | Information Object Address |
| Type | ASDU type (with/without timestamp) |
| Quality | Default quality flags (can be overridden via `msg.quality`) |

### iec104-doublepoint

Converts an integer `msg.payload` (0–3) into a Double Point Information ASDU.

| Config | Description |
|---|---|
| IOA | Information Object Address |
| Type | ASDU type (with/without timestamp) |
| Quality | Default quality flags (can be overridden via `msg.quality`) |

### iec104-measuredvalue

Converts a numeric `msg.payload` into a Measured Value ASDU. Supports hysteresis filtering (absolute/percentage) and normalised value computation.

| Config | Description |
|---|---|
| IOA | Information Object Address |
| Type | ASDU type (normalized, short float, ± timestamp) |
| Hysteresis | Mode and threshold for suppressing unchanged values |
| Normalisation | Mode and range for normalised value types |
| Quality | Default quality flags (can be overridden via `msg.quality`) |

## Development

### Run locally with Docker

```bash
docker compose up --build
```

This starts a Node-RED instance on port 1880 with the package pre-installed.

### Test with a simulated SCADA master

```bash
python3 client.py
```

## License

[MIT](LICENSE)
