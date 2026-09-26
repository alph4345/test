"""Manufacturing outputs for PCBWay (and any other assembly house):

    python3 export_fab.py

Writes to ../fab/:
  trinketcore-gerbers.zip          Gerbers + Excellon drill, origin at the bottom-left corner
  pcbway-bom-lic.csv / -edlc.csv   assembly BOM in PCBWay's column layout, one per build variant
  pcbway-centroid.csv              pick-and-place positions (mm, same origin as the Gerbers)
  parts-list.csv                   every part, including the ones you fit yourself
  trinketcore-assembly-top.pdf     top assembly drawing (designators, pin-1 marks)
  trinketcore-assembly-back.pdf    back: where the capacitors lie
and ../trinketcore-schematic.pdf.

The variants differ only in R4 (charge voltage) and R13 (cut-off voltage).
"""

import csv
import glob
import os
import shutil
import subprocess
import sys
import zipfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
for _k, _v in (("KICAD7_FOOTPRINT_DIR", "/usr/share/kicad/footprints"),
               ("KICAD7_SYMBOL_DIR", "/usr/share/kicad/symbols")):
    os.environ.setdefault(_k, _v)

import pcbnew  # noqa: E402

import gen_pcb  # noqa: E402
from netlist import PARTS, variant  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.abspath(os.path.join(HERE, ".."))
PCB = os.path.join(PROJ, "trinketcore.kicad_pcb")
SCH = os.path.join(PROJ, "trinketcore.kicad_sch")
FAB = os.path.join(PROJ, "fab")
GERBER_LAYERS = ("F.Cu,In1.Cu,In2.Cu,B.Cu,F.Paste,F.Silkscreen,B.Silkscreen,F.Mask,B.Mask,"
                 "Edge.Cuts")

# Plain-language package names for the PCBWay BOM.
PACKAGES = {
    "R_0402_1005Metric": "0402", "C_0402_1005Metric": "0402", "C_0603_1608Metric": "0603",
    "C_0805_2012Metric": "0805", "LED_0603_1608Metric": "0603", "SOT-23": "SOT-23",
    "SOT-23-6": "SOT-23-6", "D_SOD-323": "SOD-323",
    "USB_C_Receptacle_HRO_TYPE-C-31-M-12": "USB-C 16-pin SMD (HRO TYPE-C-31-M-12)",
    "WSON-8-1EP_2x2mm_P0.5mm_EP0.9x1.6mm_Vias0.3": "WSON-8 2x2 mm (DSG)",
    "WSON-10-1EP_2.5x2.5mm_P0.5mm_EP1.2x2mm_Vias0.3": "WSON-10 2.5x2.5 mm (DSK)",
    "L_3015_Universal": "3.0x3.0x1.5 mm",
    "SOIC-8_3.9x4.9mm_P1.27mm": "SOIC-8 (150 mil)", "SOIC-8_5.23x5.23mm_P1.27mm": "SOIC-8 (208 mil)",
    "Crystal_SMD_3215-2Pin_3.2x1.5mm": "3215 (FC-135)", "Crystal_SMD_3225-4Pin_3.2x2.5mm": "3225 4-pad",
    "QFN-56-1EP_7x7mm_P0.4mm_EP3.2x3.2mm_Vias0.3": "QFN-56 7x7 mm",
    "TQFN-16-1EP_3x3mm_P0.5mm_EP1.23x1.23mm_Vias0.3": "TQFN-16 3x3 mm",
    "SW_TS-1187A_5.1x5.1mm": "5.1x5.1 mm SMD tact switch", "SW_SPST_B3U-1000P": "3.0x2.5 mm SMD tact switch",
    "JST_SH_SM04B-SRSS-TB_1x04-1MP_P1.00mm_Horizontal": "JST SH 4-pin side entry",
}


def cli(*args):
    subprocess.run(["kicad-cli", *args], check=True, capture_output=True)


def natural(ref):
    head = ref.rstrip("0123456789")
    return head, int(ref[len(head):] or 0)


def gerbers():
    out = os.path.join(FAB, "gerbers")
    shutil.rmtree(out, ignore_errors=True)
    os.makedirs(out)
    cli("pcb", "export", "gerbers", "--layers", GERBER_LAYERS, "--subtract-soldermask",
        "--use-drill-file-origin", "-o", out + "/", PCB)
    cli("pcb", "export", "drill", "--excellon-separate-th", "--excellon-units", "mm",
        "--drill-origin", "plot", "--generate-map", "--map-format", "pdf", "-o", out + "/", PCB)
    files = sorted(glob.glob(os.path.join(out, "*")))
    z = os.path.join(FAB, "trinketcore-gerbers.zip")
    with zipfile.ZipFile(z, "w", zipfile.ZIP_DEFLATED) as zf:
        for f in files:
            if not f.endswith(".pdf"):
                zf.write(f, os.path.basename(f))
    return z, [os.path.basename(f) for f in files]


def assembled():
    return [p for p in PARTS if p.assembled]


# Full specs for the value column, so any brand can be substituted safely.
CAP_SPECS = {"CL05C150JB5NNNC": "50V C0G", "CL05B103KB5NNNC": "50V X7R", "CL05B104KO5NNNC": "16V X7R",
             "CL05A105KA5NQNC": "25V X5R", "CL10A475KO8NNNC": "16V X5R", "CL10A106KP8NNNC": "10V X5R",
             "CL21A475KAQNNNE": "25V X5R", "CL21A106KAYNNNE": "25V X5R"}
