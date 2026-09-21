import c104
import time
import datetime
import threading
import json
import sys
import signal
from typing import Any
from pathlib import Path


# ============================================================
# Logging
# ============================================================

DEBUG_ENABLED = False
DEBUG_LOG_PATH = None
DEBUG_LOG_LOCK = threading.RLock()


def log_message(*args):
    """
    Gibt eine Meldung immer auf der Konsole aus.

    Wenn debug=true gesetzt ist, wird die gleiche Meldung
    zusätzlich mit Zeitstempel in die Debug-Logdatei geschrieben.
    """

    text = " ".join(str(arg) for arg in args)

    print(text, flush=True)

    if not DEBUG_ENABLED or DEBUG_LOG_PATH is None:
        return

    timestamp = datetime.datetime.now().isoformat(
        timespec="milliseconds"
    )

    try:
        with DEBUG_LOG_LOCK:
            with open(
                DEBUG_LOG_PATH,
                "a",
                encoding="utf-8"
            ) as log_file:

                log_file.write(
                    f"{timestamp} {text}\n"
                )

    except Exception as exc:
        # Logging-Fehler dürfen den IEC-104 Server
        # niemals zum Absturz bringen.
        print(
            f"[LOG ERROR] {type(exc).__name__}: {exc}",
            file=sys.stderr,
            flush=True
        )


# ============================================================
# IEC-104 Server
# ============================================================

