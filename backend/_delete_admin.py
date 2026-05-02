import sqlite3
c = sqlite3.connect("traffic_fyp.db")
n = c.execute("DELETE FROM users WHERE username='admin'").rowcount
c.commit()
print("deleted rows:", n)
