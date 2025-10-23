import os
import asyncio
import asyncpg
from typing import Optional

_pool: Optional[asyncpg.pool.Pool] = None

async def init_db_pool():
    global _pool
    if _pool is None:
        database_url = os.getenv("DATABASE_URL") or "postgresql://postgres:postgres@localhost:5432/aquas"
        _pool = await asyncpg.create_pool(dsn=database_url, min_size=1, max_size=5)
    return _pool

async def close_db_pool():
    global _pool
    if _pool is not None:
        await _pool.close()
        _pool = None

async def ensure_tables():
    """Create minimal tables for telemetry and detection if they don't exist."""
    pool = await init_db_pool()
    async with pool.acquire() as conn:
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS telemetry (
                id BIGSERIAL PRIMARY KEY,
                device_id TEXT NOT NULL,
                metric TEXT NOT NULL,
                value DOUBLE PRECISION,
                ts TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """
        )
        # For Timescale hypertable, user can convert telemetry into hypertable manually or here if extension installed.
        await conn.execute(
            """
            CREATE TABLE IF NOT EXISTS detection (
                id BIGSERIAL PRIMARY KEY,
                device_id TEXT NOT NULL,
                alert TEXT NOT NULL,
                severity TEXT,
                ts TIMESTAMPTZ NOT NULL DEFAULT now()
            );
            """
        )

async def write_telemetry(device_id: str, metric: str, value: float, ts: Optional[str] = None):
    pool = await init_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO telemetry(device_id, metric, value, ts) VALUES($1,$2,$3, COALESCE($4, now())) RETURNING id, ts",
            device_id, metric, value, ts
        )
        return dict(row)

async def write_detection(device_id: str, alert: str, severity: Optional[str] = None, ts: Optional[str] = None):
    pool = await init_db_pool()
    async with pool.acquire() as conn:
        row = await conn.fetchrow(
            "INSERT INTO detection(device_id, alert, severity, ts) VALUES($1,$2,$3, COALESCE($4, now())) RETURNING id, ts",
            device_id, alert, severity, ts
        )
        return dict(row)

async def query_telemetry(device_id: Optional[str] = None, limit: int = 100):
    pool = await init_db_pool()
    async with pool.acquire() as conn:
        if device_id:
            rows = await conn.fetch("SELECT * FROM telemetry WHERE device_id=$1 ORDER BY ts DESC LIMIT $2", device_id, limit)
        else:
            rows = await conn.fetch("SELECT * FROM telemetry ORDER BY ts DESC LIMIT $1", limit)
        return [dict(r) for r in rows]
