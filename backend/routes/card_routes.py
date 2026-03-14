from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel
from typing import Optional
from database.db import create_card, get_cards, update_card, delete_card
from config.security import get_user_context

class CardCreateRequest(BaseModel):
    card_name: str
    issuer: str
    last_four: str
    card_network: str
    logo_url: str
    reward_multiplier: dict
    reward_type: str
    annual_fee: float

class CardUpdateRequest(BaseModel):
    card_name: Optional[str] = None
    issuer: Optional[str] = None
    last_four: Optional[str] = None
    card_network: Optional[str] = None
    logo_url: Optional[str] = None
    reward_multiplier: Optional[dict] = None
    reward_type: Optional[str] = None
    annual_fee: Optional[float] = None
    
router = APIRouter()

@router.post("/api/cards/create")
def create_card_endpoint(request: CardCreateRequest, context: dict = Depends(get_user_context)):
    try:
        card_id = create_card(context, request)
        return {"success": f"Card created with ID {card_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/cards")
def get_cards_endpoint(context: dict = Depends(get_user_context)):
    try:
        cards = get_cards(context)
        return cards
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.put("/api/cards/update")
def update_card_endpoint(card_id: str, request: CardUpdateRequest, context: dict = Depends(get_user_context)):
    try:
        update_card(context, card_id, request)
        return {"success": f"Card with ID {card_id} updated successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.delete("/api/cards/delete")
def delete_card_endpoint(card_id: str, context: dict = Depends(get_user_context)):
    try:
        delete_card(context, card_id)
        return {"success": f"Card with ID {card_id} deleted successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))