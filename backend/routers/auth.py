import uuid
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from core.database import get_db
from core.models import User
from core.auth import hash_password, verify_password, create_token, require_user

router = APIRouter(prefix="/auth", tags=["auth"])


class RegisterBody(BaseModel):
    email: str
    password: str
    display_name: str | None = None
    device_id: str | None = None  # link existing anonymous session to new account


class LoginBody(BaseModel):
    email: str
    password: str


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


# ── register ──────────────────────────────────────────────────────────────────

@router.post("/register", status_code=201)
async def register(body: RegisterBody, db: AsyncSession = Depends(get_db)):
    # email must be unique
    taken = (await db.execute(select(User).where(User.email == body.email))).scalar_one_or_none()
    if taken:
        raise HTTPException(400, "อีเมลนี้ถูกใช้งานแล้ว")

    # try to upgrade an existing device-only user
    user: User | None = None
    if body.device_id:
        res = await db.execute(select(User).where(User.device_id == body.device_id))
        user = res.scalar_one_or_none()

    if user:
        user.email = body.email
        user.password_hash = hash_password(body.password)
        if body.display_name:
            user.display_name = body.display_name
    else:
        user = User(
            device_id=str(uuid.uuid4()),
            email=body.email,
            password_hash=hash_password(body.password),
            display_name=body.display_name,
            health_profile={},
        )
        db.add(user)

    await db.commit()
    await db.refresh(user)
    return {"token": create_token(str(user.id)), "user": _fmt(user)}


# ── login ──────────────────────────────────────────────────────────────────────

@router.post("/login")
async def login(body: LoginBody, db: AsyncSession = Depends(get_db)):
    res = await db.execute(select(User).where(User.email == body.email))
    user = res.scalar_one_or_none()

    if not user or not user.password_hash or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "อีเมลหรือรหัสผ่านไม่ถูกต้อง")

    if not user.is_active:
        raise HTTPException(403, "บัญชีนี้ถูกระงับการใช้งาน")

    user.last_login_at = datetime.utcnow()
    await db.commit()
    return {"token": create_token(str(user.id)), "user": _fmt(user)}


# ── me / profile ───────────────────────────────────────────────────────────────

@router.get("/me")
async def me(payload: dict = Depends(require_user), db: AsyncSession = Depends(get_db)):
    user = await db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(404, "ไม่พบผู้ใช้")
    return _fmt(user)


@router.put("/me/display-name")
async def update_display_name(
    body: dict,
    payload: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, int(payload["sub"]))
    if not user:
        raise HTTPException(404, "ไม่พบผู้ใช้")
    name = (body.get("display_name") or "").strip()
    if not name:
        raise HTTPException(400, "กรุณาระบุชื่อ")
    user.display_name = name
    await db.commit()
    return {"display_name": user.display_name}


@router.put("/me/password")
async def change_password(
    body: ChangePasswordBody,
    payload: dict = Depends(require_user),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, int(payload["sub"]))
    if not user or not user.password_hash:
        raise HTTPException(404, "ไม่พบผู้ใช้")
    if not verify_password(body.current_password, user.password_hash):
        raise HTTPException(401, "รหัสผ่านปัจจุบันไม่ถูกต้อง")
    if len(body.new_password) < 8:
        raise HTTPException(400, "รหัสผ่านต้องมีอย่างน้อย 8 ตัวอักษร")
    user.password_hash = hash_password(body.new_password)
    await db.commit()
    return {"message": "เปลี่ยนรหัสผ่านเรียบร้อยแล้ว"}


# ── helper ────────────────────────────────────────────────────────────────────

def _fmt(user: User) -> dict:
    return {
        "id": user.id,
        "device_id": user.device_id,
        "email": user.email,
        "display_name": user.display_name,
        "role": user.role,
        "is_active": user.is_active,
        "created_at": user.created_at.isoformat(),
        "last_login_at": user.last_login_at.isoformat() if user.last_login_at else None,
    }
