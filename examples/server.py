import c104
import time
import datetime
import threading
import json
import sys
import signal
from typing import Any


class IEC104ServerManager:
    def __init__(self, config: dict):
        self.config = config
        self.server_config = config.get("server", {})

        self.server = c104.Server(
            ip=self.server_config.get("ip", "0.0.0.0"),
            port=int(self.server_config.get("port", 2404)),
            tick_rate_ms=int(self.server_config.get("tick_rate_ms", 100)),
            select_timeout_ms=int(
                self.server_config.get("select_timeout_ms", 10000)
            ),
            max_connections=int(
                self.server_config.get("max_connections", 0)
            )
        )

        self.stations = {}
        self.running = False
        self.lock = threading.RLock()

        if config.get("debug", False):
            c104.set_debug_mode(
                c104.Debug.Server
                | c104.Debug.Point
            )

        self._register_server_callbacks()

    def _register_server_callbacks(self):
        def on_clock_sync(
            server: c104.Server,
            ip: str,
            date_time: datetime.datetime
        ) -> c104.ResponseState:
            print(f"[CLOCK SYNC] Client {ip} setzt Zeit auf {date_time}")
            return c104.ResponseState.SUCCESS

        def on_unexpected_message(
            server: c104.Server,
            message: c104.IncomingMessage,
            cause: c104.Umc
        ) -> None:
            print(
                "[UNEXPECTED] "
                f"OA={message.originator_address}, "
                f"COT={message.cot}, "
                f"Grund={cause}"
            )

        self.server.on_clock_sync(on_clock_sync)
        self.server.on_unexpected_message(on_unexpected_message)

    def add_station(self, ca: int):
        with self.lock:
            ca = int(ca)

            if ca in self.stations:
                raise ValueError(
                    f"Station CA {ca} existiert bereits"
                )

            station = self.server.add_station(
                common_address=ca
            )

            if station is None:
                raise RuntimeError(
                    f"Station CA {ca} konnte nicht angelegt werden"
                )

            self.stations[ca] = {
                "station": station,
                "points": {}
            }

            return station

    def _get_type(self, type_name: str):
        if not hasattr(c104.Type, type_name):
            raise ValueError(
                f"Ungültiger IEC-104-Typ: {type_name}"
            )

        return getattr(c104.Type, type_name)

    def _get_command_mode(self, mode_name: str):
        mode_name = mode_name.upper()

        if not hasattr(c104.CommandMode, mode_name):
            raise ValueError(
                f"Ungültiger CommandMode: {mode_name}"
            )

        return getattr(c104.CommandMode, mode_name)

    def _convert_value(
        self,
        type_name: str,
        value: Any
    ) -> Any:
        if value is None:
            return None

        single_types = {
            "M_SP_NA_1",
            "M_SP_TA_1",
            "M_SP_TB_1",
            "C_SC_NA_1",
            "C_SC_TA_1"
        }

        double_types = {
            "M_DP_NA_1",
            "M_DP_TA_1",
            "M_DP_TB_1",
            "C_DC_NA_1",
            "C_DC_TA_1"
        }

        normalized_types = {
            "M_ME_NA_1",
            "M_ME_TA_1",
            "M_ME_TD_1",
            "C_SE_NA_1",
            "C_SE_TA_1"
        }

        scaled_types = {
            "M_ME_NB_1",
            "M_ME_TB_1",
            "M_ME_TE_1",
            "C_SE_NB_1",
            "C_SE_TB_1"
        }

        float_types = {
            "M_ME_NC_1",
            "M_ME_TC_1",
            "M_ME_TF_1",
            "C_SE_NC_1",
            "C_SE_TC_1"
        }

        if type_name in single_types:
            return bool(value)

        if type_name in double_types:
            if isinstance(value, str):
                enum_name = value.upper()

                if not hasattr(c104.Double, enum_name):
                    raise ValueError(
                        f"Ungültiger Double-Wert: {value}"
                    )

                return getattr(c104.Double, enum_name)

            return c104.Double(int(value))

        if type_name in normalized_types:
            return c104.NormalizedFloat(float(value))

        if type_name in scaled_types:
            return c104.Int16(int(value))

        if type_name in float_types:
            return float(value)

        return value

    def add_point(
        self,
        ca: int,
        ioa: int,
        type_name: str,
        initial_value: Any = None,
        report_ms: int = 0,
        timer_ms: int = 0,
        command_mode: str = "DIRECT",
        related_ioa: int | None = None,
        related_io_autoreturn: bool = False
    ):
        with self.lock:
            ca = int(ca)
            ioa = int(ioa)

            if ca not in self.stations:
                raise ValueError(
                    f"Station CA {ca} existiert nicht"
                )

            station_data = self.stations[ca]

            if ioa in station_data["points"]:
                raise ValueError(
                    f"IOA {ioa} existiert in CA {ca} bereits"
                )

            point_type = self._get_type(type_name)
            mode = self._get_command_mode(command_mode)

            point = station_data["station"].add_point(
                io_address=ioa,
                type=point_type,
                report_ms=int(report_ms),
                related_io_address=(
                    int(related_ioa)
                    if related_ioa is not None
                    else None
                ),
                related_io_autoreturn=bool(
                    related_io_autoreturn
                ),
                command_mode=mode
            )

            if point is None:
                raise RuntimeError(
                    f"Point CA={ca}, IOA={ioa} konnte "
                    "nicht angelegt werden"
                )

            if initial_value is not None:
                point.value = self._convert_value(
                    type_name,
                    initial_value
                )

            def on_receive(
                point: c104.Point,
                previous_info: c104.Information,
                message: c104.IncomingMessage
            ) -> c104.ResponseState:

                payload = {
                    "direction": "rx",
                    "client_oa": message.originator_address,
                    "asdu": point.station.common_address,
                    "ioa": point.io_address,
                    "type": type_name,
                    "previous_value": previous_info.value,
                    "value": point.value,
                    "cot": int(message.cot),
                    "timestamp": time.time()
                }

                print(
                    "RX:",
                    json.dumps(
                        payload,
                        default=str,
                        ensure_ascii=False
                    )
                )

                return c104.ResponseState.SUCCESS

            def on_before_read(
                point: c104.Point
            ) -> None:
                payload = {
                    "event": "read",
                    "asdu": point.station.common_address,
                    "ioa": point.io_address,
                    "type": type_name,
                    "value": point.value,
                    "timestamp": time.time()
                }

                print(
                    "READ:",
                    json.dumps(
                        payload,
                        default=str,
                        ensure_ascii=False
                    )
                )

            point.on_receive(on_receive)
            point.on_before_read(on_before_read)

            if int(timer_ms) > 0:
                def on_timer(
                    point: c104.Point
                ) -> None:
                    payload = {
                        "event": "timer",
                        "asdu": point.station.common_address,
                        "ioa": point.io_address,
                        "type": type_name,
                        "value": point.value,
                        "timestamp": time.time()
                    }

                    print(
                        "TIMER:",
                        json.dumps(
                            payload,
                            default=str,
                            ensure_ascii=False
                        )
                    )

                point.on_timer(
                    on_timer,
                    int(timer_ms)
                )

            station_data["points"][ioa] = {
                "point": point,
                "type": type_name
            }

            return point

    def get_point(self, ca: int, ioa: int) -> c104.Point:
        ca = int(ca)
        ioa = int(ioa)

        try:
            return self.stations[ca]["points"][ioa]["point"]
        except KeyError as exc:
            raise ValueError(
                f"Point CA={ca}, IOA={ioa} wurde nicht gefunden"
            ) from exc

    def set_point_value(
        self,
        ca: int,
        ioa: int,
        value: Any,
        transmit: bool = False
    ):
        with self.lock:
            point_data = self.stations[int(ca)]["points"][int(ioa)]
            point = point_data["point"]
            type_name = point_data["type"]

            point.value = self._convert_value(
                type_name,
                value
            )

            print(
                f"SET CA={ca}, IOA={ioa}, "
                f"VALUE={point.value}"
            )

            if transmit:
                success = point.transmit(
                    cause=c104.Cot.SPONTANEOUS
                )

                print(
                    f"TX CA={ca}, IOA={ioa}, "
                    f"SUCCESS={success}"
                )

                return success

            return True

    def transmit_point(
        self,
        ca: int,
        ioa: int,
        cause=c104.Cot.SPONTANEOUS
    ) -> bool:
        point = self.get_point(ca, ioa)
        return point.transmit(cause=cause)

    def load_from_config(self):
        for station_cfg in self.config.get("stations", []):
            ca = int(station_cfg["ca"])

            print(f"Konfiguriere Station CA {ca}")
            self.add_station(ca)

            for point_cfg in station_cfg.get("points", []):
                ioa = int(point_cfg["ioa"])
                type_name = point_cfg["type"]

                print(
                    f"  Point IOA {ioa}, Typ {type_name}"
                )

                self.add_point(
                    ca=ca,
                    ioa=ioa,
                    type_name=type_name,
                    initial_value=point_cfg.get("value"),
                    report_ms=point_cfg.get(
                        "report_ms",
                        0
                    ),
                    timer_ms=point_cfg.get(
                        "timer_ms",
                        0
                    ),
                    command_mode=point_cfg.get(
                        "command_mode",
                        "DIRECT"
                    ),
                    related_ioa=point_cfg.get(
                        "related_ioa"
                    ),
                    related_io_autoreturn=point_cfg.get(
                        "related_io_autoreturn",
                        False
                    )
                )

    def start(self):
        with self.lock:
            if self.running:
                return

            print(
                "Starte IEC-104 Server auf "
                f"{self.server.ip}:{self.server.port}"
            )

            self.server.start()
            self.running = True

            print("IEC-104 Server wurde gestartet")

    def stop(self):
        with self.lock:
            if not self.running:
                return

            print("Stoppe IEC-104 Server")

            self.running = False
            self.server.stop()

            print("IEC-104 Server wurde gestoppt")

    def print_status(self):
        while self.running:
            print(
                "[STATUS] "
                f"offene Verbindungen="
                f"{self.server.open_connection_count}, "
                f"aktive Verbindungen="
                f"{self.server.active_connection_count}"
            )

            time.sleep(10)


def load_config(path: str) -> dict:
    with open(path, "r", encoding="utf-8") as file:
        return json.load(file)


def main():
    if len(sys.argv) != 2:
        print(
            "Usage: python iec104_server.py config.json"
        )
        sys.exit(1)

    config = load_config(sys.argv[1])
    manager = IEC104ServerManager(config)

    shutdown_event = threading.Event()

    def handle_shutdown(signum, frame):
        print(f"Shutdown-Signal empfangen: {signum}")
        shutdown_event.set()

    signal.signal(signal.SIGINT, handle_shutdown)
    signal.signal(signal.SIGTERM, handle_shutdown)

    try:
        manager.load_from_config()
        manager.start()

        status_thread = threading.Thread(
            target=manager.print_status,
            daemon=True
        )
        status_thread.start()

        print(
            "IEC-104 Server läuft. "
            "Beenden mit STRG+C."
        )

        while not shutdown_event.wait(timeout=1):
            pass

    finally:
        manager.stop()


if __name__ == "__main__":
    main()