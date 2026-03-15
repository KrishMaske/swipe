import os
import requests
from jose import jwt, JWTError
from fastapi import HTTPException, Request, Depends
from supabase import create_client, Client, ClientOptions
from config.settings import jwks_url, supabase_url, supabase_key

_jwks = None

def _get_jwks():
    global _jwks
    if _jwks is None:
        jwks = requests.get(jwks_url, timeout=5).json()
        _jwks = jwks["keys"]
    return _jwks

def get_token(request: Request) -> str:
    """Extracts the Bearer token from the request header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid Authorization header")
    return auth_header.replace("Bearer ", "")

def get_user_context(token: str = Depends(get_token)) -> dict:
    """Verifies the JWT and returns a user-scoped Supabase client."""
    try:
        payload = jwt.decode(
            token,
            _get_jwks(),
            algorithms=["ES256"],
            audience="authenticated",
            options={"verify_exp": True},
        )
        user_id = payload["sub"]
        
    except JWTError:
        raise HTTPException(status_code=401, detail="Invalid or expired token")

    options = ClientOptions(headers={"Authorization": f"Bearer {token}"})
    user_client = create_client(supabase_url, supabase_key, options=options)

    return {
        "user_id": user_id,
        "supabase": user_client
    }