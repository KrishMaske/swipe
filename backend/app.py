from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from routes.transactions_route import router as transactions_router
from routes.token_route import router as token_router
from routes.db_route import router as db_router

app = FastAPI()

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],  # Allows all origins
    allow_credentials=True,
    allow_methods=["*"],  # Allows all methods
    allow_headers=["*"],  # Allows all headers
)

app.include_router(transactions_router)
app.include_router(token_router)

#put db_router to .post before prod
app.include_router(db_router)

@app.get("/")
def entrypoint():
    return {"message": "Hello, World!"}

