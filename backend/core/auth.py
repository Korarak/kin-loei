from datetime import datetime, timedelta
from typing import Literal
from jose import jwt, JWTError
from passlib.context import CryptContext
from fastapi import Depends, HTTPException
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from core.config import settings

pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
_bearer = HTTPBearer(auto_error=False)

ALGORITHM = "HS256"


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain: str, hashed: str) -> bool:
    return pwd_context.verify(plain, hashed)


def create_token(
    sub: str,
    role: Literal["user", "admin"] = "user",
    hours: int = 24 * 7,
) -> str:
    payload = {
        "sub": sub,
        "role": role,
        "exp": datetime.utcnow() + timedelta(hours=hours),
    }
    return jwt.encode(payload, settings.secret_key, algorithm=ALGORITHM)


def _decode(token: str) -> dict:
    try:
        return jwt.decode(token, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        raise HTTPException(401, "Token ไม่ถูกต้องหรือหมดอายุ")


def require_user(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if not creds:
        raise HTTPException(401, "กรุณาเข้าสู่ระบบ")
    return _decode(creds.credentials)


def decode_optional(creds: HTTPAuthorizationCredentials | None) -> dict | None:
    """Decode JWT if present and valid; return None instead of raising."""
    if not creds:
        return None
    try:
        return jwt.decode(creds.credentials, settings.secret_key, algorithms=[ALGORITHM])
    except JWTError:
        return None


def require_admin(creds: HTTPAuthorizationCredentials | None = Depends(_bearer)) -> dict:
    if not creds:
        raise HTTPException(401, "กรุณาเข้าสู่ระบบด้วยบัญชีผู้ดูแล")
    payload = _decode(creds.credentials)
    if payload.get("role") != "admin":
        raise HTTPException(403, "ไม่มีสิทธิ์เข้าถึง")
    return payload
