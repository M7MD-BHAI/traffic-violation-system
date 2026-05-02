import sqlite3
from app.crud.users import verify_password

c = sqlite3.connect("traffic_fyp.db")
row = c.execute("SELECT password_hash FROM users WHERE username='admin'").fetchone()
stored = row[0]
print("stored:", repr(stored))
print("len:", len(stored))
print("verify('admin123'):", verify_password("admin123", stored))
print("verify('wrong'):", verify_password("wrong", stored))
