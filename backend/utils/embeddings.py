import os
from datetime import datetime
from config.settings import gemini_client
from google.genai import types

def create_embedding(txn: dict) -> list[float]:
    try:
        readable_date = datetime.fromtimestamp(float(txn.get("txn_date", 0))).strftime('%B %d, %Y')
    except:
        readable_date = "an unknown date"

    merchant = txn.get("merchant", "Unknown Merchant")
    amount = abs(float(txn.get("amount", 0)))
    category = txn.get("category", "Uncategorized")
    city = txn.get("city", "Unknown City")
    state = txn.get("state", "")
    desc = txn.get("description", "")

    semantic_string = (
        f"On {readable_date}, a transaction occurred for ${amount:.2f} at {merchant}. "
        f"Category: {category}. Location: {city}, {state}. "
        f"Original bank description: {desc}."
    )

    response = gemini_client.models.embed_content(
        model='gemini-embedding-001',
        contents=semantic_string,
        config=types.EmbedContentConfig(output_dimensionality=768)
    )
    
    return response.embeddings[0].values