# Hardware Alert Integration
## กินเลย × Arduino Uno R4 WiFi × Modulino Pixel

> **Protocol ที่เลือก: HTTP Short Polling**
> Arduino poll endpoint ทุก 2 วินาที ผ่าน HTTPS ไปยัง `kinloei-api.loeitech.org`

---

## ภาพรวมระบบ

```
ผู้ใช้สแกนอาหาร
      │
      ▼
[กินเลย PWA]  ←  kinloei.loeitech.org
      │
      │  1. POST /hardware/alert
      │     { status, product_name, flagged, ttl }
      ▼
[FastAPI]  ←  kinloei-api.loeitech.org
      │
      │  เก็บ alert state ใน memory (พร้อม TTL)
      │
      │  2. GET /hardware/alert?device_id=arduino-001
      │     ← Arduino poll ทุก 2 วินาที
      ▼
[Arduino Uno R4 WiFi]
      │
      │  I2C / QWIIC
      ▼
[Modulino Pixel — 8× RGB LED]
      │
      └─► แสดงระดับความรุนแรงเป็นสี
```

### ทำไมถึงเลือก Short Polling

- กระบวนการสแกน (ถ่ายภาพ → Gemini วิเคราะห์) ใช้เวลา **3–8 วินาที** อยู่แล้ว
  latency 2 วินาทีของ polling จึงไม่รู้สึก
- Arduino R4 WiFi มี `WiFiSSLClient` + `ArduinoHttpClient` **built-in** ไม่ต้องติดตั้งอะไรเพิ่ม
- Debug ได้ด้วย `curl` ทันที ไม่ต้องการ broker หรือ infrastructure พิเศษ

---

## Hardware

| ชิ้น | รุ่น | หมายเหตุ |
|------|------|----------|
| Microcontroller | Arduino Uno R4 WiFi | Built-in WiFi, QWIIC connector |
| LED Module | Arduino Modulino Pixel | 8× WS2812B RGB, I2C `0x6C` |
| สาย | QWIIC cable | ต่อตรง ไม่ต้องบัดกรี |

---

## API Endpoints

### `POST /hardware/alert`
เรียกจาก **frontend** ทุกครั้งที่ผลสแกนเสร็จ (ทุกสถานะ รวมถึง SAFE เพื่อ reset LED)

**URL:** `https://kinloei-api.loeitech.org/hardware/alert`

**Request body:**
```json
{
  "device_id": "abc123xyz",
  "status": "AVOID",
  "product_name": "มาม่าไก่",
  "flagged": ["ผงชูรส", "โซเดียมสูง 1380mg"],
  "ttl": 60
}
```

| Field | Type | คำอธิบาย |
|-------|------|----------|
| `device_id` | `string` | Device ID ของผู้ใช้ที่สแกน |
| `status` | `SAFE` · `CAUTION` · `AVOID` | ผลการตรวจ |
| `product_name` | `string` | ชื่อสินค้า |
| `flagged` | `string[]` | สารที่ตรวจพบ (ว่างได้ถ้า SAFE) |
| `ttl` | `int` | วินาทีก่อน alert หมดอายุ (default `60`) |

**Response:**
```json
{ "ok": true }
```

---

### `GET /hardware/alert`
เรียกจาก **Arduino** ทุก 2 วินาที

**URL:** `https://kinloei-api.loeitech.org/hardware/alert?device_id=arduino-001`

| Query param | คำอธิบาย |
|-------------|----------|
| `device_id` | กรอง alert เฉพาะ device นี้ (ถ้าไม่ส่งจะดึง alert ล่าสุดของทั้งระบบ) |

**Response:**
```json
{
  "level": 3,
  "status": "AVOID",
  "product_name": "มาม่าไก่",
  "flagged": ["ผงชูรส", "โซเดียมสูง 1380mg"],
  "expires_in": 47,
  "updated_at": "2026-06-22T10:30:00Z"
}
```

**Level mapping:**

| `level` | สถานะ | LED |
|---------|-------|-----|
| `0` | ไม่มี alert / หมดอายุแล้ว | ดับทั้งหมด |
| `1` | SAFE | เขียวหรี่คงที่ |
| `2` | CAUTION — ควรระวัง | เหลืองอำพัน pulse ช้า (800ms) |
| `3` | AVOID — ห้ามกิน | แดงกระพริบเร็ว (280ms) |

