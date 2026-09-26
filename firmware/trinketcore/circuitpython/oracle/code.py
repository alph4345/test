# TrinketCore digital oracle: press A (or shake a vibration switch wired to WAKE)
# and a random tarot card appears on the e-ink screen, with a small charge icon in
# the corner. Then the whole board switches off. E-ink keeps the card on screen
# with no power at all, so one charge lasts hundreds of draws.
#
# Copy to the CIRCUITPY drive:
#   lib/trinketcore.py, plus lib/adafruit_ssd1681.mpy and lib/adafruit_display_text/
#   from the Adafruit library bundle
#   this file, as code.py
#   /cards/*.bmp made with make_cards.py. Without them the oracle shows each
#   card's number and name on a plain frame.
#
# Display: a 1.54" 200 x 200 e-paper module with an SSD1681 controller
# (Waveshare 1.54" V2, WeAct 1.54"). Wire it to J4 by function:
#   VCC -> 3V3   GND -> GND   DIN -> MOSI   CLK -> SCK
#   CS  -> CS    DC  -> DC    RST -> RES    BUSY -> BLK (GP13 reads it)
#
# Energy: about 30 mA for 5 s per draw (0.6 J), ~600 draws on one 120 F LIC.
# A black/white/red panel takes ~14 s per refresh, so ~2 J per draw.
import trinketcore  # first: raises HOLD so the board stays on

tc = trinketcore.TrinketCore()

import os  # noqa: E402
import random  # noqa: E402
import time  # noqa: E402

import adafruit_ssd1681  # noqa: E402
import busio  # noqa: E402
import displayio  # noqa: E402
import supervisor  # noqa: E402
import terminalio  # noqa: E402
import vectorio  # noqa: E402
from adafruit_display_text import label  # noqa: E402

try:
    from fourwire import FourWire          # CircuitPython 9+
except ImportError:
    from displayio import FourWire         # CircuitPython 8

SIZE = 200              # panel width and height in pixels
ROTATION = 0            # 0/90/180/270 to suit how the module is mounted
COLOURS = "bw"          # "bwr" for black/white/red panels (make the cards with --colours bwr)
REVERSED = 0.0          # chance of drawing a card reversed (upside down), e.g. 0.3
CARDS = "/cards"
MAJOR_ARCANA = ("The Fool", "The Magician", "The High Priestess", "The Empress", "The Emperor",
                "The Hierophant", "The Lovers", "The Chariot", "Strength", "The Hermit",
                "Wheel of Fortune", "Justice", "The Hanged Man", "Death", "Temperance",
                "The Devil", "The Tower", "The Star", "The Moon", "The Sun", "Judgement",
                "The World")
ROMAN = ("0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII",
         "XIII", "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI")

random.seed(int.from_bytes(os.urandom(4), "big"))   # the RP2040's hardware random bits

displayio.release_displays()
spi = busio.SPI(trinketcore.TFT_SCK, MOSI=trinketcore.TFT_MOSI)
bus = FourWire(spi, command=trinketcore.TFT_DC, chip_select=trinketcore.TFT_CS,
               reset=trinketcore.TFT_RST, baudrate=1_000_000)
extra = {"highlight_color": 0xFF0000} if COLOURS == "bwr" else {}
display = adafruit_ssd1681.SSD1681(bus, width=SIZE, height=SIZE, busy_pin=trinketcore.EPD_BUSY,
                                   rotation=ROTATION, **extra)

ink = displayio.Palette(2)
ink[0] = 0x000000
ink[1] = 0xFFFFFF


def rect(group, x, y, w, h, white):
    group.append(vectorio.Rectangle(pixel_shader=ink, x=x, y=y, width=w, height=h,
                                    color_index=1 if white else 0))


def words(group, s, y, scale=2):
    """Centred text, split over two lines when it is too wide for the panel."""
    lines = [s]
    if len(s) * 6 * scale > SIZE - 24 and " " in s:
        cut = min((i for i, c in enumerate(s) if c == " "), key=lambda i: abs(i - len(s) // 2))
        lines = [s[:cut], s[cut + 1:]]
    for k, line in enumerate(lines):
        t = label.Label(terminalio.FONT, text=line, color=0x000000, scale=scale)
        t.anchor_point = (0.5, 0.5)
        t.anchored_position = (SIZE // 2, y + k * 14 * scale)
        group.append(t)


def framed():
    g = displayio.Group()
    rect(g, 0, 0, SIZE, SIZE, True)
    rect(g, 6, 6, SIZE - 12, SIZE - 12, False)        # a 2-pixel frame
    rect(g, 8, 8, SIZE - 16, SIZE - 16, True)
    return g


def battery(group, pct):
    """Charge icon in the bottom-right corner; it stays visible while the board is off."""
    x, y = SIZE - 31, SIZE - 17
    rect(group, x - 2, y - 2, 31, 17, True)           # white patch over the art
    rect(group, x, y, 24, 12, False)
    rect(group, x + 2, y + 2, 20, 8, True)
    rect(group, x + 24, y + 3, 3, 6, False)
    if pct > 0:
        rect(group, x + 3, y + 3, max(1, 18 * pct // 100), 6, False)


def card_files():
    try:
        return sorted(f for f in os.listdir(CARDS)
                      if f.lower().endswith(".bmp") and not f.startswith("."))
    except OSError:
        return []


def draw_card():
    reversed_card = random.random() < REVERSED
    files = card_files()
    if files:
        g = displayio.Group()
        art = displayio.OnDiskBitmap(CARDS + "/" + random.choice(files))
        tile = displayio.TileGrid(art, pixel_shader=art.pixel_shader)
        tile.flip_x = tile.flip_y = reversed_card     # 180 degrees: a reversed card
        g.append(tile)
    else:
        n = random.randrange(len(MAJOR_ARCANA))
        g = framed()
        words(g, ROMAN[n], 52, scale=3)
        words(g, MAJOR_ARCANA[n], 112)
        if reversed_card:
            words(g, "reversed", 160, scale=1)
    battery(g, tc.percent())
    return g


def charge_me():
    g = framed()
    words(g, "charge me", 80)
    words(g, "plug in USB-C", 125, scale=1)
    battery(g, 0)
    return g


def show(group):
    display.root_group = group
    time.sleep(max(0, display.time_to_refresh))   # only matters when USB keeps the board on
    display.refresh()
    while display.busy:        # cutting power mid-refresh would leave a faded image
        time.sleep(0.05)


# ---- one draw per wake, then off --------------------------------------------------
show(charge_me() if tc.low() else draw_card())
tc.power_off()        # returns only if USB (jumper JP1) keeps the board on and A is pressed
supervisor.reload()   # on USB: start over and draw another card
