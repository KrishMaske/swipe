import spacy
import pandas as pd

nlp = spacy.load("en_core_web_trf")

def teacher_ner(des: str):
    clean_desc = des.title()
    
    fake_sentence = f"I bought something at {clean_desc}."
    
    doc = nlp(fake_sentence)
    
    for entity in doc.ents:
        if entity.label_ in ("GPE", "LOC"):
             print(f"FOUND: {entity.text.upper()}")

if __name__ == "__main__":
    df = pd.read_csv("transactions_rows.csv")
    for index, row in df.iterrows():
        print(index + 1)
        teacher_ner(row['description'])