import asyncio
import json
import logging
import os
from datetime import datetime, timezone

import paho.mqtt.client as mqtt
import asyncpg

logger = logging.getLogger(__name__)

MQTT_BROKER = os.getenv("MQTT_BROKER", "localhost")
MQTT_PORT = int(os.getenv("MQTT_PORT", "1884"))
MQTT_USER = os.getenv("MQTT_USER")
MQTT_PASS = os.getenv("MQTT_PASS")

_client: mqtt.Client = None

_LOOKUP_ROBOT = "SELECT robot_id FROM waterq.robots WHERE serial_number = $1"

_INSERT_MEASUREMENT = """
    INSERT INTO waterq.measurements
        (time, robot_id, latitude, longitude, ph, temperature_c, tdo_mg_l, ec_us_cm, turbidity_ntu)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    ON CONFLICT DO NOTHING
"""

_UPDATE_ROBOT_SEEN = """
    UPDATE waterq.robots
    SET is_active    = TRUE,
        last_seen_at  = $1,
        last_latitude = $2,
        last_longitude = $3
    WHERE serial_number = $4
"""


async def _insert_reading(pool: asyncpg.Pool, ts: datetime, payload: dict, serial: str):
    async with pool.acquire() as conn:
        robot = await conn.fetchrow(_LOOKUP_ROBOT, serial)
        if robot is None:
            logger.warning("Data received for unknown robot serial '%s' — not in DB, skipping", serial)
            return

        robot_id = robot["robot_id"]

        await conn.execute(
            _INSERT_MEASUREMENT,
            ts,
            robot_id,
            payload.get("latitude"),
            payload.get("longitude"),
            payload.get("ph"),
            payload.get("temperature"),
            payload.get("dissolved_oxygen"),
            payload.get("electrical_conductivity"),
            payload.get("turbidity"),
        )

        await conn.execute(
            _UPDATE_ROBOT_SEEN,
            ts,
            payload.get("latitude"),
            payload.get("longitude"),
            serial,
        )

        logger.info("Stored measurement for robot '%s' (id=%s) at %s", serial, robot_id, ts)


def _make_on_message(pool: asyncpg.Pool, loop: asyncio.AbstractEventLoop):
    def on_message(client, userdata, msg):
        try:
            payload = json.loads(msg.payload.decode())
            # topic format: aquas/robots/{serial}/data
            serial = msg.topic.split("/")[2]

            ts_raw = payload.get("timestamp")
            ts = datetime.fromtimestamp(ts_raw, tz=timezone.utc) if ts_raw else datetime.now(timezone.utc)

            asyncio.run_coroutine_threadsafe(
                _insert_reading(pool, ts, payload, serial),
                loop,
            )
        except json.JSONDecodeError as e:
            logger.error("Invalid JSON on topic %s: %s", msg.topic, e)
        except Exception as e:
            logger.error("Error processing MQTT message: %s", e)

    return on_message


def start_mqtt_listener(pool: asyncpg.Pool, loop: asyncio.AbstractEventLoop) -> None:
    global _client

    _client = mqtt.Client(
        callback_api_version=mqtt.CallbackAPIVersion.VERSION2,
        client_id="aquas_backend_ingestion",
    )

    if MQTT_USER and MQTT_PASS:
        _client.username_pw_set(MQTT_USER, MQTT_PASS)

    _client.on_message = _make_on_message(pool, loop)

    def on_connect(client, userdata, flags, reason_code, properties):
        if reason_code == 0:
            client.subscribe("aquas/robots/+/data", qos=1)
            logger.info("MQTT listener connected — subscribed to aquas/robots/+/data")
        else:
            logger.error("MQTT connection failed (code %s)", reason_code)

    def on_disconnect(client, userdata, disconnect_flags, reason_code, properties):
        if reason_code != 0:
            logger.warning("MQTT listener disconnected unexpectedly (code %s)", reason_code)

    _client.on_connect = on_connect
    _client.on_disconnect = on_disconnect

    try:
        _client.connect(MQTT_BROKER, MQTT_PORT, keepalive=60)
        _client.loop_start()
        logger.info("MQTT listener starting — broker %s:%d", MQTT_BROKER, MQTT_PORT)
    except Exception as e:
        logger.error("Failed to connect to MQTT broker: %s", e)


def stop_mqtt_listener() -> None:
    global _client
    if _client:
        _client.loop_stop()
        _client.disconnect()
        logger.info("MQTT listener stopped")
