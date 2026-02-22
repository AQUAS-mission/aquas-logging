import logging
from typing import Any, Dict, List

import asyncpg
from fastapi import APIRouter, HTTPException, Depends
from pydantic import BaseModel, Field

from db import get_pool
from auth import get_current_user

router = APIRouter()
logger = logging.getLogger(__name__)

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
    WHERE robot_id IN (SELECT robot_id FROM waterq.robots WHERE user_id = $1)
"""

VIEW_QUERIES: Dict[str, Dict[str, Any]] = {
    "all": {
        "sql": BASE_SELECT + """
            ORDER BY time DESC
        """,
        "order": [],
    },
    "water-quality": {
        "sql": BASE_SELECT + """
            AND time >= NOW() AT TIME ZONE 'utc' - make_interval(hours => $2::int)
            ORDER BY time DESC
        """,
        "params": {"hours": 24 * 7},
        "order": ["hours"],
    },
    "conductivity": {
        "sql": BASE_SELECT + """
            AND ec_us_cm IS NOT NULL
            ORDER BY time DESC
        """,
        "order": [],
    },
    "ph-neutral": {
        "sql": BASE_SELECT + """
            AND ph BETWEEN $2 AND $3
            ORDER BY time DESC
        """,
        "params": {"min_ph": 7, "max_ph": 10},
        "order": ["min_ph", "max_ph"],
    },
    "overview": {
        "sql": BASE_SELECT + """
            ORDER BY time DESC
        """,
        "order": [],
    },
    "recent_ph": {
        "sql": """
            SELECT EXTRACT(EPOCH FROM time)::bigint AS timestamp, ph
            FROM waterq.measurements
            WHERE robot_id IN (SELECT robot_id FROM waterq.robots WHERE user_id = $1)
            AND time >= NOW() AT TIME ZONE 'utc' - ($2 || ' days')::interval
            ORDER BY time DESC
        """,
        "params": {"days": 7},
        "order": ["days"],
    },
}


class ViewRequest(BaseModel):
    view: str = Field(..., description="Frontend view identifier")
    params: Dict[str, Any] = Field(default_factory=dict, description="Optional filters for the view")


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


@router.post("/views/query")
async def run_view_query(payload: ViewRequest, current_user: Dict = Depends(get_current_user)) -> Dict[str, Any]:
    user_id = current_user["id"]
    db_pool = await get_pool()
    view_config = VIEW_QUERIES.get(payload.view)
    if not view_config:
        raise HTTPException(status_code=404, detail=f"Unknown view '{payload.view}'")

    sql = view_config["sql"]
    params = build_query_params(payload.view, payload.params)

    try:
        records = await db_pool.fetch(sql, user_id, *params)
    except asyncpg.PostgresError as exc:
        logger.exception("Database error while running view '%s'", payload.view)
        raise HTTPException(status_code=500, detail="Database error") from exc

    return {
        "view": payload.view,
        "rows": [dict(record) for record in records],
    }
