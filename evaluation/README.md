## Install Dependencies

```bash
sudo apt install python3-venv

python3 -m venv .venv
source .venv/bin/activate

python -m pip install c104 psutil
```

## Run Resource Monitor

```bash
python3 resource_monitor.py --pid 12345 --output run_01.csv
```

### Find the PID

**Linux (e.g. Node-RED):**

```bash
ps aux | grep node-red
```

Use the PID from the output as the value for `--pid`.

**Windows:**

Open **Task Manager → Details** and copy the PID of the process you want to monitor.


## Run IEC104 scripts

Each python script automatically loads the `.json` config with the same name from the same directory.

```text
client.py  → client.json
server.py  → server.json
```

Start the scripts without specifying a config:

```bash
python3 client.py
python3 server.py
```

## Import Node-RED Flows

The Node-RED flows used for evaluation are provided in the `flows` directory and can be imported directly into Node-RED.
