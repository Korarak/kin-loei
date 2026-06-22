from arduino.app_utils import *
from arduino.app_bricks.web_ui import WebUI
import time

# ── State ──────────────────────────────────────────────────
_LEVEL = {"SAFE": 1, "CAUTION": 2, "AVOID": 3}

_state = {
    "level":        0,
    "status":       "NONE",
    "product_name": "",
    "flagged":      [],
    "updated_at":   "",
}
_events = []

def _log(msg):
    ts = time.strftime("%H:%M:%S")
    entry = f"{ts}  {msg}"
    _events.append(entry)
    if len(_events) > 40:
        _events.pop(0)
    print(entry)


# ── Socket.IO handlers ─────────────────────────────────────

def on_push_alert(client, data):
    """
    รับ alert จาก กินเลย PWA
    แบบ 1 — set:   { status:"AVOID", product_name, flagged, ttl? }
    แบบ 2 — reset: { level: 0 }
    """
    level_raw = data.get("level")
    status    = (data.get("status") or "").upper()

    if level_raw == 0 or (not status and level_raw is not None):
        _state.update(level=0, status="NONE", product_name="", flagged=[],
                      updated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()))
        _log("ALERT RESET → level=0")
    else:
        lv = _LEVEL.get(status, 0)
        _state.update(
            level=lv,
            status=status or "NONE",
            product_name=data.get("product_name", ""),
            flagged=data.get("flagged", []),
            updated_at=time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
        )
        _log(f"ALERT SET  status={status}  level={lv}  product={_state['product_name']!r}")

    # ส่งไปควบคุม Modulino Pixels ผ่าน RouterBridge RPC
    Bridge.call("set_alert_level", _state["level"])

    # broadcast ให้ clients ทุกตัว
    ui.send_message("alert_update", {**_state, "events": _events[-10:]})


def on_get_state(client, data):
    """client ขอ state ปัจจุบัน"""
    ui.send_message("alert_update", {**_state, "events": _events[-10:]}, client)


# ── REST endpoint ──────────────────────────────────────────
def _register_rest():
    try:
        from fastapi import Request
        from fastapi.responses import JSONResponse, PlainTextResponse

        async def rest_alert(request: Request):
            data = await request.json()
            on_push_alert(None, data)
            return JSONResponse({"ok": True, "level": _state["level"]},
                                headers={"Access-Control-Allow-Origin": "*"})

        async def rest_status(request: Request):
            return JSONResponse(dict(_state),
                                headers={"Access-Control-Allow-Origin": "*"})

        async def rest_ping(request: Request):
            return PlainTextResponse("pong")

        ui.app.add_api_route("/api/alert",  rest_alert, methods=["POST"])
        ui.app.add_api_route("/api/status", rest_status, methods=["GET"])
        ui.app.add_api_route("/api/ping",   rest_ping,   methods=["GET"])
        print("[REST] routes registered: POST /api/alert  GET /api/status  GET /api/ping")
    except Exception as e:
        print(f"[REST] skipped ({e})")


# ── Init ───────────────────────────────────────────────────
ui = WebUI()
ui.on_message("push_alert",  on_push_alert)
ui.on_message("get_state",   on_get_state)

_register_rest()
_log("กินเลย Hardware Alert — App Lab started")

App.run()