KIND = {"AO3400A": "N-channel MOSFET 30 V", "AO3401A": "P-channel MOSFET -30 V",
        "1N4148WS": "switching diode 75 V"}


def value_text(p, value, mpn):
    kind = p.symbol.split(":")[1]
    if kind == "R":
        num, prefix = (value[:-1], value[-1]) if value[-1] in "kM" else (value, "")
        return f"{num} {prefix}ohm 1% resistor"
    if kind == "C":
        return f"{value} {CAP_SPECS[mpn]} ceramic capacitor"
    return f"{value} {KIND[value]}" if value in KIND else value


def bom(name):
    groups = {}
    for p in assembled():
        value, mpn, lcsc, desc = variant(p, name)
        fp = p.footprint.split(":")[1]
        key = (p.mfr, mpn, value, fp)
        g = groups.setdefault(key, {"refs": [], "desc": desc, "lcsc": lcsc, "part": p})
        g["refs"].append(p.ref)
    path = os.path.join(FAB, f"pcbway-bom-{name}.csv")
    rows = sorted(groups.items(), key=lambda kv: natural(min(kv[1]["refs"], key=natural)))
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Item #", "Designator", "Qty", "Manufacturer", "Mfg Part #", "Description / Value",
                    "Package/Footprint", "Type", "Your Instructions / Notes"])
        for i, ((mfr, mpn, value, fp), g) in enumerate(rows, 1):
            refs = sorted(g["refs"], key=natural)
            passive = g["part"].symbol.split(":")[1] in ("R", "C")
            notes = [g["desc"]] if len(refs) == 1 and g["desc"] else []
            if g["lcsc"]:
                notes.append(f"LCSC {g['lcsc']}")
            if passive:
                notes.append("any brand with the same value, size and rating")
            w.writerow([i, ",".join(refs), len(refs), mfr, mpn, value_text(g["part"], value, mpn),
                        PACKAGES.get(fp, fp), "SMD", " | ".join(notes)])
        i = len(rows)
        for refs, what in ((["BT1", "BT2"], "capacitors (customer fits)"),
                           (["J4", "J5", "J6", "J7"], "sockets/headers/speaker connector (customer fits)"),
                           (["JP1", "JP2", "TP1", "TP2"], "solder jumpers and test pads: copper only, no part")):
            i += 1
            w.writerow([i, ",".join(refs), 0, "", "", "DNP", "", "", "Do not populate: " + what])
    return path


def centroid():
    """Designator, Mid X, Mid Y, Layer, Rotation: mm from the bottom-left corner (the
    Gerbers use the same origin), Y up, rotation counter-clockwise as seen from the top."""
    board = pcbnew.LoadBoard(PCB)
    refs = {p.ref: p for p in assembled()}
    rows = []
    for fp in board.GetFootprints():
        r = fp.GetReference()
        if r not in refs:
            continue
        pos = fp.GetPosition()
        rows.append([r, f"{pcbnew.ToMM(pos.x):.3f}", f"{gen_pcb.H - pcbnew.ToMM(pos.y):.3f}",
                     "Top" if fp.GetLayer() == pcbnew.F_Cu else "Bottom",
                     f"{fp.GetOrientationDegrees() % 360:.0f}", refs[r].value,
                     PACKAGES.get(refs[r].footprint.split(":")[1], refs[r].footprint.split(":")[1])])
    path = os.path.join(FAB, "pcbway-centroid.csv")
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Designator", "Mid X", "Mid Y", "Layer", "Rotation", "Value", "Package"])
        for row in sorted(rows, key=lambda r: natural(r[0])):
            w.writerow(row)
    return path


def full_parts_list():
    path = os.path.join(FAB, "parts-list.csv")
    with open(path, "w", newline="") as f:
        w = csv.writer(f)
        w.writerow(["Ref", "Value (LIC build)", "Value (EDLC build)", "Manufacturer", "MPN",
                    "Footprint", "LCSC", "Assembled", "Notes"])
        for p in sorted(PARTS, key=lambda p: natural(p.ref)):
            lic, edlc = variant(p, "lic"), variant(p, "edlc")
            w.writerow([p.ref, lic[0], edlc[0], p.mfr, lic[1], p.footprint.split(":")[1], lic[2],
                        "yes" if p.assembled else "no (you fit it)", lic[3]])
    return path


def drawings():
    cli("sch", "export", "pdf", "-o", os.path.join(PROJ, "trinketcore-schematic.pdf"), SCH)
    cli("pcb", "export", "pdf", "--layers", "F.Fab,F.Silkscreen,Edge.Cuts", "--black-and-white",
        "-o", os.path.join(FAB, "trinketcore-assembly-top.pdf"), PCB)
    cli("pcb", "export", "pdf", "--layers", "B.Fab,B.Silkscreen,Edge.Cuts", "--black-and-white",
        "--mirror", "-o", os.path.join(FAB, "trinketcore-assembly-back.pdf"), PCB)


def main():
    os.makedirs(FAB, exist_ok=True)
    z, files = gerbers()
    print("gerbers:", z)
    for f in files:
        print("   ", f)
    for name in ("lic", "edlc"):
        print("bom:", bom(name))
    print("centroid:", centroid())
    print("parts:", full_parts_list())
    drawings()
    print("pdf: trinketcore-schematic.pdf, fab/trinketcore-assembly-top.pdf, -back.pdf")


if __name__ == "__main__":
    main()
