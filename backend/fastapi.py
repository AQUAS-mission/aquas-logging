from fastapi import FastAPI, HTTPException
import asyncpg
import json

app = FastAPI(title="Water Quality API")

# ---------- Database Config ----------
DB_CONFIG = {
    "user": "your_user",
    "password": "your_password",
    "database": "your_database",
    "host": "localhost",
    "port": 5432,
}

# We'll hold a connection pool here
pool: asyncpg.Pool | None = None