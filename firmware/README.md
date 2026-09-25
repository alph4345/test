# Firmware examples

Two small, dependency-free examples of the firmware side of a
[CapCore](../hardware/capcore) gadget:

| | |
|---|---|
| [`arduino/CapCorePower`](arduino/CapCorePower/CapCorePower.ino) | Arduino sketch for any core with `Wire` (RP2040, ESP32, SAMD, nRF52…) |
| [`micropython/capcore.py`](micropython/capcore.py) + [`main.py`](micropython/main.py) | MicroPython driver + example for a Raspberry Pi Pico |

Both do the same five things:

1. **Raise `HOLD` first thing at boot.** After a button tap the board keeps
   power up for only 1–2 s on its own.
2. **Clear the RTC's alarm/timer flags** (PCF8563 register 0x01) and switch off
   its clock output (register 0x0D). A pending flag keeps the gadget on and
   makes `BTN` read as pressed.
3. **Read the capacitor:** voltage = 2 × `VSENSE`; `CHG` is low while charging.
   `percent()` reports the *energy* left between the cut-off and full, which
   tracks remaining runtime better than voltage does.
4. **Turn off:** wait for the button to be released, then drop `HOLD`. A long
   press (1.5 s) does this in the examples. Also turn off by yourself a
   little above the hardware cut-off so you can save state first.
5. **Sleep and wake:** `sleep_minutes(n)` / `sleepMinutes(n)` sets the
   PCF8563 countdown timer (1–255 minutes), then powers off. The timer
   switches the board back on. `wake_at(h, m)` does the same with the alarm.

`ship_mode()` disconnects the capacitor until USB is plugged in again. Use it
before storing a charged gadget.

## Default wiring (Pico)

| CapCore | Pico | |
|---|---|---|
| 3V3 (J2-3 or J3-7) | 3V3 (pin 36) | and Pico **3V3_EN (pin 37) → GND** |
| GND | GND | |
| HOLD (J2-4) | GP2 | output |
| BTN (J2-6) | GP3 | input, pull-up |
| SHIP (J2-7) | GP6 | output |
| CHG (J3-6) | GP7 | input, pull-up |
| VSENSE (J3-5) | GP26 / ADC0 | |
| SDA / SCL (J3-3 / J3-4) | GP4 / GP5 | I2C0, RTC at 0x51 |

For the EDLC build pass `variant=EDLC` (MicroPython) or change `V_FULL` /
`V_EMPTY` (Arduino).

## Power tips for long runtimes

* Budget with [`tools/energy_calc.py`](../tools/energy_calc.py). A few mA
  saved is often worth more than a bigger capacitor.
* Run the CPU slowly and sleep between frames. On the RP2040 a lower
  `machine.freq()` (MicroPython) or `set_sys_clock_khz()` (C SDK) cuts current a lot.
* For e-ink, don't keep the MCU running between updates: set the RTC timer
  and power the whole board off. Between updates it draws about 5 µA.
* Speakers are the hungriest load. Use headphones, keep the volume down, or
  pick a piezo for chiptune.
