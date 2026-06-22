# Hardware Alert Integration
## กินเลย × Arduino UNO Q × Modulino Pixels & Buttons

---

## ภาพรวม — CLIENT (Poll) Mode

Arduino UNO Q ใช้ RouterBridge ในการ poll backend ทุก 5 วินาที

```
[กินเลย PWA]
     │  POST /hardware/alert
     ▼
[FastAPI :18000]  —  เก็บ alert ใน memory + TTL
     ▲
     │  GET /result/<device_id>  (ทุก 5s)
[Arduino UNO Q + RouterBridge]
     │  I2C / QWIIC
     ▼
[Modulino Pixel — 8× RGB LED]
[Modulino Buttons — 3 ปุ่ม]
```

---

## ไฟล์ที่เกี่ยวข้อง

| ไฟล์ | หน้าที่ |
|------|--------|
| `arduino/sketch/sketch.ino` | Arduino sketch (CLIENT poll mode) |
| `arduino/main.py` | standalone FastAPI prototype (อ้างอิง ไม่ใช้ใน production) |
| `backend/routers/hardware.py` | Hardware alert router ใน backend จริง |

> **Backend จริงคือ** `backend/` ที่รันใน Docker บน port 18000 — ไม่ใช่ `arduino/main.py`

---

## Backend API Endpoints

| Method | Path | คำอธิบาย | Response |
|--------|------|----------|----------|
| `GET` | `/ping` | Health check | Plain Text `"pong"` |
| `POST` | `/hardware/alert` | webapp ส่ง alert | JSON `{"ok":true,"level":N}` |
| `GET` | `/hardware/alert` | ดึงข้อมูลเต็ม (JSON) | JSON AlertResponse |
| `DELETE` | `/hardware/alert?device_id=X` | ล้าง alert | JSON `{"ok":true}` |
| `GET` | `/hardware/devices` | ดู device ที่มี active alert | JSON |
| `GET` | `/result/{device_id}` | **Arduino poll** → Plain Text ตัวเลข 0-3 | `"0"` / `"1"` / `"2"` / `"3"` |
| `GET` | `/hardware/test` | Debug page (HTML auto-refresh 3s) | HTML |

---

## Arduino Sketch Setup

### ตั้งค่าใน `arduino/sketch/sketch.ino`

```cpp
const char* SERVER_HOST = "192.168.137.1";  // IP เครื่อง (hotspot)
const int   SERVER_PORT = 18000;
const char* DEVICE_ID   = "arduino-001";

const unsigned long POLL_INTERVAL   = 5000;  // ms
const unsigned long CONNECT_TIMEOUT = 1500;  // ms
```

> ถ้า Arduino เชื่อม **Windows Mobile Hotspot** → IP เครื่องคือ `192.168.137.1`  
> ถ้า Arduino เชื่อม **Wi-Fi วงเดียวกัน** → ใช้ IP จาก `ipconfig` (interface Wi-Fi)

### Libraries ที่ต้องติดตั้ง

| Library | หมายเหตุ |
|---------|----------|
| `Arduino_RouterBridge` | built-in กับ UNO Q |
| `Arduino_Modulino` | Library Manager |

---

## LED Display

| Level | สถานะ | สี | Animation |
|-------|-------|----|-----------|
| -1 | Startup / ยังไม่มีข้อมูล | cycling G→A→R | idle scan |
| 0 | ไม่มี alert | ดับ | — |
| 1 | SAFE | เขียว | กะพริบช้า 1200ms |
| 2 | CAUTION | ส้ม | กะพริบ 800ms |
| 3 | AVOID | แดง | กะพริบถี่ 250ms |

## ปุ่ม Modulino Buttons

| ปุ่ม | การทำงาน |
|------|----------|
| A (index 0) | บังคับ poll ทันที |
| B (index 1) | รีเซ็ตการแสดงผล (ดับไฟ) |

> ใช้ Edge Detection — กดค้างไม่ยิงซ้ำ

---

## ทดสอบด้วย curl

```bash
# Health check
curl http://192.168.137.1:18000/ping

# ส่ง AVOID alert (แดง flash)
curl -X POST http://192.168.137.1:18000/hardware/alert \
  -H "Content-Type: application/json" \
  -d '{"device_id":"arduino-001","status":"AVOID","product_name":"มาม่าไก่","flagged":["ผงชูรส"],"ttl":60}'

# ดู level ที่ Arduino จะ poll ได้ (Plain Text)
curl http://192.168.137.1:18000/result/arduino-001

# ดูข้อมูลเต็ม (JSON)
curl "http://192.168.137.1:18000/hardware/alert?device_id=arduino-001"

# ล้าง alert
curl -X DELETE "http://192.168.137.1:18000/hardware/alert?device_id=arduino-001"

# Debug page (เปิดใน browser)
open http://192.168.137.1:18000/hardware/test
```

---

## Debug Page

เปิด **`http://192.168.137.1:18000/hardware/test`** ใน browser เห็น:
- Active alerts + TTL แบบ real-time (auto-refresh 3 วินาที)
- Event log: poll request ทุกครั้งจาก Arduino, POST จาก webapp
- Quick-test curl commands

---

## Checklist

- [ ] เปิด Docker: `docker compose up -d`
- [ ] ตรวจ backend ขึ้น: `curl http://192.168.137.1:18000/ping` → `pong`
- [ ] เปิด Mobile Hotspot บน Windows
- [ ] Upload `arduino/sketch/sketch.ino` ไปบอร์ด (Serial Monitor baud 9600)
- [ ] Arduino flash blue 1s แล้วเริ่ม idle animation → แสดงว่า boot สำเร็จ
- [ ] เปิด debug page ดู event log เมื่อ Arduino poll
- [ ] ทดสอบ curl ส่ง AVOID → LED flash แดง
- [ ] กดปุ่ม B บนบอร์ด → LED ดับ

---

## ข้อควรระวัง

| ประเด็น | รายละเอียด |
|---------|-----------|
| IP เปลี่ยน | Hotspot IP คงที่ `192.168.137.1` แต่ Wi-Fi IP เปลี่ยนตาม network |
| TTL ขั้นต่ำ | ตั้ง TTL ≥ 10s (poll interval 5s) |
| Bridge.begin() | UNO Q ใช้เวลา init Linux bridge นาน ~10s ตอน boot |
| Blocking poll | `pollResult()` บล็อก loop ~1.5s ทุก 5s — ปุ่มอาจช้าตอบสนองเล็กน้อย |

---

*อัปเดต: 2026-06-22 — เปลี่ยนเป็น Arduino UNO Q, เพิ่ม `/result`, `/ping`, `/hardware/test`, `/hardware/devices`, `DELETE /hardware/alert`, edge detection ปุ่ม*
