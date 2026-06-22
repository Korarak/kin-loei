from datetime import datetime, timedelta
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter(prefix="/hardware", tags=["hardware"])

# in-memory store: device_id → alert entry
_store: dict[str, dict] = {}
_GLOBAL = "__global__"

LEVEL = {"SAFE": 1, "CAUTION": 2, "AVOID": 3}


class AlertBody(BaseModel):
    device_id: str
    status: str            # SAFE | CAUTION | AVOID
    product_name: str = ""
    flagged: list[str] = []
    ttl: int = 60          # วินาทีก่อนหมดอายุ


@router.post("/alert")
async def post_alert(body: AlertBody):
    expires_at = datetime.utcnow() + timedelta(seconds=max(body.ttl, 10))
    entry = {
        "level":        LEVEL.get(body.status, 0),
        "status":       body.status,
        "product_name": body.product_name,
        "flagged":      body.flagged,
        "expires_at":   expires_at,
        "updated_at":   datetime.utcnow(),
    }
    _store[body.device_id] = entry
    _store[_GLOBAL] = entry      # บอร์ดที่ไม่ระบุ device_id ก็รับได้
    return {"ok": True}


@router.get("/alert")
async def get_alert(device_id: str | None = None):
    now = datetime.utcnow()

    key   = device_id if (device_id and device_id in _store) else _GLOBAL
    entry = _store.get(key)

    if not entry or entry["expires_at"] < now:
        return {
            "level":        0,
            "status":       "NONE",
            "product_name": "",
            "flagged":      [],
            "expires_in":   0,
            "updated_at":   now.isoformat() + "Z",
        }

    expires_in = max(0, int((entry["expires_at"] - now).total_seconds()))
    return {
        "level":        entry["level"],
        "status":       entry["status"],
        "product_name": entry["product_name"],
        "flagged":      entry["flagged"],
        "expires_in":   expires_in,
        "updated_at":   entry["updated_at"].isoformat() + "Z",
    }
