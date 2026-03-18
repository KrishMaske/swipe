import re
import logging
from fastapi import HTTPException

logger = logging.getLogger(__name__)

def _slugify_card_name(card_name: str) -> str:
    normalized = re.sub(r"[^a-z0-9]+", "-", (card_name or "").strip().lower())
    return normalized.strip("-") or "saved-card"

def _infer_card_network(card_name: str) -> str:
    normalized = (card_name or "").lower()
    if "visa" in normalized:
        return "Visa"
    if "mastercard" in normalized:
        return "Mastercard"
    if "american express" in normalized or "amex" in normalized:
        return "American Express"
    if "discover" in normalized:
        return "Discover"
    return "Unknown"

def replace_user_cards(context, cards):
    """Replaces a user's cards atomically using Supabase RPC."""
    sb = context["supabase"]
    user_id = context["user_id"]

    rows = []
    for card in cards:
        rows.append({
            "card_name": card.get("card_name"),
            "issuer": card.get("issuer"),
            "last_four": card.get("last_four") or "0000",
            "card_network": card.get("card_network") or _infer_card_network(card.get("card_name", "")),
            "logo_url": card.get("card_image_url") or card.get("logo_url"),
            "reward_multipliers": card.get("reward_multipliers") or card.get("reward_multiplier") or {},
            "reward_type": card.get("reward_type"),
            "annual_fee": float(card.get("annual_fee") or 0),
        })

    try:
        # Atomic replacement via RPC
        sb.rpc("replace_user_cards", {"p_user_id": user_id, "p_cards": rows}).execute()
        return get_saved_user_cards(context)
    except Exception as e:
        logger.error(f"Failed to replace cards for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to replace wallet cards.")

def get_saved_user_cards(context):
    sb = context["supabase"]
    user_id = context["user_id"]

    try:
        response = (
            sb.table("user_cards")
            .select("id, card_name, issuer, logo_url, reward_multipliers, reward_type, annual_fee")
            .eq("user_id", user_id)
            .execute()
        )

        cards = []
        for row in response.data or []:
            cards.append({
                "id": _slugify_card_name(row.get("card_name", "")),
                "card_name": row.get("card_name"),
                "issuer": row.get("issuer"),
                "card_image_url": row.get("logo_url"),
                "reward_type": row.get("reward_type"),
                "annual_fee": float(row.get("annual_fee") or 0),
                "reward_multipliers": row.get("reward_multipliers") or {},
            })
        return cards
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve saved wallet cards: {str(e)}")
