import pandas as pd
import random

# 1. The Building Blocks (Local to NJ/NY)
merchants = ["CHIPOTLE", "TACO BELL", "QDOBA", "SWEETGREEN", "STARBUCKS", "WAWA", "CVS", "EXXON", "WENDYS", "MCDONALDS"]
cities = [
    ("NEW BRUNSWICK", "NJ"), ("PISCATAWAY", "NJ"), ("EDISON", "NJ"), 
    ("COLONIA", "NJ"), ("SOUTH PLAINFI", "NJ"), ("SOMERSET", "NJ"),
    ("NEW YORK", "NY"), ("HOBOKEN", "NJ"), ("GARWOOD", "NJ")
]
dates = ["02/28", "03/04", "01/15", "02/12", "03/10", "01/30"]

# 2. The Bank Formats (Cloned from your exact CSV)
formats = [
    # Format 1: Standard w/ Store Number (TACO BELL 039035 SOUTH PLAINFI NJ 02/25)
    lambda m, c, s, d: (f"{m} {random.randint(1000, 999999)} {c} {s} {d}", c),
    
    # Format 2: The "Smashed State ID" (CHIPOTLE MEX GR ONLI NEW YORK NY413285 02/28)
    lambda m, c, s, d: (f"{m} ONLI {c} {s}{random.randint(100000, 999999)} {d}", c),
    
    # Format 3: The Walgreens Grammar (WALGREENS STORE 555 IN COLONIA NJ 066973)
    lambda m, c, s, d: (f"{m} STORE {random.randint(100, 999)} IN {c} {s} {random.randint(100000, 999999)} {d}", c),
    
    # Format 4: The Square POS (SQ *RALPH'S COFFEE New York NY 02/14)
    lambda m, c, s, d: (f"SQ *{m} {c.title()} {s} {d}", c),
    
    # Format 5: The Zelle Transfer (Zelle payment to JOHN DOE, EDISON, NJ JPM99c44jtiu)
    lambda m, c, s, d: (f"Zelle payment to {m}, {c}, {s} JPM{random.randint(10,99)}c{random.randint(10,99)}jtiu", c)
]

# 3. Generate 300 Fake Transactions
data = []
for _ in range(300):
    merchant = random.choice(merchants)
    city, state = random.choice(cities)
    date = random.choice(dates)
    
    # Pick a random template format
    formatter = random.choice(formats)
    description, labeled_city = formatter(merchant, city, state, date)
    
    data.append({"description": description, "city": labeled_city})

# 4. Save to CSV
df = pd.DataFrame(data)
df.to_csv("synthetic_training_data.csv", index=False)
print("Successfully generated 300 perfectly labeled transactions!")