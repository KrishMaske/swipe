from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from utils.simplefin_service import exchange_setup
from database.db import create_simplefin_connection, has_simplefin_connection
from config.security import get_user_context

router = APIRouter()

class SimplefinPayload(BaseModel):
    setup_token: str

@router.post("/api/exchange-setup")
async def exchange_setup_handler(payload: SimplefinPayload, context: dict = Depends(get_user_context)):
    """Standardized to kebab-case: exchanges a SimpleFIN setup token for an access URL."""
    access_url = await exchange_setup(payload.setup_token)
    
    if isinstance(access_url, dict) and "error" in access_url:
        raise HTTPException(status_code=400, detail=access_url["error"])
    
    # create_simplefin_connection is currently sync
    result = create_simplefin_connection(context, access_url)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return {"message": "Setup exchange successful"}

@router.get("/api/simplefin/status")
async def simplefin_status_handler(context: dict = Depends(get_user_context)):
    return {"linked": has_simplefin_connection(context)}