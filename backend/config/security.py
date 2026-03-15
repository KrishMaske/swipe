import os
import requests
from jose import jwt, JWTError
from fastapi import HTTPException, Request, Depends
from supabase import create_client, Client, ClientOptions
from config.settings import jwks_url, supabase_url, supabase_key

_jwks = None


def _is_admin_from_payload(payload: dict) -> bool:
    role = str(payload.get("role") or "").lower()
    if role in {"admin", "service_role"}:
        return True

    app_metadata = payload.get("app_metadata") or {}
    if isinstance(app_metadata, dict):
        app_role = str(app_metadata.get("role") or "").lower()
        if app_role in {"admin", "service_role"}:
            return True
        roles = app_metadata.get("roles") or []
        if isinstance(roles, list) and any(str(r).lower() == "admin" for r in roles):
            return True

    user_metadata = payload.get("user_metadata") or {}
    if isinstance(user_metadata, dict):
        user_role = str(user_metadata.get("role") or "").lower()
        if user_role == "admin":
            return True

    return False

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
        "supabase": user_client,
        "claims": payload,
        "is_admin": _is_admin_from_payload(payload),
    }


def require_admin_context(context: dict = Depends(get_user_context)) -> dict:
    """Ensures the caller has an admin role claim before allowing privileged actions."""
    if not context.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin role required")
    return context