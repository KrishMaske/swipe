import os
from datetime import datetime
from config.settings import embedder

def create_embedding(txn: dict) -> list[float]:
    try:
        readable_date = datetime.fromtimestamp(float(txn.get("txn_date", 0))).strftime('%B %d, %Y')
    except:
        readable_date = "an unknown date"

    merchant = txn.get("merchant", "Unknown Merchant")
    raw_amount = float(txn.get("amount", 0))
    category = txn.get("category", "Uncategorized")
    city = txn.get("city", "Unknown City")
    state = txn.get("state", "")
    desc = txn.get("description", "")


    if raw_amount > 0:
        txn_type = "INCOME (Money Received / Refund)"
    else:
        txn_type = "EXPENSE (Money Spent)"
        
    absolute_amount = abs(raw_amount)

    semantic_string = (
        f"Type: {txn_type}. "
        f"Date: {readable_date}. "
        f"Merchant: {merchant}. "
        f"Amount: ${absolute_amount:.2f}. "
        f"Category: {category}. "
        f"Location: {city}, {state}. "
        f"Bank Description: {desc}."
    )

    embedding = embedder.encode(semantic_string)
    return embedding.tolist()

