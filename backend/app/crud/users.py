from passlib.context import CryptContext
from sqlalchemy.orm import Session
import hashlib

from app.database.models import User

_pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")


def hash_password(plain: str) -> str:
    # Fix: handle bcrypt 72-byte limit
    plain = hashlib.sha256(plain.encode()).hexdigest()
    return _pwd_context.hash(plain)


def verify_password(plain: str, hashed: str) -> bool:
    # Must apply same preprocessing here
    plain = hashlib.sha256(plain.encode()).hexdigest()
    return _pwd_context.verify(plain, hashed)


def get_by_username(db: Session, username: str) -> User | None:
    return db.query(User).filter(User.username == username).first()


def get_by_id(db: Session, user_id: int) -> User | None:
    return db.query(User).filter(User.id == user_id).first()


def create_user(db: Session, username: str, password: str, role: str = "operator") -> User:
    user = User(username=username, password_hash=hash_password(password), role=role)
    db.add(user)
    db.commit()
    db.refresh(user)
    return user