import os
import httpx
import time
import jwt
from jwt.algorithms import get_default_algorithms
from fastapi import HTTPException, Request, Depends
from supabase import create_client, Client, ClientOptions
from config.settings import jwks_url, supabase_url, supabase_key

_jwks = None
_jwks_last_fetched = 0
JWKS_TTL = 3600  # 1 hour

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

    # Security fix: user_metadata is writable by the user, so it cannot be trusted for roles.
    return False

async def _get_jwks():
    global _jwks, _jwks_last_fetched
    now = time.time()
    if _jwks is None or (now - _jwks_last_fetched) > JWKS_TTL:
        async with httpx.AsyncClient() as client:
            response = await client.get(jwks_url, timeout=5)
            jwks = response.json()
            _jwks = jwks["keys"]
            _jwks_last_fetched = now
    return _jwks

def get_token(request: Request) -> str:
    """Extracts the Bearer token from the request header."""
    auth_header = request.headers.get("Authorization")
    if not auth_header:
        print("[debug-auth] Missing Authorization header")
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    if not auth_header.startswith("Bearer "):
        print(f"[debug-auth] Invalid Authorization header format: {auth_header[:15]}...")
        raise HTTPException(status_code=401, detail="Invalid Authorization header format")
    return auth_header.replace("Bearer ", "")

async def get_user_context(token: str = Depends(get_token)) -> dict:
    """Verifies the JWT and returns a user-scoped Supabase client."""
    try:
        jwks = await _get_jwks()
        
        # PyJWT requires manual selection of the key from the JWKS
        header = jwt.get_unverified_header(token)
        kid = header.get("kid")
        if not kid:
            raise jwt.InvalidTokenError("Missing kid in JWT header")
            
        jwk = next((k for k in jwks if k.get("kid") == kid), None)
        if not jwk:
            raise jwt.InvalidTokenError("Key not found in JWKS")
            
        # Hardened ECDSA validation using cryptography backend via PyJWT
        key = get_default_algorithms()["ES256"].from_jwk(jwk)
        
        payload = jwt.decode(
            token,
            key,
            algorithms=["ES256"],
            audience="authenticated",
            options={"verify_exp": True},
        )
        user_id = payload["sub"]
        print(f"[debug-auth] Successfully verified token for user {user_id}")
        
    except jwt.ExpiredSignatureError:
        print("[debug-auth] Token has expired")
        raise HTTPException(status_code=401, detail="Token has expired")
    except jwt.InvalidTokenError as e:
        print(f"[debug-auth] Invalid token: {str(e)}")
        raise HTTPException(status_code=401, detail=f"Invalid token: {str(e)}")
    except Exception as e:
        print(f"[debug-auth] Unexpected auth error: {str(e)}")
        raise HTTPException(status_code=401, detail="Authentication failed")

    options = ClientOptions(headers={"Authorization": f"Bearer {token}"})
    user_client = create_client(supabase_url, supabase_key, options=options)

    return {
        "user_id": user_id,
        "supabase": user_client,
        "claims": payload,
        "is_admin": _is_admin_from_payload(payload),
    }


async def require_admin_context(context: dict = Depends(get_user_context)) -> dict:
    """Ensures the caller has an admin role claim before allowing privileged actions."""
    if not context.get("is_admin"):
        raise HTTPException(status_code=403, detail="Admin role required")
    return context