import os
from typing import Optional

import asyncpg
from dotenv import load_dotenv

load_dotenv()

DB_CONFIG = {
    "user": os.getenv("POSTGRES_USER", "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD", "postgres"),
    "database": os.getenv("POSTGRES_DB", "aquas"),
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
}

pool: Optional[asyncpg.Pool] = None


async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        pool = await asyncpg.create_pool(**DB_CONFIG, command_timeout=60)
    return pool


async def close_pool() -> None:
    global pool
    if pool:
        await pool.close()
        pool = None
