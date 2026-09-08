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

        # Optionaler Lastgenerator fuer Slave-Inbound-Benchmarks.
        # Sendet C_SC_NA_1 als einzelne IEC-104-Kommandos.
        self.load_generator_config = config.get("load_generator", {})
        self.load_generator_thread = None
        self.load_generator_stop = threading.Event()

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

    def _wait_until_connection_open(self, conn_name: str) -> bool:
        """Wartet, bis die konfigurierte IEC-104-Verbindung OPEN ist."""
        conn_data = self.connections.get(conn_name)

        if conn_data is None:
            print(f"[LOAD] Connection '{conn_name}' existiert nicht.")
            return False

        connection = conn_data["connection"]

        while self.running and not self.load_generator_stop.is_set():
            if connection.state == c104.ConnectionState.OPEN:
                return True

            self.load_generator_stop.wait(0.1)

        return False

    def _load_generator_loop(self):
        cfg = self.load_generator_config

        conn_name = str(cfg.get("connection", "NodeRED"))
        ca = int(cfg.get("ca", 1))
        ioa = int(cfg.get("ioa", 200))
        value = bool(cfg.get("value", True))

        messages_per_second = float(
            cfg.get("messages_per_second", 500)
        )
        total_messages = int(cfg.get("total_messages", 0))
        start_delay_ms = int(cfg.get("start_delay_ms", 1000))
        status_interval_ms = int(
            cfg.get("status_interval_ms", 1000)
        )

        if messages_per_second <= 0:
            print(
                "[LOAD] messages_per_second muss > 0 sein; "
                "Lastgenerator wird nicht gestartet."
            )
            return

        try:
            point = (
                self.connections[conn_name]
                ["stations"][ca]
                ["points"][ioa]
            )
        except KeyError:
            print(
                "[LOAD] Command-Point nicht gefunden: "
                f"Connection={conn_name}, CA={ca}, IOA={ioa}"
            )
            return

        if point.type != c104.Type.C_SC_NA_1:
            print(
                "[LOAD] Fuer diesen Benchmark wird ein "
                "C_SC_NA_1 Single Command erwartet "
                f"(aktuell: {point.type})."
            )
            return

        # Konstanter Single Command, standardmaessig EIN / TRUE.
        point.value = value

        print(
            "[LOAD] Konfiguriert: "
            f"Connection={conn_name}, CA={ca}, IOA={ioa}, "
            f"Typ=C_SC_NA_1, Wert={value}, "
            f"Soll={messages_per_second:g} Kommandos/s, "
            f"Gesamt={'unbegrenzt' if total_messages <= 0 else total_messages}"
        )

        if not self._wait_until_connection_open(conn_name):
            return

        if start_delay_ms > 0:
            if self.load_generator_stop.wait(
                start_delay_ms / 1000.0
            ):
                return

        period_ns = max(
            1,
            int(1_000_000_000 / messages_per_second)
        )
        next_send_ns = time.perf_counter_ns()

        sent_total = 0
        failed_total = 0
        interval_sent = 0
        interval_failed = 0

        interval_started_ns = time.perf_counter_ns()
        status_interval_ns = max(
            1,
            status_interval_ms * 1_000_000
        )

        connection = self.connections[conn_name]["connection"]

        print("[LOAD] Lastgenerator gestartet.")

        while self.running and not self.load_generator_stop.is_set():
            # Bei Verbindungsverlust pausieren und spaeter ohne
            # Burst-Nachholung neu einsetzen.
            if connection.state != c104.ConnectionState.OPEN:
                if not self._wait_until_connection_open(conn_name):
                    break

                next_send_ns = time.perf_counter_ns()
                interval_started_ns = next_send_ns
                interval_sent = 0
                interval_failed = 0

            if total_messages > 0 and sent_total >= total_messages:
                break

            now_ns = time.perf_counter_ns()
            remaining_ns = next_send_ns - now_ns

            # Grobes Sleep + kurzer Spin fuer eine stabilere Taktung.
            if remaining_ns > 200_000:
                time.sleep(
                    (remaining_ns - 100_000) / 1_000_000_000
                )
                continue

            if remaining_ns > 0:
                continue

            try:
                success = point.transmit(
                    cause=c104.Cot.ACTIVATION
                )
            except Exception as exc:
                success = False
                print(f"[LOAD] transmit() Fehler: {exc}")

            if success:
                sent_total += 1
                interval_sent += 1
            else:
                failed_total += 1
                interval_failed += 1

            next_send_ns += period_ns

            # Wenn transmit() langsamer als die Sollrate ist, werden
            # ausgefallene Slots nicht spaeter als Burst nachgeholt.
            now_after_ns = time.perf_counter_ns()
            if next_send_ns < now_after_ns - period_ns:
                next_send_ns = now_after_ns + period_ns

            if now_after_ns - interval_started_ns >= status_interval_ns:
                elapsed_s = (
                    now_after_ns - interval_started_ns
                ) / 1_000_000_000

                actual_rate = (
                    interval_sent / elapsed_s
                    if elapsed_s > 0
                    else 0.0
                )

                print(
                    "[LOAD] "
                    f"TX={actual_rate:.1f} Kommandos/s, "
                    f"erfolgreich={interval_sent}, "
                    f"fehlgeschlagen={interval_failed}, "
                    f"gesamt={sent_total}"
                )

                interval_started_ns = now_after_ns
                interval_sent = 0
                interval_failed = 0

        print(
            "[LOAD] Lastgenerator beendet: "
            f"erfolgreich={sent_total}, "
            f"fehlgeschlagen={failed_total}"
        )

    def start_load_generator(self):
        cfg = self.load_generator_config

        if not bool(cfg.get("enabled", False)):
            return

        if (
            self.load_generator_thread is not None
            and self.load_generator_thread.is_alive()
        ):
            return

        self.load_generator_stop.clear()

        self.load_generator_thread = threading.Thread(
            target=self._load_generator_loop,
            name="iec104-command-load-generator",
            daemon=True
        )
        self.load_generator_thread.start()

    def start(self):
        if self.running:
            return

        print("Starte IEC-104 Client")

        self.client.start()
        self.running = True

        for name, conn_data in self.connections.items():
            print(f"Verbinde '{name}'")
            conn_data["connection"].connect()

        self.start_load_generator()

    def stop(self):
        print("Stoppe IEC-104 Client")
        self.running = False
        self.load_generator_stop.set()

        if (
            self.load_generator_thread is not None
            and self.load_generator_thread.is_alive()
        ):
            self.load_generator_thread.join(timeout=2.0)

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