class IEC104ServerManager:

    COMMAND_TYPES = {
        # Single Commands
        "C_SC_NA_1",
        "C_SC_TA_1",

        # Double Commands
        "C_DC_NA_1",
        "C_DC_TA_1",

        # Normalized Setpoint
        "C_SE_NA_1",
        "C_SE_TA_1",

        # Scaled Setpoint
        "C_SE_NB_1",
        "C_SE_TB_1",

        # Floating Point Setpoint
        "C_SE_NC_1",
        "C_SE_TC_1",
    }

    def __init__(self, config: dict):

        self.config = config
        self.server_config = config.get(
            "server",
            {}
        )

        self.server = c104.Server(
            ip=self.server_config.get(
                "ip",
                "0.0.0.0"
            ),
            port=int(
                self.server_config.get(
                    "port",
                    2404
                )
            ),
            tick_rate_ms=int(
                self.server_config.get(
                    "tick_rate_ms",
                    100
                )
            ),
            select_timeout_ms=int(
                self.server_config.get(
                    "select_timeout_ms",
                    10000
                )
            ),
            max_connections=int(
                self.server_config.get(
                    "max_connections",
                    0
                )
            )
        )

        self.stations = {}
        self.running = False
        self.lock = threading.RLock()

        # Native c104 Debug-Ausgabe.
        # Diese bleibt bewusst auf der Konsole.
        if config.get(
            "debug",
            False
        ):
            c104.set_debug_mode(
                c104.Debug.Server |
                c104.Debug.Point
            )

        self._register_server_callbacks()

    # ========================================================
    # Server Callbacks
    # ========================================================

    def _register_server_callbacks(self):

        def on_clock_sync(
            server: c104.Server,
            ip: str,
            date_time: datetime.datetime
        ) -> c104.ResponseState:

            log_message(
                "[CLOCK SYNC] "
                f"Client {ip} setzt Zeit auf {date_time}"
            )

            return c104.ResponseState.SUCCESS

        def on_receive_raw(
            server: c104.Server,
            data: bytes
        ) -> None:
            """
            Erkennt eingehende Interrogation-Commands und schreibt
            den Start explizit über log_message in Konsole + Logdatei.
            """
            try:
                info = c104.explain_bytes_dict(
                    apdu=data
                )

                if (
                    info.get("type") == "C_IC_NA_1"
                    and info.get("cot") == "ACTIVATION"
                ):
                    log_message(
                        "[INTERROGATION START] "
                        f"CA={info.get('commonAddress')}, "
                        f"OA={info.get('originatorAddress')}, "
                        f"COT={info.get('cot')}, "
                        f"QOI={info.get('elements')}"
                    )

            except Exception as exc:
                log_message(
                    "[INTERROGATION RX LOG ERROR] "
                    f"{type(exc).__name__}: {exc}"
                )

        def on_send_raw(
            server: c104.Server,
            data: bytes
        ) -> None:
            """
            Erkennt die Antworten des Servers auf eine Interrogation.

            ACTIVATION_CON:
                Server hat die Interrogation angenommen.

            ACTIVATION_TERMINATION:
                Server hat die Interrogation vollständig beendet.
            """
            try:
                info = c104.explain_bytes_dict(
                    apdu=data
                )

                if info.get("type") != "C_IC_NA_1":
                    return

                cot = info.get("cot")

                if cot == "ACTIVATION_CON":
                    log_message(
                        "[INTERROGATION CONFIRMED] "
                        f"CA={info.get('commonAddress')}, "
                        f"OA={info.get('originatorAddress')}, "
                        f"COT={cot}"
                    )

                elif cot == "ACTIVATION_TERMINATION":
                    log_message(
                        "[INTERROGATION FINISHED] "
                        f"CA={info.get('commonAddress')}, "
                        f"OA={info.get('originatorAddress')}, "
                        f"COT={cot}"
                    )

            except Exception as exc:
                log_message(
                    "[INTERROGATION TX LOG ERROR] "
                    f"{type(exc).__name__}: {exc}"
                )

        def on_unexpected_message(
            server: c104.Server,
            message: c104.IncomingMessage,
            cause: c104.Umc
        ) -> None:

            oa = self._safe_message_attribute(
                message,
                "originator_address",
                "UNKNOWN"
            )

            cot = self._safe_message_attribute(
                message,
                "cot",
                "UNKNOWN"
            )

            log_message(
                "[UNEXPECTED] "
                f"OA={oa}, "
                f"COT={cot}, "
                f"Grund={cause}"
            )

        self.server.on_clock_sync(
            on_clock_sync
        )

        self.server.on_receive_raw(
            on_receive_raw
        )

        self.server.on_send_raw(
            on_send_raw
        )

        self.server.on_unexpected_message(
            on_unexpected_message
        )

    # ========================================================
    # Helper
    # ========================================================

    @staticmethod
    def _safe_message_attribute(
        message,
        attribute: str,
        default=None
    ):
        try:
            return getattr(
                message,
                attribute
            )

        except Exception:
            return default

    @staticmethod
    def _safe_previous_value(
        previous_info
    ):
        try:
            return previous_info.value

        except Exception:
            return None

    def _is_command_type(
        self,
        type_name: str
    ) -> bool:

        return type_name in self.COMMAND_TYPES

    # ========================================================
    # Stations
    # ========================================================

    def add_station(
        self,
        ca: int
    ):

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
                    f"Station CA {ca} konnte "
                    f"nicht angelegt werden"
                )

            self.stations[ca] = {
                "station": station,
                "points": {}
            }

            return station

    # ========================================================
    # Typen
    # ========================================================

    def _get_type(
        self,
        type_name: str
    ):

        if not hasattr(
            c104.Type,
            type_name
        ):
            raise ValueError(
                f"Ungültiger IEC-104-Typ: "
                f"{type_name}"
            )

        return getattr(
            c104.Type,
            type_name
        )

    def _get_command_mode(
        self,
        mode_name: str
    ):

        mode_name = mode_name.upper()

        if not hasattr(
            c104.CommandMode,
            mode_name
        ):
            raise ValueError(
                f"Ungültiger CommandMode: "
                f"{mode_name}"
            )

        return getattr(
            c104.CommandMode,
            mode_name
        )

    # ========================================================
    # Werte konvertieren
    # ========================================================

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

            if isinstance(
                value,
                str
            ):
                enum_name = value.upper()

                if not hasattr(
                    c104.Double,
                    enum_name
                ):
                    raise ValueError(
                        f"Ungültiger Double-Wert: "
                        f"{value}"
                    )

                return getattr(
                    c104.Double,
                    enum_name
                )

            return c104.Double(
                int(value)
            )

        if type_name in normalized_types:
            return c104.NormalizedFloat(
                float(value)
            )

        if type_name in scaled_types:
            return c104.Int16(
                int(value)
            )

        if type_name in float_types:
            return float(value)

        return value

    # ========================================================
    # Command Logging
    # ========================================================

    def _log_command_receive(
        self,
        point: c104.Point,
        previous_info: c104.Information,
        message: c104.IncomingMessage,
        type_name: str
    ):

        cot = self._safe_message_attribute(
            message,
            "cot",
            None
        )

        oa = self._safe_message_attribute(
            message,
            "originator_address",
            None
        )

        payload = {
            "event": "command_receive",
            "direction": "rx",

            "client_oa": oa,

            "asdu":
                point.station.common_address,

            "ioa":
                point.io_address,

            "type":
                type_name,

            "previous_value":
                self._safe_previous_value(
                    previous_info
                ),

            "value":
                point.value,

            "cot":
                int(cot)
                if cot is not None
                else None,

            "timestamp":
                time.time()
        }

        log_message(
            "[COMMAND RX]",
            json.dumps(
                payload,
                default=str,
                ensure_ascii=False
            )
        )

    def _log_command_result(
        self,
        point: c104.Point,
        message: c104.IncomingMessage,
        type_name: str,
        success: bool,
        error: str = None
    ):

        cot = self._safe_message_attribute(
            message,
            "cot",
            None
        )

        oa = self._safe_message_attribute(
            message,
            "originator_address",
            None
        )

        payload = {
            "event": "command_result",
            "direction": "rx",

            "client_oa": oa,

            "asdu":
                point.station.common_address,

            "ioa":
                point.io_address,

            "type":
                type_name,

            "value":
                point.value,

            "cot":
                int(cot)
                if cot is not None
                else None,

            "success":
                bool(success),

            "error":
                error,

            "timestamp":
                time.time()
        }

        if success:
            prefix = "[COMMAND RESULT]"
        else:
            prefix = "[COMMAND ERROR]"

        log_message(
            prefix,
            json.dumps(
                payload,
                default=str,
                ensure_ascii=False
            )
        )

    # ========================================================
    # Points
    # ========================================================

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

            station_data = (
                self.stations[ca]
            )

            if ioa in station_data["points"]:
                raise ValueError(
                    f"IOA {ioa} existiert in "
                    f"CA {ca} bereits"
                )

            point_type = self._get_type(
                type_name
            )

            mode = self._get_command_mode(
                command_mode
            )

            point = (
                station_data["station"]
                .add_point(
                    io_address=ioa,

                    type=point_type,

                    report_ms=int(
                        report_ms
                    ),

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
            )

            if point is None:
                raise RuntimeError(
                    f"Point CA={ca}, "
                    f"IOA={ioa} konnte "
                    f"nicht angelegt werden"
                )

            if initial_value is not None:

                point.value = (
                    self._convert_value(
                        type_name,
                        initial_value
                    )
                )

            # =================================================
            # RECEIVE
            # =================================================

            def on_receive(
                point: c104.Point,
                previous_info: c104.Information,
                message: c104.IncomingMessage
            ) -> c104.ResponseState:

                # ---------------------------------------------
                # COMMAND
                # ---------------------------------------------

                if self._is_command_type(
                    type_name
                ):

                    try:

                        self._log_command_receive(
                            point,
                            previous_info,
                            message,
                            type_name
                        )

                        # =================================================
                        # HIER KANN SPÄTER DEINE ECHTE COMMAND-LOGIK REIN
                        # =================================================
                        #
                        # Beispiel:
                        #
                        # if type_name == "C_SC_NA_1":
                        #     if point.value:
                        #         relais_einschalten()
                        #     else:
                        #         relais_ausschalten()
                        #
                        # Momentan wird der empfangene Command akzeptiert.
                        # =================================================

                        self._log_command_result(
                            point,
                            message,
                            type_name,
                            True
                        )

                        return (
                            c104.ResponseState.SUCCESS
                        )

                    except Exception as exc:

                        error_text = (
                            f"{type(exc).__name__}: "
                            f"{exc}"
                        )

                        try:

                            self._log_command_result(
                                point,
                                message,
                                type_name,
                                False,
                                error_text
                            )

                        except Exception:

                            log_message(
                                "[COMMAND ERROR] "
                                f"CA={ca}, "
                                f"IOA={ioa}, "
                                f"TYPE={type_name}, "
                                f"ERROR={error_text}"
                            )

                        return (
                            c104.ResponseState.FAILURE
                        )

                # ---------------------------------------------
                # NORMAL RX
                # ---------------------------------------------

                cot = (
                    self._safe_message_attribute(
                        message,
                        "cot",
                        None
                    )
                )

                oa = (
                    self._safe_message_attribute(
                        message,
                        "originator_address",
                        None
                    )
                )

                payload = {
                    "event":
                        "point_receive",

                    "direction":
                        "rx",

                    "client_oa":
                        oa,

                    "asdu":
                        point.station.common_address,

                    "ioa":
                        point.io_address,

                    "type":
                        type_name,

                    "previous_value":
                        self._safe_previous_value(
                            previous_info
                        ),

                    "value":
                        point.value,

                    "cot":
                        int(cot)
                        if cot is not None
                        else None,

                    "timestamp":
                        time.time()
                }

                log_message(
                    "RX:",
                    json.dumps(
                        payload,
                        default=str,
                        ensure_ascii=False
                    )
                )

                return (
                    c104.ResponseState.SUCCESS
                )

            # =================================================
            # READ
            # =================================================

            def on_before_read(
                point: c104.Point
            ) -> None:

                payload = {
                    "event":
                        "read",

                    "asdu":
                        point.station.common_address,

                    "ioa":
                        point.io_address,

                    "type":
                        type_name,

                    "value":
                        point.value,

                    "timestamp":
                        time.time()
                }

                log_message(
                    "READ:",
                    json.dumps(
                        payload,
                        default=str,
                        ensure_ascii=False
                    )
                )

            point.on_receive(
                on_receive
            )

            point.on_before_read(
                on_before_read
            )

            # =================================================
            # TIMER
            # =================================================

            if int(timer_ms) > 0:

                def on_timer(
                    point: c104.Point
                ) -> None:

                    payload = {
                        "event":
                            "timer",

                        "asdu":
                            point.station.common_address,

                        "ioa":
                            point.io_address,

                        "type":
                            type_name,

                        "value":
                            point.value,

                        "timestamp":
                            time.time()
                    }

                    log_message(
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

    # ========================================================
    # Point lesen
    # ========================================================

    def get_point(
        self,
        ca: int,
        ioa: int
    ) -> c104.Point:

        ca = int(ca)
        ioa = int(ioa)

        try:

            return (
                self.stations[ca]
                ["points"]
                [ioa]
                ["point"]
            )

        except KeyError as exc:

            raise ValueError(
                f"Point CA={ca}, "
                f"IOA={ioa} wurde "
                f"nicht gefunden"
            ) from exc

    # ========================================================
    # Point setzen
    # ========================================================

    def set_point_value(
        self,
        ca: int,
        ioa: int,
        value: Any,
        transmit: bool = False
    ):

        with self.lock:

            point_data = (
                self.stations[int(ca)]
                ["points"]
                [int(ioa)]
            )

            point = (
                point_data["point"]
            )

            type_name = (
                point_data["type"]
            )

            point.value = (
                self._convert_value(
                    type_name,
                    value
                )
            )

            log_message(
                f"SET CA={ca}, "
                f"IOA={ioa}, "
                f"VALUE={point.value}"
            )

            if transmit:

                success = point.transmit(
                    cause=c104.Cot.SPONTANEOUS
                )

                log_message(
                    f"TX CA={ca}, "
                    f"IOA={ioa}, "
                    f"SUCCESS={success}"
                )

                return success

            return True

    # ========================================================
    # Point senden
    # ========================================================

    def transmit_point(
        self,
        ca: int,
        ioa: int,
        cause=c104.Cot.SPONTANEOUS
    ) -> bool:

        point = self.get_point(
            ca,
            ioa
        )

        success = point.transmit(
            cause=cause
        )

        log_message(
            f"TX CA={ca}, "
            f"IOA={ioa}, "
            f"COT={cause}, "
            f"SUCCESS={success}"
        )

        return success

    # ========================================================
    # Config laden
    # ========================================================

    def load_from_config(self):

        for station_cfg in self.config.get(
            "stations",
            []
        ):

            ca = int(
                station_cfg["ca"]
            )

            log_message(
                f"Konfiguriere Station CA {ca}"
            )

            self.add_station(
                ca
            )

            for point_cfg in station_cfg.get(
                "points",
                []
            ):

                ioa = int(
                    point_cfg["ioa"]
                )

                type_name = (
                    point_cfg["type"]
                )

                log_message(
                    f"  Point IOA {ioa}, "
                    f"Typ {type_name}"
                )

                self.add_point(
                    ca=ca,

                    ioa=ioa,

                    type_name=type_name,

                    initial_value=(
                        point_cfg.get(
                            "value"
                        )
                    ),

                    report_ms=(
                        point_cfg.get(
                            "report_ms",
                            0
                        )
                    ),

                    timer_ms=(
                        point_cfg.get(
                            "timer_ms",
                            0
                        )
                    ),

                    command_mode=(
                        point_cfg.get(
                            "command_mode",
                            "DIRECT"
                        )
                    ),

                    related_ioa=(
                        point_cfg.get(
                            "related_ioa"
                        )
                    ),

                    related_io_autoreturn=(
                        point_cfg.get(
                            "related_io_autoreturn",
                            False
                        )
                    )
                )

    # ========================================================
    # Server starten
    # ========================================================

    def start(self):

        with self.lock:

            if self.running:
                return

            log_message(
                "Starte IEC-104 Server auf "
                f"{self.server.ip}:"
                f"{self.server.port}"
            )

            self.server.start()

            self.running = True

            log_message(
                "IEC-104 Server wurde gestartet"
            )

    # ========================================================
    # Server stoppen
    # ========================================================

    def stop(self):

        with self.lock:

            if not self.running:
                return

            log_message(
                "Stoppe IEC-104 Server"
            )

            self.running = False

            self.server.stop()

            log_message(
                "IEC-104 Server wurde gestoppt"
            )

    # ========================================================
    # Status
    # ========================================================

    def print_status(self):

        while self.running:

            log_message(
                "[STATUS] "
                f"offene Verbindungen="
                f"{self.server.open_connection_count}, "
                f"aktive Verbindungen="
                f"{self.server.active_connection_count}"
            )

            time.sleep(10)


# ============================================================
# Config laden
# ============================================================

def load_config(
    path: str
) -> dict:

    with open(
        path,
        "r",
        encoding="utf-8"
    ) as file:

        return json.load(
            file
        )


# ============================================================
# Main
# ============================================================

def main():

    global DEBUG_ENABLED
    global DEBUG_LOG_PATH

    script_path = Path(
        __file__
    ).resolve()

    config_path = (
        script_path.with_suffix(
            ".json"
        )
    )

    if not config_path.exists():

        print(
            f"Config nicht gefunden: "
            f"{config_path}"
        )

        sys.exit(1)

    print(
        f"Lade Config: "
        f"{config_path}"
    )

    config = load_config(
        config_path
    )

    # ========================================================
    # Debug Logging konfigurieren
    # ========================================================

    DEBUG_ENABLED = bool(
        config.get(
            "debug",
            False
        )
    )

    if DEBUG_ENABLED:

        configured_log = (
            config.get(
                "debug_log"
            )
        )

        if configured_log:

            log_path = Path(
                configured_log
            ).expanduser()

            if not log_path.is_absolute():

                log_path = (
                    script_path.parent
                    / log_path
                )

        else:

            log_path = (
                script_path.with_suffix(
                    ".debug.log"
                )
            )

        log_path.parent.mkdir(
            parents=True,
            exist_ok=True
        )

        DEBUG_LOG_PATH = log_path

        log_message(
            "[DEBUG] Debug-Logging aktiv: "
            f"{DEBUG_LOG_PATH}"
        )

    else:

        DEBUG_LOG_PATH = None

    # ========================================================
    # Manager erstellen
    # ========================================================

    manager = IEC104ServerManager(
        config
    )

    shutdown_event = (
        threading.Event()
    )

    # ========================================================
    # Shutdown
    # ========================================================

    def handle_shutdown(
        signum,
        frame
    ):

        log_message(
            f"Shutdown-Signal "
            f"empfangen: {signum}"
        )

        shutdown_event.set()

    signal.signal(
        signal.SIGINT,
        handle_shutdown
    )

    signal.signal(
        signal.SIGTERM,
        handle_shutdown
    )

    # ========================================================
    # Server ausführen
    # ========================================================

    try:

        manager.load_from_config()

        manager.start()

        status_thread = (
            threading.Thread(
                target=manager.print_status,
                daemon=True
            )
        )

        status_thread.start()

        log_message(
            "IEC-104 Server läuft. "
            "Beenden mit STRG+C."
        )

        while not shutdown_event.wait(
            timeout=1
        ):
            pass

    except Exception as exc:

        log_message(
            "[FATAL ERROR] "
            f"{type(exc).__name__}: {exc}"
        )

        raise

    finally:

        manager.stop()


if __name__ == "__main__":
    main()