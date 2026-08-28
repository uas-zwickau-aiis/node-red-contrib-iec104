import c104
import time
import threading
import json
import sys
import signal
from pathlib import Path


class IECManager:
    def __init__(self, config):
        self.config = config
        self.client = c104.Client()
        self.connections = {}
        self.running = False
        self.lock = threading.Lock()

        if config.get("debug", False):
            c104.set_debug_mode(c104.Debug.Connection | c104.Debug.Point)

    def add_connection(self, name, ip, port):
        with self.lock:
            if name in self.connections:
                raise ValueError(f"Connection '{name}' existiert bereits")

            conn = self.client.add_connection(
                ip=ip,
                port=int(port),
                init=c104.Init.INTERROGATION
            )

            def state_change(
                connection: c104.Connection,
                state: c104.ConnectionState
            ) -> None:
                print(f"[{name}] STATE: {state}")

                if state == c104.ConnectionState.OPEN_MUTED:
                    def watchdog():
                        time.sleep(10)
                        if connection.state == c104.ConnectionState.OPEN_MUTED:
                            print(f"[{name}] STARTDT Timeout → reconnect")
                            connection.disconnect()

                    threading.Thread(
                        target=watchdog,
                        daemon=True
                    ).start()

                if state == c104.ConnectionState.CLOSED and self.running:
                    print(f"[{name}] reconnect")
                    connection.connect()

            conn.on_state_change(state_change)

            self.connections[name] = {
                "connection": conn,
                "stations": {}
            }

    def add_station(self, conn_name, ca):
        with self.lock:
            ca = int(ca)
            conn_data = self.connections[conn_name]

            if ca in conn_data["stations"]:
                raise ValueError(
                    f"Station CA {ca} existiert in '{conn_name}' bereits"
                )

            station = conn_data["connection"].add_station(
                common_address=ca
            )

            conn_data["stations"][ca] = {
                "station": station,
                "points": {}
            }

    def add_point(self, conn_name, ca, ioa, type_name):
        with self.lock:
            ca = int(ca)
            ioa = int(ioa)

            if not hasattr(c104.Type, type_name):
                raise ValueError(
                    f"Ungültiger IEC-104 Typ: {type_name}"
                )

            station_data = self.connections[conn_name]["stations"][ca]
            station = station_data["station"]

            if ioa in station_data["points"]:
                raise ValueError(
                    f"IOA {ioa} existiert in Connection "
                    f"'{conn_name}', CA {ca} bereits"
                )

            point = station.add_point(
                io_address=ioa,
                type=getattr(c104.Type, type_name)
            )

            def on_receive(
                point: c104.Point,
                previous_info: c104.Information,
                message: c104.IncomingMessage
            ) -> c104.ResponseState:

                payload = {
                    "connection": conn_name,
                    "asdu": point.station.common_address,
                    "ioa": point.io_address,
                    "type": type_name,
                    "value": point.value,
                    "cot": int(message.cot),
                    "timestamp": time.time()
                }

                print("RX:", payload)

                return c104.ResponseState.SUCCESS

            point.on_receive(on_receive)
            station_data["points"][ioa] = point

    def load_from_config(self):
        for conn_cfg in self.config.get("connections", []):
            name = conn_cfg["name"]

            print(f"Konfiguriere Connection '{name}'")

            self.add_connection(
                name=name,
                ip=conn_cfg["ip"],
                port=conn_cfg.get("port", 2404)
            )

            for station_cfg in conn_cfg.get("stations", []):
                ca = station_cfg["ca"]

                print(f"  Station CA {ca}")
                self.add_station(name, ca)

                for point_cfg in station_cfg.get("points", []):
                    print(
                        f"    Point IOA {point_cfg['ioa']} "
                        f"Typ {point_cfg['type']}"
                    )

                    self.add_point(
                        conn_name=name,
                        ca=ca,
                        ioa=point_cfg["ioa"],
                        type_name=point_cfg["type"]
                    )

    def start(self):
        if self.running:
            return

        print("Starte IEC-104 Client")

        self.client.start()
        self.running = True

        for name, conn_data in self.connections.items():
            print(f"Verbinde '{name}'")
            conn_data["connection"].connect()

    def stop(self):
        print("Stoppe IEC-104 Client")
        self.running = False

        for conn_data in self.connections.values():
            conn_data["connection"].disconnect()

        self.client.stop()


def load_config(path):
    with open(path, "r", encoding="utf-8") as f:
        return json.load(f)


def main():
    script_path = Path(__file__).resolve()
    config_path = script_path.with_suffix(".json")

    if not config_path.exists():
        print(f"Config nicht gefunden: {config_path}")
        sys.exit(1)

    print(f"Lade Config: {config_path}")

    config = load_config(config_path)
    manager = IECManager(config)

    def handle_shutdown(signum, frame):
        manager.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    manager.load_from_config()
    manager.start()

    print("IEC-104 Client läuft. Beenden mit STRG+C.")

    while True:
        time.sleep(1)


if __name__ == "__main__":
    main()