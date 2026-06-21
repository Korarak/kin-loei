from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from pydantic import BaseModel
import base64
import json
import logging

logger = logging.getLogger(__name__)

from core.database import get_db
from core.gemini import analyze_food, search_product_info
from core.models import User, Scan

router = APIRouter(prefix="/analyze", tags=["analyze"])

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 4 * 1024 * 1024  # 4 MB


class ProfilePayload(BaseModel):
    conditions: list[str] = []
    allergies: list[str] = []
    avoid_ingredients: list[str] = []
    notes: str = ""


@router.post("/scan")
async def scan_food(
    device_id: str = Form(...),
    health_profile: str = Form("{}"),
    text_input: str | None = Form(None),
    image: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
):
    # validate image
    image_b64 = None
    image_mime = None
    if image:
        mime = image.content_type or ""
        if mime not in ALLOWED_MIME:
            # some browsers omit Content-Type; infer from filename extension
            name = (image.filename or "").lower()
            if name.endswith((".jpg", ".jpeg")):
                mime = "image/jpeg"
            elif name.endswith(".png"):
                mime = "image/png"
            elif name.endswith(".webp"):
                mime = "image/webp"
            else:
                raise HTTPException(400, "รองรับเฉพาะไฟล์ JPEG, PNG, WebP")
        raw = await image.read()
        if len(raw) > MAX_IMAGE_BYTES:
            raise HTTPException(400, "ภาพใหญ่เกินไป (สูงสุด 4 MB)")
        image_b64 = base64.b64encode(raw).decode()
        image_mime = mime

    if not image_b64 and not text_input:
        raise HTTPException(400, "กรุณาส่งภาพหรือข้อความอย่างน้อยหนึ่งอย่าง")

    try:
        profile = json.loads(health_profile)
    except json.JSONDecodeError:
        raise HTTPException(400, "health_profile ไม่ใช่ JSON ที่ถูกต้อง")

    # get or create user
    result = await db.execute(select(User).where(User.device_id == device_id))
    user = result.scalar_one_or_none()
    if not user:
        user = User(device_id=device_id, health_profile=profile)
        db.add(user)
        await db.flush()
    else:
        if profile:
            user.health_profile = profile

    # call gemini
    try:
        analysis = await analyze_food(image_b64, image_mime, text_input, profile)
    except Exception as e:
        msg = str(e)
        if "429" in msg or "RESOURCE_EXHAUSTED" in msg:
            raise HTTPException(429, "Gemini API quota หมด — รอสักครู่แล้วลองใหม่")
        raise HTTPException(502, f"Gemini วิเคราะห์ไม่สำเร็จ: {msg}")

    # second-pass: search for product info if name was extracted
    if analysis.get("product_name"):
        try:
            search = await search_product_info(
                product_name=analysis.get("product_name", ""),
                brand=analysis.get("brand", ""),
                product_type=analysis.get("product_type", ""),
                ingredients=analysis.get("ingredients", []),
            )
            if search:
                analysis["product_search"] = search
        except Exception as e:
            logger.warning("search_product_info failed (non-fatal): %s", str(e))

    # save scan history
    scan = Scan(
        user_id=user.id,
        product_name=analysis.get("product_name"),
        status=analysis.get("status", "CAUTION"),
        result=analysis,
        text_input=text_input,
    )
    db.add(scan)
    await db.commit()

    return {"scan_id": scan.id, "result": analysis}


@router.get("/history/{device_id}")
async def get_history(device_id: str, limit: int = 20, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.device_id == device_id))
    user = result.scalar_one_or_none()
    if not user:
        return {"scans": []}

    scans_q = await db.execute(
        select(Scan)
        .where(Scan.user_id == user.id)
        .order_by(Scan.created_at.desc())
        .limit(limit)
    )
    scans = scans_q.scalars().all()
    return {
        "scans": [
            {
                "id": s.id,
                "product_name": s.product_name,
                "status": s.status,
                "created_at": s.created_at.isoformat(),
                "summary": s.result.get("summary", ""),
            }
            for s in scans
        ]
    }
