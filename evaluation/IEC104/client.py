import c104
import time
import datetime
import threading
import json
import sys
import signal
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

    Wenn debug=true gesetzt ist, wird dieselbe Meldung zusätzlich
    mit Zeitstempel in die Debug-Logdatei geschrieben.
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
        # Ein Logging-Fehler darf den IEC-104 Client nicht beenden.
        print(
            f"[LOG ERROR] {type(exc).__name__}: {exc}",
            file=sys.stderr,
            flush=True
        )


# ============================================================
# IEC-104 Client
# ============================================================

class IECManager:
    def __init__(self, config):
        self.config = config
        self.client = c104.Client()
        self.connections = {}
        self.running = False
        self.lock = threading.RLock()

        # Native c104 Debug-Ausgabe bleibt auf der Konsole.
        if config.get("debug", False):
            c104.set_debug_mode(
                c104.Debug.Connection |
                c104.Debug.Point
            )

    # ========================================================
    # Helper
    # ========================================================

    @staticmethod
    def _safe_message_attribute(
        message,
        attribute,
        default=None
    ):
        try:
            return getattr(message, attribute)
        except Exception:
            return default

    @staticmethod
    def _safe_previous_value(previous_info):
        try:
            return previous_info.value
        except Exception:
            return None

    @staticmethod
    def _get_init_mode(init_name):
        """
        Liest den c104.Init-Modus aus der JSON.

        Beispiel:
            "init": "INTERROGATION"

        Der Default bleibt INTERROGATION und entspricht damit
        dem Verhalten des bisherigen Clients.
        """
        name = str(init_name).upper()

        if not hasattr(c104.Init, name):
            raise ValueError(
                f"Ungültiger Init-Modus: {init_name}"
            )

        return getattr(c104.Init, name)

    # ========================================================
    # Connection
    # ========================================================

    def add_connection(
        self,
        name,
        ip,
        port,
        init_mode="INTERROGATION"
    ):
        with self.lock:
            if name in self.connections:
                raise ValueError(
                    f"Connection '{name}' existiert bereits"
                )

            init_value = self._get_init_mode(
                init_mode
            )

            # Die Interrogation wird bewusst NICHT automatisch über
            # c104.Init.INTERROGATION gestartet, weil wir Start und Ende
            # eindeutig selbst loggen möchten.
            #
            # Wenn in der JSON "init": "INTERROGATION" steht, merken wir
            # uns das und führen die GI nach erfolgreichem OPEN explizit aus.
            actual_init = (
                c104.Init.NONE
                if init_value == c104.Init.INTERROGATION
                else init_value
            )

            conn = self.client.add_connection(
                ip=ip,
                port=int(port),
                init=actual_init
            )

            if conn is None:
                raise RuntimeError(
                    f"Connection '{name}' konnte nicht "
                    f"angelegt werden"
                )

            def state_change(
                connection: c104.Connection,
                state: c104.ConnectionState
            ) -> None:

                log_message(
                    f"[{name}] STATE: {state}"
                )

                # Verbindung besteht auf TCP-Ebene,
                # IEC STARTDT ist aber noch nicht abgeschlossen.
                if state == c104.ConnectionState.OPEN_MUTED:

                    def watchdog():
                        time.sleep(10)

                        if (
                            connection.state
                            == c104.ConnectionState.OPEN_MUTED
                        ):
                            log_message(
                                f"[{name}] STARTDT Timeout -> reconnect"
                            )

                            try:
                                connection.disconnect()
                            except Exception as exc:
                                log_message(
                                    f"[{name}] DISCONNECT ERROR: "
                                    f"{type(exc).__name__}: {exc}"
                                )

                    threading.Thread(
                        target=watchdog,
                        daemon=True
                    ).start()

                if state == c104.ConnectionState.OPEN:
                    conn_data = self.connections.get(name)

                    if (
                        conn_data is not None
                        and conn_data.get(
                            "interrogation_requested",
                            False
                        )
                        and not conn_data.get(
                            "interrogation_started",
                            False
                        )
                    ):
                        conn_data["interrogation_started"] = True

                        def run_interrogation():
                            try:
                                log_message(
                                    f"[{name}] INTERROGATION START"
                                )

                                started_at = time.time()

                                # CA 65535 = globale Common Address.
                                # In c104 2.2.1 blockiert diese Methode bei
                                # wait_for_response=True bis alle beteiligten
                                # Stationen ACT_TERM geliefert haben.
                                success = connection.interrogation(
                                    common_address=65535,
                                    cause=c104.Cot.ACTIVATION,
                                    qualifier=c104.Qoi.STATION,
                                    wait_for_response=True
                                )

                                duration = time.time() - started_at

                                log_message(
                                    f"[{name}] INTERROGATION FINISHED "
                                    f"SUCCESS={success} "
                                    f"DURATION={duration:.3f}s"
                                )

                            except Exception as exc:
                                log_message(
                                    f"[{name}] INTERROGATION ERROR: "
                                    f"{type(exc).__name__}: {exc}"
                                )

                            finally:
                                # Bei einem späteren echten Reconnect darf
                                # die konfigurierte Init-Interrogation erneut
                                # ausgeführt werden.
                                conn_data["interrogation_started"] = False

                        threading.Thread(
                            target=run_interrogation,
                            name=f"{name}-interrogation",
                            daemon=True
                        ).start()

                if (
                    state == c104.ConnectionState.CLOSED
                    and self.running
                ):
                    conn_data = self.connections.get(name)

                    if conn_data is not None:
                        conn_data["interrogation_started"] = False

                    log_message(
                        f"[{name}] reconnect"
                    )

                    try:
                        connection.connect()
                    except Exception as exc:
                        log_message(
                            f"[{name}] RECONNECT ERROR: "
                            f"{type(exc).__name__}: {exc}"
                        )

            conn.on_state_change(
                state_change
            )

            self.connections[name] = {
                "connection": conn,
                "stations": {},
                "init": init_mode,
                "interrogation_requested": (
                    init_value == c104.Init.INTERROGATION
                ),
                "interrogation_started": False
            }

    # ========================================================
    # Station
    # ========================================================

    def add_station(
        self,
        conn_name,
        ca
    ):
        with self.lock:
            ca = int(ca)

            conn_data = self.connections[
                conn_name
            ]

            if ca in conn_data["stations"]:
                raise ValueError(
                    f"Station CA {ca} existiert in "
                    f"'{conn_name}' bereits"
                )

            station = (
                conn_data["connection"]
                .add_station(
                    common_address=ca
                )
            )

            if station is None:
                raise RuntimeError(
                    f"Station CA {ca} konnte in "
                    f"'{conn_name}' nicht angelegt werden"
                )

            conn_data["stations"][ca] = {
                "station": station,
                "points": {}
            }

    # ========================================================
    # Point
    # ========================================================

    def add_point(
        self,
        conn_name,
        ca,
        ioa,
        type_name
    ):
        with self.lock:
            ca = int(ca)
            ioa = int(ioa)

            if not hasattr(
                c104.Type,
                type_name
            ):
                raise ValueError(
                    f"Ungültiger IEC-104 Typ: "
                    f"{type_name}"
                )

            station_data = (
                self.connections[conn_name]
                ["stations"][ca]
            )

            station = station_data[
                "station"
            ]

            if ioa in station_data["points"]:
                raise ValueError(
                    f"IOA {ioa} existiert in "
                    f"Connection '{conn_name}', "
                    f"CA {ca} bereits"
                )

            point = station.add_point(
                io_address=ioa,
                type=getattr(
                    c104.Type,
                    type_name
                )
            )

            if point is None:
                raise RuntimeError(
                    f"Point {conn_name}/CA={ca}/IOA={ioa} "
                    f"konnte nicht angelegt werden"
                )

            # =================================================
            # RECEIVE
            # =================================================

            def on_receive(
                point: c104.Point,
                previous_info: c104.Information,
                message: c104.IncomingMessage
            ) -> c104.ResponseState:

                try:
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

                    previous_value = (
                        self._safe_previous_value(
                            previous_info
                        )
                    )

                    payload = {
                        "event": "point_receive",
                        "direction": "rx",
                        "connection": conn_name,
                        "client_oa": oa,
                        "asdu": point.station.common_address,
                        "ioa": point.io_address,
                        "type": type_name,
                        "previous_value": previous_value,
                        "value": point.value,
                        "cot": (
                            int(cot)
                            if cot is not None
                            else None
                        ),
                        "timestamp": time.time()
                    }

                    # Jeder empfangene Point wird einzeln ausgegeben.
                    # Damit sind auch spontane Einzelmeldungen direkt
                    # im Log erkennbar.
                    log_message(
                        "[SINGLE RX]",
                        json.dumps(
                            payload,
                            default=str,
                            ensure_ascii=False
                        )
                    )

                    return c104.ResponseState.SUCCESS

                except Exception as exc:
                    log_message(
                        "[RX ERROR] "
                        f"CONNECTION={conn_name}, "
                        f"CA={ca}, "
                        f"IOA={ioa}, "
                        f"TYPE={type_name}, "
                        f"ERROR={type(exc).__name__}: {exc}"
                    )

                    return c104.ResponseState.FAILURE

            point.on_receive(
                on_receive
            )

            station_data["points"][ioa] = {
                "point": point,
                "type": type_name
            }

    # ========================================================
    # Point holen
    # ========================================================

    def get_point(
        self,
        conn_name,
        ca,
        ioa
    ):
        ca = int(ca)
        ioa = int(ioa)

        try:
            return (
                self.connections[conn_name]
                ["stations"][ca]
                ["points"][ioa]
                ["point"]
            )

        except KeyError as exc:
            raise ValueError(
                f"Point '{conn_name}' "
                f"CA={ca}, IOA={ioa} "
                f"wurde nicht gefunden"
            ) from exc

    # ========================================================
    # Explizites Senden eines Commands
    # ========================================================

    def send_command(
        self,
        conn_name,
        ca,
        ioa,
        value
    ):
        """
        Sendet nur dann einen Command, wenn diese Methode explizit
        aufgerufen wird und der konfigurierte Point ein Command-Typ
        (z.B. C_SC_NA_1) ist.

        Ein 'report'-Eintrag in der JSON ruft diese Methode NICHT auf.
        """

        point = self.get_point(
            conn_name,
            ca,
            ioa
        )

        point_data = (
            self.connections[conn_name]
            ["stations"][int(ca)]
            ["points"][int(ioa)]
        )

        type_name = point_data[
            "type"
        ]

        command_types = {
            "C_SC_NA_1",
            "C_SC_TA_1",
            "C_DC_NA_1",
            "C_DC_TA_1",
            "C_SE_NA_1",
            "C_SE_TA_1",
            "C_SE_NB_1",
            "C_SE_TB_1",
            "C_SE_NC_1",
            "C_SE_TC_1"
        }

        if type_name not in command_types:
            raise ValueError(
                f"Point CA={ca}, IOA={ioa}, "
                f"Typ={type_name} ist kein Command-Point"
            )

        old_value = point.value

        try:
            point.value = value

            log_message(
                "[COMMAND TX]",
                json.dumps(
                    {
                        "event": "command_transmit",
                        "direction": "tx",
                        "connection": conn_name,
                        "asdu": int(ca),
                        "ioa": int(ioa),
                        "type": type_name,
                        "value": point.value,
                        "timestamp": time.time()
                    },
                    default=str,
                    ensure_ascii=False
                )
            )

            success = point.transmit(
                cause=c104.Cot.ACTIVATION
            )

            log_message(
                "[COMMAND RESULT]",
                json.dumps(
                    {
                        "event": "command_result",
                        "direction": "tx",
                        "connection": conn_name,
                        "asdu": int(ca),
                        "ioa": int(ioa),
                        "type": type_name,
                        "value": point.value,
                        "success": bool(success),
                        "timestamp": time.time()
                    },
                    default=str,
                    ensure_ascii=False
                )
            )

            return success

        except Exception as exc:
            log_message(
                "[COMMAND ERROR] "
                f"CONNECTION={conn_name}, "
                f"CA={ca}, "
                f"IOA={ioa}, "
                f"TYPE={type_name}, "
                f"ERROR={type(exc).__name__}: {exc}"
            )

            raise

        finally:
            # Den lokalen Wert nicht unnötig dauerhaft verändern,
            # falls das Point-Objekt dies zulässt.
            try:
                if old_value is not None:
                    point.value = old_value
            except Exception:
                pass

    # ========================================================
    # Config
    # ========================================================

    def load_from_config(self):

        for conn_cfg in self.config.get(
            "connections",
            []
        ):
            name = conn_cfg["name"]

            log_message(
                f"Konfiguriere Connection '{name}'"
            )

            self.add_connection(
                name=name,
                ip=conn_cfg["ip"],
                port=conn_cfg.get(
                    "port",
                    2404
                ),
                init_mode=conn_cfg.get(
                    "init",
                    "INTERROGATION"
                )
            )

            for station_cfg in conn_cfg.get(
                "stations",
                []
            ):
                ca = station_cfg["ca"]

                log_message(
                    f"  Station CA {ca}"
                )

                self.add_station(
                    name,
                    ca
                )

                for point_cfg in station_cfg.get(
                    "points",
                    []
                ):
                    log_message(
                        f"    Point IOA "
                        f"{point_cfg['ioa']} "
                        f"Typ {point_cfg['type']}"
                    )

                    self.add_point(
                        conn_name=name,
                        ca=ca,
                        ioa=point_cfg["ioa"],
                        type_name=point_cfg["type"]
                    )

    # ========================================================
    # Start
    # ========================================================

    def start(self):

        if self.running:
            return

        log_message(
            "Starte IEC-104 Client"
        )

        self.client.start()
        self.running = True

        for (
            name,
            conn_data
        ) in self.connections.items():

            log_message(
                f"Verbinde '{name}' "
                f"(init={conn_data['init']})"
            )

            try:
                result = (
                    conn_data["connection"]
                    .connect()
                )

                log_message(
                    f"[{name}] CONNECT RESULT: "
                    f"{result}"
                )

            except Exception as exc:
                log_message(
                    f"[{name}] CONNECT ERROR: "
                    f"{type(exc).__name__}: {exc}"
                )

    # ========================================================
    # Stop
    # ========================================================

    def stop(self):

        if not self.running:
            return

        log_message(
            "Stoppe IEC-104 Client"
        )

        self.running = False

        for (
            name,
            conn_data
        ) in self.connections.items():

            try:
                conn_data[
                    "connection"
                ].disconnect()

            except Exception as exc:
                log_message(
                    f"[{name}] DISCONNECT ERROR: "
                    f"{type(exc).__name__}: {exc}"
                )

        self.client.stop()

        log_message(
            "IEC-104 Client wurde gestoppt"
        )


# ============================================================
# Config
# ============================================================

def load_config(path):

    with open(
        path,
        "r",
        encoding="utf-8"
    ) as f:
        return json.load(f)


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
    # Debug Logging
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

    manager = IECManager(
        config
    )

    shutdown_event = (
        threading.Event()
    )

    def handle_shutdown(
        signum,
        frame
    ):
        log_message(
            f"Shutdown-Signal empfangen: "
            f"{signum}"
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

    try:
        manager.load_from_config()
        manager.start()

        log_message(
            "IEC-104 Client läuft. "
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
