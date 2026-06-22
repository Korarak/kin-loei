# Hardware Alert Integration — กินเลย × Arduino Modulino Pixel

## ภาพรวม

เมื่อผลสแกนอาหารตรงกับสารก่อภูมิแพ้ในโปรไฟล์ผู้ใช้ ระบบจะส่ง alert ผ่าน HTTP
ไปยัง **Arduino Uno R4 WiFi** ซึ่งจะแสดงระดับความรุนแรงผ่าน **Modulino Pixel**
(8× RGB LED, I2C/QWIIC) แบบ real-time

```
[กินเลย PWA] ──scan result──► [FastAPI backend]
                                      │
                              POST /hardware/alert
                                      │
                              in-memory alert store
                                      │
                         ◄── GET /hardware/alert (poll 2s) ──[Arduino R4 WiFi]
                                                                      │
                                                               I2C (QWIIC)
                                                                      │
                                                            [Modulino Pixel 8 LED]
```

---

## Hardware ที่ใช้

| ชิ้น | รุ่น | หมายเหตุ |
|------|------|----------|
| Microcontroller | Arduino Uno R4 WiFi | Built-in WiFi (ESP32-S3), QWIIC connector |
| LED Module | Arduino Modulino Pixel | 8× WS2812B RGB LED, I2C address `0x6C` |
| เชื่อมต่อ | QWIIC cable (3.3V I2C) | ต่อตรงจาก R4 WiFi port ไม่ต้องบัดกรี |

### ทำไมถึงเลือก Arduino R4 WiFi
- Built-in WiFi ไม่ต้องใช้ shield เพิ่ม
- QWIIC port ตรงกับ Modulino ecosystem ต่อง่าย
- RAM 32KB + Flash 256KB เพียงพอสำหรับ HTTP client + JSON parse
- Library `WiFiS3.h` + `ArduinoHttpClient.h` รองรับ HTTP/1.1 ครบ

---

## Protocol: HTTP Polling

### เหตุผลที่เลือก HTTP แทน MQTT / WebSocket

| Feature | HTTP Polling | MQTT | WebSocket |
|---------|-------------|------|-----------|
| Setup ความซับซ้อน | ต่ำ ✅ | กลาง (ต้องมี broker) | กลาง |
| Arduino library | ครบ built-in ✅ | ต้องติดตั้งเพิ่ม | ต้องติดตั้งเพิ่ม |
| Latency | ~2–3 วินาที ✅ | <1 วินาที | <1 วินาที |
| Server complexity | ไม่ต้องมี broker ✅ | ต้องมี Mosquitto | ต้องจัดการ WS state |
| Debug ง่าย? | ✅ ใช้ curl ทดสอบได้ | ❌ ต้องมี MQTT client | ❌ |

**สรุป:** Latency 2–3 วินาทียอมรับได้สำหรับ use case นี้ (แจ้งเตือนก่อนกิน ไม่ใช่ real-time sensor)

---

## API Specification

### `POST /hardware/alert`
> เรียกจาก frontend ทุกครั้งที่ผลสแกนเป็น CAUTION หรือ AVOID

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
| `device_id` | string | Device ID ของผู้ใช้ที่สแกน |
| `status` | `SAFE` \| `CAUTION` \| `AVOID` | ผลการตรวจ |
| `product_name` | string | ชื่อสินค้า |
| `flagged` | string[] | รายการสารที่ตรวจพบ |
| `ttl` | int | วินาทีที่ alert จะหมดอายุ (default 60) |

**Response:**
```json
{ "ok": true }
```

---

### `GET /hardware/alert`
> Arduino poll ทุก 2 วินาที

**Query params:**
| Param | คำอธิบาย |
|-------|----------|
| `device_id` | (optional) filter เฉพาะ device นี้ ถ้าไม่ส่งจะดึง alert ล่าสุดของทั้งระบบ |

**Response:**
```json
{
  "level": 2,
  "status": "AVOID",
  "product_name": "มาม่าไก่",
  "flagged": ["ผงชูรส", "โซเดียมสูง 1380mg"],
  "expires_in": 45,
  "updated_at": "2026-06-22T10:30:00Z"
}
```

| `level` | ความหมาย | LED behavior |
|---------|----------|-------------|
| `0` | ไม่มี alert / หมดอายุ | ดับทั้งหมด |
| `1` | SAFE | เขียวหรี่ทั้ง 8 |
| `2` | CAUTION — ควรระวัง | เหลืองอำพัน pulse ช้า |
| `3` | AVOID — ห้ามกิน | แดงกระพริบเร็ว |

> **หมายเหตุ:** SAFE ส่ง level 1 (ไม่ใช่ 0) เพื่อยืนยันว่าอุปกรณ์ยังทำงานอยู่

---

## LED Display Mapping

