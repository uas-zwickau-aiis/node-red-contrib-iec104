import c104
import time
import threading
import json
import paho.mqtt.client as mqtt
from flask import Flask, render_template_string, request, redirect

# ==========================================================
# MQTT
# ==========================================================

MQTT_BROKER = "192.168.4.51"
MQTT_PORT = 1883
MQTT_TOPIC_BASE = "iec104/sp"

mqtt_client = mqtt.Client(client_id="iec104-scada")
#mqtt_client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
#mqtt_client.loop_start()

print("MQTT verbunden")

# ==========================================================
# IEC MANAGER
# ==========================================================

class IECManager:
    def __init__(self):
        c104.set_debug_mode(c104.Debug.Connection | c104.Debug.Point)
        self.client = c104.Client()
        self.connections = {}
        self.lock = threading.Lock()

    # ---------------- CONNECTION ----------------

    def add_connection(self, name, ip, port):
        with self.lock:
            if name in self.connections:
                return

            conn = self.client.add_connection(
                ip=ip,
                port=port,
                init=c104.Init.INTERROGATION
            )

            def state_change(
                    connection: c104.Connection,
                    state: c104.ConnectionState
            ) -> None:
                print(state)

                if state == c104.ConnectionState.OPEN_MUTED:
                    def watchdog():
                        time.sleep(10)
                        if connection.state == c104.ConnectionState.OPEN_MUTED:
                            print("STARTDT Timeout → reconnect")
                            connection.disconnect()

                    threading.Thread(target=watchdog, daemon=True).start()
                if state == c104.ConnectionState.CLOSED:
                    connection.connect()

            conn.on_state_change(state_change)
            conn.connect()

            self.connections[name] = {
                "connection": conn,
                "stations": {}
            }

    # ---------------- STATION ----------------

    def add_station(self, conn_name, ca):
        with self.lock:
            station = self.connections[conn_name]["connection"].add_station(
                common_address=ca
            )

            self.connections[conn_name]["stations"][ca] = {
                "station": station,
                "points": {}
            }

    # ---------------- POINT ----------------

    def add_point(self, conn_name, ca, ioa, type_name):
        with self.lock:
            t = getattr(c104.Type, type_name)

            point = self.connections[conn_name]["stations"][ca]["station"].add_point(
                io_address=ioa,
                type=t
            )

            # AUTOMATISCHER RECEIVE HANDLER
            def on_receive(
                point: c104.Point,
                previous_info: c104.Information,
                message: c104.IncomingMessage
            ) -> c104.ResponseState:
                payload = {
                    "asdu": point.station.common_address,
                    "ioa": point.io_address,
                    "value": point.value,
                    "cot": int(message.cot),
                    "timestamp": time.time()
                }

                topic = f"{MQTT_TOPIC_BASE}/{point.io_address}"
                # mqtt_client.publish(topic, json.dumps(payload), qos=0)

                print("RX:", payload)

                return c104.ResponseState.SUCCESS

            point.on_receive(on_receive)

            self.connections[conn_name]["stations"][ca]["points"][ioa] = point

    def start(self):
        self.client.start()


iec = IECManager()

# ==========================================================
# FLASK GUI
# ==========================================================

app = Flask(__name__)

HTML = """
<h1>IEC 60870-5-104 SCADA</h1>

<h2>Neue Verbindung</h2>
<form method="post" action="/add_connection">
Name <input name="name">
IP <input name="ip" value="127.0.0.1">
Port <input name="port" value="2404">
<button type="submit">Add</button>
</form>

<hr>

{% for cname, c in connections.items() %}
<h2>{{ cname }}</h2>

<form method="post" action="/add_station">
<input type="hidden" name="connection" value="{{ cname }}">
CA <input name="ca">
<button>Add Station</button>
</form>

{% for ca, s in c["stations"].items() %}
<h3>Station {{ ca }}</h3>

<form method="post" action="/add_point">
<input type="hidden" name="connection" value="{{ cname }}">
<input type="hidden" name="ca" value="{{ ca }}">
IOA <input name="ioa">
Type
<select name="type">
<option>M_SP_NA_1</option>
<option>M_DP_NA_1</option>
<option>M_ME_NA_1</option>
<option>C_SC_NA_1</option>
</select>
<button>Add Point</button>
</form>

<ul>
{% for ioa in s["points"].keys() %}
<li>IOA {{ ioa }}</li>
{% endfor %}
</ul>

{% endfor %}
<hr>
{% endfor %}
"""

# ---------------- ROUTES ----------------

@app.route("/")
def index():
    return render_template_string(HTML, connections=iec.connections)


@app.route("/add_connection", methods=["POST"])
def add_connection():
    iec.add_connection(
        request.form["name"],
        request.form["ip"],
        int(request.form["port"])
    )
    return redirect("/")


@app.route("/add_station", methods=["POST"])
def add_station():
    iec.add_station(
        request.form["connection"],
        int(request.form["ca"])
    )
    return redirect("/")


@app.route("/add_point", methods=["POST"])
def add_point():
    iec.add_point(
        request.form["connection"],
        int(request.form["ca"]),
        int(request.form["ioa"]),
        request.form["type"]
    )
    return redirect("/")


# ==========================================================
# MAIN
# ==========================================================

if __name__ == "__main__":
    iec.start()
    print("IEC-104 Client läuft")
    app.run("0.0.0.0", 1881)
