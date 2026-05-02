import sqlite3
c = sqlite3.connect('traffic_fyp.db')
tables = c.execute("SELECT name FROM sqlite_master WHERE type='table'").fetchall()
print("tables:", tables)
try:
    rows = c.execute("SELECT id, username, role FROM users").fetchall()
    print("users:", rows)
except Exception as e:
    print("err:", e)
