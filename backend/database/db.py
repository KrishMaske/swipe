from fastapi import HTTPException
import re
from config.security import get_user_context
from config.settings import admin
from utils.crypt import encrypt, decrypt
from utils.embeddings import create_embedding
from datetime import datetime as dt, timezone
from utils.date_service import curr_time, epoch_to_date
from models.categorization import predict_category
from utils.location_cache import get_cached_location, update_cached_location
from models.fraud_detector import score_transaction


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

def create_simplefin_connection(context, access_url):
    sb = context["supabase"]
    user_id = context["user_id"]
    encrypted_url = encrypt(access_url)
    
    try:
        response = (
            sb.table("simplefin_conn")
            .insert({"user_id": user_id, "access_url": encrypted_url})
            .execute()
        )
        return {"success": "Connection created successfully"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create connection: {str(e)}")

def has_simplefin_connection(context) -> bool:
    sb = context["supabase"]
    user_id = context["user_id"]

    try:
        response = (
            sb.table("simplefin_conn")
            .select("id")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        return bool(response.data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to check SimpleFIN connection: {str(e)}")

def get_access_url(context) -> dict:
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        response = (
            sb.table("simplefin_conn")
            .select("id, access_url, last_sync")
            .eq("user_id", user_id)
            .single()
            .execute()
        )
        data = response.data
        
        access_url = decrypt(data["access_url"])
        
        if not (access_url.startswith("http://") or access_url.startswith("https://")):
            raise ValueError("Decrypted URL is malformed.")
            
        return {"id": data["id"], "access_url": access_url, "last_sync": data["last_sync"]}
        
    except Exception as e:
        raise HTTPException(status_code=404, detail="No linked bank connection found. Please link a bank first.")

def sync_accounts(context, sfc_id, raw_simplefin_data):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    actual_accounts_list = raw_simplefin_data.get("accounts", [])
    
    accounts_to_upsert = []
    all_acc_transactions = []
    
    for account in actual_accounts_list:
        accounts_to_upsert.append({
            "sfc_id": sfc_id,
            "acc_id": account["id"],
            "user_id": user_id,
            "provider": account["org"]["name"],
            "acc_type": account["name"],
            "currency": account.get("currency", "USD"),
            "balance": float(account["balance"]),
            "available_balance": account.get("available-balance"),
        })
        
        all_acc_transactions.append({"acc_id": account["id"], "txn": account["transactions"]})
    
    try:
        response = (
            sb.table("accounts")
            .upsert(accounts_to_upsert, on_conflict="acc_id")
            .execute()
        )

        return all_acc_transactions

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Database upsert failed: {str(e)}")

def update_sync_time(context, sfc_id, last_sync_epoch=None):
    sb = context["supabase"]
    user_id = context["user_id"]
    sync_value = last_sync_epoch if last_sync_epoch is not None else curr_time()
    
    try:
        response = (
            sb.table("simplefin_conn")
            .update({"last_sync": sync_value})
            .eq("id", sfc_id)
            .eq("user_id", user_id)
            .execute()
        )
        return response.data 

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update sync time: {str(e)}")

def sync_transactions(context, transactions):
    sb = context["supabase"]
    user_id = context["user_id"]
    insert_list = []
    for data in transactions:
        acc_id = data["acc_id"]
        txn_list = data["txn"]
        
        for txn in txn_list:
            merchant = txn["payee"]
            description = txn.get("description", "")
            category = predict_category(merchant)
            city, state = get_cached_location(description)
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
            fraud_detected = score_transaction(txn_dict, user_id)
            txn_dict["is_flagged_fraud"] = fraud_detected["is_anomaly"]
            txn_dict["risk_score"] = fraud_detected["risk_score"]
            if txn_dict["is_flagged_fraud"] == False:
                txn_dict["is_confirmed_fraud"] = False
            txn_dict["feature_breakdown"] = fraud_detected["features"]
            txn_dict["embedding"] = create_embedding(txn_dict)
            insert_list.append(txn_dict)
    if not insert_list:
        return {"status": "success", "message": "No new transactions to sync."}
    
    try:
        response = (
            sb.table("transactions")
            .upsert(insert_list, on_conflict="txn_id")
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to sync transactions: {str(e)}")
    
def get_accounts(context):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        response = (
            sb.table("accounts")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve accounts: {str(e)}")


def get_last_sync(context):
    sb = context["supabase"]
    user_id = context["user_id"]

    try:
        response = (
            sb.table("simplefin_conn")
            .select("last_sync")
            .eq("user_id", user_id)
            .limit(1)
            .execute()
        )
        rows = response.data or []
        if not rows:
            return {"last_sync": None}
        return {"last_sync": rows[0].get("last_sync")}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve last sync: {str(e)}")
    
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

    # If the user is correcting city/state we must refresh the disk cache so
    # future transactions with the same description use the verified values.
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
            pass  # cache update is best-effort; DB write still proceeds

    try:
        response = (
            sb.table("transactions")
            .update(update_fields)
            .eq("user_id", user_id)
            .eq("txn_id", txn_id)
            .execute()
        )

        # Keep the disk cache in sync with the user's manual correction.
        # Fall back to the existing DB value for whichever field wasn't changed.
        if location_corrected and description:
            final_city = update_fields.get("city") or existing_city or "REMOTE"
            final_state = update_fields.get("state") or existing_state or "REMOTE"
            update_cached_location(description, final_city, final_state)

        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update transaction: {str(e)}")

def create_budget(context, budget):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        response = (
            sb.table("budgets")
            .upsert({
                "user_id": user_id,
                "name": budget.name,
                "amount": budget.amount,
                "category": budget.category,
                "period": budget.period,
            })
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create budget: {str(e)}")

def get_active_budgets(context):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        response = (
            sb.table("budgets")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        return response.data
    except Exception as e:
        print(f"Failed to retrieve budgets: {str(e)}")
        return []

def update_budget(context, budget_id: str, budget_data):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    update_fields = {k: v for k, v in budget_data.dict().items() if v is not None}
    if not update_fields:
        return {"status": "success"}

    try:
        response = (
            sb.table("budgets")
            .update(update_fields)
            .eq("id", budget_id)
            .eq("user_id", user_id)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update budget: {str(e)}")


def delete_budget(context, budget_id: str):
    sb = context["supabase"]
    user_id = context["user_id"]

    try:
        sb.table("budgets").delete().eq("id", budget_id).eq("user_id", user_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete budget: {str(e)}")


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
    sb = context["supabase"]
    user_id = context["user_id"]

    rows = []
    for card in cards:
        rows.append({
            "user_id": user_id,
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
        sb.table("user_cards").delete().eq("user_id", user_id).execute()
        if rows:
            sb.table("user_cards").insert(rows).execute()
        return get_saved_user_cards(context)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to replace wallet cards: {str(e)}")


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


def delete_user_account(context):
    user_id = context["user_id"]

    try:
        # Remove dependent data first to avoid FK constraint issues.
        admin.table("transactions").delete().eq("user_id", user_id).execute()
        admin.table("budgets").delete().eq("user_id", user_id).execute()
        admin.table("user_cards").delete().eq("user_id", user_id).execute()
        admin.table("accounts").delete().eq("user_id", user_id).execute()
        admin.table("simplefin_conn").delete().eq("user_id", user_id).execute()

        # Delete the auth user from Supabase Auth.
        try:
            admin.auth.admin.delete_user(user_id, should_soft_delete=False)
        except TypeError:
            admin.auth.admin.delete_user(user_id)

        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete account: {str(e)}")