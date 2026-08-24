import c104
import time
import argparse
import signal
import sys


class IEC104LoadClient:
    def __init__(
        self,
        ip: str,
        port: int,
        ca: int,
        ioa: int,
        rate: float,
        count: int | None = None,
        debug: bool = False,
    ):
        self.ip = ip
        self.port = port
        self.ca = ca
        self.ioa = ioa

        # APDUs pro Sekunde
        self.rate = rate

        # None = unbegrenzt senden
        self.count = count

        self.running = False

        if debug:
            c104.set_debug_mode(
                c104.Debug.Connection |
                c104.Debug.Point
            )

        self.client = c104.Client()

        self.connection = self.client.add_connection(
            ip=self.ip,
            port=self.port,
            init=c104.Init.NONE
        )

        self.station = self.connection.add_station(
            common_address=self.ca
        )

        self.point = self.station.add_point(
            io_address=self.ioa,
            type=c104.Type.M_ME_NC_1
        )

        self.connection.on_state_change(self.on_state_change)

    def on_state_change(
        self,
        connection: c104.Connection,
        state: c104.ConnectionState
    ) -> None:
        print(f"Connection state: {state}")

    def connect(self):
        print(
            f"Verbinde mit {self.ip}:{self.port} "
            f"(CA={self.ca}, IOA={self.ioa})"
        )

        self.client.start()
        self.connection.connect()

        # Auf aktive Verbindung warten
        timeout = time.monotonic() + 10

        while time.monotonic() < timeout:
            if self.connection.state == c104.ConnectionState.OPEN:
                print("IEC-104 Verbindung aktiv")
                return

            time.sleep(0.05)

        raise RuntimeError(
            f"IEC-104 Verbindung konnte nicht aufgebaut werden. "
            f"State: {self.connection.state}"
        )

    def run(self):
        if self.rate <= 0:
            raise ValueError("Rate muss > 0 sein")

        interval_ns = int(1_000_000_000 / self.rate)

        print()
        print("Starte Lasttest")
        print(f"Rate:   {self.rate:,.0f} APDU/s")

        if self.count is None:
            print("Anzahl: unbegrenzt")
        else:
            print(f"Anzahl: {self.count:,}")

        print()

        self.running = True

        sent = 0

        start_ns = time.perf_counter_ns()
        next_send_ns = start_ns

        last_report_ns = start_ns
        last_report_count = 0

        while self.running:

            if self.count is not None and sent >= self.count:
                break

            # Auf Sollzeitpunkt warten
            while True:
                now_ns = time.perf_counter_ns()

                remaining_ns = next_send_ns - now_ns

                if remaining_ns <= 0:
                    break

                # Bei größeren Abständen CPU schonen
                if remaining_ns > 200_000:
                    time.sleep((remaining_ns - 100_000) / 1e9)

            # Messwert verändern, damit echte Datenänderungen entstehen
            self.point.value = float(sent % 10000)

            # Spontane IEC-104 Übertragung
            self.point.transmit(
                cause=c104.Cot.SPONTANEOUS
            )

            sent += 1
            next_send_ns = start_ns + sent * interval_ns

            # Statistik ungefähr einmal pro Sekunde
            now_ns = time.perf_counter_ns()

            if now_ns - last_report_ns >= 1_000_000_000:

                elapsed = (now_ns - last_report_ns) / 1e9
                delta = sent - last_report_count

                current_rate = delta / elapsed

                total_elapsed = (now_ns - start_ns) / 1e9
                average_rate = sent / total_elapsed

                print(
                    f"Sent: {sent:>10,} | "
                    f"aktuell: {current_rate:>10,.0f} APDU/s | "
                    f"Ø: {average_rate:>10,.0f} APDU/s"
                )

                last_report_ns = now_ns
                last_report_count = sent

        end_ns = time.perf_counter_ns()

        duration = (end_ns - start_ns) / 1e9

        print()
        print("Test beendet")
        print(f"Gesendet:   {sent:,}")
        print(f"Dauer:      {duration:.3f} s")
        print(f"Durchsatz:  {sent / duration:,.2f} APDU/s")

    def stop(self):
        if not self.running:
            return

        print("\nStoppe Test...")
        self.running = False

    def close(self):
        try:
            self.connection.disconnect()
        except Exception:
            pass

        try:
            self.client.stop()
        except Exception:
            pass


def parse_args():
    parser = argparse.ArgumentParser(
        description="IEC-60870-5-104 Lastgenerator"
    )

    parser.add_argument(
        "--ip",
        default="127.0.0.1",
        help="IP-Adresse des IEC-104 Servers"
    )

    parser.add_argument(
        "--port",
        type=int,
        default=2404,
        help="IEC-104 Port"
    )

    parser.add_argument(
        "--ca",
        type=int,
        default=1,
        help="Common Address"
    )

    parser.add_argument(
        "--ioa",
        type=int,
        default=1,
        help="Information Object Address"
    )

    parser.add_argument(
        "--rate",
        type=float,
        required=True,
        help="Gewünschte APDUs pro Sekunde"
    )

    parser.add_argument(
        "--count",
        type=int,
        default=None,
        help="Gesamtzahl APDUs (ohne Angabe unbegrenzt)"
    )

    parser.add_argument(
        "--debug",
        action="store_true",
        help="c104 Debug-Ausgaben aktivieren"
    )

    return parser.parse_args()


def main():
    args = parse_args()

    client = IEC104LoadClient(
        ip=args.ip,
        port=args.port,
        ca=args.ca,
        ioa=args.ioa,
        rate=args.rate,
        count=args.count,
        debug=args.debug
    )

    def shutdown(signum, frame):
        client.stop()

    signal.signal(signal.SIGINT, shutdown)
    signal.signal(signal.SIGTERM, shutdown)

    try:
        client.connect()
        client.run()

    except Exception as exc:
        print(f"Fehler: {exc}", file=sys.stderr)
        sys.exit(1)

    finally:
        client.close()


if __name__ == "__main__":
    main()