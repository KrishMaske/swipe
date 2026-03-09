from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from utils.simplefin_service import retrieve_accounts
from database.db import get_access_url, sync_accounts, sync_transactions, update_sync_time
from config.security import get_user_context
from utils.date_service import ninety_days

router = APIRouter()


@router.get("/api/sync_accounts")
def sync_accounts_endpoint(background_tasks: BackgroundTasks, context: dict = Depends(get_user_context)):
    try:
        data = get_access_url(context)
        access_url = data["access_url"]
        last_sync = data.get("last_sync")
        
        if last_sync:
            start_date = last_sync - 259200
        else:
            start_date = ninety_days()
            
        accounts = retrieve_accounts(access_url, start_date)
        all_acc_transactions = sync_accounts(context, data["id"], accounts)
        
        background_tasks.add_task(sync_transactions, context, all_acc_transactions)
        background_tasks.add_task(update_sync_time, context, data["id"])
        return {"accounts": accounts}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))