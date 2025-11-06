import os
import asyncpg
from typing import Any, Iterable, Mapping, Optional, Sequence

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

# change this to not require row id and chang the default sql query.
async def query_telemetry(device_id: Optional[str] = None, limit: int = 100):
    pool = await init_db_pool()
    async with pool.acquire() as conn:
        if device_id:
            rows = await conn.fetch("SELECT * FROM telemetry WHERE device_id=$1 ORDER BY ts DESC LIMIT $2", device_id, limit)
        else:
            rows = await conn.fetch("SELECT * FROM telemetry ORDER BY ts DESC LIMIT $1", limit)
        return [dict(r) for r in rows]

# make this not 
TELEMETRY_COLUMNS = {
    "id": "id",
    "device_id": "device_id",
    "metric": "metric",
    "value": "value",
    "ts": "ts",
}

_FILTER_OPERATORS: Mapping[str, str] = {
    "eq": "=",
    "ne": "<>",
    "lt": "<",
    "gt": ">",
    "lte": "<=",
    "gte": ">=",
}


async def query_telemetry_advanced(
    select_columns: Optional[Sequence[str]] = None,
    filters: Optional[Iterable[Mapping[str, Any]]] = None,
    order_by: Optional[Mapping[str, str]] = None,
    limit: int = 500,
    offset: int = 0,
):
    """
    Flexible telemetry query helper that supports limited filtering and projection.

    Args:
        select_columns: Iterable of allowed column names to include in SELECT.
        filters: Iterable of dicts with keys: column, op, value, optional value2 for BETWEEN.
        order_by: Dict with keys column and direction (asc/desc).
        limit: Max rows to return (capped via API validation).
        offset: Offset for pagination.
    """
    invalid_select = set(select_columns or []) - TELEMETRY_COLUMNS.keys()
    if invalid_select:
        raise ValueError(f"invalid select columns requested: {', '.join(sorted(invalid_select))}")

    select_sql = (
        ", ".join(TELEMETRY_COLUMNS[col] for col in select_columns)
        if select_columns else "*"
    )

    where_clauses: list[str] = []
    values: list[Any] = []
    parameter_index = 1

    for filt in filters or []:
        column = filt.get("column")
        op = filt.get("op")
        value = filt.get("value")
        column_sql = TELEMETRY_COLUMNS.get(column)
        if column_sql is None:
            raise ValueError(f"invalid filter column: {column}")

        if op == "in":
            where_clauses.append(f"{column_sql} = ANY(${parameter_index})")
            values.append(value)
            parameter_index += 1
        elif op == "between":
            value2 = filt.get("value2")
            if value2 is None:
                raise ValueError("between filter requires value2")
            where_clauses.append(f"{column_sql} BETWEEN ${parameter_index} AND ${parameter_index + 1}")
            values.extend([value, value2])
            parameter_index += 2
        elif op == "like":
            where_clauses.append(f"{column_sql} ILIKE ${parameter_index}")
            values.append(value)
            parameter_index += 1
        elif op in _FILTER_OPERATORS:
            where_clauses.append(f"{column_sql} {_FILTER_OPERATORS[op]} ${parameter_index}")
            values.append(value)
            parameter_index += 1
        else:
            raise ValueError(f"unsupported filter operator: {op}")

    where_sql = ""
    if where_clauses:
        where_sql = " WHERE " + " AND ".join(where_clauses)

    order_sql = ""
    if order_by:
        order_column = TELEMETRY_COLUMNS.get(order_by.get("column"))
        if order_column is None:
            raise ValueError(f"invalid order_by column: {order_by.get('column')}")
        direction = order_by.get("direction", "asc").upper()
        if direction not in {"ASC", "DESC"}:
            raise ValueError("order_by direction must be 'asc' or 'desc'")
        order_sql = f" ORDER BY {order_column} {direction}"

    if limit < 1:
        raise ValueError("limit must be positive")
    if offset < 0:
        raise ValueError("offset cannot be negative")

    query = f"SELECT {select_sql} FROM telemetry{where_sql}{order_sql} LIMIT {limit} OFFSET {offset}"

    pool = await init_db_pool()
    async with pool.acquire() as conn:
        rows = await conn.fetch(query, *values)
        return [dict(row) for row in rows]
