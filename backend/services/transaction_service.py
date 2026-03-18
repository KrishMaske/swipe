import asyncio
import logging
from fastapi import HTTPException
from config.settings import admin
from utils.embeddings import create_embedding
from utils.date_service import epoch_to_date
from models.categorization import predict_category
from utils.location_cache import get_cached_location, update_cached_location
from models.fraud_detector import score_transaction

logger = logging.getLogger(__name__)

def get_latest_transaction_epoch(all_acc_transactions):
    latest_epoch = None

    for account_data in all_acc_transactions or []:
        for txn in account_data.get("txn", []) or []:
            raw_ts = txn.get("transacted_at")
            if raw_ts is None:
                continue

            try:
                txn_epoch = int(float(raw_ts))
            except (TypeError, ValueError):
                continue

            if latest_epoch is None or txn_epoch > latest_epoch:
                latest_epoch = txn_epoch

    return latest_epoch

async def process_single_transaction(txn, acc_id, user_id):
    """Processes a single transaction: categorization, location, fraud scoring, and embedding."""
    merchant = txn["payee"]
    description = txn.get("description", "")
    
    # Offload CPU-bound tasks to threads to avoid blocking the event loop
    category = await asyncio.to_thread(predict_category, merchant)
    city, state = await asyncio.to_thread(get_cached_location, description)
    
    if not city and not state:
        city, state = "REMOTE", "REMOTE"
        
    txn_dict = {
        "user_id": user_id,
        "txn_id": txn["id"],
        "acc_id": acc_id,
        "amount": float(txn["amount"]),
        "merchant": merchant,
        "description": description,
        "category": category,
        "city": city,
        "state": state,
        "txn_date": epoch_to_date(txn["transacted_at"]),
    }
    
    fraud_detected = await asyncio.to_thread(score_transaction, txn_dict, user_id)
    txn_dict["is_flagged_fraud"] = fraud_detected["is_anomaly"]
    txn_dict["risk_score"] = fraud_detected["risk_score"]
    if txn_dict["is_flagged_fraud"] == False:
        txn_dict["is_confirmed_fraud"] = False
    txn_dict["feature_breakdown"] = fraud_detected["features"]
    
    txn_dict["embedding"] = await asyncio.to_thread(create_embedding, txn_dict)
    return txn_dict

async def sync_transactions(context, transactions):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    tasks = []
    for data in transactions:
        acc_id = data["acc_id"]
        txn_list = data["txn"]
        for txn in txn_list:
            tasks.append(process_single_transaction(txn, acc_id, user_id))

    if not tasks:
        return {"status": "success", "message": "No new transactions to sync."}

    # Process all transactions in parallel
    insert_list = await asyncio.gather(*tasks)
    
    try:
        response = (
            sb.table("transactions")
            .upsert(insert_list, on_conflict="txn_id")
            .execute()
        )
        return response.data
    except Exception as e:
        logger.error(f"Failed to sync transactions for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to sync transactions.")

def get_transactions(context, acc_id):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        response = (
            sb.table("transactions")
            .select("id, user_id, txn_id, acc_id, amount, merchant, description, category, city, state, txn_date, is_flagged_fraud, is_confirmed_fraud, risk_score")
            .eq("user_id", user_id)
            .eq("acc_id", acc_id)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transactions: {str(e)}")

def update_transaction(context, txn_id: str, transaction_data):
    sb = context["supabase"]
    user_id = context["user_id"]

    update_fields = {k: v for k, v in transaction_data.dict().items() if v is not None}
    if not update_fields:
        return {"status": "success"}

    location_corrected = "city" in update_fields or "state" in update_fields
    description = None
    existing_city = None
    existing_state = None

    if location_corrected:
        try:
            row = (
                sb.table("transactions")
                .select("description, city, state")
                .eq("user_id", user_id)
                .eq("txn_id", txn_id)
                .single()
                .execute()
            )
            row_data = row.data or {}
            description = row_data.get("description")
            existing_city = row_data.get("city")
            existing_state = row_data.get("state")
        except Exception:
            pass

    try:
        response = (
            sb.table("transactions")
            .update(update_fields)
            .eq("user_id", user_id)
            .eq("txn_id", txn_id)
            .execute()
        )

        if location_corrected and description:
            final_city = update_fields.get("city") or existing_city or "REMOTE"
            final_state = update_fields.get("state") or existing_state or "REMOTE"
            update_cached_location(description, final_city, final_state)

        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update transaction: {str(e)}")

def get_all_non_fraudulent_transactions():
    try:
        response = (
            admin.table("transactions")
            .select("*")
            .or_("is_confirmed_fraud.eq.false,is_confirmed_fraud.is.null")
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transactions: {str(e)}")

def get_fraudulent_transactions(context):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        response = (
            sb.table("transactions")
            .select("*")
            .eq("user_id", user_id)
            .eq("is_flagged_fraud", True)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve fraudulent transactions: {str(e)}")

def update_fraud_status(context, txn_id, is_confirmed_fraud):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        response = (
            sb.table("transactions")
            .update({"is_confirmed_fraud": is_confirmed_fraud})
            .eq("user_id", user_id)
            .eq("txn_id", txn_id)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update fraud status: {str(e)}")
