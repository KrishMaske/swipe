import logging
from fastapi import HTTPException

logger = logging.getLogger(__name__)
from config.settings import admin
from utils.crypt import encrypt, decrypt
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

def delete_user_account(context):
    """Deletes a user's data atomically using Supabase RPC and then removes the auth user."""
    sb = context["supabase"]
    user_id = context["user_id"]

    try:
        # Atomic deletion of all user-related data via RPC
        sb.rpc("delete_user_data", {"p_user_id": user_id}).execute()

        # Delete the auth user from Supabase Auth.
        try:
            admin.auth.admin.delete_user(user_id, should_soft_delete=False)
        except TypeError:
            admin.auth.admin.delete_user(user_id)

        return {"status": "success"}
    except Exception as e:
        logger.error(f"Failed to delete account for user {user_id}: {e}")
        raise HTTPException(status_code=500, detail="Failed to delete account.")
