from fastapi import APIRouter, Depends, BackgroundTasks, HTTPException, Request
from pydantic import BaseModel
from utils.simplefin_service import retrieve_accounts
from typing import Optional
from database.db import (
    create_budget, 
    update_budget, 
    delete_budget, 
    get_access_url, 
    get_active_budgets, 
    sync_accounts, 
    sync_transactions, 
    update_sync_time, 
    get_accounts, 
    get_last_sync, 
    get_transactions, 
    get_fraudulent_transactions, 
    update_fraud_status, 
    get_latest_transaction_epoch, 
    update_transaction
)
from config.security import get_user_context
from config.rate_limit import limiter
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


class TransactionUpdateRequest(BaseModel):
    merchant: Optional[str] = None
    description: Optional[str] = None
    category: Optional[str] = None
    city: Optional[str] = None
    state: Optional[str] = None

router = APIRouter(tags=["Bank Account Management"])

@router.post("/api/accounts/sync")
@limiter.limit("3/hour")
async def sync_accounts_handler(request: Request, background_tasks: BackgroundTasks, context: dict = Depends(get_user_context)):
    """Standardized to POST: triggers a bank transaction sync."""
    try:
        data = get_access_url(context)
        access_url = data["access_url"]
        last_sync = data.get("last_sync")
        
        if last_sync:
            start_date = last_sync - 259200 # 3 days buffer
        else:
            start_date = ninety_days()
            
        # retrieve_accounts is now async
        accounts = await retrieve_accounts(access_url, start_date)
        all_acc_transactions = sync_accounts(context, data["id"], accounts)

        latest_txn_epoch = get_latest_transaction_epoch(all_acc_transactions)
        if latest_txn_epoch is not None:
            background_tasks.add_task(sync_transactions, context, all_acc_transactions)
            background_tasks.add_task(update_sync_time, context, data["id"], latest_txn_epoch)

        return {"success": "Account sync initiated. Transactions will be updated in the background."}
    
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@router.get("/api/accounts")
async def get_accounts_handler(context: dict = Depends(get_user_context)):
    return get_accounts(context)


@router.get("/api/accounts/sync-status")
async def get_sync_status_handler(context: dict = Depends(get_user_context)):
    return get_last_sync(context)

@router.get("/api/transactions")
async def get_transactions_handler(acc_id: str, context: dict = Depends(get_user_context)):
    return get_transactions(context, acc_id)


@router.patch("/api/transactions/{txn_id}")
async def update_transaction_handler(txn_id: str, transaction: TransactionUpdateRequest, context: dict = Depends(get_user_context)):
    """Standardized to PATCH for partial updates."""
    return update_transaction(context, txn_id, transaction)

@router.get("/api/transactions/fraud")
async def get_fraudulent_transactions_handler(context: dict = Depends(get_user_context)):
    return get_fraudulent_transactions(context)

@router.patch("/api/transactions/{txn_id}/fraud")
async def update_fraud_status_handler(txn_id: str, is_confirmed_fraud: bool, context: dict = Depends(get_user_context)):
    """Standardized to PATCH /api/transactions/{id}/fraud."""
    return update_fraud_status(context, txn_id, is_confirmed_fraud)

@router.get("/api/transactions/budgets")
async def get_budgets_handler(context: dict = Depends(get_user_context)):
    return get_active_budgets(context)

@router.post("/api/transactions/budgets")
async def create_budget_handler(budget: BudgetCreateRequest, context: dict = Depends(get_user_context)):
    """Standardized to POST /api/transactions/budgets."""
    return create_budget(context, budget)

@router.patch("/api/transactions/budgets/{budget_id}")
async def update_budget_handler(budget_id: str, budget: BudgetUpdateRequest, context: dict = Depends(get_user_context)):
    """Standardized to PATCH."""
    return update_budget(context, budget_id, budget)

@router.delete("/api/transactions/budgets/{budget_id}")
async def delete_budget_handler(budget_id: str, context: dict = Depends(get_user_context)):
    return delete_budget(context, budget_id)
