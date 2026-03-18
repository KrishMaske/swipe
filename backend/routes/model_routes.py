from pydantic import BaseModel
from typing import Optional
from fastapi import APIRouter, Depends, HTTPException, Request
from database.db import get_all_non_fraudulent_transactions
from config.security import get_user_context, require_admin_context
from models.fraud_detector import train_global_fraud_detector, score_transaction

router = APIRouter()

class TransactionScoreRequest(BaseModel):
    txn_id: str
    acc_id: str
    amount: float
    merchant: str
    description: Optional[str] = ""
    txn_date: str

@router.post("/api/train-fraud-model")
async def trigger_global_training(context: dict = Depends(require_admin_context)):
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


from config.rate_limit import limiter

@router.post("/api/score-transaction")
@limiter.limit("10/minute")
async def score_single_transaction(
    request: Request,
    txn: TransactionScoreRequest,
    context: dict = Depends(get_user_context),
):
    """Score a single transaction for fraud risk using the global model."""

    user_id = context["user_id"]
    # score_transaction expects a dict, so we convert the Pydantic model
    result = score_transaction(txn.dict(), user_id)

    return result