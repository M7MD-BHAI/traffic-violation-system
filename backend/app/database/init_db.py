from sqlalchemy.orm import Session
from app.database.models import User
from app.crud import users as users_crud


def init_db(db: Session) -> None:
    """Seed default admin and operator users if they don't exist."""
    existing_admin = users_crud.get_by_username(db, "admin")
    if not existing_admin:
        users_crud.create_user(
            db,
            username="admin",
            password="admin123",
            role="admin"
        )
        print("✅ Default admin user created (username: admin, password: admin123)")
    
    existing_operator = users_crud.get_by_username(db, "operator")
    if not existing_operator:
        users_crud.create_user(
            db,
            username="operator",
            password="operator123",
            role="operator"
        )
        print("✅ Default operator user created (username: operator, password: operator123)")
