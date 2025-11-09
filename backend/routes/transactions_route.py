from fastapi import APIRouter, Request
from plaid.model.sandbox_public_token_create_request import SandboxPublicTokenCreateRequest
from plaid.model.products import Products
from config.settings import plaid_client
from utils.plaid_service import get_transactions

router = APIRouter()


@router.get("/api/transactions/", tags=["transactions"])
async def fetch_transactions(request: Request):
    transactions = get_transactions()
    return {"latest_transactions": transactions}
    