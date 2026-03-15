from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from routes.token_exchange import router as token_exchange
from routes.bank_routes import router as bank_routes
from routes.card_routes import router as card_routes
from routes.chatbot_routes import router as chatbot_routes
from routes.model_routes import router as model_routes

app = FastAPI()

cors = ["http://localhost:3000", "http://localhost:8000", "http://127.0.0.1:5500", "*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors,
    allow_methods=["*"],
    allow_headers=["*"],
    allow_credentials=True,
)

app.include_router(token_exchange)
app.include_router(bank_routes)
app.include_router(card_routes)
app.include_router(chatbot_routes)
app.include_router(model_routes)

@app.get("/")
def read_root():
    return {"message": "Hello World"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)