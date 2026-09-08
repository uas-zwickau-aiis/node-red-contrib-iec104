import c104
import json
import time
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


print(
    f"Verbunden mit {IP}:{PORT}"
)

print(
    f"Sollrate: {RATE:.0f} msg/s"
)


period = 1.0 / RATE

ok_count = 0
failed_count = 0

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
        else:
            failed_count += 1

        # Kein Nachholen verlorener Sendezeit
        next_send = max(
            next_send + period,
            time.perf_counter()
        )

        now = time.perf_counter()

        if now - second_start >= 1.0:

            duration = (
                now - second_start
            )

            print(
                f"TX={ok_count / duration:.1f}/s "
                f"failed={failed_count}"
            )

            ok_count = 0
            failed_count = 0
            second_start = now


except KeyboardInterrupt:
    pass


finally:
    client.stop()