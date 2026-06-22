"""
กินเลย — Arduino Board API (Python App Lab)
รันบน Linux side ของ Arduino UNO Q

Frontend ส่งตรงมาที่บอร์ด:
  POST /alert   { status:"AVOID", product_name, flagged }  ← จาก pushHardwareAlert()
  POST /alert   { level: 0 }                               ← reset / ปิด LED

ATmega sketch poll:
  GET  /result  → plain text "0" | "1" | "2" | "3"

อื่นๆ:
  GET  /status  → { "level": N }
  GET  /ping    → "pong"
  GET  /test    → debug HTML (auto-refresh)
  OPTIONS /alert → CORS preflight (auto)

Run:
  pip install fastapi uvicorn
  python main.py
"""

import logging
import time
from typing import List, Optional

import uvicorn
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import HTMLResponse, PlainTextResponse
from pydantic import BaseModel

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("kinloei-hw")

app = FastAPI(title="กินเลย Board API", version="2.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.time()
    response = await call_next(request)
    ms = (time.time() - t0) * 1000
    log.info(f"{request.method} {request.url.path}  → {response.status_code}  ({ms:.0f}ms)  from={request.client.host}")
    return response

# ── State ──────────────────────────────────────────────────
_LEVEL = {"SAFE": 1, "CAUTION": 2, "AVOID": 3}

_state = {
    "level":        0,
    "status":       "NONE",
    "product_name": "",
    "flagged":      [],
    "expires_at":   0.0,
    "updated_at":   "",
}
_events: list = []

def _push(msg: str):
    ts = time.strftime("%H:%M:%S")
    _events.append(f"{ts}  {msg}")
    if len(_events) > 40:
        _events.pop(0)
    log.info(msg)


# ── Models ─────────────────────────────────────────────────

class AlertBody(BaseModel):
    # frontend ส่งมาสองแบบ:
    #   แบบ 1 — set alert:  { status, product_name?, flagged?, ttl? }
    #   แบบ 2 — reset:      { level: 0 }
    status:       Optional[str]       = None
    level:        Optional[int]       = None
    product_name: Optional[str]       = ""
    flagged:      Optional[List[str]] = []
    ttl:          Optional[int]       = 60


# ── POST /alert ────────────────────────────────────────────
@app.post("/alert")
async def post_alert(body: AlertBody):
    """รับ alert จาก frontend โดยตรง (pushHardwareAlert / ทดสอบ LED)"""
    now = time.time()

    # reset: { level: 0 }
    if body.level is not None and body.status is None:
        _state.update(level=0, status="NONE", product_name="", flagged=[],
                      expires_at=0.0, updated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        _push("POST /alert  → RESET (level=0)")
        return {"ok": True, "level": 0}

    # set alert: { status: "AVOID", ... }
    status = (body.status or "").upper()
    level  = _LEVEL.get(status, 0)
    ttl    = max(body.ttl or 60, 10)
    _state.update(
        level=level,
        status=status or "NONE",
        product_name=body.product_name or "",
        flagged=body.flagged or [],
        expires_at=now + ttl,
        updated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    )
    _push(f"POST /alert  status={status}  level={level}  product={body.product_name!r}  ttl={ttl}s")
    return {"ok": True, "level": level}


# ── GET /status ────────────────────────────────────────────
@app.get("/status")
async def get_status():
    """frontend / webapp ดูสถานะปัจจุบัน"""
    _expire_check()
    return {
        "level":        _state["level"],
        "status":       _state["status"],
        "product_name": _state["product_name"],
        "flagged":      _state["flagged"],
        "expires_in":   max(0, int(_state["expires_at"] - time.time())) if _state["expires_at"] else 0,
        "updated_at":   _state["updated_at"],
    }


# ── GET /result  ← ATmega sketch poll ─────────────────────
@app.get("/result", response_class=PlainTextResponse)
@app.get("/result/{device_id}", response_class=PlainTextResponse)
async def get_result(device_id: str = ""):
    """ATmega ใช้ client.parseInt() อ่านตัวเลข 0-3 โดยตรง"""
    _expire_check()
    level = str(_state["level"])
    _push(f"POLL /result  → {level}  ({_state['status']})")
    return level


# ── GET /ping ──────────────────────────────────────────────
@app.get("/ping", response_class=PlainTextResponse)
async def ping():
    return "pong"


# ── GET /alert (backward compat) ──────────────────────────
@app.get("/alert")
async def get_alert():
    return await get_status()


# ── helpers ────────────────────────────────────────────────
def _expire_check():
    if _state["expires_at"] and time.time() > _state["expires_at"]:
        _state.update(level=0, status="NONE", product_name="", flagged=[],
                      expires_at=0.0, updated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))


# ── GET /test  debug page ──────────────────────────────────
@app.get("/test", response_class=HTMLResponse)
async def test_page():
    _expire_check()
    s = _state
    ttl = max(0, int(s["expires_at"] - time.time())) if s["expires_at"] else 0
    level_color = ["#444", "#2d7a2d", "#b86000", "#aa0000"][min(s["level"], 3)]
    level_label = ["ไม่มี alert", "SAFE", "CAUTION", "AVOID"][min(s["level"], 3)]

    ev_html = "".join(
        f'<div class="ev">{e}</div>' for e in reversed(_events)
    ) or '<div class="ev" style="color:#555">ยังไม่มี event</div>'

    flagged_str = ", ".join(s["flagged"]) if s["flagged"] else "—"

    return f"""<!DOCTYPE html>
<html lang="th"><head>
  <meta charset="UTF-8"><meta http-equiv="refresh" content="3">
  <title>กินเลย Board</title>
  <style>
    *{{box-sizing:border-box}}
    body{{font-family:monospace;background:#0d0d0d;color:#ddd;padding:20px;margin:0}}
    h1{{color:#4fc;margin:0 0 2px;font-size:20px}}
    h2{{color:#666;font-size:11px;text-transform:uppercase;letter-spacing:1px;margin:18px 0 6px}}
    .box{{background:#161616;border:1px solid #2a2a2a;padding:12px 16px;border-radius:6px;margin-bottom:12px}}
    .level{{font-size:32px;font-weight:bold;color:{level_color}}}
    .ev{{font-size:12px;color:#7c7;padding:2px 0;border-bottom:1px solid #1a1a1a}}
    code{{background:#222;padding:2px 6px;border-radius:3px;color:#fa0;font-size:12px}}
    table{{width:100%;border-collapse:collapse;font-size:13px}}
    td{{padding:5px 8px;border-bottom:1px solid #222}}
    td:first-child{{color:#888;width:130px}}
  </style>
</head><body>
  <h1>กินเลย Board API</h1>
  <div style="color:#444;font-size:11px">192.168.50.137:18000 · auto-refresh 3s · {time.strftime('%H:%M:%S')}</div>

  <h2>สถานะปัจจุบัน</h2>
  <div class="box">
    <div class="level">L{s["level"]} — {level_label}</div>
    <table style="margin-top:10px">
      <tr><td>Product</td><td>{s["product_name"] or "—"}</td></tr>
      <tr><td>Flagged</td><td>{flagged_str}</td></tr>
      <tr><td>TTL เหลือ</td><td>{ttl}s</td></tr>
      <tr><td>Updated</td><td>{s["updated_at"] or "—"}</td></tr>
    </table>
  </div>

  <h2>ทดสอบ (curl)</h2>
  <div class="box" style="font-size:12px;line-height:2">
    <b>Health:</b><br>
    <code>curl http://192.168.50.137:18000/ping</code><br>
    <b>ส่ง AVOID:</b><br>
    <code>curl -X POST http://192.168.50.137:18000/alert -H "Content-Type: application/json" -d '{{"status":"AVOID","product_name":"test","flagged":["ผงชูรส"],"ttl":30}}'</code><br>
    <b>Arduino poll:</b><br>
    <code>curl http://192.168.50.137:18000/result</code><br>
    <b>Reset:</b><br>
    <code>curl -X POST http://192.168.50.137:18000/alert -H "Content-Type: application/json" -d '{{"level":0}}'</code>
  </div>

  <h2>Event Log ({len(_events)})</h2>
  <div class="box" style="max-height:220px;overflow-y:auto">{ev_html}</div>
</body></html>"""


if __name__ == "__main__":
    log.info("กินเลย Board API  →  http://0.0.0.0:18000")
    log.info("Debug page: http://192.168.50.137:18000/test")
    uvicorn.run(app, host="0.0.0.0", port=18000, reload=False)
