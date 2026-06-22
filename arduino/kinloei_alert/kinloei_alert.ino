/*
 * กินเลย — Hardware Alert
 * Arduino Uno R4 WiFi + Modulino Pixel (8× RGB LED)
 *
 * Poll GET /hardware/alert ทุก 2 วินาที
 * แสดงระดับความรุนแรงของสารก่อภูมิแพ้
 *
 * Libraries ที่ต้องติดตั้ง:
 *   WiFiS3          (built-in กับ Arduino R4 WiFi)
 *   ArduinoHttpClient
 *   ArduinoJson     (v7.x)
 *   Arduino_Modulino
 */

#include <WiFiS3.h>
#include <ArduinoHttpClient.h>
#include <ArduinoJson.h>
#include <Modulino.h>

// ── User Config ── แก้ค่าเหล่านี้ก่อน upload ─────────
const char* WIFI_SSID     = "YOUR_WIFI_SSID";
const char* WIFI_PASSWORD  = "YOUR_WIFI_PASSWORD";

// โหมด production (HTTPS บน domain จริง)
const char* SERVER_HOST    = "kinloei-loeitech.ac.th";
const int   SERVER_PORT    = 443;
const bool  USE_HTTPS      = true;

// โหมด local dev (HTTP บน LAN) — สลับมาใช้ถ้าทดสอบในบ้าน
// const char* SERVER_HOST = "192.168.1.100";
// const int   SERVER_PORT = 18000;
// const bool  USE_HTTPS   = false;

const char* DEVICE_ID      = "arduino-001";
// ──────────────────────────────────────────────────────

const int   POLL_INTERVAL  = 2000;  // ms
const int   MAX_FAIL       = 5;     // ครั้งที่ fail ก่อน error indicator

ModulinoPixels pixels;
WiFiSSLClient  wifiSSL;   // HTTPS
WiFiClient     wifiPlain; // HTTP (local dev)
HttpClient     http(wifiSSL, SERVER_HOST, SERVER_PORT); // default HTTPS

int           currentLevel = -1;   // -1 = ยังไม่ได้รับข้อมูล
bool          ledState     = false;
unsigned long lastPoll     = 0;
unsigned long lastBlink    = 0;
int           failCount    = 0;

// ─────────────────────────────────────────────────────
void setup() {
  Serial.begin(115200);
  while (!Serial && millis() < 3000);

  // Init Modulino Pixel
  Modulino.begin();
  pixels.begin();
  pixels.clear();
  pixels.show();

  // Show "booting" (ขาว)
  for (int i = 0; i < 8; i++) pixels.set(i, ModulinoColor(20, 20, 20));
  pixels.show();

  // Connect WiFi
  Serial.print("[WiFi] Connecting");
  WiFi.begin(WIFI_SSID, WIFI_PASSWORD);
  int attempt = 0;
  while (WiFi.status() != WL_CONNECTED && attempt < 30) {
    delay(500);
    Serial.print(".");
    attempt++;
  }

  if (WiFi.status() == WL_CONNECTED) {
    Serial.println("\n[WiFi] Connected: " + WiFi.localIP().toString());
    pixels.clear();
    pixels.show();
  } else {
    Serial.println("\n[WiFi] FAILED — check SSID/password");
    showWiFiError();
  }
}

// ─────────────────────────────────────────────────────
void loop() {
  unsigned long now = millis();

  // Poll backend
  if (now - lastPoll >= POLL_INTERVAL) {
    lastPoll = now;
    pollAlert();
  }

  // Non-blocking LED animation
  animate(now);
}

// ─────────────────────────────────────────────────────
void pollAlert() {
  String path = "/hardware/alert?device_id=";
  path += DEVICE_ID;

  http.get(path);
  int    statusCode = http.responseStatusCode();
  String body       = http.responseBody();

  if (statusCode != 200) {
    failCount++;
    Serial.printf("[HTTP] Error %d (fail %d/%d)\n", statusCode, failCount, MAX_FAIL);
    if (failCount >= MAX_FAIL) showWiFiError();
    return;
  }
  failCount = 0;

  JsonDocument doc;
  DeserializationError err = deserializeJson(doc, body);
  if (err) {
    Serial.println("[JSON] Parse error");
    return;
  }

  int     newLevel = doc["level"] | 0;
  String  status   = doc["status"] | "";
  String  product  = doc["product_name"] | "";

  Serial.printf("[Alert] level=%d status=%s product=%s\n",
                newLevel, status.c_str(), product.c_str());

  if (newLevel != currentLevel) {
    currentLevel = newLevel;
    ledState     = false;
    lastBlink    = 0;
    applyLevel(currentLevel);
  }
}

// ─────────────────────────────────────────────────────
void applyLevel(int level) {
  pixels.clear();
  switch (level) {
    case 0:
      // ดับ — ไม่มี alert หรือหมดอายุ
      break;

    case 1:
      // SAFE — เขียวหรี่คงที่
      for (int i = 0; i < 8; i++)
        pixels.set(i, ModulinoColor(0, 50, 0));
      break;

    case 2:
      // CAUTION — เหลืองอำพัน (animation loop ใน animate())
      for (int i = 0; i < 8; i++)
        pixels.set(i, ModulinoColor(255, 140, 0));
      break;

    case 3:
      // AVOID — แดงสว่าง (animation loop ใน animate())
      for (int i = 0; i < 8; i++)
        pixels.set(i, ModulinoColor(255, 0, 0));
      break;

    default:
      break;
  }
  pixels.show();
}

// ─────────────────────────────────────────────────────
void animate(unsigned long now) {
  if (currentLevel == 2) {
    // CAUTION: pulse ช้า ทุก 800ms
    if (now - lastBlink >= 800) {
      lastBlink = now;
      ledState  = !ledState;
      for (int i = 0; i < 8; i++) {
        pixels.set(i, ledState
          ? ModulinoColor(255, 140, 0)
          : ModulinoColor(0,   0,   0));
      }
      pixels.show();
    }
  } else if (currentLevel == 3) {
    // AVOID: flash เร็ว ทุก 280ms
    if (now - lastBlink >= 280) {
      lastBlink = now;
      ledState  = !ledState;
      for (int i = 0; i < 8; i++) {
        pixels.set(i, ledState
          ? ModulinoColor(255, 0, 0)
          : ModulinoColor(0,   0, 0));
      }
      pixels.show();
    }
  }
}

// ─────────────────────────────────────────────────────
void showWiFiError() {
  // ฟ้าวับสั้น — บอก WiFi/backend ไม่ได้
  for (int i = 0; i < 8; i++) pixels.set(i, ModulinoColor(0, 80, 255));
  pixels.show();
  delay(150);
  pixels.clear();
  pixels.show();
}
