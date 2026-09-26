# TrinketCore charge gauge: shows how full the capacitors are on the display.
#
# Copy lib/trinketcore.py and this file (as code.py) to the CIRCUITPY drive.
# Libraries from the Adafruit bundle, in lib/: adafruit_display_text, plus the
# driver for your display (adafruit_st7789, adafruit_st7735r,
# adafruit_displayio_ssd1306, or the community gc9a01).
#
# The burst pattern that makes a capacitor last: wake, show, dim, switch off.
# Plugged into USB it stays on and shows charging progress instead.
import trinketcore  # first: raises HOLD so the board stays on

tc = trinketcore.TrinketCore()

import time  # noqa: E402

import busio  # noqa: E402
import displayio  # noqa: E402
import pwmio  # noqa: E402
import terminalio  # noqa: E402
import vectorio  # noqa: E402
from adafruit_display_text import label  # noqa: E402

DISPLAY = "st7789_240"   # st7789_240, gc9a01, st7735_160x80, ssd1306_spi, ssd1306_i2c
SHOW_SECONDS = 8          # full brightness after waking
OFF_AFTER = 15            # power off after this many seconds (on capacitor power)
BRIGHT, DIM = 0.6, 0.08   # backlight duty: the backlight is most of a TFT's power

displayio.release_displays()


def spi_bus():
    try:
        from fourwire import FourWire          # CircuitPython 9+
    except ImportError:
        from displayio import FourWire
    spi = busio.SPI(trinketcore.TFT_SCK, MOSI=trinketcore.TFT_MOSI)
    return FourWire(spi, command=trinketcore.TFT_DC, chip_select=trinketcore.TFT_CS,
                    reset=trinketcore.TFT_RST, baudrate=24_000_000)


if DISPLAY == "st7789_240":
    from adafruit_st7789 import ST7789
    display = ST7789(spi_bus(), width=240, height=240, rowstart=80)
elif DISPLAY == "gc9a01":
    import gc9a01
    display = gc9a01.GC9A01(spi_bus(), width=240, height=240)
elif DISPLAY == "st7735_160x80":
    from adafruit_st7735r import ST7735R
    display = ST7735R(spi_bus(), width=160, height=80, colstart=24, rotation=90, bgr=True)
elif DISPLAY == "ssd1306_spi":
    import adafruit_displayio_ssd1306
    display = adafruit_displayio_ssd1306.SSD1306(spi_bus(), width=128, height=64)
else:
    import adafruit_displayio_ssd1306
    try:
        from i2cdisplaybus import I2CDisplayBus  # CircuitPython 9+
    except ImportError:
        from displayio import I2CDisplay as I2CDisplayBus
    display = adafruit_displayio_ssd1306.SSD1306(I2CDisplayBus(tc.i2c, device_address=0x3C),
                                                 width=128, height=64)

MONO = DISPLAY.startswith("ssd1306")
backlight = None if MONO else pwmio.PWMOut(trinketcore.TFT_BL, frequency=2000)


def set_backlight(level):
    if backlight is not None:
        backlight.duty_cycle = int(level * 65535)


# ---- the picture: a battery outline, a fill bar, the numbers ------------------
W, H = display.width, display.height
BAT_W, BAT_H = int(W * 0.6), int(H * 0.28)
bx, by = (W - BAT_W) // 2, int(H * 0.22)
palette = displayio.Palette(4)
palette[0] = 0x000000
palette[1] = 0xFFFFFF
palette[2] = 0x20D060   # plenty
palette[3] = 0xF0A020   # low (red below 15 %)

root = displayio.Group()
root.append(vectorio.Rectangle(pixel_shader=palette, x=bx, y=by, width=BAT_W, height=BAT_H, color_index=1))
root.append(vectorio.Rectangle(pixel_shader=palette, x=bx + 2, y=by + 2, width=BAT_W - 4,
                               height=BAT_H - 4, color_index=0))
root.append(vectorio.Rectangle(pixel_shader=palette, x=bx + BAT_W, y=by + BAT_H // 3,
                               width=max(3, BAT_W // 20), height=BAT_H // 3, color_index=1))
fill = vectorio.Rectangle(pixel_shader=palette, x=bx + 4, y=by + 4, width=1, height=BAT_H - 8,
                          color_index=1 if MONO else 2)
root.append(fill)
scale = 1 if H < 100 else 3
pct_text = label.Label(terminalio.FONT, text="", color=0xFFFFFF, scale=scale)
pct_text.anchor_point = (0.5, 0.0)
pct_text.anchored_position = (W // 2, by + BAT_H + 6)
root.append(pct_text)
info = label.Label(terminalio.FONT, text="", color=0xFFFFFF, scale=1 if H < 100 else 2)
info.anchor_point = (0.5, 0.0)
info.anchored_position = (W // 2, by + BAT_H + 6 + 14 * scale)
root.append(info)
display.root_group = root


def draw():
    pct = tc.percent()
    volts = tc.cap_volts()
    fill.width = max(1, (BAT_W - 8) * pct // 100)
    if not MONO:
        palette[3] = 0xF02020 if pct < 15 else 0xF0A020
        fill.color_index = 2 if pct >= 35 else 3
    if tc.charging():
        state = "charging"
    elif tc.usb_power():
        state = "full"
    else:
        state = "%.2f V" % volts
    pct_text.text = "%d%%" % pct
    info.text = state
    return pct


# ---- burst: show, dim, off ---------------------------------------------------------
def show():
    """One burst: bright, then dim, then return so the board can switch off."""
    set_backlight(BRIGHT)
    start = time.monotonic()
    armed = not tc.button()                # ignore the press that woke us
    while True:
        draw()
        awake = time.monotonic() - start
        if tc.usb_power():
            start = time.monotonic()       # stay on while charging, but dim
            set_backlight(DIM if awake > SHOW_SECONDS else BRIGHT)
        elif tc.low():
            info.text = "charge me"
            time.sleep(2)
            return
        elif awake > OFF_AFTER:
            return
        elif awake > SHOW_SECONDS:
            set_backlight(DIM)
        if not tc.button_b.value:          # B: wake the screen again
            start = time.monotonic()
            set_backlight(BRIGHT)
        if tc.button():
            if armed:                      # A (power button): off now
                return
        else:
            armed = True
        time.sleep(0.5)


while True:
    show()
    set_backlight(0)
    tc.power_off()    # returns only if USB (jumper JP1) keeps the board on and A is pressed
