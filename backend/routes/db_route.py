from fastapi import APIRouter, Request
from utils.plaid_service import get_transactions
from database.queries import insert_transactions

router = APIRouter()

#put it to .post before prod
@router.get("/api/transactions/insert", tags=["transactions_db"])
async def fetch_and_store_transactions():
    transactions = get_transactions()
    status = insert_transactions(transactions)
    return status