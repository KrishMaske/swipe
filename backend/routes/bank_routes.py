from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException
from pydantic import BaseModel
from utils.simplefin_service import retrieve_accounts
from typing import Optional
from database.db import create_budget, update_budget, delete_budget, get_access_url, get_active_budgets, sync_accounts, sync_transactions, update_sync_time, get_accounts, get_last_sync, get_transactions, get_fraudulent_transactions, update_fraud_status
from config.security import get_user_context
from utils.date_service import ninety_days, epoch_to_date

class BudgetCreateRequest(BaseModel):
    name: str
    amount: float
    category: str
    period: str

class BudgetUpdateRequest(BaseModel):
    name: Optional[str] = None
    amount: Optional[float] = None
    category: Optional[str] = None
    period: Optional[str] = None

router = APIRouter()

@router.get("/api/accounts/sync")
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
        return {"success": "Account sync initiated. Transactions will be updated in the background."}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/accounts")
def get_accounts_endpoint(context: dict = Depends(get_user_context)):
    return get_accounts(context)


@router.get("/api/accounts/sync-status")
def get_sync_status_endpoint(context: dict = Depends(get_user_context)):
    return get_last_sync(context)

@router.get("/api/transactions")
def get_transactions_endpoint(acc_id, context: dict = Depends(get_user_context)):
    return get_transactions(context, acc_id)

@router.get("/api/transactions/fraud")
def get_fraudulent_transactions_endpoint(context: dict = Depends(get_user_context)):
    return get_fraudulent_transactions(context)

@router.post("/api/transactions/update-fraud-status")
def update_fraud_status_endpoint(txn_id: str, is_confirmed_fraud: bool, context: dict = Depends(get_user_context)):
    return update_fraud_status(context, txn_id, is_confirmed_fraud)

@router.get("/api/transactions/budgets")
def get_budgets_endpoint(context: dict = Depends(get_user_context)):
    return get_active_budgets(context)

@router.post("/api/transactions/create-budget")
def create_budget_endpoint(budget: BudgetCreateRequest, context: dict = Depends(get_user_context)):
    return create_budget(context, budget)

@router.put("/api/transactions/budgets/{budget_id}")
def update_budget_endpoint(budget_id: str, budget: BudgetUpdateRequest, context: dict = Depends(get_user_context)):
    return update_budget(context, budget_id, budget)

@router.delete("/api/transactions/budgets/{budget_id}")
def delete_budget_endpoint(budget_id: str, context: dict = Depends(get_user_context)):
    return delete_budget(context, budget_id)