import logging
import os
from contextlib import asynccontextmanager
from typing import Dict

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from db import get_pool, close_pool
from routes.view_routes import router as view_router
from routes.auth_routes import router as auth_router
from routes.robot_routes import router as robot_router

logger = logging.getLogger(__name__)

ALLOWED_ORIGINS = [
    origin.strip()
    for origin in os.getenv(
        "FRONTEND_ORIGINS",
        "http://localhost:3000,http://127.0.0.1:3000",
    ).split(",")
    if origin.strip()
]


@asynccontextmanager
async def lifespan(app: FastAPI):
    # everything before yield runs on startup everything after runs on shutdown
    await get_pool()
    logger.info("Database pool created")
    yield
    await close_pool()
    logger.info("Database pool closed")


app = FastAPI(title="Water Quality API", lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(view_router)
app.include_router(auth_router)
app.include_router(robot_router)


@app.get("/health")
async def health() -> Dict[str, str]:
    return {"status": "ok"}
