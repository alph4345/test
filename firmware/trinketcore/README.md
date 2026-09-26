# TrinketCore firmware (CircuitPython)

Examples for the [TrinketCore](../../hardware/trinketcore) board. They use
CircuitPython because its built-in display (`displayio`) and sound
(`synthio`, `audiobusio`) support make trinkets quick to write.

| Example | What it does |
|---|---|
| [`charge_gauge`](circuitpython/charge_gauge/code.py) | Wakes, shows the charge level on the display for a few seconds, dims, switches off. Stays on and shows progress while charging. |
| [`music_box`](circuitpython/music_box/code.py) | Opening the lid plays a short synthesised music-box tune with LEDs that pulse on each note, then switches the whole board off. |
| [`lib/trinketcore.py`](circuitpython/lib/trinketcore.py) | Board support: power hold/off, charge level, charging and USB status, RTC wake-up timer, speaker, pin names. |

## Getting started

1. **Install CircuitPython.** A new board with blank flash starts in the USB
   bootloader by itself and shows up as a drive called `RPI-RP2`. Otherwise
   hold **BOOT**, tap **RESET**, then release BOOT. Drag on a CircuitPython
   UF2 for any RP2040 board. The *Raspberry Pi Pico* build works and uses
   2 MB of the flash. A 16 MB build such as *Pimoroni Pico LiPo (16MB)* lets
   you use all of it for sounds and pictures.
2. Copy `lib/trinketcore.py` into `CIRCUITPY/lib/`, and one example's
   `code.py` to the root of `CIRCUITPY`.
3. For the charge gauge, also copy from the
   [Adafruit library bundle](https://circuitpython.org/libraries):
   `adafruit_display_text`, plus your display's driver
   (`adafruit_st7789`, `adafruit_st7735r`, `adafruit_displayio_ssd1306`, or
   the community `gc9a01`). Set `DISPLAY = ...` at the top of `code.py`.

The first line of every `code.py` is `import trinketcore`. It raises `HOLD`
at once: after a button press the board powers itself for only about 4–6 s.

## The pattern that makes a capacitor last

Every example follows the same four steps:

1. **Wake** from a button, the lid switch or the RTC timer. The whole board
   was off, drawing about 5 µA.
2. **Do one short burst**: show the screen for a few seconds, or play a
   15–30 s tune.
3. **Dim, shut the amplifier down** (`AMP_EN` low), and turn LEDs off as
   soon as they're not needed.
4. **Switch everything off** with `tc.power_off()`, or `tc.sleep_minutes(n)`
   to wake again later (virtual pets, e-ink updates).

`tc.percent()` is the energy left between the cut-off and full, which
tracks remaining runtime. `tc.low()` turns true a little above the hardware
cut-off, so you can save state and play a "charge me" sound before the
board switches itself off.

## Pin map

| GPIO | Use | GPIO | Use |
|---|---|---|---|
| GP0–GP7 | expansion J6 (LEDs, buttons, sensors) | GP18 | I2S data |
| GP8 | display CS | GP19 | I2S bit clock |
| GP9 | display DC | GP20 | I2S word select |
| GP10 | display SCK | GP21 | amplifier on (high) |
| GP11 | display MOSI | GP22 | CHG (low = charging) |
| GP12 | display reset | GP23 | power button A (low = pressed) |
| GP13 | backlight (PWM) | GP24 | USB power present (low) |
| GP14 | button B | GP25 | user LED (blue) |
| GP15 | SHIP (pulse high = storage mode) | GP26 | HOLD (high = stay on) |
| GP16 / GP17 | I2C SDA / SCL (RTC 0x51, OLED, Qwiic) | GP27 | capacitor voltage ÷ 2 (analog) |
| | | GP28, GP29 | expansion J6, analog |

GP22, GP23 and GP24 are read through diodes: enable the pull-ups (the library
does). The pin map works with MicroPython and Arduino-Pico too, and the logic
is the same as in the CapCore examples in [`../micropython`](../micropython) and
[`../arduino`](../arduino).
