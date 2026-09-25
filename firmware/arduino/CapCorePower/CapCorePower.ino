// CapCorePower.ino: power management for a gadget running on a CapCore board.
//
// Shows everything the board expects from firmware:
//   * raise HOLD immediately so the gadget stays on after a button tap,
//   * clear the RTC flags (a pending alarm/timer holds power on and makes BTN read low),
//   * read the capacitor voltage and charge status,
//   * long-press the button to turn off,
//   * sleep for N minutes and let the RTC timer wake the gadget up again,
//   * ship mode for storage.
//
// Written for any Arduino core with Wire (RP2040, ESP32, SAMD, nRF52, AVR at 3.3 V).
// Change the pin numbers below to match your wiring.

#include <Wire.h>

// ---- wiring --------------------------------------------------------------
const int PIN_HOLD = 2;      // CapCore J2-4, output: high = stay on
const int PIN_BTN = 3;       // CapCore J2-6, input with pull-up: low = button pressed
const int PIN_SHIP = 6;      // CapCore J2-7, output: pulse high = ship mode
const int PIN_CHG = 7;       // CapCore J3-6, input with pull-up: low = charging
const int PIN_VSENSE = A0;   // CapCore J3-5, analog: capacitor voltage / 2
// SDA/SCL (CapCore J3-3/J3-4) go to your board's default I2C pins.

// ---- capacitor -----------------------------------------------------------
// LIC build: charges to 3.71 V, hardware cut-off at 2.61 V.
// EDLC build: charges to 2.62 V, hardware cut-off at 1.96 V.
const float V_FULL = 3.71;
const float V_EMPTY = 2.61;
const float V_SHUTDOWN = 2.75;   // power off cleanly a little above the hard cut-off

const float ADC_VREF = 3.3;      // CapCore's 3V3 rail feeds the MCU (ESP32: calibrate)
int adcBits = 10;                // raised to 12 below where the core supports it

// ---- PCF8563 real-time clock (I2C address 0x51) --------------------------
const uint8_t RTC_ADDR = 0x51;
const uint8_t REG_CTRL2 = 0x01;   // bit3 AF, bit2 TF, bit1 AIE, bit0 TIE
const uint8_t REG_CLKOUT = 0x0D;  // bit7 FE: 0 = CLKOUT off (saves ~1 uA)
const uint8_t REG_TIMER_CTRL = 0x0E;
const uint8_t REG_TIMER = 0x0F;

bool wokeByRtc = false;

uint8_t rtcRead(uint8_t reg) {
  Wire.beginTransmission(RTC_ADDR);
  Wire.write(reg);
  Wire.endTransmission(false);
  Wire.requestFrom(RTC_ADDR, (uint8_t)1);
  return Wire.available() ? Wire.read() : 0;
}

void rtcWrite(uint8_t reg, uint8_t value) {
  Wire.beginTransmission(RTC_ADDR);
  Wire.write(reg);
  Wire.write(value);
  Wire.endTransmission();
}

// ---- CapCore helpers ------------------------------------------------------
float capVolts() {
  // VSENSE sits behind 1 Mohm + 1 Mohm and a 100 nF capacitor; one slow read is fine.
  long sum = 0;
  for (int i = 0; i < 8; i++) sum += analogRead(PIN_VSENSE);
  float vsense = (sum / 8.0) * ADC_VREF / ((1 << adcBits) - 1);
  return 2.0 * vsense;
}

int capPercent() {
  // Energy left between the cut-off and full, which is what runtime depends on.
  float v = constrain(capVolts(), V_EMPTY, V_FULL);
  return (int)(100.0 * (v * v - V_EMPTY * V_EMPTY) / (V_FULL * V_FULL - V_EMPTY * V_EMPTY));
}

bool charging() { return digitalRead(PIN_CHG) == LOW; }
bool buttonDown() { return digitalRead(PIN_BTN) == LOW; }

