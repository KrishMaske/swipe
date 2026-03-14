from fastapi import HTTPException
from config.security import get_user_context
from config.settings import admin
from utils.crypt import encrypt, decrypt
from utils.embeddings import create_embedding
from datetime import datetime as dt, timezone
from utils.date_service import curr_time, epoch_to_date
from models.categorization import predict_category
from models.ner import extract_location
from models.fraud_detector import score_transaction

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

def update_sync_time(context, sfc_id):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        response = (
            sb.table("simplefin_conn")
            .update({"last_sync": curr_time()})
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
            city, state = extract_location(description)
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
    
def get_transactions(context, acc_id):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        response = (
            sb.table("transactions")
            .select("id, user_id, txn_id, acc_id, amount, merchant, description, category, city, state, txn_date")
            .eq("user_id", user_id)
            .eq("acc_id", acc_id)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve transactions: {str(e)}")

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

def update_budget(context, budget_id: str, budget):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    update_data = {}
    if budget.name is not None: update_data["name"] = budget.name
    if budget.amount is not None: update_data["amount"] = budget.amount
    if budget.category is not None: update_data["category"] = budget.category
    if budget.period is not None: update_data["period"] = budget.period
    
    if not update_data:
        return {"status": "success", "message": "No fields to update."}
        
    try:
        response = (
            sb.table("budgets")
            .update(update_data)
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
        response = (
            sb.table("budgets")
            .delete()
            .eq("id", budget_id)
            .eq("user_id", user_id)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete budget: {str(e)}")

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

def delete_budget(context, budget_id: str):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        sb.table("budgets").delete().eq("id", budget_id).eq("user_id", user_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete budget: {str(e)}")

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
    
    
def create_card(context, card_data):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        sb.table("user_cards").upsert({
            "user_id": user_id,
            "card_name": card_data.card_name,
            "issuer": card_data.issuer,
            "last_four": card_data.last_four,
            "card_network": card_data.card_network,
            "logo_url": card_data.logo_url,
            "reward_multiplier": card_data.reward_multiplier,
            "reward_type": card_data.reward_type,
            "annual_fee": card_data.annual_fee,
        }).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create card: {str(e)}")
    
def get_cards(context):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    try:
        response = (
            sb.table("user_cards")
            .select("*")
            .eq("user_id", user_id)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to retrieve cards: {str(e)}")
    
def update_card(context, card_id, card_data):
    sb = context["supabase"]
    user_id = context["user_id"]
    
    update_fields = {k: v for k, v in card_data.dict().items() if v is not None}
    if not update_fields:
        return {"status": "success"}

    try:
        response = (
            sb.table("user_cards")
            .update(update_fields)
            .eq("id", card_id)
            .eq("user_id", user_id)
            .execute()
        )
        return response.data
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update card: {str(e)}")

def delete_card(context, card_id):
    sb = context["supabase"]
    user_id = context["user_id"]

    try:
        sb.table("user_cards").delete().eq("id", card_id).eq("user_id", user_id).execute()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to delete card: {str(e)}")