import os
import json
from fastapi import FastAPI, Request, Depends, HTTPException
from fastapi.responses import JSONResponse
from fastapi.middleware.cors import CORSMiddleware
from jsonschema import validate, ValidationError
from typing import Any

try:
    from . import db
    from .auth import get_current_user
except ImportError:
    import db
    import auth as auth_module
    get_current_user = auth_module.get_current_user

app = FastAPI(title="AQUAS Logging API")

allowed_origins = [
    "http://localhost:3000",
    "http://127.0.0.1:3000",
]
app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

BASE_DIR = os.path.dirname(__file__)
TELEMETRY_SCHEMA_PATH = os.path.join(BASE_DIR, "schemas", "telemetry.json")

with open(TELEMETRY_SCHEMA_PATH, "r", encoding="utf-8") as f:
    TELEMETRY_SCHEMA = json.load(f)

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
    try:
        validate(instance=payload, schema=TELEMETRY_SCHEMA)
    except ValidationError as e:
        raise HTTPException(status_code=400, detail=f"schema validation error: {e.message}")

    res = await db.write_telemetry(payload["device_id"], payload["metric"], float(payload["value"]), payload.get("ts"))
    return {"status": "ok", "inserted": res}


@app.post("/ingest/detection")
async def ingest_detection(payload: dict, user: Any = Depends(get_current_user)):
    if "device_id" not in payload or "alert" not in payload:
        raise HTTPException(status_code=400, detail="device_id and alert are required")
    res = await db.write_detection(payload["device_id"], payload["alert"], payload.get("severity"), payload.get("ts"))
    return {"status": "ok", "inserted": res}


@app.get("/query/telemetry")
async def query_telemetry(device_id: str | None = None, limit: int = 100, user: Any = Depends(get_current_user)):
    rows = await db.query_telemetry(device_id=device_id, limit=limit)
    return {"count": len(rows), "rows": rows}


@app.get("/query/metric")
async def query_metric(metric: str, device_id: str | None = None, limit: int = 500, hours: int = 24, user: Any = Depends(get_current_user)):
    """Query telemetry data by metric (e.g., 'ph', 'temperature', etc.)."""
    rows = await db.query_telemetry_by_metric(metric=metric, device_id=device_id, limit=limit, hours=hours)
    return {"count": len(rows), "metric": metric, "rows": rows}


@app.get("/health")
async def health():
    return {"status": "ok"}
