import re
from typing import Any

import requests


NOMINATIM_URL = "https://nominatim.openstreetmap.org/reverse"
NOMINATIM_HEADERS = {
    "User-Agent": "SwipeSmart/1.0 (smart-card-evaluator)",
}

OVERPASS_URL = "https://overpass-api.de/api/interpreter"
_MAX_GEOFENCES = 18  # iOS allows 20 total; leave 2 as buffer


def get_nearby_merchants(latitude: float, longitude: float, radius: int = 400) -> list[dict[str, Any]]:
    """Return named commercial POIs within `radius` metres using the Overpass API."""
    query = f"""
[out:json][timeout:8];
(
  node["amenity"~"restaurant|fast_food|cafe|bar|pub|supermarket|convenience|pharmacy|hotel|cinema|fuel|theatre|nightclub|food_court|ice_cream|car_wash"](around:{radius},{latitude},{longitude});
  node["shop"](around:{radius},{latitude},{longitude});
  node["tourism"~"hotel|motel"](around:{radius},{latitude},{longitude});
  node["leisure"~"stadium|bowling_alley|amusement_arcade"](around:{radius},{latitude},{longitude});
);
out body {_MAX_GEOFENCES};
"""
    try:
        response = requests.post(
            OVERPASS_URL,
            data={"data": query},
            headers={"User-Agent": "SwipeSmart/1.0"},
            timeout=8,
        )
        response.raise_for_status()
        elements = response.json().get("elements", [])

        merchants = []
        for el in elements:
            name = _clean_text(el.get("tags", {}).get("name"))
            if not name:
                continue
            lat = el.get("lat")
            lon = el.get("lon")
            if lat is None or lon is None:
                continue
            merchants.append({"name": name, "latitude": lat, "longitude": lon})

        return merchants[:_MAX_GEOFENCES]
    except Exception:
        return []

NON_COMMERCIAL_TYPES = {
    "house",
    "residential",
    "apartments",
    "road",
    "footway",
    "path",
    "neighbourhood",
    "suburb",
    "hamlet",
    "city",
    "county",
    "state",
    "postcode",
}


def _clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "")).strip()


def resolve_place_details(latitude: float, longitude: float) -> dict[str, Any]:
    fallback = {
        "place_name": "Nearby merchant",
        "display_name": "Nearby merchant",
        "source_category": "unknown",
        "source_type": "unknown",
        "is_commercial": False,
    }

    try:
        response = requests.get(
            NOMINATIM_URL,
            params={
                "lat": latitude,
                "lon": longitude,
                "format": "jsonv2",
                "zoom": 18,
                "addressdetails": 1,
                "namedetails": 1,
            },
            headers=NOMINATIM_HEADERS,
            timeout=6,
        )
        response.raise_for_status()
        payload = response.json()

        display_name = _clean_text(payload.get("display_name")) or fallback["display_name"]
        place_name = (
            _clean_text(payload.get("name"))
            or _clean_text((payload.get("namedetails") or {}).get("name"))
            or display_name.split(",")[0]
        )
        source_category = str(payload.get("category") or "unknown").lower()
        source_type = str(payload.get("type") or "unknown").lower()

        is_commercial = source_category in {"amenity", "shop", "tourism", "leisure", "office", "craft"}
        if source_type in NON_COMMERCIAL_TYPES:
            is_commercial = False

        return {
            "place_name": place_name,
            "display_name": display_name,
            "source_category": source_category,
            "source_type": source_type,
            "is_commercial": is_commercial,
        }
    except Exception:
        return fallback


def _dedupe(values: list[str]) -> list[str]:
    ordered = []
    seen = set()
    for value in values:
        if value and value not in seen:
            ordered.append(value)
            seen.add(value)
    return ordered


