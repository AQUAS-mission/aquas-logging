from fastapi import APIRouter, HTTPException
import asyncpg
from pydantic import BaseModel, EmailStr, Field
from db import get_pool
import bcrypt

insert_query: str = """
                    INSERT INTO waterq.users (email, password_hash, display_name)
                    VALUES ($1, $2, $3)
                """
select_query: str = """
                SELECT id, email, password_hash, display_name FROM 
                waterq.users WHERE email = $1
                """
router = APIRouter()
# define Pydantic model to recieve and vlaidat athe body
# accept body of { "email": string, "password": string, "display_name": string (optional) 
# validate email format and password min 8 chars
class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8)
    display_name: str | None = None

class VerifyRequest(BaseModel):
    email: EmailStr
    password: str

@router.post("/auth/register", status_code=201)
async def register(body: RegisterRequest): 
    pool = await get_pool()
    # hash password with bcyrpt
    # Define the password (must be in bytes)
    password_hashed = bcrypt.hashpw(body.password.encode('utf-8'), bcrypt.gensalt()).decode("utf-8")

    # insert into waterq.users
    try:
        await pool.execute(insert_query, body.email, password_hashed, body.display_name)
    # return 201 on success, returen 409 if email already exists
    except asyncpg.UniqueViolationError: 
        raise HTTPException(status_code=409, detail="Email already registered")
    
    return {"message": "User registered successfully"}

# POST /auth/verify    — Phase 2.5
@router.post("/auth/verify")
async def verify(body: VerifyRequest):
    pool = await get_pool()
    #make sql query to look up user by email
    user = await pool.fetchrow(select_query, body.email)
    if user is None: 
        raise HTTPException(status_code=401, detail="Invalid Credentials")
    # verify password = bcrypt.checkpw()
    input_password = body.password
    if bcrypt.checkpw(input_password.encode("utf-8"), user.get("password_hash").encode("utf-8")):
        # return 200 with 
        return {"id": user.get("id"), "email": user.get("email"), "display_name": user.get("display_name")}
    else: 
        raise HTTPException(status_code=401, detail="Invalid Credentials")