import asyncio
import json
from datetime import datetime, timezone
import paho.mqtt.client as mqtt
import asyncpg

def on_message(client, userdata, msg):
    """Callback for when a message is received from the MQTT broker."""
    try:
        payload = json.loads(msg.payload.decode())
        robot_id = msg.topic.split('/')[2]
        ts = datetime.fromtimestamp(payload["timestamp"], tz=timezone.utc)

        asyncio.run_coroutine_threadsafe(
            insert_reading(pool, ts, payload, robot_id),
            loop
        )
        print(f"Queued insert for robot {robot_id} at {ts}")
    except json.JSONDecodeError as e:
        print(f"Invalid JSON payload: {e}")
    except Exception as e:
        print(f"Error processing message: {e}")