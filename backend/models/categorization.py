import pandas as pd
import numpy as np
import joblib
import os
from datasets import load_dataset
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.linear_model import LogisticRegression

CLASSIFIER_PATH = os.path.join(os.path.dirname(__file__), "swipe_smart_categorizer_v2.pkl")
VECTORIZER_PATH = os.path.join(os.path.dirname(__file__), "swipe_smart_vectorizer_v2.pkl")

def train_categorizer(df: pd.DataFrame):
    print(f"Starting training on {len(df):,} transactions...")
    
    if 'transaction_description' in df.columns:
        df = df.rename(columns={'transaction_description': 'merchant'})
        
    clean_df = df.dropna(subset=['merchant', 'category'])
    
    if len(clean_df) == 0:
        print("No categorized data available to train on. Skipping.")
        return
        
    print("Vectorizing the text (Learning to ignore numbers and noise)...")
    vectorizer = TfidfVectorizer(max_features=15000, stop_words='english')
    X_train = vectorizer.fit_transform(clean_df['merchant'])
    y_train = clean_df['category']
    
    print("Fitting the Logistic Regression model (This might take a few seconds)...")
    classifier = LogisticRegression(max_iter=1000, n_jobs=-1)
    classifier.fit(X_train, y_train)
    
    print("Saving models to disk...")
    joblib.dump(vectorizer, VECTORIZER_PATH)
    joblib.dump(classifier, CLASSIFIER_PATH)
    print(f"✅ Categorizer and Vectorizer successfully retrained and saved!")

def predict_category(merchant: str) -> str:
    if not os.path.exists(CLASSIFIER_PATH) or not os.path.exists(VECTORIZER_PATH):
        return "Uncategorized"
        
    vectorizer = joblib.load(VECTORIZER_PATH)
    classifier = joblib.load(CLASSIFIER_PATH)
    
    vector = vectorizer.transform([str(merchant)])
    
    probabilities = classifier.predict_proba(vector)[0]
    
    max_confidence = np.max(probabilities)
    predicted_index = np.argmax(probabilities)
    predicted_category = classifier.classes_[predicted_index]
    
    print(f"   -> [DEBUG] {merchant[:35].ljust(35)}: {predicted_category} ({max_confidence * 100:.1f}% confident)")
    
    if max_confidence < 0.20:
        return "Uncategorized"
        
    return predicted_category

if __name__ == "__main__":
    ##print("\n--- 1. DOWNLOADING MASSIVE DATASET FROM HUGGING FACE ---")
    ##dataset = load_dataset("mitulshah/transaction-categorization", split="train")
    ##print("Sampling 200,000 rows for memory-efficient training...")
    ##sampled_data = dataset.shuffle(seed=42).select(range(200000))
    ##df = sampled_data.to_pandas()
    
    ##df = df[df['country'] == 'USA']
    
    ##train_categorizer(df)
    
    print("\n--- 2. RUNNING REAL-TIME FASTAPI INFERENCE ---")
    
    new_swipes = pd.read_csv("transactions_rows.csv") 
    
    for index, swipe in new_swipes.iterrows():
        pred = predict_category(swipe['merchant'])
        print(f"Final Category: {pred}\n")