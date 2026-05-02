"""Run once to create the initial admin user."""
import sys
import os

sys.path.insert(0, os.path.dirname(__file__))

from app.database.connection import SessionLocal, create_tables
from app.crud.users import get_by_username, create_user

USERNAME = "admin"
PASSWORD = "admin123"
ROLE = "admin"

create_tables()
db = SessionLocal()

if get_by_username(db, USERNAME):
    print(f"User '{USERNAME}' already exists.")
else:
    create_user(db, USERNAME, PASSWORD, ROLE)
    print(f"Admin user created — username: {USERNAME}  password: {PASSWORD}")

db.close()
