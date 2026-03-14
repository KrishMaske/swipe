from fastapi import APIRouter, Depends, HTTPException
from database.db import get_all_non_fraudulent_transactions
from config.security import get_user_context
from models.fraud_detector import train_global_fraud_detector, score_transaction

router = APIRouter()


@router.post("/api/train-fraud-model")
async def trigger_global_training():
    """Fetches ALL transactions (admin) and trains the global fraud model."""

    all_txns = get_all_non_fraudulent_transactions()

    if len(all_txns) < 20:
        return {
            "status": "warning",
            "message": f"Only {len(all_txns)} transactions found. Need at least 50 to train a useful model.",
        }

    model, scaler, user_profiles = train_global_fraud_detector(all_txns)

    return {
        "status": "success",
        "message": f"Global fraud model trained on {len(all_txns)} transactions across {len(user_profiles)} users.",
    }


@router.post("/api/score-transaction")
async def score_single_transaction(
    txn: dict,
    context: dict = Depends(get_user_context),
):
    """Score a single transaction for fraud risk using the global model."""

    user_id = context["user_id"]
    result = score_transaction(txn, user_id)

    return result