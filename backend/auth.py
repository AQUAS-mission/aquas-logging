from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import os
from typing import Any, Dict
from dotenv import load_dotenv
from db import get_pool

load_dotenv()
SECRET: str = os.environ["NEXTAUTH_SECRET"]
ALGORITHM: str = "HS256"

security = HTTPBearer()
select_query: str = "SELECT id, email, display_name FROM waterq.users WHERE email = $1"
upsert_query: str =  """
                INSERT INTO waterq.users (email, display_name)
                VALUES ($1, $2)
                ON CONFLICT (email) DO UPDATE SET display_name = EXCLUDED.display_name
                RETURNING id, email, display_name
                """

async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security)
) -> Dict:
    token: str = credentials.credentials
    try:
        payload: Dict[str, Any] = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    email: str = payload.get("email", "")
    if not email: 
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    pool = await get_pool()
    user = await pool.fetchrow(select_query, email)

    if user is None: 
        user = await pool.fetchrow(upsert_query, email, payload.get("name"))
    return dict(user)
