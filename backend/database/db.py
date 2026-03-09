from fastapi import HTTPException
from config.security import get_user_context
from utils.crypt import encrypt, decrypt
from datetime import datetime as dt, timezone
from utils.date_service import curr_time

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
            .select("id, access_url", "last_sync")
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
            insert_list.append({
                "user_id": user_id,
                "txn_id": txn["id"],
                "acc_id": acc_id,
                "amount": float(txn["amount"]),
                "merchant": txn["payee"],
                "description": txn.get("description", ""),
                "txn_date": txn["transacted_at"]
            })
            
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