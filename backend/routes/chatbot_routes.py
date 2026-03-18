from fastapi import APIRouter, Depends, HTTPException, Request
from models.chatbot import ChatRequest, ChatResponse, ask_financial_assistant
from config.security import get_user_context
from config.rate_limit import limiter

router = APIRouter()

@router.post("/api/ask", response_model=ChatResponse)
@limiter.limit("5/minute")
async def ask_endpoint(request: ChatRequest, fastapi_request: Request, context: dict = Depends(get_user_context)):
    try:
        response = await ask_financial_assistant(context, request)
        return response
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))