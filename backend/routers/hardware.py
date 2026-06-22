import logging
from datetime import datetime, timedelta

from fastapi import APIRouter
from fastapi.responses import HTMLResponse, PlainTextResponse
from pydantic import BaseModel

log = logging.getLogger("kinloei.hardware")

# router หลัก prefix /hardware
router = APIRouter(prefix="/hardware", tags=["hardware"])

# router สำหรับ /result/{device_id} (ไม่มี prefix — Arduino poll path)
result_router = APIRouter(tags=["hardware"])

_store: dict[str, dict] = {}
_GLOBAL = "__global__"
_events: list[str] = []

LEVEL = {"SAFE": 1, "CAUTION": 2, "AVOID": 3}
MAX_EVENTS = 40


def _log_event(msg: str):
    ts = datetime.now().strftime("%H:%M:%S")
    entry = f"{ts}  {msg}"
    log.info(msg)
    _events.append(entry)
    if len(_events) > MAX_EVENTS:
        _events.pop(0)


class AlertBody(BaseModel):
    device_id: str
    status: str            # SAFE | CAUTION | AVOID
    product_name: str = ""
    flagged: list[str] = []
    ttl: int = 60


# ── POST /hardware/alert ───────────────────────────────────
@router.post("/alert")
async def post_alert(body: AlertBody):
    level = LEVEL.get(body.status.upper(), 0)
    expires_at = datetime.utcnow() + timedelta(seconds=max(body.ttl, 10))
    entry = {
        "level":        level,
        "status":       body.status.upper(),
        "product_name": body.product_name,
        "flagged":      body.flagged,
        "expires_at":   expires_at,
        "updated_at":   datetime.utcnow(),
    }
    _store[body.device_id] = entry
    _store[_GLOBAL] = entry
    _log_event(f"POST alert  device={body.device_id}  status={body.status.upper()}  level={level}  ttl={body.ttl}s")
    return {"ok": True, "level": level}


# ── GET /hardware/alert ────────────────────────────────────
@router.get("/alert")
async def get_alert(device_id: str | None = None):
    now = datetime.utcnow()
    key   = device_id if (device_id and device_id in _store) else _GLOBAL
    entry = _store.get(key)

    if not entry or entry["expires_at"] < now:
        _store.pop(key, None)
        return {
            "level": 0, "status": "NONE", "product_name": "",
            "flagged": [], "expires_in": 0,
            "updated_at": now.isoformat() + "Z",
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


# ── DELETE /hardware/alert ─────────────────────────────────
@router.delete("/alert")
async def delete_alert(device_id: str):
    removed = _store.pop(device_id, None)
    # ถ้า global ชี้ตัวเดียวกัน ล้างด้วย
    g = _store.get(_GLOBAL)
    if g and g is removed:
        _store.pop(_GLOBAL, None)
    _log_event(f"DELETE alert  device={device_id}  found={removed is not None}")
    return {"ok": True}


# ── GET /hardware/devices ──────────────────────────────────
@router.get("/devices")
async def list_devices():
    now = datetime.utcnow()
    active = {
        k: {
            "level": v["level"],
            "status": v["status"],
            "expires_in": max(0, int((v["expires_at"] - now).total_seconds())),
        }
        for k, v in _store.items()
        if k != _GLOBAL and v["expires_at"] >= now
    }
    return {"devices": active, "count": len(active)}


# ── GET /result/{device_id}  ← Arduino poll endpoint ──────
@result_router.get("/result/{device_id}", response_class=PlainTextResponse)
async def arduino_poll(device_id: str):
    """ตอบแค่ตัวเลข 0-3 — Arduino ใช้ client.parseInt() อ่านโดยตรง"""
    now = datetime.utcnow()
    entry = _store.get(device_id) or _store.get(_GLOBAL)

    if not entry or entry["expires_at"] < now:
        _store.pop(device_id, None)
        _log_event(f"POLL  device={device_id}  → 0 (no alert)")
        return "0"

    level = str(entry["level"])
    _log_event(f"POLL  device={device_id}  → {level}  ({entry['status']})")
    return level


# ── GET /hardware/test  ← debug page ──────────────────────
@router.get("/test", response_class=HTMLResponse)
async def debug_page():
    now = datetime.utcnow()
    active = {k: v for k, v in _store.items() if k != _GLOBAL and v["expires_at"] >= now}

    rows = ""
    if active:
        for dev, d in active.items():
            ttl = max(0, int((d["expires_at"] - now).total_seconds()))
            rows += f"""<tr>
              <td><code>{dev}</code></td>
              <td><b>L{d['level']}</b> — {d['status']}</td>
              <td>{d['product_name'] or '—'}</td>
              <td>{', '.join(d['flagged']) or '—'}</td>
              <td>{ttl}s</td></tr>"""
    else:
        rows = '<tr><td colspan="5" style="color:#777">ไม่มี active alert</td></tr>'

    ev_html = "".join(
        f'<div class="ev">{e}</div>' for e in reversed(_events)
    ) or '<div class="ev" style="color:#777">ยังไม่มี event</div>'

    return f"""<!DOCTYPE html>
<html lang="th"><head>
  <meta charset="UTF-8"><meta http-equiv="refresh" content="3">
  <title>กินเลย HW Debug</title>
  <style>
    body{{font-family:monospace;background:#111;color:#eee;padding:24px;margin:0}}
    h1{{color:#4fc;margin:0 0 2px}}
    h2{{color:#888;font-size:13px;text-transform:uppercase;letter-spacing:1px;margin:18px 0 6px}}
    table{{border-collapse:collapse;width:100%;margin-bottom:12px}}
    th,td{{border:1px solid #333;padding:6px 10px;font-size:13px;text-align:left}}
    th{{background:#1e1e1e;color:#4fc}}
    .box{{background:#1a1a1a;border:1px solid #333;padding:12px 16px;border-radius:6px;margin-bottom:14px}}
    code{{background:#2a2a2a;padding:2px 6px;border-radius:3px;color:#fc4;font-size:12px}}
    .ev{{font-size:12px;color:#9f9;padding:2px 0;border-bottom:1px solid #1e1e1e}}
  </style>
</head><body>
  <h1>กินเลย Hardware Alert</h1>
  <div style="color:#666;font-size:12px">auto-refresh 3s · {now.strftime('%Y-%m-%d %H:%M:%S')} UTC</div>

  <h2>Active Alerts ({len(active)})</h2>
  <table><tr><th>Device</th><th>Level/Status</th><th>Product</th><th>Flagged</th><th>TTL</th></tr>
    {rows}
  </table>

  <h2>Quick Test (curl)</h2>
  <div class="box">
    <b>Health:</b><br>
    <code>curl http://192.168.137.1:18000/ping</code><br><br>
    <b>ส่ง AVOID:</b><br>
    <code>curl -X POST http://192.168.137.1:18000/hardware/alert -H "Content-Type: application/json" -d '{{"device_id":"arduino-001","status":"AVOID","product_name":"test","flagged":[],"ttl":60}}'</code><br><br>
    <b>Arduino poll:</b><br>
    <code>curl http://192.168.137.1:18000/result/arduino-001</code><br><br>
    <b>ล้าง:</b><br>
    <code>curl -X DELETE "http://192.168.137.1:18000/hardware/alert?device_id=arduino-001"</code>
  </div>

  <h2>Event Log ({len(_events)} รายการ)</h2>
  <div class="box" style="max-height:260px;overflow-y:auto">{ev_html}</div>
</body></html>"""
