from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
import jwt
import os
from typing import Dict, Optional

SECRET = os.getenv("NEXTAUTH_SECRET", "aquas_test_secret")
ALGORITHM = "HS256"

# Allow missing Authorization header during development so the frontend can call
# protected endpoints without a token. Set auto_error=False so HTTPBearer doesn't
# raise a 403 on missing credentials; we'll handle that case here.
# Control whether JWT validation is enforced. In development set AUTH_REQUIRED=false
# (the default) so the frontend and scripts can call the API without real tokens.
AUTH_REQUIRED = os.getenv("AUTH_REQUIRED", "false").lower() in ("1", "true", "yes")

# When auth is required, let HTTPBearer enforce presence of credentials (auto_error=True).
# Otherwise allow missing credentials and handle gracefully in get_current_user.
security = HTTPBearer(auto_error=AUTH_REQUIRED)


async def get_current_user(
    credentials: Optional[HTTPAuthorizationCredentials] = Depends(security)
) -> Dict:
    if credentials is None:
        if AUTH_REQUIRED:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Missing credentials")
        return {"sub": "dev-anonymous", "token": ""}

    token = credentials.credentials

    if AUTH_REQUIRED:
        try:
            payload = jwt.decode(token, SECRET, algorithms=[ALGORITHM])
            return payload
        except jwt.ExpiredSignatureError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Token expired")
        except jwt.InvalidTokenError:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    if token and len(token) > 0:
        return {"sub": "test-user", "token": token}

    raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="No token provided")
