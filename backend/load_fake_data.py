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
import getpass
import os
import random
from typing import Any, Dict, List, Tuple

import asyncpg


def db_config() -> Dict[str, Any]:
    return {
        "user": os.getenv("POSTGRES_USER", "postgres"),
        "password": os.getenv("POSTGRES_PASSWORD", "postgres"),
        "database": os.getenv("POSTGRES_DB", "postgres"),
        "host": os.getenv("POSTGRES_HOST", "localhost"),
        "port": int(os.getenv("POSTGRES_PORT", "5432")),
    }


def generate_rows(
    weeks: int,
    interval_minutes: int,
    base_lat: float,
    base_lon: float,
    jitter: float,
) -> List[Tuple[dt.datetime, float, float, float, float, float, float, float]]:
    total_minutes = weeks * 7 * 24 * 60
    steps = max(1, total_minutes // interval_minutes)
    now = dt.datetime.utcnow().replace(tzinfo=dt.timezone.utc)
    delta = dt.timedelta(minutes=interval_minutes)

    rows: List[
        Tuple[dt.datetime, float, float, float, float, float, float, float]
    ] = []

    for i in range(steps):
        ts = now - i * delta
        lat = base_lat + random.uniform(-jitter, jitter)
        lon = base_lon + random.uniform(-jitter, jitter)
        temperature_c = random.uniform(8, 32)
        turbidity_ntu = max(0.0, random.gauss(20, 10))
        ec_us_cm = max(0.0, random.gauss(500, 200))
        tdo_mg_l = max(0.0, random.gauss(8, 3))
        ph = min(14.0, max(0.0, random.gauss(7.2, 0.4)))
        rows.append((ts, lon, lat, temperature_c, turbidity_ntu, ec_us_cm, tdo_mg_l, ph))

    rows.reverse()  # oldest first
    return rows


async def ensure_schema(conn: asyncpg.Connection) -> None:
    """Create schema/table and use TimescaleDB features when available."""
    timescaledb_available = True
    try:
        await conn.execute("CREATE EXTENSION IF NOT EXISTS timescaledb CASCADE")
    except asyncpg.PostgresError:
        timescaledb_available = False
        print("TimescaleDB extension not available; continuing with plain PostgreSQL table.")

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

    if timescaledb_available:
        try:
            await conn.execute("""
                SELECT create_hypertable('waterq.measurements', 'time',
                    chunk_time_interval => INTERVAL '7 days',
                    if_not_exists => TRUE,
                    migrate_data => TRUE
                )
            """)
            print("Schema and hypertable ready.")
        except asyncpg.PostgresError:
            print("TimescaleDB hypertable setup skipped; using plain PostgreSQL table.")
    else:
        print("Schema ready (plain PostgreSQL table mode).")


async def load_fake_data(
    weeks: int,
    interval_minutes: int,
    base_lat: float,
    base_lon: float,
    jitter: float,
    truncate: bool,
) -> None:
    cfg = db_config()

    try:
        conn = await asyncpg.connect(**cfg)
    except asyncpg.InvalidPasswordError:
        try:
            entered_password = getpass.getpass("PostgreSQL password for user 'postgres' (leave blank to cancel): ")
        except (KeyboardInterrupt, EOFError):
            print("\nPassword entry canceled.")
            raise SystemExit(1)

        if not entered_password:
            print("No password entered. Aborting data load.")
            raise SystemExit(1)

        cfg["password"] = entered_password
        conn = await asyncpg.connect(**cfg)

    try:
        await ensure_schema(conn)

        if truncate:
            await conn.execute("TRUNCATE TABLE waterq.measurements")

        rows = generate_rows(weeks, interval_minutes, base_lat, base_lon, jitter)
        await conn.executemany(
            """
            INSERT INTO waterq.measurements
            (time, longitude, latitude, temperature_c, turbidity_ntu, ec_us_cm, tdo_mg_l, ph)
            VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
            """,
            rows,
        )
        print(f"Inserted {len(rows)} rows into waterq.measurements")
    finally:
        await conn.close()


def main() -> None:
    parser = argparse.ArgumentParser(description="Load synthetic data into waterq.measurements")
    parser.add_argument("--weeks", type=int, default=4, help="How many weeks of data to generate")
    parser.add_argument("--interval-mins", type=int, default=15, help="Interval between points")
    parser.add_argument("--lat", type=float, default=37.7749, help="Base latitude")
    parser.add_argument("--lon", type=float, default=-122.4194, help="Base longitude")
    parser.add_argument("--jitter", type=float, default=0.01, help="Lat/Lon jitter degrees")
    parser.add_argument("--no-truncate", action="store_true", help="Skip truncating the table first")
    parser.add_argument(
        "--pg-password",
        type=str,
        default=None,
        help="PostgreSQL password (overrides POSTGRES_PASSWORD)",
    )
    args = parser.parse_args()

    if args.pg_password is not None:
        os.environ["POSTGRES_PASSWORD"] = args.pg_password

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
