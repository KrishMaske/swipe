from config.settings import conn

c = conn.cursor()

def create_transactions_table():
    c.execute('''CREATE TABLE IF NOT EXISTS transactions
                (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                transaction_id TEXT UNIQUE,
                name TEXT,
                amount REAL,
                date TEXT
                )''')
    conn.commit()