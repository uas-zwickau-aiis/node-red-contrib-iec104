import c104
import time
import json
import threading
import paho.mqtt.client as mqtt

# ---------------- MQTT ----------------

MQTT_BROKER = "192.168.4.51"
MQTT_PORT = 1883
MQTT_TOPIC_BASE = "iec104/sp"

mqtt_client = mqtt.Client(client_id="iec104-scada")
mqtt_client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
mqtt_client.loop_start()

print("MQTT verbunden")

# ---------------- IEC-104 ----------------

print("Starte IEC-104 SCADA Client")

c104.set_debug_mode(c104.Debug.Connection | c104.Debug.Point)
client = c104.Client()

conn = client.add_connection(
    ip="127.0.0.1",
    port=2404,
    init=c104.Init.INTERROGATION
)

station = conn.add_station(common_address=1)
conn.connect()

def on_connection_state_change(
    connection: c104.Connection,
    state: c104.ConnectionState
) -> None:
    print("IEC-104 STATE:", state)

conn.on_state_change(on_connection_state_change)

# ---------- SP (RTU → SCADA) ----------

sp = station.add_point(
    io_address=12,
    type=c104.Type.M_SP_NA_1
)
def on_sp(
    point: c104.Point,
    previous_info: c104.Information,
    message: c104.IncomingMessage
) -> c104.ResponseState:

    payload = {
        "asdu": point.station.common_address,
        "ioa": point.io_address,
        "value": bool(point.value),
        "cot": int(message.cot),
        "timestamp": time.time()
    }

   # topic = f"{MQTT_TOPIC_BASE}/{point.io_address}"
   # mqtt_client.publish(topic, json.dumps(payload), qos=0, retain=False)
    print("SP → MQTT:", payload)

    return c104.ResponseState.SUCCESS

sp.on_receive(on_sp)

# ---------- SC (SCADA → RTU) ----------

sc = station.add_point(
    io_address=2,
    type=c104.Type.C_SC_NA_1
)

client.start()
print("IEC-104 Client läuft")

# ---------- 5-Sekunden-Trigger in separatem Thread ----------

def sc_trigger():
    value = False
    while True:
        time.sleep(5)
        value = not value
        sc.value = value
        sc.transmit(c104.Cot.ACTIVATION)
        print(f"SC gesendet: IOA=2, VALUE={value}")

#threading.Thread(target=sc_trigger, daemon=True).start()

# ---------- Main-Loop ----------

while True:
    time.sleep(0.1)

