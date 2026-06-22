"""
กินเลย — Hardware Alert Backend (CLIENT mode)
FastAPI server สำหรับ Arduino UNO Q / RouterBridge ใน CLIENT (poll) mode

Endpoints:
  POST /hardware/alert         — webapp ส่ง alert มา
  GET  /hardware/alert         — ดึงข้อมูลเต็ม (JSON)
  GET  /result/{device_id}     — Arduino poll → ตอบเฉพาะตัวเลข Plain Text
  DELETE /hardware/alert       — ล้าง alert
  GET  /hardware/devices       — ดู device ที่มี active alert
  GET  /ping                   — health check (Plain Text "pong")
  GET  /test                   — debug page แสดง state ปัจจุบัน (HTML)

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

# ── Logging ───────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s  %(levelname)-8s  %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("kinloei-hw")

app = FastAPI(title="กินเลย Hardware Alert API", version="1.2.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)

# ── Middleware: log ทุก request ────────────────────────────
@app.middleware("http")
async def log_requests(request: Request, call_next):
    t0 = time.time()
    response = await call_next(request)
    ms = (time.time() - t0) * 1000
    log.info(f"{request.method} {request.url.path}  → {response.status_code}  ({ms:.0f}ms)  client={request.client.host}")
    return response

# ── In-memory store ────────────────────────────────────────
_alerts: dict = {}
_log_events: list = []   # circular log สำหรับ /test page

_STATUS_LEVEL = {"SAFE": 1, "CAUTION": 2, "AVOID": 3}

MAX_LOG = 30  # เก็บ event ล่าสุดกี่รายการ


def _push_event(msg: str):
    ts = time.strftime("%H:%M:%S", time.localtime())
    _log_events.append(f"{ts}  {msg}")
    if len(_log_events) > MAX_LOG:
        _log_events.pop(0)


# ── Models ─────────────────────────────────────────────────

class AlertRequest(BaseModel):
    device_id: str
    status: str
    product_name: Optional[str] = ""
    flagged: Optional[List[str]] = []
    ttl: Optional[int] = 60


class AlertResponse(BaseModel):
    level: int
    status: str
    product_name: str
    flagged: List[str]
    expires_in: int
    updated_at: str


# ── Endpoints ──────────────────────────────────────────────

@app.get("/ping", response_class=PlainTextResponse)
def ping():
    """Health check — Arduino หรือ browser ทดสอบการเชื่อมต่อ"""
    return "pong"


@app.post("/hardware/alert")
def post_alert(req: AlertRequest):
    level = _STATUS_LEVEL.get(req.status.upper(), 0)
    _alerts[req.device_id] = {
        "level": level,
        "status": req.status.upper(),
        "product_name": req.product_name or "",
        "flagged": req.flagged or [],
        "expires_at": time.time() + (req.ttl or 60),
        "updated_at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
    }
    msg = f"POST alert  device={req.device_id}  status={req.status.upper()}  level={level}  ttl={req.ttl}s"
    log.info(msg)
    _push_event(msg)
    return {"ok": True, "level": level, "device_id": req.device_id}


@app.get("/hardware/alert", response_model=AlertResponse)
def get_alert(device_id: str):
    data = _alerts.get(device_id)
    if not data or time.time() > data["expires_at"]:
        _alerts.pop(device_id, None)
        return AlertResponse(level=0, status="NONE", product_name="", flagged=[],
                             expires_in=0, updated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
    return AlertResponse(
        level=data["level"],
        status=data["status"],
        product_name=data["product_name"],
        flagged=data["flagged"],
        expires_in=max(0, int(data["expires_at"] - time.time())),
        updated_at=data["updated_at"],
    )


@app.get("/result/{device_id}", response_class=PlainTextResponse)
def get_result(device_id: str):
    """Arduino poll endpoint — ตอบแค่ตัวเลข 0-3"""
    data = _alerts.get(device_id)
    if not data or time.time() > data["expires_at"]:
        _alerts.pop(device_id, None)
        log.debug(f"POLL  device={device_id}  → 0 (no alert)")
        _push_event(f"POLL  device={device_id}  → 0 (no alert)")
        return "0"
    level = str(data["level"])
    log.info(f"POLL  device={device_id}  → {level}  ({data['status']})")
    _push_event(f"POLL  device={device_id}  → {level}  ({data['status']})")
    return level


@app.delete("/hardware/alert")
def clear_alert(device_id: str):
    _alerts.pop(device_id, None)
    msg = f"DELETE alert  device={device_id}"
    log.info(msg)
    _push_event(msg)
    return {"ok": True}


@app.get("/hardware/devices")
def list_devices():
    now = time.time()
    active = {
        k: {"level": v["level"], "status": v["status"], "expires_in": max(0, int(v["expires_at"] - now))}
        for k, v in _alerts.items()
        if now <= v["expires_at"]
    }
    return {"devices": active, "count": len(active)}


# ── Debug page ─────────────────────────────────────────────

@app.get("/test", response_class=HTMLResponse)
def test_page():
    """หน้า debug แสดง state ปัจจุบัน + วิธีทดสอบ"""
    now = time.time()

    # สร้าง rows ของ active alerts
    alert_rows = ""
    active = {k: v for k, v in _alerts.items() if now <= v["expires_at"]}
    if active:
        for dev, d in active.items():
            ttl_left = max(0, int(d["expires_at"] - now))
            alert_rows += f"""
            <tr>
              <td><code>{dev}</code></td>
              <td><b>L{d['level']}</b> — {d['status']}</td>
              <td>{d['product_name'] or '—'}</td>
              <td>{ttl_left}s</td>
              <td>{d['updated_at']}</td>
            </tr>"""
    else:
        alert_rows = '<tr><td colspan="5" style="color:#888">ไม่มี active alert</td></tr>'

    # event log
    events_html = "".join(
        f'<div class="ev">{e}</div>' for e in reversed(_log_events)
    ) or '<div class="ev" style="color:#888">ยังไม่มี event</div>'

    return f"""<!DOCTYPE html>
