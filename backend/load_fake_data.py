"""
Generate and load synthetic sensor data into waterq.measurements.

Usage:
  export POSTGRES_HOST=...
  export POSTGRES_PORT=5432
  export POSTGRES_USER=postgres
  export POSTGRES_PASSWORD=...
  export POSTGRES_DB=postgres
  python backend/load_fake_data.py --weeks 4 --interval-mins 15
"""

import argparse
import asyncio
import datetime as dt
import os
import random
import uuid
from pathlib import Path
from typing import Any, Dict, List, Tuple

import asyncpg
import bcrypt


def load_env_file() -> None:
    """Load environment variables from .env file in project root."""
    script_dir = Path(__file__).parent
    root_dir = script_dir.parent
    env_file = root_dir / ".env"
    
    if not env_file.exists():
        return
    
    with open(env_file, "r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#"):
                continue
            if "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip())


def db_config() -> Dict[str, Any]:
    return {
        "user": os.getenv("POSTGRES_USER", "postgres"),
        "password": os.getenv("POSTGRES_PASSWORD", "postgres"),
        "database": os.getenv("POSTGRES_DB", "aquas"),
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": int(os.getenv("POSTGRES_PORT", "5432")),
    }


def generate_rows(
    weeks: int,
    interval_minutes: int,
    robot_ids: List[uuid.UUID],
    base_lat: float,
    base_lon: float,
    jitter: float,
) -> List[Tuple[dt.datetime, float, float, float, float, float, float, float, uuid.UUID]]:
    total_minutes = weeks * 7 * 24 * 60
    steps = max(1, total_minutes // interval_minutes)
    now = dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc)
    delta = dt.timedelta(minutes=interval_minutes)

    rows: List[
        Tuple[dt.datetime, float, float, float, float, float, float, float, uuid.UUID]
    ] = []

    for i in range(steps):
        ts = now - i * delta
        robot_id = robot_ids[i % len(robot_ids)]
        lat = base_lat + random.uniform(-jitter, jitter)
        lon = base_lon + random.uniform(-jitter, jitter)
        temperature_c = random.uniform(8, 32)
        turbidity_ntu = max(0.0, random.gauss(20, 10))
        ec_us_cm = max(0.0, random.gauss(500, 200))
        tdo_mg_l = max(0.0, random.gauss(8, 3))
        ph = min(14.0, max(0.0, random.gauss(7.2, 0.4)))
        rows.append((ts, lon, lat, temperature_c, turbidity_ntu, ec_us_cm, tdo_mg_l, ph, robot_id))

    rows.reverse()  # oldest first
    return rows


async def ensure_schema(conn: asyncpg.Connection) -> None:
    """Create the TimescaleDB extension, schema, table, and hypertable if they don't exist."""
    try:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")
        has_timescaledb = True
    except Exception as e:
        print(f"TimescaleDB not available ({e}), continuing with plain PostgreSQL tables...")
        has_timescaledb = False
    
    await conn.execute("CREATE SCHEMA IF NOT EXISTS waterq")

    await conn.execute("""
        CREATE TABLE IF NOT EXISTS waterq.measurements (
            "time" timestamp with time zone NOT NULL,
            longitude double precision NOT NULL,
            latitude double precision NOT NULL,
            temperature_c double precision,
            turbidity_ntu double precision,
            ec_us_cm double precision,
            tdo_mg_l double precision,
            ph double precision,
            robot_id UUID,
            CONSTRAINT chk_ec CHECK ((ec_us_cm IS NULL) OR (ec_us_cm >= 0)),
            CONSTRAINT chk_lat CHECK ((latitude >= -90) AND (latitude <= 90)),
            CONSTRAINT chk_lon CHECK ((longitude >= -180) AND (longitude <= 180)),
            CONSTRAINT chk_tdo CHECK ((tdo_mg_l IS NULL) OR (tdo_mg_l >= 0)),
            CONSTRAINT chk_temp CHECK ((temperature_c IS NULL) OR ((temperature_c >= -5) AND (temperature_c <= 80))),
            CONSTRAINT chk_turb CHECK ((turbidity_ntu IS NULL) OR (turbidity_ntu >= 0)),
            CONSTRAINT measurements_ph_check CHECK ((ph >= 0) AND (ph <= 14)),
            CONSTRAINT measurements_pk PRIMARY KEY (longitude, latitude, "time")
        )
    """)

    if has_timescaledb:
        try:
            await conn.execute("""
                SELECT create_hypertable('waterq.measurements', 'time',
                    chunk_time_interval => INTERVAL '7 days',
                    if_not_exists => TRUE,
                    migrate_data => TRUE
                )
            """)
            print("Schema and hypertable ready.")
        except Exception as e:
            print(f"Could not create hypertable ({e}), using regular table.")
    else:
        print("Schema and regular table ready.")


