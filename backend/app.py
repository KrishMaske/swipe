from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
import os
from contextlib import asynccontextmanager
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from config.rate_limit import limiter
from routes import token_exchange, bank_routes, card_routes, chatbot_routes, model_routes, account_routes
from scheduler import start_scheduler, stop_scheduler



@asynccontextmanager
async def lifespan(_: FastAPI):
    start_scheduler()
    try:
        yield
    finally:
        stop_scheduler()


app = FastAPI(title="Swipe API", openapi_url="/swipe/api/openapi.json", lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

app_env = os.getenv("APP_ENV", "development").lower()

if app_env in {"dev", "development", "local"}:
    cors = [
        "http://localhost:3000",
        "http://localhost:8000",
        "http://127.0.0.1:5500",
        "http://192.168.1.89:3000",
        "http://192.168.1.89:8000"
    ]
else:
    configured = os.getenv("CORS_ORIGINS", "")
    cors = [origin.strip() for origin in configured.split(",") if origin.strip()]
    if not cors:
        raise RuntimeError("CORS_ORIGINS must be set in non-development environments")

app.add_middleware(
    CORSMiddleware,
    allow_origins=cors,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(token_exchange.router)
app.include_router(bank_routes.router)
app.include_router(card_routes.router)
app.include_router(chatbot_routes.router)
app.include_router(model_routes.router)
app.include_router(account_routes.router)

@app.get("/health")
def health():
    return {"status": "ok"}

@app.get("/")
def read_root():
    return {"message": "Hello World"}


if __name__ == "__main__":
    import uvicorn
    host = os.getenv("HOST", "0.0.0.0")
    port = int(os.getenv("PORT", "8000"))
    uvicorn.run(app, host=host, port=port)