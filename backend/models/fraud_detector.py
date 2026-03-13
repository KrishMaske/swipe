import pandas as pd
import numpy as np
import joblib
import os
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from datetime import datetime, timezone

# ── Paths ──────────────────────────────────────────────────

_DIR = os.path.dirname(__file__)
GLOBAL_MODEL_PATH = os.path.join(_DIR, "global_fraud_detector.pkl")
GLOBAL_SCALER_PATH = os.path.join(_DIR, "global_fraud_scaler.pkl")
USER_PROFILES_PATH = os.path.join(_DIR, "user_profiles.pkl")

# In-memory cache (lazy-loaded on first inference call)
_global_model = None
_global_scaler = None
_user_profiles = None

DECAY_HALF_LIFE_DAYS = 30


# ── Profile Helpers ────────────────────────────────────────

def _recency_weight(txn_epoch: float, now_epoch: float) -> float:
    """Exponential decay — recent visits matter more.
    A visit 30 days ago has weight 0.5, 60 days ago 0.25, etc."""
    days_ago = (now_epoch - txn_epoch) / 86400
    return 2.0 ** (-days_ago / DECAY_HALF_LIFE_DAYS)


def _build_familiarity_map(df: pd.DataFrame, column: str, now_epoch: float) -> dict[str, float]:
    """Recency-weighted familiarity score per unique value in `column`."""
    fam = {}
    for _, row in df.iterrows():
        val = row.get(column)
        if pd.isna(val) or not val:
            continue
        key = str(val).upper().strip()
        weight = _recency_weight(row["txn_epoch"], now_epoch)
        fam[key] = fam.get(key, 0.0) + weight
    return fam


def _lookup_familiarity(fam_map: dict[str, float], value) -> float:
    """Look up recency-weighted familiarity. Returns 0 if unknown."""
    if not value or (isinstance(value, float) and pd.isna(value)):
        return 0.0
    return fam_map.get(str(value).upper().strip(), 0.0)


def _parse_txn_datetime(raw) -> datetime:
    """Parse txn_date whether it's an epoch number or a timestamp string."""
    try:
        ts = float(raw)
        if ts > 1e9:
            return datetime.fromtimestamp(ts, tz=timezone.utc)
    except (TypeError, ValueError):
        pass
    try:
        from dateutil import parser as dateutil_parser
        return dateutil_parser.parse(str(raw)).replace(tzinfo=timezone.utc)
    except (ValueError, TypeError):
        return datetime.now(timezone.utc)


# ── User Profile ───────────────────────────────────────────

def build_user_profile(transactions: list[dict]) -> dict:
    """Builds a behavioral profile from a user's transaction history."""
    if not transactions:
        return {}

    df = pd.DataFrame(transactions)
    df["amount"] = df["amount"].astype(float).abs()
    df["txn_date"] = pd.to_datetime(df["txn_date"], utc=True)
    df["txn_epoch"] = df["txn_date"].astype(np.int64) // 10**9
    df["hour"] = df["txn_date"].dt.hour
    df["day_of_week"] = df["txn_date"].dt.dayofweek

    now_epoch = float(df["txn_epoch"].max())

    merchant_fam = _build_familiarity_map(df, "merchant", now_epoch)
    location_fam = _build_familiarity_map(df, "city", now_epoch)
    state_fam = _build_familiarity_map(df, "state", now_epoch)

    return {
        "avg_amount": df["amount"].mean(),
        "std_amount": df["amount"].std() or 0.01,
        "median_amount": df["amount"].median(),
        "max_amount": df["amount"].max(),
        "most_common_hour": df["hour"].mode().iloc[0] if not df["hour"].mode().empty else 12,
        "most_common_day": df["day_of_week"].mode().iloc[0] if not df["day_of_week"].mode().empty else 0,
        "unique_merchants": df["merchant"].nunique(),
        "txn_count": len(df),
        "merchant_familiarity": merchant_fam,
        "location_familiarity": location_fam,
        "state_familiarity": state_fam,
    }


# ── Feature Extraction ────────────────────────────────────

