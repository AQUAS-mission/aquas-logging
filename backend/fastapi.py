import os
import json
from datetime import datetime, timedelta, timezone
from typing import Any, List, Literal, Optional

from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.encoders import jsonable_encoder
from fastapi.responses import JSONResponse
from jsonschema import validate, ValidationError
from pydantic import BaseModel, Field, root_validator, validator

from . import db
from .auth import get_current_user

app = FastAPI(title="AQUAS Logging API")

BASE_DIR = os.path.dirname(__file__)
TELEMETRY_SCHEMA_PATH = os.path.join(BASE_DIR, "schemas", "telemetry.json")

with open(TELEMETRY_SCHEMA_PATH, "r", encoding="utf-8") as f:
    TELEMETRY_SCHEMA = json.load(f)

DEFAULT_LOOKBACK_HOURS = int(os.getenv("TELEMETRY_DEFAULT_LOOKBACK_HOURS", "24"))
DEFAULT_LIMIT = int(os.getenv("TELEMETRY_DEFAULT_LIMIT", "500"))
MAX_LIMIT = int(os.getenv("TELEMETRY_QUERY_MAX_LIMIT", "5000"))


class TelemetryFilter(BaseModel):
    column: Literal["id", "device_id", "metric", "value", "ts"]
    op: Literal["eq", "ne", "lt", "gt", "lte", "gte", "in", "between", "like"]
    value: Any
    value2: Optional[Any] = None

    @validator("value", pre=True)
    def ensure_collection_for_in(cls, value, values):
        op = values.get("op")
        if op == "in":
            if not isinstance(value, (list, tuple)):
                raise ValueError("value must be a list or tuple for 'in' operator")
            if not value:
                raise ValueError("'in' operator requires at least one value")
            return list(value)
        if op == "like" and not isinstance(value, str):
            raise ValueError("value must be a string for 'like' operator")
        return value

    @root_validator
    def validate_between(cls, values):
        op = values.get("op")
        if op == "between":
            if values.get("value") is None or values.get("value2") is None:
                raise ValueError("value and value2 are required for 'between' operator")
        if op != "between":
            values["value2"] = None
        return values


class TelemetryOrder(BaseModel):
    column: Literal["id", "device_id", "metric", "value", "ts"]
    direction: Literal["asc", "desc"] = "asc"


class TelemetryQueryRequest(BaseModel):
    select: Optional[List[Literal["id", "device_id", "metric", "value", "ts"]]] = None
    filters: List[TelemetryFilter] = Field(default_factory=list)
    order_by: Optional[TelemetryOrder] = None
    limit: int = Field(default=500, ge=1, le=MAX_LIMIT)
    offset: int = Field(default=0, ge=0)
    include_default_filter: bool = False

@app.on_event("startup")
async def startup():
    await db.init_db_pool()
    await db.ensure_tables()


@app.on_event("shutdown")
async def shutdown():
    await db.close_db_pool()


@app.exception_handler(ValidationError)
async def validation_exception_handler(request: Request, exc: ValidationError):
    return JSONResponse(status_code=400, content={"error": "invalid_payload", "details": exc.message})


@app.post("/ingest/telemetry")
async def ingest_telemetry(payload: dict, user: Any = Depends(get_current_user)):
    # Validate against schema
    try:
        validate(instance=payload, schema=TELEMETRY_SCHEMA)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"schema validation error: {e.message}")

    res = await db.write_telemetry(payload["device_id"], payload["metric"], float(payload["value"]), payload.get("ts"))
    return {"status": "ok", "inserted": res}


@app.post("/ingest/detection")
async def ingest_detection(payload: dict, user: Any = Depends(get_current_user)):
    # Minimal validation performed here; for brevity we reuse telemetry schema partially
    if "device_id" not in payload or "alert" not in payload:
        raise HTTPException(status_code=400, detail="device_id and alert are required")
    res = await db.write_detection(payload["device_id"], payload["alert"], payload.get("severity"), payload.get("ts"))
    return {"status": "ok", "inserted": res}


@app.get("/query/telemetry")
async def query_telemetry(device_id: str | None = None, limit: int = 100, user: Any = Depends(get_current_user)):
    rows = await db.query_telemetry(device_id=device_id, limit=limit)
    return {"count": len(rows), "rows": rows}


def _default_since(lookback_hours: int) -> datetime:
    return datetime.now(timezone.utc) - timedelta(hours=lookback_hours)


@app.get("/query/telemetry/default")
async def query_telemetry_default(
    limit: int = DEFAULT_LIMIT,
    lookback_hours: int = DEFAULT_LOOKBACK_HOURS,
    device_id: str | None = None,
    user: Any = Depends(get_current_user),
):
    if lookback_hours <= 0:
        raise HTTPException(status_code=400, detail="lookback_hours must be positive")

    capped_limit = min(limit, MAX_LIMIT)
    filters = [
        {"column": "ts", "op": "gte", "value": _default_since(lookback_hours)},
    ]
    if device_id:
        filters.append({"column": "device_id", "op": "eq", "value": device_id})

    try:
        rows = await db.query_telemetry_advanced(
            select_columns=None,
            filters=filters,
            order_by={"column": "ts", "direction": "desc"},
            limit=capped_limit,
            offset=0,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "meta": {
            "count": len(rows),
            "limit": capped_limit,
            "lookback_hours": lookback_hours,
            "device_id": device_id,
        },
        "rows": jsonable_encoder(rows),
    }


@app.post("/query/telemetry/advanced")
async def query_telemetry_advanced_endpoint(
    payload: TelemetryQueryRequest,
    user: Any = Depends(get_current_user),
):
    filters = [f.dict(exclude_none=True) for f in payload.filters]
    if payload.include_default_filter:
        filters.append({"column": "ts", "op": "gte", "value": _default_since(DEFAULT_LOOKBACK_HOURS)})

    order_mapping = payload.order_by.dict() if payload.order_by else None
    capped_limit = min(payload.limit, MAX_LIMIT)

    try:
        rows = await db.query_telemetry_advanced(
            select_columns=payload.select,
            filters=filters,
            order_by=order_mapping,
            limit=capped_limit,
            offset=payload.offset,
        )
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "meta": {
            "count": len(rows),
            "limit": capped_limit,
            "offset": payload.offset,
            "filters": filters,
            "select": payload.select,
            "order_by": order_mapping,
        },
        "rows": jsonable_encoder(rows),
    }


@app.get("/health")
async def health():
    return {"status": "ok"}