<html lang="th">
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="3">
  <title>กินเลย HW Debug</title>
  <style>
    body {{ font-family: monospace; background:#111; color:#eee; padding:24px; }}
    h1 {{ color:#4fc; margin:0 0 4px }}
    h2 {{ color:#aaa; margin:20px 0 6px; font-size:14px; text-transform:uppercase; letter-spacing:1px; }}
    table {{ border-collapse:collapse; width:100%; margin-bottom:16px; }}
    th,td {{ border:1px solid #333; padding:6px 10px; text-align:left; font-size:13px; }}
    th {{ background:#222; color:#4fc; }}
    .ev {{ font-size:12px; color:#9f9; padding:2px 0; border-bottom:1px solid #222; }}
    .box {{ background:#1a1a1a; border:1px solid #333; padding:12px 16px; border-radius:6px; margin-bottom:16px; }}
    code {{ background:#2a2a2a; padding:2px 6px; border-radius:3px; color:#fc4; }}
    .badge {{ display:inline-block; padding:2px 8px; border-radius:10px; font-size:12px; }}
    .ok {{ background:#1a3a1a; color:#4fc; }}
    .warn {{ background:#3a3a1a; color:#fc4; }}
  </style>
</head>
<body>
  <h1>กินเลย Hardware Alert</h1>
  <div style="color:#888;font-size:12px">Auto-refresh ทุก 3 วินาที · {time.strftime('%Y-%m-%d %H:%M:%S')}</div>

  <h2>Active Alerts ({len(active)})</h2>
  <table>
    <tr><th>Device ID</th><th>Level / Status</th><th>Product</th><th>TTL</th><th>Updated</th></tr>
    {alert_rows}
  </table>

  <h2>Quick Test</h2>
  <div class="box">
    <b>1. Health check:</b><br>
    <code>curl http://192.168.137.59:18000/ping</code><br><br>
    <b>2. ส่ง AVOID alert:</b><br>
    <code>curl -X POST http://192.168.137.59:18000/hardware/alert -H "Content-Type: application/json" -d "{{\\"device_id\\":\\"arduino-001\\",\\"status\\":\\"AVOID\\",\\"product_name\\":\\"test\\",\\"flagged\\":[],\\"ttl\\":60}}"</code><br><br>
    <b>3. Arduino poll:</b><br>
    <code>curl http://192.168.137.59:18000/result/arduino-001</code><br><br>
    <b>4. ล้าง alert:</b><br>
    <code>curl -X DELETE "http://192.168.137.59:18000/hardware/alert?device_id=arduino-001"</code>
  </div>

  <h2>Event Log (ล่าสุด {len(_log_events)} รายการ)</h2>
  <div class="box" style="max-height:280px;overflow-y:auto">
    {events_html}
  </div>
</body>
</html>"""


# ──────────────────────────────────────────────────────────
if __name__ == "__main__":
    log.info("Starting กินเลย Hardware Alert API on 0.0.0.0:18000")
    log.info("Debug page: http://192.168.137.59:18000/test")
    uvicorn.run(app, host="0.0.0.0", port=18000, reload=False)
