from transformers import pipeline
import pandas as pd
import os

MODEL_DIR = os.path.join(os.path.dirname(__file__), "swipesmart_BERT")
ner_pipeline = pipeline("ner", model=MODEL_DIR, aggregation_strategy="simple")

def extract_city(description: str) -> str:
    if pd.isna(description) or not description:
        return None

    try:
        results = ner_pipeline(str(description))
        
        if not results:
            return None
            
        start_idx = None
        end_idx = None
        
        for entity in results:
            if entity.get("entity_group") == "CITY":
                if start_idx is None:
                    start_idx = entity.get("start")

                end_idx = entity.get("end")
        
        if start_idx is None:
            return None
            
        while end_idx < len(description) and description[end_idx] not in [" ", ","]:
            end_idx += 1
            
        while start_idx > 0 and description[start_idx - 1] not in [" ", ","]:
            start_idx -= 1
            
        return description[start_idx:end_idx].strip().upper()
                
    except Exception as e:
        print(f"DistilBERT Inference Error for '{description}': {e}")
        
    return None

# --- QUICK LOCAL TEST ---
if __name__ == "__main__":
    df = pd.read_csv("transactions_rows.csv") 
    
    for index, row in df.iterrows():
        raw_desc = row['description']
        found_city = extract_city(raw_desc)
        print(f"Row {index + 1} | CITY: {found_city} | RAW: {raw_desc}")