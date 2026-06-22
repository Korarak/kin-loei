/*
 * กินเลย — Hardware Alert
 * Arduino Uno R4 WiFi + Modulino Pixel (8× RGB LED)
 *
 * Poll GET /hardware/alert ทุก 2 วินาที
 * แสดงระดับความรุนแรงของสารก่อภูมิแพ้ด้วย LED สี
 *
 * Libraries ที่ต้องติดตั้ง (Arduino IDE → Library Manager):
 *   WiFiS3           — built-in กับ Arduino R4 WiFi
 *   ArduinoHttpClient
 *   ArduinoJson      — v7.x
 *   Arduino_Modulino
 */

#include <WiFiS3.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include <Modulino.h>

// ════════════════════════════════════════════════════════
//  STEP 1 — เลือกโหมดการเชื่อมต่อ (แก้บรรทัดเดียว)
//
//   1  = Production  →  HTTPS  kinloei-api.loeitech.org
//   0  = Local LAN   →  HTTP   192.168.x.x:18000
// ════════════════════════════════════════════════════════
#define USE_HTTPS  1

// ════════════════════════════════════════════════════════
//  STEP 2 — WiFi credentials
// ════════════════════════════════════════════════════════
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD = "YOUR_WIFI_PASSWORD";

// ════════════════════════════════════════════════════════
//  STEP 3 — Server config (เลือกตาม mode ด้านบน)
// ════════════════════════════════════════════════════════
#if USE_HTTPS
  // Production — HTTPS ผ่าน nginx บน domain จริง
  const char* SERVER_HOST = "kinloei-api.loeitech.org";
  const int   SERVER_PORT = 443;
  WiFiSSLClient _netClient;
#else
  // Local LAN — HTTP ตรงไปยัง Docker backend
  // หา IP เครื่อง server ด้วย: ipconfig (Windows) / ip addr (Linux)
  const char* SERVER_HOST = "192.168.1.100";   // ← แก้ให้ตรง
  const int   SERVER_PORT = 18000;
  WiFiClient  _netClient;
#endif

// ════════════════════════════════════════════════════════
//  STEP 4 — Device ID (ต้องตรงกับที่ frontend ส่งมา)
// ════════════════════════════════════════════════════════
const char* DEVICE_ID = "arduino-001";

// ────────────────────────────────────────────────────────
const int POLL_INTERVAL = 2000;   // ms ระหว่าง poll
const int MAX_FAIL      = 5;      // ครั้ง fail ก่อนแสดง error LED

HttpClient    http(_netClient, SERVER_HOST, SERVER_PORT);
ModulinoPixels pixels;

int           currentLevel = -1;
bool          ledState     = false;
unsigned long lastPoll     = 0;
unsigned long lastBlink    = 0;
int           failCount    = 0;

// ─────────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000);

  Serial.println("=== กินเลย Hardware Alert ===");
#if USE_HTTPS
  Serial.println("[Mode] Production HTTPS → " + String(SERVER_HOST));
#else
  Serial.println("[Mode] Local LAN HTTP → " + String(SERVER_HOST) + ":" + String(SERVER_PORT));
#endif

  Modulino.begin();
  pixels.begin();

  // LED ขาวหรี่ระหว่าง boot
  for (int i = 0; i < 8; i++) pixels.set(i, ModulinoColor(15, 15, 15));
  pixels.show();

  // Connect WiFi
  Serial.print("[WiFi] Connecting to " + String(WIFI_SSID));
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < 30) {
    delay(500);
    Serial.print(".");
    attempt++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected: " + WiFi.localIP().toString());
    Serial.println("[Poll] Starting → https://" + String(SERVER_HOST) + "/hardware/alert");
    pixels.clear();
    pixels.show();
  } else {
    Serial.println("\n[WiFi] FAILED — ตรวจสอบ SSID/PASSWORD");
    blinkError(ModulinoColor(0, 0, 255), 3);   // ฟ้า 3 ครั้ง = WiFi fail
  }
}

// ─────────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  if (now - lastPoll >= POLL_INTERVAL) {
    lastPoll = now;
    pollAlert();
  }

  animate(now);
}

// ─────────────────────────────────────────────────────────
void pollAlert() {
  String path = "/hardware/alert?device_id=" + String(DEVICE_ID);

  http.get(path);
  int    code = http.responseStatusCode();
  String body = http.responseBody();

  if (code != 200) {
    failCount++;
    Serial.printf("[HTTP] %d — fail %d/%d\n", code, failCount, MAX_FAIL);
    if (failCount >= MAX_FAIL) {
      blinkError(ModulinoColor(0, 80, 255), 1);   // ฟ้าวับ = network error
    }
    return;
  }
  failCount = 0;

  JsonDocument doc;
  if (deserializeJson(doc, body) != DeserializationError::Ok) {
    Serial.println("[JSON] Parse error");
    return;
  }

  int    newLevel = doc["level"]        | 0;
  String status   = doc["status"]       | "?";
  String product  = doc["product_name"] | "";
  int    expiresIn = doc["expires_in"]  | 0;

  Serial.printf("[Alert] level=%d  status=%s  expires_in=%ds  product=%s\n",
                newLevel, status.c_str(), expiresIn, product.c_str());

  if (newLevel != currentLevel) {
    currentLevel = newLevel;
    ledState     = false;
    lastBlink    = 0;
    applyLevel(currentLevel);
  }
}

// ─────────────────────────────────────────────────────────
void applyLevel(int level) {
  pixels.clear();
  switch (level) {
    case 0:   // ดับ — ไม่มี alert หรือหมดอายุ
      Serial.println("[LED] OFF — no alert");
      break;

    case 1:   // SAFE — เขียวหรี่คงที่
      Serial.println("[LED] GREEN — SAFE");
      for (int i = 0; i < 8; i++)
        pixels.set(i, ModulinoColor(0, 50, 0));
      break;

    case 2:   // CAUTION — เหลืองอำพัน pulse (ทำใน animate)
      Serial.println("[LED] AMBER pulse — CAUTION");
      for (int i = 0; i < 8; i++)
        pixels.set(i, ModulinoColor(255, 140, 0));
      break;

    case 3:   // AVOID — แดง flash เร็ว (ทำใน animate)
      Serial.println("[LED] RED flash — AVOID");
      for (int i = 0; i < 8; i++)
        pixels.set(i, ModulinoColor(255, 0, 0));
      break;
  }
  pixels.show();
}

// ─────────────────────────────────────────────────────────
void animate(unsigned long now) {
  if (currentLevel == 2) {           // CAUTION: pulse ทุก 800ms
    if (now - lastBlink >= 800) {
      lastBlink = now;
      ledState  = !ledState;
      for (int i = 0; i < 8; i++)
        pixels.set(i, ledState ? ModulinoColor(255, 140, 0) : ModulinoColor(0, 0, 0));
      pixels.show();
    }
  } else if (currentLevel == 3) {   // AVOID: flash ทุก 280ms
    if (now - lastBlink >= 280) {
      lastBlink = now;
      ledState  = !ledState;
      for (int i = 0; i < 8; i++)
        pixels.set(i, ledState ? ModulinoColor(255, 0, 0) : ModulinoColor(0, 0, 0));
      pixels.show();
    }
  }
}

// ─────────────────────────────────────────────────────────
void blinkError(ModulinoColor color, int times) {
  for (int t = 0; t < times; t++) {
    for (int i = 0; i < 8; i++) pixels.set(i, color);
    pixels.show();
    delay(150);
    pixels.clear();
    pixels.show();
    if (t < times - 1) delay(150);
  }
}
