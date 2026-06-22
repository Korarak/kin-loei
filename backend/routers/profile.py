from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel

from core.database import get_db
from core.models import User

router = APIRouter(prefix="/profile", tags=["profile"])


class NutrientLimitItem(BaseModel):
    key: str
    label: str
    max: float
    unit: str
    enabled: bool = True


class HealthProfile(BaseModel):
    conditions: list[str] = []
    allergies: list[str] = []
    avoid_ingredients: list[str] = []
    notes: str = ""
    nutrient_limits: list[NutrientLimitItem] = []


@router.get("/{device_id}")
async def get_profile(device_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.device_id == device_id))
    user = result.scalar_one_or_none()
    if not user:
        return {"device_id": device_id, "health_profile": {}}
    return {"device_id": device_id, "health_profile": user.health_profile}


@router.put("/{device_id}")
async def upsert_profile(device_id: str, profile: HealthProfile, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.device_id == device_id))
    user = result.scalar_one_or_none()
    if not user:
        user = User(device_id=device_id, health_profile=profile.model_dump())
        db.add(user)
    else:
        user.health_profile = profile.model_dump()
    await db.commit()
    return {"device_id": device_id, "health_profile": user.health_profile}


@router.delete("/{device_id}")
async def delete_profile(device_id: str, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.device_id == device_id))
    user = result.scalar_one_or_none()
    if not user:
        raise HTTPException(404, "ไม่พบผู้ใช้")
    await db.delete(user)
    await db.commit()
    return {"message": "ลบข้อมูลเรียบร้อยแล้ว"}
