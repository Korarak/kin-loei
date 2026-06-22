/*
 * กินเลย — Hardware Alert (CLIENT mode - Plain Text)
 * สำหรับ Arduino UNO Q (RouterBridge) + Modulino Pixels & Buttons
 * แก้ไข: edge detection ปุ่ม, ลด blocking, แยก Level 0 จาก animation
 */

#include <Arduino_RouterBridge.h>
#include <Modulino.h>

// ── ตั้งค่า Backend ───────────────────────────────────────
const char* SERVER_HOST = "192.168.137.59";  // IP ของบอร์ดเอง (main.py รันบน Linux side)
const int   SERVER_PORT = 18000;
const char* DEVICE_ID   = "arduino-001";

const unsigned long POLL_INTERVAL   = 5000;  // เพิ่มเป็น 5s เพื่อให้ปุ่มทำงานได้
const unsigned long CONNECT_TIMEOUT = 1500;  // ลด timeout เหลือ 1.5s
const int           MAX_FAIL        = 5;

// ── ฮาร์ดแวร์ Modulino ───────────────────────────────────
ModulinoPixels  pixels;
ModulinoButtons buttons;

int           currentLevel  = -1;   // -1 = startup/idle (ยังไม่ได้ poll)
bool          ledState      = false;
unsigned long lastBlink     = 0;
unsigned long lastPoll      = 0;
int           failCount     = 0;

// สำหรับ idle animation (Level -1)
int           showStage       = 0;
unsigned long lastStageTime   = 0;
unsigned long stageIntervals[] = {500, 600, 700};

// Edge detection ปุ่ม
bool prevButtonA = false;
bool prevButtonB = false;

// สีมาตรฐาน
ModulinoColor colorGreen(0, 50, 0);
ModulinoColor colorAmber(60, 30, 0);
ModulinoColor colorRed(60, 0, 0);
ModulinoColor colorBlue(0, 0, 60);
ModulinoColor colorBlack(0, 0, 0);

void setup() {
  Serial.begin(9600);
  delay(500);
  Serial.println(F("[SETUP] Starting..."));

  Modulino.begin();
  pixels.begin();
  buttons.begin();
  Serial.println(F("[SETUP] Modulino initialized."));

  // flash blue ยืนยันเปิดเครื่อง
  for (int i = 0; i < 8; i++) pixels.set(i, colorBlue);
  pixels.show();
  delay(1000);
  pixels.clear();
  pixels.show();

  Serial.println(F("[SETUP] Bridge.begin()..."));
  Bridge.begin();
  Serial.println(F("[SETUP] READY"));
}

void loop() {
  unsigned long now = millis();

  // 1. Auto-poll
  if (now - lastPoll >= POLL_INTERVAL) {
    lastPoll = now;
    pollResult();
    lastPoll = millis(); // รีเซ็ตหลัง poll เสร็จเพื่อนับ interval ใหม่
  }

  // 2. ตรวจปุ่ม (edge detection)
  checkButtons();

  // 3. animation
  runAnimation(millis());
}

void checkButtons() {
  buttons.update();
  bool btnA = buttons.isPressed(0);
  bool btnB = buttons.isPressed(1);

  // ปุ่ม A (rising edge): บังคับ poll ทันที
  if (btnA && !prevButtonA) {
    Serial.println(F("[BTN] A pressed -> force poll"));
    pollResult();
    lastPoll = millis();
  }

  // ปุ่ม B (rising edge): รีเซ็ตการแสดงผล
  if (btnB && !prevButtonB) {
    Serial.println(F("[BTN] B pressed -> reset display"));
    currentLevel = 0;
    ledState     = false;
    allOff();
  }

  prevButtonA = btnA;
  prevButtonB = btnB;
}

void pollResult() {
  Serial.println(F("[NET] Connecting..."));
  BridgeTCPClient<1024> client(Bridge);

  if (!client.connect(SERVER_HOST, SERVER_PORT)) {
    failCount++;
    Serial.print(F("[NET] Fail count: "));
    Serial.println(failCount);
    if (failCount >= MAX_FAIL) blinkError(colorBlue, 1);
    return;
  }

  String path = F("/result/");
  path += DEVICE_ID;

  client.print(F("GET "));
  client.print(path);
  client.println(F(" HTTP/1.1"));
  client.print(F("Host: "));
  client.println(SERVER_HOST);
  client.println(F("Connection: close"));
  client.println();

  // รอ response (timeout ลดเหลือ CONNECT_TIMEOUT)
  unsigned long t0 = millis();
  while (!client.available() && millis() - t0 < CONNECT_TIMEOUT) {}

  if (!client.available()) {
    Serial.println(F("[NET] Timeout."));
    client.stop();
    return;
  }

  // ข้าม HTTP headers
  while (client.connected() || client.available()) {
    String line = client.readStringUntil('\n');
    line.trim();
    if (line.length() == 0) break;
  }

  int newLevel = client.parseInt();
  client.stop();
  failCount = 0;

  Serial.print(F("[DATA] Level: "));
  Serial.println(newLevel);

  if (newLevel != currentLevel) {
    Serial.print(F("[DATA] Changed: "));
    Serial.print(currentLevel);
    Serial.print(F(" -> "));
    Serial.println(newLevel);

    currentLevel = newLevel;
    ledState     = false;
    lastBlink    = 0;

    if (currentLevel == 0) allOff();
  }
}

void runAnimation(unsigned long now) {
  if (currentLevel < 0) {
    // Startup/idle: cycling animation (ยังไม่มีข้อมูลจากเซิร์ฟเวอร์)
    if (now - lastStageTime >= stageIntervals[showStage]) {
      lastStageTime = now;
      showStage = (showStage + 1) % 3;
      pixels.clear();
      if (showStage == 0) {
        for (int i = 0; i < 3; i++) pixels.set(i, colorGreen);
      } else if (showStage == 1) {
        for (int i = 0; i < 6; i++) pixels.set(i, colorAmber);
      } else {
        for (int i = 0; i < 8; i++) pixels.set(i, colorRed);
      }
      pixels.show();
    }
  } else if (currentLevel == 0) {
    // ไม่มี alert → ดับไฟ (ไม่ทำอะไร)
    return;
  } else if (currentLevel == 1) {
    // SAFE → กะพริบเขียวช้า
    if (now - lastBlink >= 1200) {
      lastBlink = now;
      ledState = !ledState;
      for (int i = 0; i < 8; i++) pixels.set(i, ledState ? colorGreen : colorBlack);
      pixels.show();
    }
  } else if (currentLevel == 2) {
    // CAUTION → กะพริบส้ม
    if (now - lastBlink >= 800) {
      lastBlink = now;
      ledState = !ledState;
      for (int i = 0; i < 8; i++) pixels.set(i, ledState ? colorAmber : colorBlack);
      pixels.show();
    }
  } else if (currentLevel == 3) {
    // AVOID → กะพริบแดงถี่
    if (now - lastBlink >= 250) {
      lastBlink = now;
      ledState = !ledState;
      for (int i = 0; i < 8; i++) pixels.set(i, ledState ? colorRed : colorBlack);
      pixels.show();
    }
  }
}

void allOff() {
  pixels.clear();
  pixels.show();
}

void blinkError(ModulinoColor color, int times) {
  for (int t = 0; t < times; t++) {
    for (int i = 0; i < 8; i++) pixels.set(i, color);
    pixels.show();
    delay(100);
    pixels.clear();
    pixels.show();
    if (t < times - 1) delay(100);
  }
}