def infer_reward_profile(place: dict[str, Any]) -> dict[str, Any]:
    source_type = str(place.get("source_type") or "").lower()
    source_category = str(place.get("source_category") or "").lower()
    merchant_blob = f"{place.get('place_name', '')} {place.get('display_name', '')}".upper()

    category_label = "Everyday"
    reward_keys = ["everything_else"]

    if source_type in {"restaurant", "fast_food", "cafe", "bar", "pub", "food_court", "ice_cream", "biergarten"}:
        category_label = "Dining"
        reward_keys = ["dining", "everything_else"]
    elif source_type in {"supermarket", "grocery", "greengrocer", "convenience", "marketplace"}:
        category_label = "Grocery"
        reward_keys = ["grocery", "whole_foods", "everything_else"]
    elif source_type in {"fuel", "gas_station", "charging_station", "car_wash"}:
        category_label = "Gas"
        reward_keys = ["gas", "costco_gas", "ev_charging", "everything_else"]
    elif source_type in {"pharmacy", "chemist", "drugstore"}:
        category_label = "Drugstores"
        reward_keys = ["drugstores", "everything_else"]
    elif source_type in {"hotel", "motel", "hostel", "guest_house", "resort", "airport", "airfield"}:
        category_label = "Travel"
        reward_keys = ["travel", "flights", "airline_hotel_direct", "everything_else"]
    elif source_type in {"bus_station", "train_station", "subway_entrance", "tram_stop", "ferry_terminal", "parking"}:
        category_label = "Transit"
        reward_keys = ["transit", "select_transit", "everything_else"]
    elif source_type in {"cinema", "theatre", "museum", "stadium", "nightclub", "bowling_alley", "arts_centre", "amusement_arcade"}:
        category_label = "Entertainment"
        reward_keys = ["entertainment", "live_entertainment", "capital_one_entertainment", "everything_else"]
    elif source_category == "shop":
        category_label = "Retail"
        reward_keys = ["everything_else"]

    if "TARGET" in merchant_blob:
        category_label = "Retail"
        reward_keys = ["target", *reward_keys]
    if "VERIZON" in merchant_blob:
        category_label = "Wireless"
        reward_keys = ["verizon_store", *reward_keys]
    if "COSTCO" in merchant_blob:
        reward_keys = ["costco", *reward_keys]
        if category_label == "Gas":
            reward_keys = ["costco_gas", *reward_keys]
    if "WHOLE FOODS" in merchant_blob:
        reward_keys = ["whole_foods", "grocery", *reward_keys]
    if "APPLE" in merchant_blob:
        reward_keys = ["apple_and_select_merchants_via_apple_pay", "apple_pay", *reward_keys]

    return {
        "category": category_label,
        "reward_keys": _dedupe(reward_keys),
    }


def evaluate_best_card(cards: list[dict[str, Any]], place: dict[str, Any]) -> dict[str, Any]:
    reward_profile = infer_reward_profile(place)
    best_match = None

    for card in cards:
        multipliers = card.get("reward_multipliers") or card.get("reward_multiplier") or {}
        best_key = "everything_else"
        best_multiplier = float(multipliers.get("everything_else") or multipliers.get("physical_card") or 0)

        for reward_key in reward_profile["reward_keys"]:
            value = multipliers.get(reward_key)
            if value is None:
                continue
            try:
                numeric_value = float(value)
            except (TypeError, ValueError):
                continue
            if numeric_value > best_multiplier:
                best_multiplier = numeric_value
                best_key = reward_key

        if best_match is None or best_multiplier > best_match["multiplier"]:
            best_match = {
                "best_card_name": card.get("card_name"),
                "multiplier": best_multiplier,
                "matched_key": best_key,
            }

    return {
        "place_name": place.get("place_name"),
        "category": reward_profile["category"],
        "reward_keys": reward_profile["reward_keys"],
        "is_commercial": bool(place.get("is_commercial")),
        "best_card_name": best_match.get("best_card_name") if best_match else None,
        "multiplier": best_match.get("multiplier") if best_match else None,
        "matched_key": best_match.get("matched_key") if best_match else None,
    }