void powerOff() {
  // The power switch stays on while the button is held: wait for release first.
  while (buttonDown()) delay(10);
  digitalWrite(PIN_HOLD, LOW);
  delay(3000);
  // Still running? USB is plugged in with jumper JP1 bridged (or JP2 is bridged),
  // which keeps the gadget on. Idle quietly until that changes.
  while (true) {
    delay(1000);
    if (buttonDown()) {            // a press brings us back to life
      digitalWrite(PIN_HOLD, HIGH);
      return;
    }
  }
}

void sleepMinutes(uint8_t minutes) {
  // PCF8563 countdown timer at 1/60 Hz. When it expires, TF pulls /INT low,
  // which switches CapCore back on.
  rtcWrite(REG_TIMER_CTRL, 0x00);   // stop timer
  rtcWrite(REG_TIMER, minutes);
  rtcWrite(REG_CTRL2, 0x01);        // TIE = 1, clear AF/TF, level interrupt
  rtcWrite(REG_TIMER_CTRL, 0x83);   // TE = 1, source = 1/60 Hz
  powerOff();
}

void shipMode() {
  // Disconnects the capacitor completely; only USB power brings the board back.
  // Use before storing or posting a charged gadget.
  while (buttonDown()) delay(10);
  digitalWrite(PIN_SHIP, HIGH);
  delay(2000);
  digitalWrite(PIN_SHIP, LOW);      // only reached while USB is plugged in
}

// ---- sketch ----------------------------------------------------------------
void setup() {
  // 1) Keep the power on. Do this before anything slow.
  pinMode(PIN_HOLD, OUTPUT);
  digitalWrite(PIN_HOLD, HIGH);
  pinMode(PIN_SHIP, OUTPUT);
  digitalWrite(PIN_SHIP, LOW);
  pinMode(PIN_BTN, INPUT_PULLUP);
  pinMode(PIN_CHG, INPUT_PULLUP);
#if defined(ARDUINO_ARCH_RP2040) || defined(ARDUINO_ARCH_ESP32) || defined(ARDUINO_ARCH_SAMD) || \
    defined(ARDUINO_ARCH_NRF52) || defined(ARDUINO_ARCH_STM32)
  analogReadResolution(12);
  adcBits = 12;
#endif

  // 2) Find out why we woke up and release the RTC interrupt.
  Wire.begin();
  uint8_t ctrl2 = rtcRead(REG_CTRL2);
  wokeByRtc = ctrl2 & 0x0C;          // AF or TF set
  rtcWrite(REG_CTRL2, 0x00);         // clear flags, interrupts off -> releases WAKE
  rtcWrite(REG_CLKOUT, 0x00);        // clock output off
  rtcWrite(REG_TIMER_CTRL, 0x00);    // timer off

  Serial.begin(115200);
  delay(200);
  Serial.print(wokeByRtc ? "Woke from RTC timer. " : "Woke from button/USB. ");
  Serial.print("Capacitor ");
  Serial.print(capVolts(), 2);
  Serial.print(" V (");
  Serial.print(capPercent());
  Serial.println(charging() ? "%, charging)" : "%)");

  if (wokeByRtc) {
    // Example: an e-ink dashboard would refresh here, then sleep again.
    // updateDisplay();
    sleepMinutes(60);
  }
}

void loop() {
  static unsigned long pressedAt = 0;

  if (!charging() && capVolts() < V_SHUTDOWN) {
    Serial.println("Capacitor low, powering off. Plug in USB to charge.");
    // saveGame(); showChargeMeScreen();
    powerOff();
  }

  // Long-press (1.5 s) to turn off.
  if (buttonDown()) {
    if (pressedAt == 0) pressedAt = millis();
    if (millis() - pressedAt > 1500) {
      Serial.println("Bye");
      powerOff();
      pressedAt = 0;
    }
  } else {
    pressedAt = 0;
  }

  // Your game / music / display code goes here.
  delay(20);
}
