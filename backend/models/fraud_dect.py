import pandas as pd
import numpy as np
import joblib
import os
from sklearn.ensemble import IsolationForest
from sklearn.preprocessing import StandardScaler
from datetime import datetime, timezone

MODEL_PATH = os.path.join(os.path.dirname(__file__), "fraud_detector.pkl")
SCALER_PATH = os.path.join(os.path.dirname(__file__), "fraud_scaler.pkl")

_model = None
_scaler = None

DECAY_HALF_LIFE_DAYS = 30 


def _recency_weight(txn_epoch: float, now_epoch: float) -> float:
    """Exponential decay weight — recent visits matter more.
    A visit 30 days ago has weight 0.5, 60 days ago 0.25, etc."""
    days_ago = (now_epoch - txn_epoch) / 86400
    return 2.0 ** (-days_ago / DECAY_HALF_LIFE_DAYS)


def _build_familiarity_map(df: pd.DataFrame, column: str, now_epoch: float) -> dict[str, float]:
    """Builds a recency-weighted familiarity score per unique value in `column`.
    Score is the sum of decay-weighted visits, so a merchant visited 5 times recently
    scores far higher than one visited once 3 months ago."""
    fam = {}
    for _, row in df.iterrows():
        val = row.get(column)
        if pd.isna(val) or not val:
            continue
        key = str(val).upper().strip()
        weight = _recency_weight(row["txn_epoch"], now_epoch)
        fam[key] = fam.get(key, 0.0) + weight
    return fam


def build_user_profile(transactions: list[dict]) -> dict:
    """Builds a behavioral profile from a user's transaction history."""
    if not transactions:
        return {}

    df = pd.DataFrame(transactions)
    df["amount"] = df["amount"].astype(float).abs()
    df["txn_date"] = pd.to_datetime(df["txn_date"], unit="s", utc=True)
    df["txn_epoch"] = df["txn_date"].astype(np.int64) // 10**9
    df["hour"] = df["txn_date"].dt.hour
    df["day_of_week"] = df["txn_date"].dt.dayofweek

    now_epoch = float(datetime.now(timezone.utc).timestamp())

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


def _lookup_familiarity(fam_map: dict[str, float], value) -> float:
    """Look up recency-weighted familiarity. Returns 0 if unknown."""
    if not value or pd.isna(value):
        return 0.0
    return fam_map.get(str(value).upper().strip(), 0.0)


def extract_features(txn: dict, profile: dict) -> list[float]:
    """Extracts behavioral deviation features for a single transaction against the user's profile."""
    amount = abs(float(txn.get("amount", 0)))
    txn_date = datetime.fromtimestamp(txn.get("txn_date", 0), tz=timezone.utc)
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

    # New merchant = never seen OR decayed to near zero
    new_merchant = 1.0 if merchant_fam < 0.1 else 0.0
    new_location = 1.0 if city_fam < 0.1 and state_fam < 0.1 else 0.0

    return [
        amount,
        (amount - avg) / std,                        # z-score vs user average
        amount / median if median > 0 else 1.0,      # ratio to median spend
        1.0 if amount > max_amt else 0.0,             # exceeds historical max
        abs(hour - common_hour),                      # deviation from typical hour
        1.0 if day_of_week != common_day else 0.0,    # unusual day
        1.0 if hour < 5 or hour > 23 else 0.0,        # late-night flag
        merchant_fam,                                 # how familiar this merchant is (recency-weighted)
        city_fam,                                     # how familiar this city is
        state_fam,                                    # how familiar this state is
        new_merchant,                                 # binary: never/rarely seen merchant
        new_location,                                 # binary: never/rarely seen location
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
]


# --- Model Training ---

def train_fraud_detector(transactions: list[dict]):
    """Trains an Isolation Forest on a user's normal transaction patterns."""
    profile = build_user_profile(transactions)
    features = [extract_features(txn, profile) for txn in transactions]

    X = np.array(features)
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)

    model = IsolationForest(
        n_estimators=200,
        contamination=0.05,
        random_state=42,
    )
    model.fit(X_scaled)

    joblib.dump(model, MODEL_PATH)
    joblib.dump(scaler, SCALER_PATH)
    print(f"Fraud detector trained on {len(transactions)} transactions and saved.")


# --- Inference ---

def _load_model():
    global _model, _scaler
    if _model is None or _scaler is None:
        if not os.path.exists(MODEL_PATH) or not os.path.exists(SCALER_PATH):
            return False
        _model = joblib.load(MODEL_PATH)
        _scaler = joblib.load(SCALER_PATH)
    return True


def score_transaction(txn: dict, profile: dict) -> dict:
    """Scores a single transaction for fraud risk.

    Returns:
        dict with 'is_anomaly' (bool) and 'risk_score' (float 0-1, higher = riskier).
    """
    if not _load_model():
        return {"is_anomaly": False, "risk_score": 0.0}

    features = np.array([extract_features(txn, profile)])
    scaled = _scaler.transform(features)

    prediction = _model.predict(scaled)[0]       # 1 = normal, -1 = anomaly
    raw_score = _model.decision_function(scaled)[0]  # lower = more anomalous

    # Normalize decision_function output to 0-1 risk score (invert so higher = riskier)
    risk_score = round(max(0.0, min(1.0, 0.5 - raw_score)), 3)

    return {
        "is_anomaly": prediction == -1,
        "risk_score": risk_score,
    }
