"""Turn tarot card art into e-ink images for the oracle example (runs on a computer).

    pip install pillow
    python3 make_cards.py ART_FOLDER CARDS_FOLDER [--size 200x200] [--colours bw|bwr]
                          [--fit crop|pad] [--no-title]

Each picture is cropped (or padded) to the panel's shape, dithered to black and
white (or black, white and red for three-colour panels), given its name along
the bottom, and saved as a small BMP. Copy CARDS_FOLDER to CIRCUITPY/cards.

Name the art files by card, e.g. "00-the-fool.jpg", "13-death.png" or
"wands-03.jpg". A leading number from 0 to 21 becomes the card's Roman numeral.

Use art you are free to use: the original 1909 Rider-Waite-Smith cards are in
the public domain in the UK and other life + 70 countries, but recoloured
modern editions can carry their own copyright.
"""

import argparse
import os
import re

from PIL import Image, ImageDraw, ImageFont, ImageOps

ROMAN = ["0", "I", "II", "III", "IV", "V", "VI", "VII", "VIII", "IX", "X", "XI", "XII", "XIII",
         "XIV", "XV", "XVI", "XVII", "XVIII", "XIX", "XX", "XXI"]
IMAGES = (".png", ".jpg", ".jpeg", ".gif", ".bmp", ".webp", ".tif", ".tiff")
TITLE_BAND = 0.12       # share of the height kept for the name


def title_for(stem):
    m = re.match(r"^(\d+)[-_ ]+(.+)$", stem)
    text = (m.group(2) if m else stem).replace("_", " ").replace("-", " ")
    name = " ".join(text.split()).upper()
    if m and int(m.group(1)) < len(ROMAN):
        return f"{ROMAN[int(m.group(1))]}  {name}"
    return name


def font(px):
    try:
        return ImageFont.load_default(size=px)      # Pillow 10.1+: a scalable font
    except TypeError:
        return ImageFont.load_default()


def shape(img, w, h, fit):
    img = ImageOps.exif_transpose(img).convert("RGB")
    if fit == "pad":
        return ImageOps.pad(img, (w, h), color=(255, 255, 255))
    return ImageOps.fit(img, (w, h), Image.LANCZOS, centering=(0.5, 0.4))


def dither(img, colours):
    img = ImageOps.autocontrast(img, cutoff=1)
    if colours == "bw":
        return img.convert("L").convert("1")        # Floyd-Steinberg dithering
    pal = Image.new("P", (1, 1))
    pal.putpalette([0, 0, 0, 255, 255, 255, 255, 0, 0] + [0, 0, 0] * 253)
    return img.quantize(palette=pal, dither=Image.FLOYDSTEINBERG)


def make(path, out_dir, w, h, colours, fit, titled):
    stem = os.path.splitext(os.path.basename(path))[0]
    art_h = h - int(h * TITLE_BAND) if titled else h
    card = Image.new("RGB", (w, h), (255, 255, 255))
    card.paste(shape(Image.open(path), w, art_h, fit), (0, 0))
    card = dither(card, colours)
    if titled:
        # The name goes on after dithering so the letters stay crisp.
        d = ImageDraw.Draw(card)
        band = h - art_h
        d.rectangle([0, art_h, w - 1, h - 1], fill=1)          # white (index 1 in both modes)
        d.line([0, art_h, w - 1, art_h], fill=0, width=1)
        title, px = title_for(stem), max(8, int(band * 0.7))
        f = font(px)
        while d.textlength(title, font=f) > w - 8 and px > 8:
            px -= 1
            f = font(px)
        l, t, r, b = d.textbbox((0, 0), title, font=f)
        d.text(((w - (r - l)) // 2 - l, art_h + (band - (b - t)) // 2 - t), title, font=f, fill=0)
    name = re.sub(r"[^a-z0-9]+", "-", stem.lower()).strip("-") + ".bmp"
    card.save(os.path.join(out_dir, name))
    return name


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("art")
    ap.add_argument("out")
    ap.add_argument("--size", default="200x200", help="panel pixels, width x height")
    ap.add_argument("--colours", choices=("bw", "bwr"), default="bw")
    ap.add_argument("--fit", choices=("crop", "pad"), default="crop")
    ap.add_argument("--no-title", action="store_true")
    a = ap.parse_args()
    w, h = (int(v) for v in a.size.lower().split("x"))
    os.makedirs(a.out, exist_ok=True)
    files = sorted(f for f in os.listdir(a.art) if f.lower().endswith(IMAGES))
    total = 0
    for f in files:
        name = make(os.path.join(a.art, f), a.out, w, h, a.colours, a.fit, not a.no_title)
        total += os.path.getsize(os.path.join(a.out, name))
        print(name)
    print(f"{len(files)} cards, {total / 1024:.0f} KB: copy {a.out} to CIRCUITPY/cards")


if __name__ == "__main__":
    main()
