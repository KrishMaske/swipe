from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from database.db import get_saved_user_cards, replace_user_cards
from config.security import get_user_context
from utils.location_evaluator import evaluate_best_card, resolve_place_details, get_nearby_merchants


class WalletCardRequest(BaseModel):
    id: str
    card_name: str
    issuer: str
    card_image_url: str
    reward_type: str
    annual_fee: float
    reward_multipliers: dict


class SaveWalletCardsRequest(BaseModel):
    cards: list[WalletCardRequest]


class LocationEvaluateRequest(BaseModel):
    latitude: float
    longitude: float


router = APIRouter()


@router.get("/api/user/cards")
def get_user_cards_endpoint(context: dict = Depends(get_user_context)):
    return get_saved_user_cards(context)


@router.post("/api/user/cards")
def save_user_cards_endpoint(request: SaveWalletCardsRequest, context: dict = Depends(get_user_context)):
    cards = [card.model_dump() for card in request.cards]
    saved_cards = replace_user_cards(context, cards)
    return {
        "status": "success",
        "count": len(saved_cards),
        "cards": saved_cards,
    }


@router.get("/api/location/nearby-merchants")
def nearby_merchants_endpoint(lat: float, lon: float, context: dict = Depends(get_user_context)):
    return get_nearby_merchants(lat, lon)


@router.post("/api/location/evaluate")
def evaluate_location_endpoint(request: LocationEvaluateRequest, context: dict = Depends(get_user_context)):
    saved_cards = get_saved_user_cards(context)
    place = resolve_place_details(request.latitude, request.longitude)
    evaluation = evaluate_best_card(saved_cards, place)
    return {
        **evaluation,
        "latitude": request.latitude,
        "longitude": request.longitude,
    }