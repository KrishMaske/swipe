from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from utils.simplefin_service import exchange_setup
from database.db import create_simplefin_connection
from config.security import get_user_context

router = APIRouter()

class SimplefinPayload(BaseModel):
    setup_token: str

@router.post("/api/exchange_setup")
def exchange_setup_endpoint(payload: SimplefinPayload, context: dict = Depends(get_user_context)):
    access_url = exchange_setup(payload.setup_token)
    
    if isinstance(access_url, dict) and "error" in access_url:
        raise HTTPException(status_code=400, detail=access_url["error"])
    
    result = create_simplefin_connection(context, access_url)
    
    if "error" in result:
        raise HTTPException(status_code=400, detail=result["error"])
    
    return {"message": "Setup exchange successful"}