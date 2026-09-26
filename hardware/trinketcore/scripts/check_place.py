"""Placement sanity check: courtyard overlaps, parts outside the board, and a
PNG render of the top side for eyeballing."""

import os
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pcbnew  # noqa: E402

import gen_pcb  # noqa: E402

SCRATCH = os.environ.get("TRINKET_SCRATCH", "/tmp")


def bbox_mm(fp):
    fp.BuildCourtyardCaches()
    cy = fp.GetCourtyard(pcbnew.F_CrtYd)
    bb = cy.BBox()
    return (pcbnew.ToMM(bb.GetX()), pcbnew.ToMM(bb.GetY()), pcbnew.ToMM(bb.GetRight()), pcbnew.ToMM(bb.GetBottom()))


def overlaps(board, margin=0.0):
    fps = list(board.GetFootprints())
    boxes = [(fp.GetReference(), bbox_mm(fp)) for fp in fps]
    out = []
    for i in range(len(boxes)):
        ri, a = boxes[i]
        for j in range(i + 1, len(boxes)):
            rj, b = boxes[j]
            if a[0] + margin < b[2] and b[0] + margin < a[2] and a[1] + margin < b[3] and b[1] + margin < a[3]:
                dx = min(a[2], b[2]) - max(a[0], b[0])
                dy = min(a[3], b[3]) - max(a[1], b[1])
                out.append((ri, rj, round(dx, 2), round(dy, 2)))
    outside = [(r, tuple(round(v, 2) for v in b)) for r, b in boxes
               if b[0] < -0.2 or b[1] < -1.2 or b[2] > gen_pcb.W + 0.2 or b[3] > gen_pcb.H + 0.2]
    return out, outside


def render(path, png, layers="F.Cu,F.Silkscreen,F.Fab,F.Courtyard,Edge.Cuts", width=1400):
    svg = png[:-4] + ".svg"
    subprocess.run(["kicad-cli", "pcb", "export", "svg", "--layers", layers, "--page-size-mode", "2",
                    "--exclude-drawing-sheet", "-o", svg, path], check=True, capture_output=True)
    import cairosvg
    cairosvg.svg2png(url=svg, write_to=png, output_width=width, background_color="white")
    return png


if __name__ == "__main__":
    board = gen_pcb.build()
    path = gen_pcb.save(board)
    ov, outside = overlaps(board)
    for o in ov:
        print("  overlap %s <-> %s  (%.2f x %.2f mm)" % o)
    for o in outside:
        print("  outside board:", o)
    print(f"{len(ov)} overlaps, {len(outside)} outside")
    if "--render" in sys.argv:
        print(render(path, os.path.join(SCRATCH, "place.png")))
