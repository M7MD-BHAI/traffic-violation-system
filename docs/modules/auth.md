# Module: Authentication (M8)

> JWT-based login system with admin and operator roles. Protects all API routes and React pages from unauthenticated access.

---

## Dependencies
- `database/models.py` — User model
- `python-jose` — JWT encoding/decoding
- `passlib` — password hashing (bcrypt)
- `database/connection.py` — DB session

---

## Public Interface

```python
# FastAPI dependencies
def get_current_user(token: str) -> User
def require_admin(current_user: User) -> User

# Routes
POST /auth/login     → access_token
POST /auth/register  → User (admin only)
GET  /auth/me        → current User
```

---

## Features & Requirements

- Login accepts `username` + `password`, returns JWT access token
- Token expiry configurable via `ACCESS_TOKEN_EXPIRE_MINUTES` env var
- Two roles: `admin` (full access) and `operator` (read + view only)
- All non-auth routes require valid Bearer token in Authorization header
- React Login page: username + password fields, Tailwind styled
- On login success: token stored, redirect to Dashboard
- On token expiry: auto-redirect to Login page
- Register endpoint protected — admin token required

---

## Data Models Owned

```python
User:
    id:            int (PK)
    username:      str (unique)
    password_hash: str
    role:          "admin" | "operator"
    created_at:    datetime
    is_active:     bool
```

---

## API Endpoints

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/auth/login` | `{username, password}` | `{access_token, token_type}` |
| POST | `/auth/register` | `{username, password, role}` | UserOut |
| GET | `/auth/me` | — | UserOut |

---

## Acceptance Criteria

- [ ] Invalid credentials return 401, not 500
- [ ] JWT token validates correctly on protected routes
- [ ] Operator role cannot access admin-only endpoints
- [ ] React redirects to login if no token present
- [ ] Password never stored in plain text