> SAFE ส่ง `level: 1` (ไม่ใช่ 0) เพื่อยืนยันว่าบอร์ดยังออนไลน์อยู่

---

## LED Display

```
Modulino Pixel — 8 LEDs (0 ← → 7)

Level 0 │ ○ ○ ○ ○ ○ ○ ○ ○  ดับ — ไม่มี alert
Level 1 │ ● ● ● ● ● ● ● ●  เขียว  #00FF00 dim  — SAFE
Level 2 │ ◉ ◉ ◉ ◉ ◉ ◉ ◉ ◉  เหลือง #FF8C00 pulse 800ms — CAUTION
Level 3 │ ◉ ◉ ◉ ◉ ◉ ◉ ◉ ◉  แดง    #FF0000 flash 280ms — AVOID
```

Animation เป็น **non-blocking** (ใช้ `millis()` ไม่มี `delay()` ใน `loop()`)

---

## Timing Flow

```
t=0s   ผู้ใช้กดสแกน
t=0s   กล้องถ่ายภาพ / รับ text input
t=3-8s Gemini วิเคราะห์ → ได้ผล
t=~8s  frontend แสดง result card
t=~8s  frontend POST /hardware/alert  ← ทันที
t=10s  Arduino poll รอบถัดไป (max 2 วิหลัง POST)
t=10s  LED เปลี่ยนสี ✅
```

ผู้ใช้เห็นผลบนหน้าจอก่อน → LED ติดตามภายใน **≤ 2 วินาที**

---

## Backend — สิ่งที่ต้อง implement

**ไฟล์:** `backend/routers/hardware.py`

```
POST /hardware/alert
  ├─ รับ body → validate
  ├─ map status → level (SAFE=1, CAUTION=2, AVOID=3)
  ├─ เก็บใน dict: alert_store[device_id] = { ...data, expires_at }
  └─ return { ok: true }

GET /hardware/alert
  ├─ ดึง alert จาก alert_store[device_id]
  ├─ ถ้าหมดอายุ (expires_at < now) → level 0
  ├─ คำนวณ expires_in (วินาทีที่เหลือ)
  └─ return AlertResponse
```

**State:** ใช้ Python `dict` ใน memory (ไม่ต้องใช้ DB — alert อายุสั้น ≤ 60 วิ)

**Register ใน** `backend/main.py`:
```python
from routers import hardware
app.include_router(hardware.router)
```

---

## Frontend — สิ่งที่ต้อง implement

**ไฟล์:** `frontend/src/pages/result.js`

หลัง render result card:
```js
// ส่ง alert ทุกครั้ง (รวม SAFE เพื่อ reset LED)
await fetch('https://kinloei-api.loeitech.org/hardware/alert', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    device_id: deviceId,
    status:       result.status,          // SAFE | CAUTION | AVOID
    product_name: result.product_name ?? '',
    flagged:      result.flagged_items ?? [],
    ttl:          result.status === 'SAFE' ? 10 : 60,
  }),
})
```

ไม่ต้อง await หรือแสดง error ถ้า fail — เป็น fire-and-forget (บอร์ดไม่ได้เชื่อมต่อตลอดเวลา)

---

## Arduino Sketch

**ไฟล์:** `arduino/kinloei_alert/kinloei_alert.ino`

### Libraries ที่ต้องติดตั้ง (Arduino IDE → Library Manager)

| Library | ที่มา |
|---------|-------|
| `WiFiS3` | built-in กับ Arduino R4 WiFi |
| `ArduinoHttpClient` | Arduino Library Manager |
| `ArduinoJson` v7.x | Arduino Library Manager |
| `Arduino_Modulino` | Arduino Library Manager |

### Config ที่ต้องแก้ก่อน upload

```cpp
// Production (HTTPS — kinloei-api.loeitech.org)
const char* WIFI_SSID    = "ชื่อ WiFi";
const char* WIFI_PASSWORD = "รหัส WiFi";
const char* SERVER_HOST   = "kinloei-api.loeitech.org";
const int   SERVER_PORT   = 443;          // HTTPS
const char* DEVICE_ID     = "arduino-001";

// Local dev (สลับมาใช้ถ้าทดสอบกับ backend บน LAN)
// const char* SERVER_HOST = "192.168.x.x";
// const int   SERVER_PORT = 18000;
```

### Polling logic