def extract_features(txn: dict, profile: dict) -> list[float]:
    """Extracts behavioral deviation features for a single transaction against the user's profile."""
    amount = abs(float(txn.get("amount", 0)))

    txn_date = _parse_txn_datetime(txn.get("txn_date", 0))
    hour = txn_date.hour
    day_of_week = txn_date.weekday()

    avg = profile.get("avg_amount", amount)
    std = profile.get("std_amount", 1)
    median = profile.get("median_amount", amount)
    max_amt = profile.get("max_amount", amount)
    common_hour = profile.get("most_common_hour", 12)
    common_day = profile.get("most_common_day", 0)

    # Recency-weighted familiarity scores
    merchant_fam = _lookup_familiarity(profile.get("merchant_familiarity", {}), txn.get("merchant"))
    city_fam = _lookup_familiarity(profile.get("location_familiarity", {}), txn.get("city"))
    state_fam = _lookup_familiarity(profile.get("state_familiarity", {}), txn.get("state"))

    new_merchant = 1.0 if merchant_fam < 0.1 else 0.0
    new_location = 1.0 if city_fam < 0.1 and state_fam < 0.1 else 0.0

    # Amplified location signals — these are stronger fraud indicators
    # location_risk: fires when BOTH merchant AND location are unknown (stolen card in new city)
    location_risk = new_merchant * new_location
    # geo_jump: fires when the location is new but the merchant IS familiar (cloned card pattern)
    geo_jump = (1.0 - new_merchant) * new_location

    return [
        amount,
        (amount - avg) / std,                        # z-score vs user average
        amount / median if median > 0 else 1.0,      # ratio to median spend
        1.0 if amount > max_amt else 0.0,             # exceeds historical max
        min(abs(hour - common_hour), 24 - abs(hour - common_hour)) / 12.0,  # normalized circular hour deviation (0–1)
        min(abs(day_of_week - common_day), 7 - abs(day_of_week - common_day)) / 3.0,  # normalized circular day deviation (0–1)
        1.0 if hour < 4 or hour > 23 else 0.0,        # late-night flag (only truly extreme hours)
        merchant_fam,                                 # recency-weighted merchant familiarity
        city_fam,                                     # recency-weighted city familiarity
        state_fam,                                    # recency-weighted state familiarity
        new_merchant,                                 # binary: never/rarely seen merchant
        new_location,                                 # binary: never/rarely seen location
        location_risk,                                # amplified: unknown merchant + unknown location
        geo_jump,                                     # amplified: known merchant + unknown location (cloned card)
    ]


FEATURE_NAMES = [
    "amount",
    "z_score",
    "median_ratio",
    "exceeds_max",
    "hour_deviation",
    "unusual_day",
    "late_night",
    "merchant_familiarity",
    "city_familiarity",
    "state_familiarity",
    "new_merchant",
    "new_location",
    "location_risk",
    "geo_jump",
]


# ── Global Training ───────────────────────────────────────

def train_global_fraud_detector(all_transactions: list[dict]):
    """Trains a single global Isolation Forest using every user's personal baseline.

    Steps:
        1. Group transactions by user_id
        2. Build a behavioral profile per user
        3. Extract relative features for every transaction using its owner's profile
        4. Train one IsolationForest on the universal feature matrix
        5. Save model, scaler, and user_profiles to disk
    """

    # 1 ── Group by user
    txns_by_user: dict[str, list[dict]] = {}
    for txn in all_transactions:
        uid = txn.get("user_id", "unknown")
        txns_by_user.setdefault(uid, []).append(txn)

    # 2 ── Build per-user profiles
    user_profiles: dict[str, dict] = {}
    for uid, txns in txns_by_user.items():
        user_profiles[uid] = build_user_profile(txns)

    # 3 ── Extract features using each transaction's owner profile
    all_features = []
    for txn in all_transactions:
        uid = txn.get("user_id", "unknown")
        profile = user_profiles[uid]
        all_features.append(extract_features(txn, profile))

    # 4 ── Train
    X = np.array(all_features)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = IsolationForest(
        n_estimators=200,
        contamination=0.10,
        random_state=42,
    )
    model.fit(X_scaled)

    # 5 ── Persist
    joblib.dump(model, GLOBAL_MODEL_PATH)
    joblib.dump(scaler, GLOBAL_SCALER_PATH)
    joblib.dump(user_profiles, USER_PROFILES_PATH)

    # Bust the in-memory cache so next inference picks up the new model
    global _global_model, _global_scaler, _user_profiles
    _global_model = model
    _global_scaler = scaler
    _user_profiles = user_profiles

    return model, scaler, user_profiles


