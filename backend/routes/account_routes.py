from fastapi import APIRouter, Depends
from config.security import get_user_context
from database.db import delete_user_account

router = APIRouter()


@router.delete('/api/account')
def delete_account_endpoint(context: dict = Depends(get_user_context)):
    return delete_user_account(context)