```cpp
void loop() {
  unsigned long now = millis();

  if (now - lastPoll >= 2000) {   // poll ทุก 2 วิ
    lastPoll = now;
    pollAlert();
  }

  animate(now);                   // LED animation non-blocking
}

void pollAlert() {
  http.get("/hardware/alert?device_id=" + String(DEVICE_ID));

  if (http.responseStatusCode() != 200) {
    if (++failCount >= 5) showWiFiError();
    return;
  }
  failCount = 0;

  JsonDocument doc;
  deserializeJson(doc, http.responseBody());

  int newLevel = doc["level"] | 0;
  if (newLevel != currentLevel) {
    currentLevel = newLevel;
    applyLevel(currentLevel);
  }
}
```

---

## Network Diagram (Production)

```
 [WiFi — ที่ไหนก็ได้ที่ออกเน็ตได้]
        │
        │  HTTPS :443
        ▼
 kinloei-api.loeitech.org
        │
        │  nginx → terminate TLS
        │  proxy_pass → localhost:18000
        ▼
 [FastAPI :18000]
        │
        │  GET /hardware/alert
        ▼
 { "level": 3, "status": "AVOID", ... }
        │
        ▼
 [Arduino R4 WiFi]
        │  I2C / QWIIC
        ▼
 [Modulino Pixel]  🔴 flash เร็ว = AVOID
```

---

## ทดสอบด้วย curl

```bash
# 1. ส่ง AVOID alert (จำลองผล scan)
curl -X POST https://kinloei-api.loeitech.org/hardware/alert \
  -H "Content-Type: application/json" \
  -d '{
    "device_id": "arduino-001",
    "status": "AVOID",
    "product_name": "มาม่าไก่",
    "flagged": ["ผงชูรส", "โซเดียมสูง"],
    "ttl": 60
  }'

# 2. ดู state ที่ Arduino จะได้รับ
curl "https://kinloei-api.loeitech.org/hardware/alert?device_id=arduino-001"

# 3. ส่ง CAUTION
curl -X POST https://kinloei-api.loeitech.org/hardware/alert \
  -H "Content-Type: application/json" \
  -d '{"device_id":"arduino-001","status":"CAUTION","product_name":"โกโก้","flagged":["น้ำตาลสูง"],"ttl":60}'

# 4. Reset LED (SAFE)
curl -X POST https://kinloei-api.loeitech.org/hardware/alert \
  -H "Content-Type: application/json" \
  -d '{"device_id":"arduino-001","status":"SAFE","product_name":"","flagged":[],"ttl":10}'
```

> ถ้า curl ตอบได้จากมือถือ 4G → Arduino ที่ต่อ WiFi เดียวกันตอบได้แน่นอน

---

## Checklist ก่อนนำไปใช้จริง

- [x] `backend/routers/hardware.py` implement POST + GET
- [x] Register router ใน `backend/main.py`
- [x] `frontend/src/api.js` เพิ่ม `pushHardwareAlert()`
- [x] `frontend/src/pages/result.js` POST หลัง render result
- [ ] Arduino sketch: แก้ SSID / PASSWORD / DEVICE_ID
- [ ] ทดสอบ curl จากภายนอก network ก่อน upload sketch
- [ ] เปิด Serial Monitor ดู log ขณะ Arduino poll
- [ ] ยืนยัน LED ตอบสนองถูกต้องทั้ง 3 level

---

## ข้อควรระวัง

| ประเด็น | รายละเอียด |
|---------|-----------|
| ไม่มี auth บน endpoint | Arduino ไม่มี secure key storage — ยอมรับได้เพราะ GET เป็น read-only, POST มาจาก frontend ของเราเอง |
| TTL สั้นกว่า poll interval | ถ้า TTL < 2 วิ Arduino อาจไม่ทัน — ตั้ง TTL ขั้นต่ำ 10 วิ |
| WiFi หลุด | sketch มี `failCount` → LED ฟ้าวับเมื่อ fail 5 ครั้งติด |
| `WiFiSSLClient` ไม่ verify cert | ยอมรับ cert ทุกใบ (ปลอดภัยพอสำหรับ use case นี้) |
| JSON response ต้องเล็ก | Arduino RAM 32KB — response ปัจจุบัน ~150 bytes ไม่มีปัญหา |

---

*decision: Short Polling (HTTP) · branch: `hardware-alert` · updated: 2026-06-22*
