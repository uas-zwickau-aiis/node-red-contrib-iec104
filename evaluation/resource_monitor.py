#!/usr/bin/env python3

import argparse
import csv
import os
import sys
import time

import psutil


def main():
    parser = argparse.ArgumentParser(
        description="Ressourcenmonitor für den Node-RED-Prozess"
    )

    parser.add_argument(
        "--pid",
        type=int,
        required=True,
        help="PID des zu überwachenden Node-RED-Prozesses"
    )

    parser.add_argument(
        "--output",
        default="nodered_resources.csv",
        help="CSV-Ausgabedatei"
    )

    parser.add_argument(
        "--interval",
        type=float,
        default=1.0,
        help="Messintervall in Sekunden; Standard: 1.0"
    )

    args = parser.parse_args()

    if args.interval <= 0:
        print("Fehler: Das Messintervall muss größer als 0 sein.")
        sys.exit(1)

    try:
        process = psutil.Process(args.pid)
    except psutil.NoSuchProcess:
        print(f"Fehler: Prozess mit PID {args.pid} existiert nicht.")
        sys.exit(1)

    fieldnames = [
        "sample",
        "timestamp",
        "elapsed_s",
        "process_cpu_affinity",
        "process_cpu_percent",
        "process_rss_mb",
        "system_cpu_percent",
        "system_cpu_steal_percent",
        "system_ram_used_mb",
        "system_ram_percent",
        "system_swap_used_mb",
        "system_swap_percent",
        "system_swap_in_bytes",
        "system_swap_out_bytes",
        "load_avg_1m",
        "load_avg_5m",
        "load_avg_15m",
    ]

    print("Ressourcenmessung gestartet")
    print(f"Prozess: {process.name()}")
    print(f"PID: {process.pid}")
    print(f"Intervall: {args.interval:.3f} s")
    print(f"Messwerte: {args.output}")
    print("Abbruch mit Ctrl+C")

    process.cpu_percent(interval=None)
    psutil.cpu_percent(interval=None)
    psutil.cpu_times_percent(interval=None)

    start_monotonic = time.monotonic()

    # Swap-Zähler sind kumulativ seit Systemstart. Für die CSV werden
    # deshalb zusätzlich die Änderungen seit dem vorherigen Sample gebildet.
    initial_swap = psutil.swap_memory()
    previous_swap_in = initial_swap.sin
    previous_swap_out = initial_swap.sout

    # Nicht nach jedem Sample flushen, damit der Ressourcenmonitor selbst
    # möglichst wenig periodische I/O-Last erzeugt. Bei 1-s-Intervall
    # entspricht 10 z. B. einem Flush etwa alle 10 Sekunden.
    flush_every_samples = 10

    # Der erste eigentliche Messpunkt liegt nach einem vollständigen
    # Messintervall bei t = 1 s.
    next_measurement = start_monotonic + args.interval
    sample = 1

    try:
        with open(args.output, "w", newline="", encoding="utf-8") as csvfile:
            writer = csv.DictWriter(csvfile, fieldnames=fieldnames)
            writer.writeheader()

            while True:
                # Festes Messraster:
                # t_n = t_0 + n * Intervall
                sleep_time = next_measurement - time.monotonic()

                if sleep_time > 0:
                    time.sleep(sleep_time)

                measurement_time = time.monotonic()
                elapsed = measurement_time - start_monotonic

                try:
                    process_cpu = process.cpu_percent(interval=None)
                    process_memory = process.memory_info()
                    process_affinity = (
                        process.cpu_affinity()
                        if hasattr(process, "cpu_affinity")
                        else []
                    )
                except psutil.NoSuchProcess:
                    print("\nDer überwachte Prozess wurde beendet.")
                    break

                system_cpu = psutil.cpu_percent(interval=None)
                system_cpu_times = psutil.cpu_times_percent(interval=None)
                system_steal = getattr(system_cpu_times, "steal", 0.0)
                system_memory = psutil.virtual_memory()
                system_swap = psutil.swap_memory()

                swap_in_delta = max(0, system_swap.sin - previous_swap_in)
                swap_out_delta = max(0, system_swap.sout - previous_swap_out)
                previous_swap_in = system_swap.sin
                previous_swap_out = system_swap.sout

                try:
                    load_avg_1m, load_avg_5m, load_avg_15m = os.getloadavg()
                except (AttributeError, OSError):
                    load_avg_1m = load_avg_5m = load_avg_15m = float("nan")

                writer.writerow({
                    "sample": sample,
                    "timestamp": int(time.time() * 1000),
                    "elapsed_s": round(elapsed, 3),
                    "process_cpu_affinity": ",".join(map(str, process_affinity)),
                    "process_cpu_percent": round(process_cpu, 2),
                    "process_rss_mb": round(
                        process_memory.rss / (1024 ** 2), 2
                    ),

                    # Zusätzliche Kontrollgrößen des Gesamtsystems
                    "system_cpu_percent": round(system_cpu, 2),
                    "system_cpu_steal_percent": round(system_steal, 2),
                    "system_ram_used_mb": round(
                        system_memory.used / (1024 ** 2), 2
                    ),
                    "system_ram_percent": round(
                        system_memory.percent, 2
                    ),
                    "system_swap_used_mb": round(
                        system_swap.used / (1024 ** 2), 2
                    ),
                    "system_swap_percent": round(system_swap.percent, 2),
                    "system_swap_in_bytes": swap_in_delta,
                    "system_swap_out_bytes": swap_out_delta,
                    "load_avg_1m": round(load_avg_1m, 3),
                    "load_avg_5m": round(load_avg_5m, 3),
                    "load_avg_15m": round(load_avg_15m, 3),
                })

                # Periodisch statt nach jedem Sample flushen. Das reduziert
                # den durch den Monitor selbst verursachten I/O-Overhead.
                if sample % flush_every_samples == 0:
                    csvfile.flush()

                sample += 1
                next_measurement = (
                    start_monotonic + sample * args.interval
                )

    except KeyboardInterrupt:
        print("\nMessung durch Ctrl+C beendet.")

    finally:
        duration = time.monotonic() - start_monotonic

        print(f"Messdauer: {duration:.2f} s")
        print(f"Messwerte gespeichert: {args.output}")


if __name__ == "__main__":
    main()