import datetime
import uuid
from typing import Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Query
from pydantic import BaseModel

from auth import get_current_user
from db import get_pool

router = APIRouter()

class ClaimRobotRequest(BaseModel): 
    serial_number: str



verify_serial_number_query: str = """
                                SELECT robot_id, name, serial_number, user_id 
                                FROM waterq.robots 
                                WHERE serial_number = $1
                                """
assign_user_to_robot_query: str = """
                                UPDATE waterq.robots 
                                SET user_id = $1 
                                WHERE robot_id = $2;   
                                """
get_robot_data_query: str = """ 
                            SELECT robot_id, name, serial_number, is_active, last_seen_at, last_latitude, last_longitude 
                            FROM waterq.robots 
                            WHERE user_id = $1
                            """

# POST /robots/claim        — Phase 2.6
@router.post("/robots/claim")
async def claim_robot(body: ClaimRobotRequest, current_user: Dict = Depends(get_current_user)):
    user_id = current_user["id"]
    pool = await get_pool()

    # make sql query to serach by serial number 
    robot = await pool.fetchrow(verify_serial_number_query, body.serial_number)
    if robot is None:
        raise HTTPException(status_code=404, detail="Serial Number Not Found")
    elif robot.get("user_id") is not None: 
        raise HTTPException(status_code=409, detail="Robot Serial Number Already Set")
    
    #set user_id to the logged in users id
    await pool.execute(assign_user_to_robot_query, user_id, robot.get("robot_id"))
    return {
            "robot_id": robot.get('robot_id'),
            "name": robot.get("name"),
            "serial_number": body.serial_number
        }
# GET  /robots/me           — Phase 2.7
@router.get("/robots/me")
async def get_my_robot(current_user: Dict = Depends(get_current_user)):
    user_id = current_user["id"]
    pool = await get_pool()
    my_robot_data: Dict = await pool.fetch(get_robot_data_query, user_id)
    return [
        {
            "robot_id": r.get("robot_id"), 
            "name": r.get("name"),
            "serial_number": r.get("serial_number"),
            "is_active": r.get("is_active"),
            "last_seen_at": r.get("last_seen_at"),
            "last_latitude": r.get("last_latitude"),
            "last_longitude": r.get("last_longitude")
        }
        for r in my_robot_data
    ]
# GET  /robots/{robot_id}/data  — Phase 2.8
@router.get("/robots/{robot_id}/data")
async def get_robot_telemetry(
    robot_id: str,
    hours: int = Query(default=24),
    start_time: Optional[datetime.datetime] = Query(default=None),
    end_time: Optional[datetime.datetime] = Query(default=None),
    current_user: Dict = Depends(get_current_user),
) -> Dict:
    pool = await get_pool()

    # ownership check
    robot = await pool.fetchrow(
        "SELECT user_id FROM waterq.robots WHERE robot_id = $1",
        robot_id,
    )
    if robot is None:
        raise HTTPException(status_code=404, detail="Robot not found")
    if str(robot.get("user_id")) != str(current_user["id"]):
        raise HTTPException(status_code=403, detail="Access denied")

    # resolve time range
    end: datetime.datetime = end_time or datetime.datetime.now(datetime.timezone.utc)
    start: datetime.datetime = start_time or (end - datetime.timedelta(hours=hours))

    rows = await pool.fetch(
        """
        SELECT
            time AS timestamp,
            longitude,
            latitude,
            ph,
            temperature_c AS temperature,
            tdo_mg_l AS dissolved_oxygen,
            ec_us_cm AS electrical_conductivity,
            turbidity_ntu
        FROM waterq.measurements
        WHERE robot_id = $1 AND time >= $2 AND time <= $3
        ORDER BY time DESC
        """,
        robot_id, start, end,
    )

    return {
        "robot_id": robot_id,
        "rows": [dict(r) for r in rows],
    }
# you can implement this later if we decide adding an sql search feature would be good or not
# POST /robots/{robot_id}/query — Phase 2.9