```
Modulino Pixel — 8 LEDs (ซ้าย → ขวา: LED 0–7)

Level 0 (ว่าง / ไม่มี alert):
  ○ ○ ○ ○ ○ ○ ○ ○   ดับหมด

Level 1 (SAFE):
  ● ● ● ● ● ● ● ●   เขียว #00FF00 brightness 20%
  
Level 2 (CAUTION):
  ● ● ● ● ● ● ● ●   เหลืองอำพัน #FF8C00 brightness 60%
  pulse เปิด/ปิดทุก 800ms

Level 3 (AVOID):
  ● ● ● ● ● ● ● ●   แดง #FF0000 brightness 100%
  flash เปิด/ปิดทุก 300ms (เร็ว = อันตราย)
```

### ตัวอย่างเพิ่มเติมที่ปรับได้
- แสดง flagged item count ด้วย LED จำนวน (เช่น 3 สารอันตราย = 3 LED แดง + 5 LED ส้ม)
- ใช้ gradient สีตามความรุนแรง

---

## สิ่งที่ต้องทำ (Scope)

### Backend (`backend/routers/hardware.py`)
- [ ] `POST /hardware/alert` — รับ alert จาก frontend เก็บใน in-memory store
- [ ] `GET /hardware/alert` — คืน current alert (พร้อม TTL check)
- [ ] Auto-expire: alert หมดอายุหลัง TTL วินาที
- [ ] Register router ใน `main.py`

### Frontend (`frontend/src/pages/result.js`)
- [ ] หลัง render result แล้ว ถ้า status เป็น `CAUTION` หรือ `AVOID` → `POST /hardware/alert`
- [ ] ถ้าเป็น `SAFE` → `POST /hardware/alert` พร้อม `status: "SAFE"` เพื่อ reset LED

### Arduino Sketch (`arduino/kinloei_alert/kinloei_alert.ino`)
- [ ] Connect WiFi ด้วย SSID/password ที่กำหนดใน config
- [ ] Poll `GET /hardware/alert?device_id=xxx` ทุก 2,000ms
- [ ] Parse JSON response (ใช้ `ArduinoJson`)
- [ ] แสดงผล LED ตาม level พร้อม animation
- [ ] Fallback: ถ้า HTTP fail 5 ครั้งติด → LED ฟ้าสั้น (บอก WiFi problem)

### Libraries ที่ต้องติดตั้ง (Arduino IDE)
```
WiFiS3          — built-in กับ Arduino R4 WiFi
ArduinoHttpClient — HTTP client
ArduinoJson     — JSON parse (version 7.x)
Arduino_Modulino — Modulino Pixel driver
```

---

## Arduino Sketch (โครง)

```cpp
#include <WiFiS3.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include <Modulino.h>

// ── Config ──────────────────────────────────────────
const char* WIFI_SSID     = "YOUR_SSID";
const char* WIFI_PASSWORD  = "YOUR_PASS";
const char* SERVER_HOST    = "192.168.x.x";   // IP ของ backend (ไม่ใช่ localhost)
const int   SERVER_PORT    = 18000;
const char* DEVICE_ID      = "arduino-001";
const int   POLL_INTERVAL  = 2000;            // ms

// ── Hardware ─────────────────────────────────────────
ModulinoPixels pixels;
WiFiClient wifi;
HttpClient http(wifi, SERVER_HOST, SERVER_PORT);

int  currentLevel = 0;
bool ledState     = false;
unsigned long lastPoll     = 0;
unsigned long lastBlink    = 0;
int  failCount    = 0;

// ── Setup ─────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  Modulino.begin();
  pixels.begin();
  pixels.clear();
  pixels.show();

  // WiFi connect
  Serial.print("Connecting WiFi");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  while (WiFi.status() != WL_CONNECTED) {
    delay(500);
    Serial.print(".");
  }
  Serial.println("\nConnected: " + WiFi.localIP().toString());
  showLevel(0);  // เริ่มต้นดับ LED
}

// ── Loop ──────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // Poll backend
  if (now - lastPoll >= POLL_INTERVAL) {
    lastPoll = now;
    pollAlert();
  }

  // Animation (non-blocking)
  animate(now);
}

// ── HTTP Poll ─────────────────────────────────────────
void pollAlert() {
  String path = "/hardware/alert?device_id=";
  path += DEVICE_ID;

  http.get(path);
  int statusCode = http.responseStatusCode();
  String body    = http.responseBody();

  if (statusCode != 200) {
    failCount++;
    if (failCount >= 5) showWiFiError();
    return;
  }
  failCount = 0;

  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) return;

  int newLevel = doc["level"] | 0;
  if (newLevel != currentLevel) {
    currentLevel = newLevel;
    ledState = false;
    lastBlink = 0;
    showLevel(currentLevel);
  }
}

// ── LED Control ───────────────────────────────────────
void showLevel(int level) {
  pixels.clear();
  switch (level) {
    case 0:  // ดับ
      break;

    case 1:  // SAFE — เขียวหรี่
      for (int i = 0; i < 8; i++)
        pixels.set(i, ModulinoColor(0, 50, 0));
      break;

    case 2:  // CAUTION — เหลืองอำพัน (animation ทำใน animate())
      for (int i = 0; i < 8; i++)
        pixels.set(i, ModulinoColor(255, 140, 0));
      break;

    case 3:  // AVOID — แดง (animation ทำใน animate())
      for (int i = 0; i < 8; i++)
        pixels.set(i, ModulinoColor(255, 0, 0));
      break;
  }
  pixels.show();
}

// ── Non-blocking animation ───────────────────────────
void animate(unsigned long now) {
  if (currentLevel == 2) {          // CAUTION: pulse ทุก 800ms
    if (now - lastBlink >= 800) {
      lastBlink = now;
      ledState = !ledState;
      for (int i = 0; i < 8; i++)
        pixels.set(i, ledState ? ModulinoColor(255, 140, 0) : ModulinoColor(0,0,0));
      pixels.show();
    }
  } else if (currentLevel == 3) {   // AVOID: flash ทุก 300ms
    if (now - lastBlink >= 300) {
      lastBlink = now;
      ledState = !ledState;
      for (int i = 0; i < 8; i++)
        pixels.set(i, ledState ? ModulinoColor(255, 0, 0) : ModulinoColor(0,0,0));
      pixels.show();
    }
  }
}

// ── WiFi error indicator (ฟ้าสั้น) ───────────────────
void showWiFiError() {
  for (int i = 0; i < 8; i++) pixels.set(i, ModulinoColor(0, 0, 255));
  pixels.show();
  delay(200);
  pixels.clear();
  pixels.show();
}
```

