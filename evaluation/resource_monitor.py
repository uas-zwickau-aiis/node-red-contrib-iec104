#!/usr/bin/env python3

import argparse
import csv
import json
import os
import platform
import sys
import time
from datetime import datetime

import psutil


def collect_metadata(process, interval):
    vm = psutil.virtual_memory()

    return {
        "measurement_start": datetime.now().astimezone().isoformat(timespec="seconds"),
        "measurement_interval_s": interval,
        "hostname": platform.node(),
        "os": platform.system(),
        "os_release": platform.release(),
        "platform": platform.platform(),
        "python_version": platform.python_version(),
        "psutil_version": psutil.__version__,
        "logical_cpu_count": psutil.cpu_count(logical=True),
        "physical_cpu_count": psutil.cpu_count(logical=False),
        "total_ram_mb": round(vm.total / (1024 ** 2), 2),
        "process_pid": process.pid,
        "process_name": process.name(),
        "process_executable": process.exe() if process.exe() else "",
    }


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

    metadata_path = os.path.splitext(args.output)[0] + "_metadata.json"

    metadata = collect_metadata(process, args.interval)

    with open(metadata_path, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=4, ensure_ascii=False)

    fieldnames = [
        "sample",
        "timestamp",
        "elapsed_s",
        "process_cpu_percent",
        "process_rss_mb",
        "system_cpu_percent",
        "system_ram_used_mb",
        "system_ram_percent",
    ]

    print("Ressourcenmessung gestartet")
    print(f"Prozess: {process.name()}")
    print(f"PID: {process.pid}")
    print(f"Intervall: {args.interval:.3f} s")
    print(f"Messwerte: {args.output}")
    print(f"Metadaten: {metadata_path}")
    print("Abbruch mit Ctrl+C")

    process.cpu_percent(interval=None)
    psutil.cpu_percent(interval=None)

    start_monotonic = time.monotonic()

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
                except psutil.NoSuchProcess:
                    print("\nDer überwachte Prozess wurde beendet.")
                    break

                system_cpu = psutil.cpu_percent(interval=None)
                system_memory = psutil.virtual_memory()

                writer.writerow({
                    "sample": sample,
                    "timestamp": int(time.time() * 1000),
                    "elapsed_s": round(elapsed, 3),
                    "process_cpu_percent": round(process_cpu, 2),
                    "process_rss_mb": round(
                        process_memory.rss / (1024 ** 2), 2
                    ),

                    # Zusätzliche Kontrollgrößen des Gesamtsystems
                    "system_cpu_percent": round(system_cpu, 2),
                    "system_ram_used_mb": round(
                        system_memory.used / (1024 ** 2), 2
                    ),
                    "system_ram_percent": round(
                        system_memory.percent, 2
                    ),
                })

                # Nach jeder Messung direkt schreiben.
                # Dadurch bleiben bei Ctrl+C die bisherigen Messwerte erhalten.
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
        print(f"Metadaten gespeichert: {metadata_path}")


if __name__ == "__main__":
    main()