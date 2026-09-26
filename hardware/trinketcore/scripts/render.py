"""Photo-style top and bottom renders of trinketcore.kicad_pcb for the docs.

KiCad 7 has no command-line 3D renderer, so this composites black-and-white
layer plots (copper, mask, silkscreen, outline) into a picture with a blue
mask and ENIG gold pads, and punches the drill holes in from the board data.

    python3 render.py [out_dir]     # default: ../../../docs/images
"""

import io
import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import cairosvg  # noqa: E402
import numpy as np  # noqa: E402
import pcbnew  # noqa: E402
from PIL import Image, ImageDraw  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PCB = os.path.join(HERE, "..", "trinketcore.kicad_pcb")
OUT = os.path.join(HERE, "..", "..", "..", "docs", "images")
WIDTH = 900

MASK = (24, 58, 128)         # blue solder mask
MASK_CU = (40, 84, 168)      # copper seen through the mask
FINISH = (214, 178, 92)      # ENIG gold
SILK = (245, 245, 240)
BG = (255, 255, 255)
HOLE = (40, 40, 40)


def plot(layer, mirror, tmp):
    svg = os.path.join(tmp, layer.replace(".", "_") + ".svg")
    cmd = ["kicad-cli", "pcb", "export", "svg", "--black-and-white", "--page-size-mode", "2",
           "--exclude-drawing-sheet", "--layers", layer + ",Edge.Cuts", "-o", svg, PCB]
    if mirror:
        cmd.insert(4, "--mirror")
    subprocess.run(cmd, check=True, capture_output=True)
    png = cairosvg.svg2png(url=svg, output_width=WIDTH, background_color="white")
    return np.array(Image.open(io.BytesIO(png)).convert("L")) < 128


def render(side, out):
    back = side == "back"
    pre = "B." if back else "F."
    with tempfile.TemporaryDirectory() as tmp:
        edge = plot("Edge.Cuts", back, tmp)
        cu = plot(pre + "Cu", back, tmp) & ~edge
        opening = plot(pre + "Mask", back, tmp) & ~edge
        silk = plot(pre + "Silkscreen", back, tmp) & ~edge
    h, w = edge.shape
    # Board area: flood-fill the outline from the centre.
    im = Image.fromarray(np.where(edge, 0, 255).astype(np.uint8)).copy()
    ImageDraw.floodfill(im, (w // 2, h // 2), 0)
    board = np.array(im) == 0

    img = np.zeros((h, w, 3), np.uint8)
    img[:] = BG
    img[board] = MASK
    img[board & cu] = MASK_CU
    img[board & opening] = FINISH
    img[board & silk & ~opening] = SILK

    # mm -> px from the outline's extent.
    ys, xs = np.nonzero(edge)
    x0, x1, y0, y1 = xs.min(), xs.max(), ys.min(), ys.max()
    brd = pcbnew.LoadBoard(PCB)
    bb = brd.GetBoardEdgesBoundingBox()
    bx0, by0 = pcbnew.ToMM(bb.GetX()), pcbnew.ToMM(bb.GetY())
    bw, bh = pcbnew.ToMM(bb.GetWidth()), pcbnew.ToMM(bb.GetHeight())
    sx, sy = (x1 - x0) / bw, (y1 - y0) / bh

    def px(x, y):
        u = (x - bx0) / bw
        if back:
            u = 1 - u
        return x0 + u * bw * sx, y0 + (y - by0) * sy

    pic = Image.fromarray(img)
    d = ImageDraw.Draw(pic)
    holes = []
    for fp in brd.GetFootprints():
        for p in fp.Pads():
            if p.GetDrillSizeX() > 0:
                holes.append((p.GetX(), p.GetY(), p.GetDrillSizeX(), p.GetDrillSizeY()))
    for t in brd.GetTracks():
        if t.GetClass() == "PCB_VIA":
            holes.append((t.GetX(), t.GetY(), t.GetDrillValue(), t.GetDrillValue()))
    for x, y, dx, dy in holes:
        cx, cy = px(pcbnew.ToMM(x), pcbnew.ToMM(y))
        rx, ry = pcbnew.ToMM(dx) / 2 * sx, pcbnew.ToMM(dy) / 2 * sy
        d.ellipse([cx - rx, cy - ry, cx + rx, cy + ry], fill=HOLE)
    pic = pic.crop((max(0, x0 - 12), max(0, y0 - 12), min(w, x1 + 13), min(h, y1 + 13)))
    pic.save(out)
    return out


def main():
    out = sys.argv[1] if len(sys.argv) > 1 else OUT
    os.makedirs(out, exist_ok=True)
    for side in ("front", "back"):
        print(render(side, os.path.join(out, f"trinketcore-{side}.png")))


if __name__ == "__main__":
    main()
