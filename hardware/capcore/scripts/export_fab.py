"""Manufacturing outputs: Gerbers + drill (zipped for upload), JLCPCB BOM and CPL
for both build variants, a full parts list, schematic PDF and an assembly drawing.

    python3 export_fab.py

Everything lands in ../fab/. The two variants only differ in R4 (charge voltage)
and R13 (cut-off voltage); see netlist.py.
"""

import csv
import glob
import os
import shutil
import subprocess
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pcbnew  # noqa: E402

from netlist import PARTS, variant  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.abspath(os.path.join(HERE, ".."))
PCB = os.path.join(PROJ, "capcore.kicad_pcb")
SCH = os.path.join(PROJ, "capcore.kicad_sch")
FAB = os.path.join(PROJ, "fab")
GERBER_LAYERS = "F.Cu,In1.Cu,In2.Cu,B.Cu,F.Paste,F.Silkscreen,B.Silkscreen,F.Mask,B.Mask,Edge.Cuts"


def cli(*args):
    subprocess.run(["kicad-cli", *args], check=True, capture_output=True)


def gerbers():
    out = os.path.join(FAB, "gerbers")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    cli("pcb", "export", "gerbers", "--layers", GERBER_LAYERS, "--subtract-soldermask",
        "-o", out + "/", PCB)
    cli("pcb", "export", "drill", "--excellon-separate-th", "--excellon-units", "mm",
        "-o", out + "/", PCB)
    files = sorted(glob.glob(os.path.join(out, "*")))
    z = os.path.join(FAB, "capcore-gerbers.zip")
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            zf.write(f, os.path.basename(f))
    return z, [os.path.basename(f) for f in files]


def assembled():
    return [p for p in PARTS if p.in_bom and p.lcsc]


def bom(name):
    groups = {}
    for p in assembled():
        value, lcsc, mpn, _ = variant(p, name)
        fp = p.footprint.split(":")[1]
        groups.setdefault((value, fp, lcsc), []).append(p.ref)
    path = os.path.join(FAB, f"jlcpcb-bom-{name}.csv")
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Comment", "Designator", "Footprint", "LCSC Part #"])
        for (value, fp, lcsc), refs in sorted(groups.items(), key=lambda kv: natural(min(kv[1], key=natural))):
            w.writerow([value, ",".join(sorted(refs, key=natural)), fp, lcsc])
    return path


def natural(ref):
    head = ref.rstrip("0123456789")
    return head, int(ref[len(head):] or 0)


def cpl():
    board = pcbnew.LoadBoard(PCB)
    refs = {p.ref for p in assembled()}
    rows = []
    for fp in board.GetFootprints():
        r = fp.GetReference()
        if r not in refs:
            continue
        pos = fp.GetPosition()
        rows.append([r, f"{pcbnew.ToMM(pos.x):.4f}", f"{-pcbnew.ToMM(pos.y):.4f}",
                     "Top" if fp.GetLayer() == pcbnew.F_Cu else "Bottom",
                     f"{fp.GetOrientationDegrees() % 360:.0f}"])
    path = os.path.join(FAB, "jlcpcb-cpl.csv")
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Designator", "Mid X", "Mid Y", "Layer", "Rotation"])
        for row in sorted(rows, key=lambda r: natural(r[0])):
            w.writerow(row)
    return path


def full_parts_list():
    path = os.path.join(FAB, "parts-list.csv")
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Ref", "Value (LIC build)", "Value (EDLC build)", "Footprint", "LCSC",
                    "MPN", "Assembled by JLCPCB", "Notes"])
        for p in sorted(PARTS, key=lambda p: natural(p.ref)):
            lic, edlc = variant(p, "lic"), variant(p, "edlc")
            w.writerow([p.ref, lic[0], edlc[0], p.footprint.split(":")[1], lic[1],
                        lic[2], "yes" if (p.in_bom and p.lcsc) else "no (you fit it)", lic[3]])
    return path


def drawings():
    cli("sch", "export", "pdf", "-o", os.path.join(PROJ, "capcore-schematic.pdf"), SCH)
    cli("pcb", "export", "pdf", "--layers", "F.Fab,F.Silkscreen,Edge.Cuts", "--black-and-white",
        "-o", os.path.join(FAB, "capcore-assembly-top.pdf"), PCB)


def main():
    os.makedirs(FAB, exist_ok=True)
    z, files = gerbers()
    print("gerbers:", z)
    for f in files:
        print("   ", f)
    for name in ("lic", "edlc"):
        print("bom:", bom(name))
    print("cpl:", cpl())
    print("parts:", full_parts_list())
    drawings()
    print("pdf: capcore-schematic.pdf, fab/capcore-assembly-top.pdf")


if __name__ == "__main__":
    main()
