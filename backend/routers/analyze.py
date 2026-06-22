from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
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
from core.auth import decode_optional

_bearer_opt = HTTPBearer(auto_error=False)

router = APIRouter(prefix="/analyze", tags=["analyze"])

ALLOWED_MIME = {"image/jpeg", "image/png", "image/webp"}
MAX_IMAGE_BYTES = 4 * 1024 * 1024  # 4 MB


class NutrientLimitItem(BaseModel):
    key: str
    label: str
    max: float
    unit: str
    enabled: bool = True


class ProfilePayload(BaseModel):
    conditions: list[str] = []
    allergies: list[str] = []
    avoid_ingredients: list[str] = []
    notes: str = ""
    nutrient_limits: list[NutrientLimitItem] = []


@router.post("/scan")
async def scan_food(
    device_id: str = Form(...),
    health_profile: str = Form("{}"),
    text_input: str | None = Form(None),
    image: UploadFile | None = File(None),
    db: AsyncSession = Depends(get_db),
    creds: HTTPAuthorizationCredentials | None = Depends(_bearer_opt),
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
        client_profile = json.loads(health_profile)
    except json.JSONDecodeError:
        raise HTTPException(400, "health_profile ไม่ใช่ JSON ที่ถูกต้อง")

    # ── resolve user ──────────────────────────────────────────────────────────
    # Priority: JWT auth user > device_id lookup > create new anonymous user
    jwt_payload = decode_optional(creds)
    user: User | None = None

    if jwt_payload:
        try:
            user = await db.get(User, int(jwt_payload["sub"]))
        except (ValueError, KeyError):
            pass

    if not user:
        res = await db.execute(select(User).where(User.device_id == device_id))
        user = res.scalar_one_or_none()

    if not user:
        # brand-new anonymous session
        user = User(device_id=device_id, health_profile=client_profile)
        db.add(user)
        await db.flush()

    # ── resolve profile ───────────────────────────────────────────────────────
    # Authenticated → DB profile is authoritative; never overwrite from client
    # Anonymous     → client profile is source of truth; save to DB
    if jwt_payload and user.health_profile:
        profile = user.health_profile
        logger.info("[Scan] using DB profile for authenticated user %s", user.id)
    elif client_profile:
        user.health_profile = client_profile   # update DB with latest client data
        profile = client_profile
    else:
        profile = user.health_profile or {}    # fall back to whatever is in DB

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