---

## ขั้นตอนการตั้งค่า (Quick Start)

1. **Backend** — รัน `docker compose up` ตามปกติ port 18000
2. **Arduino** — เปิด `arduino/kinloei_alert/kinloei_alert.ino`
   - แก้ `WIFI_SSID`, `WIFI_PASSWORD`
   - แก้ `SERVER_HOST` เป็น IP ของเครื่องที่รัน backend (ดูด้วย `ipconfig`)
   - Upload ขึ้น Arduino R4 WiFi
3. **ทดสอบ** — เปิด Serial Monitor ดู log + เปิดแอปสแกนอาหาร

### ทดสอบ endpoint ด้วย curl
```bash
# ส่ง AVOID alert ทดสอบ
curl -X POST http://localhost:18000/hardware/alert \
  -H "Content-Type: application/json" \
  -d '{"device_id":"arduino-001","status":"AVOID","product_name":"ทดสอบ","flagged":["กุ้ง"],"ttl":60}'

# Arduino poll (ดู response)
curl http://localhost:18000/hardware/alert?device_id=arduino-001

# Reset (SAFE)
curl -X POST http://localhost:18000/hardware/alert \
  -H "Content-Type: application/json" \
  -d '{"device_id":"arduino-001","status":"SAFE","product_name":"","flagged":[],"ttl":10}'
```

---

## Network Diagram

```
 ┌─────────────────────────────────┐
 │  LAN / WiFi network             │
 │                                 │
 │  ┌──────────────┐  HTTP:18000   │
 │  │ กินเลย App  │──────────────►│
 │  │ (browser)    │               │   ┌──────────────────┐
 │  └──────────────┘               │   │ FastAPI Backend  │
 │                                 │   │ port 18000       │
 │  ┌──────────────┐  GET poll 2s  │   │                  │
 │  │ Arduino R4   │◄──────────────┤   │ /hardware/alert  │
 │  │ WiFi         │               │   └──────────────────┘
 │  └──────┬───────┘               │
 │         │ I2C (QWIIC)           │
 │  ┌──────▼───────┐               │
 │  │ Modulino     │               │
 │  │ Pixel 8 LED  │               │
 │  └──────────────┘               │
 └─────────────────────────────────┘
```

---

## ข้อควรระวัง

- **Arduino ต้องอยู่ network เดียวกับ backend** — ถ้าใช้ Docker ต้องเปิด port 18000 ให้ LAN เข้าถึงได้ (ปัจจุบันเปิดอยู่แล้ว)
- **IP ของ backend เปลี่ยนได้** — พิจารณาใช้ mDNS หรือ assign static IP
- **ไม่มี auth บน `/hardware/alert`** — endpoint นี้ไม่ต้องการ token เพราะ Arduino ไม่มี secure storage; ถ้า production ควรเพิ่ม pre-shared key
- **TTL ค่า default 60 วินาที** — หลังจากนั้น LED จะดับอัตโนมัติไม่ให้ค้างแสดง

---

*branch: `hardware-alert` | สร้าง: 2026-06-22*