# ── Inference ──────────────────────────────────────────────

def _load_global_model() -> bool:
    """Lazy-load the global model, scaler, and profiles into memory."""
    global _global_model, _global_scaler, _user_profiles
    if _global_model is not None and _global_scaler is not None and _user_profiles is not None:
        return True
    if not all(os.path.exists(p) for p in [GLOBAL_MODEL_PATH, GLOBAL_SCALER_PATH, USER_PROFILES_PATH]):
        return False
    _global_model = joblib.load(GLOBAL_MODEL_PATH)
    _global_scaler = joblib.load(GLOBAL_SCALER_PATH)
    _user_profiles = joblib.load(USER_PROFILES_PATH)
    return True


def score_transaction(txn: dict, user_id: str) -> dict:
    """Score a single transaction against the global model.

    Looks up the user's stored profile for baseline comparison.
    If the user has no profile yet (brand-new user), returns neutral.

    Returns:
        dict with 'is_anomaly' (bool), 'risk_score' (float 0–1, higher = riskier),
        and 'features' (dict mapping feature names to values).
    """
    if not _load_global_model():
        return {"is_anomaly": False, "risk_score": 0.0, "message": "Global model not trained yet."}

    profile = _user_profiles.get(user_id)
    if profile is None:
        return {"is_anomaly": False, "risk_score": 0.0, "message": "No profile for this user yet."}

    features = extract_features(txn, profile)
    X = np.array([features])
    X_scaled = _global_scaler.transform(X)

    prediction = _global_model.predict(X_scaled)[0]          # 1 = normal, -1 = anomaly
    raw_score = _global_model.decision_function(X_scaled)[0]  # lower = more anomalous

    # Normalize to 0–1 (higher = riskier)
    risk_score = round(float(max(0.0, min(1.0, 0.5 - raw_score))), 3)

    feature_breakdown = {k: float(v) for k, v in zip(FEATURE_NAMES, features)}

    return {
        "is_anomaly": bool(prediction == -1 or risk_score > 0.45),
        "risk_score": risk_score,
        "features": feature_breakdown,
    }

if __name__ == "__main__":
    txns = pd.read_csv("fraud_rows.csv")
    all_txn_dicts = txns.to_dict(orient="records")
        
    print(f"Evaluating {len(txns)} transactions for fraud...\n" + "="*50)

    for txn in all_txn_dicts:
        user_id = str(txn.get("user_id", "unknown"))
        result = score_transaction(txn, user_id)
        
        # 1. Extract context for the console
        merchant = txn.get("merchant", "Unknown")
        amount = float(txn.get("amount", 0.0))
        city = txn.get("city", "Unknown")
        state = txn.get("state", "Unknown")
        txn_date = txn.get("txn_date", "Unknown Date")
        
        # 2. Setup colors and status
        is_anomaly = result.get("is_anomaly", False)
        risk_score = result.get("risk_score", 0.0)
        
        if is_anomaly:
            # Red text for Anomalies
            status_text = f"\033[91m🚨 ANOMALY DETECTED (Risk: {risk_score})\033[0m"
        else:
            # Green text for Normal
            status_text = f"\033[92m✅ NORMAL (Risk: {risk_score})\033[0m"

        # 3. Print the clean UI
        print(f"[{txn_date}] {merchant} | ${abs(amount):.2f} | {city}, {state}")
        print(f"Result: {status_text}")
        
        # Print warning messages if the model isn't ready
        if "message" in result:
            print(f"Note:   {result['message']}")
            
        # Neatly align the features if they exist
        if "features" in result:
            print("Feature Breakdown:")
            for feature, value in result["features"].items():
                # The '<22' aligns the colons perfectly in the terminal
                print(f"  - {feature:<22}: {value:.3f}")
                
        print("-" * 50)
    