async def setup_test_user_and_robots(conn: asyncpg.Connection) -> List[uuid.UUID]:
    """Create test user and 2 test robots, return their IDs."""
    password_hash = bcrypt.hashpw(b"testpassword", bcrypt.gensalt()).decode()

    user_id = await conn.fetchval("""
        INSERT INTO waterq.users (email, password_hash, display_name)
        VALUES ('test@aquas.dev', $1, 'Test User')
        ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
        RETURNING id
    """, password_hash)

    print(f"Test user ready: test@aquas.dev (id={user_id})")

    robots = [
        ("Aquas-001", "SN-AQUAS-001"),
        ("Aquas-002", "SN-AQUAS-002"),
    ]

    robot_ids = []
    for name, serial in robots:
        robot_id = await conn.fetchval("""
            INSERT INTO waterq.robots (user_id, name, serial_number)
            VALUES ($1, $2, $3)
            ON CONFLICT (serial_number) DO UPDATE SET user_id = EXCLUDED.user_id
            RETURNING robot_id
        """, user_id, name, serial)
        robot_ids.append(robot_id)
        print(f"Robot ready: {name} ({serial}) (id={robot_id})")

    return robot_ids


async def load_fake_data(
    weeks: int,
    interval_minutes: int,
    base_lat: float,
    base_lon: float,
    jitter: float,
    truncate: bool,
) -> None:
    cfg = db_config()
    conn = await asyncpg.connect(**cfg)
    try:
        await ensure_schema(conn)

        robot_ids = await setup_test_user_and_robots(conn)

        if truncate:
            await conn.execute("TRUNCATE TABLE waterq.measurements")

        rows = generate_rows(weeks, interval_minutes, robot_ids, base_lat, base_lon, jitter)
        await conn.executemany(
            """
            INSERT INTO waterq.measurements
            (time, longitude, latitude, temperature_c, turbidity_ntu, ec_us_cm, tdo_mg_l, ph, robot_id)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            """,
            rows,
        )
        print(f"Inserted {len(rows)} rows into waterq.measurements")
    finally:
        await conn.close()


def main() -> None:
    load_env_file()
    
    parser = argparse.ArgumentParser(description="Load synthetic data into waterq.measurements")
    parser.add_argument("--weeks", type=int, default=4, help="How many weeks of data to generate")
    parser.add_argument("--interval-mins", type=int, default=15, help="Interval between points")
    parser.add_argument("--lat", type=float, default=37.7749, help="Base latitude")
    parser.add_argument("--lon", type=float, default=-122.4194, help="Base longitude")
    parser.add_argument("--jitter", type=float, default=0.01, help="Lat/Lon jitter degrees")
    parser.add_argument("--no-truncate", action="store_true", help="Skip truncating the table first")
    args = parser.parse_args()

    asyncio.run(
        load_fake_data(
            weeks=args.weeks,
            interval_minutes=args.interval_mins,
            base_lat=args.lat,
            base_lon=args.lon,
            jitter=args.jitter,
            truncate=not args.no_truncate,
        )
    )


if __name__ == "__main__":
    main()
