from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from pydantic import BaseModel

from core.database import get_db
from core.models import User, Scan
from core.auth import create_token, require_admin
from core.config import settings

router = APIRouter(prefix="/admin", tags=["admin"])


class AdminLoginBody(BaseModel):
    username: str
    password: str


class UpdateUserBody(BaseModel):
    display_name: str | None = None
    email: str | None = None
    role: str | None = None


# ── admin auth ────────────────────────────────────────────────────────────────

@router.post("/login")
async def admin_login(body: AdminLoginBody):
    if body.username != settings.admin_user or body.password != settings.admin_password:
        raise HTTPException(401, "ชื่อผู้ใช้หรือรหัสผ่านไม่ถูกต้อง")
    token = create_token(sub="admin", role="admin", hours=8)
    return {"token": token, "role": "admin"}


# ── users ──────────────────────────────────────────────────────────────────────

@router.get("/users")
async def list_users(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    search: str | None = Query(None),
    _: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(User)
    if search:
        like = f"%{search}%"
        q = q.where(
            User.email.ilike(like) |
            User.display_name.ilike(like) |
            User.device_id.ilike(like)
        )

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    users = (
        await db.execute(q.order_by(User.created_at.desc()).offset((page - 1) * size).limit(size))
    ).scalars().all()

    return {"total": total, "page": page, "size": size, "users": [_fmt(u) for u in users]}


@router.get("/users/{user_id}")
async def get_user(
    user_id: int,
    _: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "ไม่พบผู้ใช้")

    scans = (
        await db.execute(
            select(Scan)
            .where(Scan.user_id == user_id)
            .order_by(Scan.created_at.desc())
            .limit(20)
        )
    ).scalars().all()

    return {
        **_fmt(user),
        "health_profile": user.health_profile,
        "recent_scans": [
            {
                "id": s.id,
                "product_name": s.product_name,
                "status": s.status,
                "created_at": s.created_at.isoformat(),
                "summary": (s.result or {}).get("summary", ""),
            }
            for s in scans
        ],
    }


@router.put("/users/{user_id}")
async def update_user(
    user_id: int,
    body: UpdateUserBody,
    _: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "ไม่พบผู้ใช้")

    if body.display_name is not None:
        user.display_name = body.display_name.strip() or None
    if body.email is not None:
        # check not taken by another user
        taken = (
            await db.execute(select(User).where(User.email == body.email, User.id != user_id))
        ).scalar_one_or_none()
        if taken:
            raise HTTPException(400, "อีเมลนี้ถูกใช้งานแล้ว")
        user.email = body.email or None
    if body.role is not None:
        if body.role not in ("user", "admin"):
            raise HTTPException(400, "role ต้องเป็น user หรือ admin เท่านั้น")
        user.role = body.role

    await db.commit()
    return _fmt(user)


@router.put("/users/{user_id}/toggle-active")
async def toggle_active(
    user_id: int,
    _: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "ไม่พบผู้ใช้")
    user.is_active = not user.is_active
    await db.commit()
    return {"id": user_id, "is_active": user.is_active}


@router.delete("/users/{user_id}")
async def delete_user(
    user_id: int,
    _: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    user = await db.get(User, user_id)
    if not user:
        raise HTTPException(404, "ไม่พบผู้ใช้")
    await db.delete(user)
    await db.commit()
    return {"message": "ลบผู้ใช้เรียบร้อยแล้ว"}


# ── stats ──────────────────────────────────────────────────────────────────────

@router.get("/stats")
async def stats(_: dict = Depends(require_admin), db: AsyncSession = Depends(get_db)):
    total_users = await db.scalar(select(func.count(User.id)))
    registered  = await db.scalar(select(func.count(User.id)).where(User.email.isnot(None)))
    total_scans = await db.scalar(select(func.count(Scan.id)))
    safe        = await db.scalar(select(func.count(Scan.id)).where(Scan.status == "SAFE"))
    caution     = await db.scalar(select(func.count(Scan.id)).where(Scan.status == "CAUTION"))
    avoid       = await db.scalar(select(func.count(Scan.id)).where(Scan.status == "AVOID"))

    return {
        "users": {
            "total": total_users,
            "registered": registered,
            "device_only": total_users - registered,
        },
        "scans": {
            "total": total_scans,
            "safe": safe,
            "caution": caution,
            "avoid": avoid,
        },
    }


# ── scans (admin view) ─────────────────────────────────────────────────────────

@router.get("/scans")
async def list_scans(
    page: int = Query(1, ge=1),
    size: int = Query(20, ge=1, le=100),
    status: str | None = Query(None),
    _: dict = Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    q = select(Scan)
    if status and status in ("SAFE", "CAUTION", "AVOID"):
        q = q.where(Scan.status == status)

    total = await db.scalar(select(func.count()).select_from(q.subquery()))
    scans = (
        await db.execute(q.order_by(Scan.created_at.desc()).offset((page - 1) * size).limit(size))
    ).scalars().all()

    return {
        "total": total,
        "page": page,
        "size": size,
        "scans": [
            {
                "id": s.id,
                "user_id": s.user_id,
                "product_name": s.product_name,
                "status": s.status,
                "created_at": s.created_at.isoformat(),
                "summary": (s.result or {}).get("summary", ""),
            }
            for s in scans
        ],
    }


# ── helper ─────────────────────────────────────────────────────────────────────

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
