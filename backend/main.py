import os
import logging
from typing import Any, Dict, List, Optional

import asyncpg
from fastapi import Depends, FastAPI, HTTPException
from pydantic import BaseModel, Field
from fastapi.middleware.cors import CORSMiddleware

from auth import get_current_user

app = FastAPI(title="Water Quality API")
logger = logging.getLogger(__name__)

# ---------- Database Config ----------
# Use environment variables so the same code runs locally and in deployment.
DB_CONFIG = {
    "user": os.getenv("POSTGRES_USER", "postgres"),
    "password": os.getenv("POSTGRES_PASSWORD", "postgres"),
    "database": os.getenv("POSTGRES_DB", "aquas"),
    "host": os.getenv("POSTGRES_HOST", "localhost"),
    "port": int(os.getenv("POSTGRES_PORT", "5432")),
}

DEFAULT_LIMIT = 200

BASE_SELECT = """
    SELECT
        EXTRACT(EPOCH FROM time)::bigint AS timestamp,
        longitude,
        latitude,
        ph,
        temperature_c AS temperature,
        tdo_mg_l AS dissolved_oxygen,
        ec_us_cm AS electrical_conductivity,
        turbidity_ntu
    FROM waterq.measurements
"""

# Predefined queries keyed by the frontend view IDs.
# Replace table/column names with the real schema you have in Postgres.
VIEW_QUERIES: Dict[str, Dict[str, Any]] = {
    "all": {
        "sql": BASE_SELECT
        + """
            ORDER BY time DESC
            LIMIT $1
        """,
        "params": {"limit": DEFAULT_LIMIT},
        "order": ["limit"],
    },
    "water-quality": {
        "sql": BASE_SELECT
        + """
            WHERE time >= NOW() AT TIME ZONE 'utc' - make_interval(hours => $1::int)
            ORDER BY time DESC
            LIMIT $2
        """,
        "params": {"hours": 24 * 7, "limit": DEFAULT_LIMIT},
        "order": ["hours", "limit"],
    },
    "conductivity": {
        "sql": BASE_SELECT
        + """
            WHERE ec_us_cm IS NOT NULL
            ORDER BY time DESC
            LIMIT $1
        """,
        "params": {"limit": DEFAULT_LIMIT},
        "order": ["limit"],
    },
    "ph-neutral": {
        "sql": BASE_SELECT
        + """
            WHERE ph BETWEEN $1 AND $2
            ORDER BY time DESC
            LIMIT $3
        """,
        "params": {"min_ph": 7, "max_ph": 10, "limit": DEFAULT_LIMIT},
        "order": ["min_ph", "max_ph", "limit"],
    },
    # Legacy / example endpoints kept for reference
    "overview": {
        "sql": BASE_SELECT
        + """
            ORDER BY time DESC
            LIMIT $1
        """,
        "params": {"limit": DEFAULT_LIMIT},
        "order": ["limit"],
    },
    "recent_ph": {
        "sql": """
            SELECT EXTRACT(EPOCH FROM time)::bigint AS timestamp, ph
            FROM waterq.measurements
            WHERE time >= NOW() AT TIME ZONE 'utc' - make_interval(days => $1::int)
            ORDER BY time DESC
        """,
        "params": {"days": 7},
        "order": ["days"],
    },
}

# We'll hold a connection pool here
pool: Optional[asyncpg.Pool] = None

# ---------- CORS ----------
ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

class ViewRequest(BaseModel):
    view: str = Field(..., description="Frontend view identifier")
    params: Dict[str, Any] = Field(default_factory=dict, description="Optional filters for the view")


async def get_pool() -> asyncpg.Pool:
    global pool
    if pool is None:
        pool = await asyncpg.create_pool(**DB_CONFIG, command_timeout=60)
    return pool


@app.on_event("startup")
async def startup_event() -> None:
    await get_pool()
    logger.info("Database pool created")


@app.on_event("shutdown")
async def shutdown_event() -> None:
    global pool
    if pool:
        await pool.close()
        pool = None
        logger.info("Database pool closed")


def build_query_params(view_name: str, request_params: Dict[str, Any]) -> List[Any]:
    view_config = VIEW_QUERIES.get(view_name)
    if not view_config:
        raise HTTPException(status_code=404, detail=f"Unknown view '{view_name}'")

    required_params = view_config.get("required", [])
    for param in required_params:
        if param not in request_params:
            raise HTTPException(
                status_code=400,
                detail=f"Missing required parameter '{param}' for view '{view_name}'",
            )

    defaults = view_config.get("params", {})
    order = view_config.get("order") or list(defaults.keys())
    bound_values = []
    for key in order:
        if key in request_params:
            bound_values.append(request_params[key])
        elif key in defaults:
            bound_values.append(defaults[key])
        else:
            raise HTTPException(
                status_code=400,
                detail=f"Parameter '{key}' is not allowed for view '{view_name}'",
            )
    return bound_values


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}


@app.post("/views/query")
async def run_view_query(
    payload: ViewRequest,
    _user: Dict = Depends(get_current_user),
) -> Dict[str, Any]:
    db_pool = await get_pool()
    view_config = VIEW_QUERIES.get(payload.view)
    if not view_config:
        raise HTTPException(status_code=404, detail=f"Unknown view '{payload.view}'")

    sql = view_config["sql"]
    params = build_query_params(payload.view, payload.params)

    try:
        records = await db_pool.fetch(sql, *params)
    except asyncpg.PostgresError as exc:
        logger.exception("Database error while running view '%s'", payload.view)
        raise HTTPException(status_code=500, detail="Database error") from exc

    return {
        "view": payload.view,
        "rows": [dict(record) for record in records],
    }
