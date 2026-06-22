// กินเลย — Hardware Alert Sketch
// Arduino UNO Q · Modulino Pixels + Buttons
// Python side ส่ง level มาผ่าน Bridge.call("set_alert_level", N)

#include <Arduino_RouterBridge.h>
#include <Modulino.h>

ModulinoPixels  pixels;
ModulinoButtons buttons;

int           currentLevel = -1;   // -1 = startup
bool          ledState     = false;
unsigned long lastBlink    = 0;
unsigned long lastStage    = 0;
int           stage        = 0;

bool prevA = false;
bool prevB = false;

ModulinoColor clrGreen(0, 50, 0);
ModulinoColor clrAmber(60, 30, 0);
ModulinoColor clrRed(60, 0, 0);
ModulinoColor clrBlue (0, 0, 60);
ModulinoColor clrOff  (0, 0, 0);

// ── RPC ที่ Python เรียก ───────────────────────────────────
void set_alert_level(int level) {
    // debug: white flash ยืนยันว่า Bridge RPC ถูกเรียก
    for (int i = 0; i < 8; i++) pixels.set(i, ModulinoColor(60, 60, 60));
    pixels.show();
    delay(200);

    currentLevel = level;
    ledState     = false;
    lastBlink    = 0;
    if (level == 0) allOff();
}

void setup() {
    Serial.begin(115200);
    delay(500);
    Serial.println("[kinloei] setup start");

    Modulino.begin();
    pixels.begin();
    buttons.begin();
    Serial.println("[kinloei] Modulino ready");

    // flash blue ยืนยัน boot
    for (int i = 0; i < 8; i++) pixels.set(i, clrBlue);
    pixels.show();
    delay(800);
    allOff();

    Serial.println("[kinloei] Bridge.begin ...");
    Bridge.begin();
    Bridge.provide("set_alert_level", set_alert_level);
    Serial.println("[kinloei] Bridge ready — waiting for RPC");
}

void loop() {
    checkButtons();
    runAnimation(millis());
}

// ── ปุ่ม ───────────────────────────────────────────────────
void checkButtons() {
    buttons.update();
    bool a = buttons.isPressed(0);
    bool b = buttons.isPressed(1);

    if (a && !prevA) {
        // ปุ่ม A: รีเซ็ต LED ชั่วคราว (Python จะ push level ใหม่เองถ้ายังมี alert)
        set_alert_level(0);
    }
    if (b && !prevB) {
        // ปุ่ม B: test cycle ผ่าน level 1→2→3→0
        int next = (currentLevel >= 3) ? 0 : currentLevel + 1;
        set_alert_level(next);
    }

    prevA = a;
    prevB = b;
}

// ── Animation ──────────────────────────────────────────────
void runAnimation(unsigned long now) {
    if (currentLevel < 0) {
        // Startup idle — cycling สี
        unsigned long intervals[] = {500, 600, 700};
        if (now - lastStage >= intervals[stage]) {
            lastStage = now;
            stage = (stage + 1) % 3;
            pixels.clear();
            if (stage == 0)      for (int i = 0; i < 3; i++) pixels.set(i, clrGreen);
            else if (stage == 1) for (int i = 0; i < 6; i++) pixels.set(i, clrAmber);
            else                 for (int i = 0; i < 8; i++) pixels.set(i, clrRed);
            pixels.show();
        }
    } else if (currentLevel == 0) {
        return; // ดับ — ไม่ทำอะไร
    } else if (currentLevel == 1) {
        // SAFE — กะพริบเขียวช้า
        if (now - lastBlink >= 1200) {
            lastBlink = now; ledState = !ledState;
            for (int i = 0; i < 8; i++) pixels.set(i, ledState ? clrGreen : clrOff);
            pixels.show();
        }
    } else if (currentLevel == 2) {
        // CAUTION — กะพริบส้ม
        if (now - lastBlink >= 800) {
            lastBlink = now; ledState = !ledState;
            for (int i = 0; i < 8; i++) pixels.set(i, ledState ? clrAmber : clrOff);
            pixels.show();
        }
    } else if (currentLevel == 3) {
        // AVOID — กะพริบแดงถี่
        if (now - lastBlink >= 250) {
            lastBlink = now; ledState = !ledState;
            for (int i = 0; i < 8; i++) pixels.set(i, ledState ? clrRed: clrOff);
            pixels.show();
        }
    }
}

void allOff() {
    pixels.clear();
    pixels.show();
}
