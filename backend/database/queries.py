from database.db import conn

c = conn.cursor()

def insert_transactions(transactions):
    try:
        if not transactions:
            raise ValueError("No transactions to insert.")

        inserted_count = 0
        skipped_count = 0

        for transaction in transactions[::-1]:
            try:
                c.execute('''
                            INSERT OR IGNORE into transactions (transaction_id, name, amount, date)
                            VALUES (?, ?, ?, ?)'''
                        , (
                            transaction.get("transaction_id"), 
                            transaction.get("name"), 
                            transaction.get("amount"), 
                            transaction.get("date")
                        ))

                if c.rowcount == 1:
                    inserted_count += 1
                else:
                    skipped_count += 1

            except Exception as e:
                print(f"Error inserting transaction {transaction.get('transaction_id')}: {e}")
                skipped_count += 1
                continue
        
        conn.commit()
        return {"status": "success", "inserted": inserted_count, "skipped": skipped_count}
    except Exception as e:
        print(f"Error inserting transaction: {e}")
        return {"status": "error", "message": str(e)}

