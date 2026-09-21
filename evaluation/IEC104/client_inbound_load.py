import c104
import json
import time
import csv
from pathlib import Path


CONFIG_FILE = Path(__file__).with_suffix(".json")


with open(CONFIG_FILE, "r", encoding="utf-8") as f:
    config = json.load(f)


load = config["load_generator"]

connection_cfg = next(
    c for c in config["connections"]
    if c["name"] == load["connection"]
)


RATE = float(load["messages_per_second"])
CA = int(load["ca"])
IOA = int(load["ioa"])
VALUE = bool(load["value"])

IP = connection_cfg["ip"]
PORT = int(connection_cfg["port"])


client = c104.Client(
    tick_rate_ms=50,
    command_timeout_ms=1000
)

connection = client.add_connection(
    ip=IP,
    port=PORT,
    init=c104.Init.NONE
)

connection.protocol_parameters.send_window_size = int(connection_cfg.get("k", 12))
connection.protocol_parameters.receive_window_size = int(connection_cfg.get("w", 8))

station = connection.add_station(
    common_address=CA
)

point = station.add_point(
    io_address=IOA,
    type=c104.Type.C_SC_NA_1,
    command_mode=c104.CommandMode.DIRECT
)

point.info = c104.SingleCmd(
    on=VALUE,
    qualifier=c104.Qoc.NONE
)


client.start()
connection.connect()


while (
    connection.state !=
    c104.ConnectionState.OPEN
):
    time.sleep(0.01)


LOG_DIR = Path(__file__).parent / "logs"
LOG_DIR.mkdir(parents=True, exist_ok=True)
run_stamp = time.strftime("%Y%m%d_%H%M%S")
log_path = LOG_DIR / f"client_load_{run_stamp}.csv"

log_file = open(log_path, "w", newline="", encoding="utf-8", buffering=256 * 1024)
writer = csv.writer(log_file)
writer.writerow([
    "timestamp_ms", "target_rate", "actual_rate",
    "interval_success", "interval_failed",
    "total_success", "total_failed"
])

period = 1.0 / RATE
status_interval = max(float(load.get("status_interval_ms", 1000)) / 1000.0, 0.001)

ok_count = 0
failed_count = 0
total_ok = 0
total_failed = 0

second_start = time.perf_counter()
next_send = second_start


try:

    while True:

        now = time.perf_counter()

        if now < next_send:
            time.sleep(next_send - now)

        ok = point.transmit(
            cause=c104.Cot.ACTIVATION
        )

        if ok:
            ok_count += 1
            total_ok += 1
        else:
            failed_count += 1
            total_failed += 1

        # Kein Nachholen verlorener Sendezeit
        next_send = max(
            next_send + period,
            time.perf_counter()
        )

        now = time.perf_counter()

        if now - second_start >= status_interval:

            duration = now - second_start

            writer.writerow([
                int(time.time() * 1000),
                f"{RATE:.6f}",
                f"{ok_count / duration:.6f}",
                ok_count,
                failed_count,
                total_ok,
                total_failed
            ])

            ok_count = 0
            failed_count = 0
            second_start = now


except KeyboardInterrupt:
    pass


finally:
    try:
        log_file.flush()
        log_file.close()
    finally:
        client.stop()