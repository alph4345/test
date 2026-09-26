"""Project footprints that differ from the stock KiCad 7 library.

The exposed pads of the RP2040, the amplifier and the two power ICs get
0.3 mm thermal vias on 0.6 mm pads. That meets PCBWay's 0.15 mm minimum
annular ring; the stock "ThermalVias" variants use 0.2 mm holes.
The capacitor pads, button and inductor footprints are copied from CapCore.
"""

import os
import shutil

from sexpr import Sym, dump, find, find_all, parse

HERE = os.path.dirname(os.path.abspath(__file__))
PRETTY = os.path.join(HERE, "..", "TrinketCore.pretty")
CAPCORE = os.path.join(HERE, "..", "..", "capcore", "CapCore.pretty")
STOCK = "/usr/share/kicad/footprints"

VIA_PAD, VIA_DRILL = 0.6, 0.3


def load(path):
    with open(path) as f:
        return parse(f.read())


def via(num, x, y):
    return [Sym("pad"), num, Sym("thru_hole"), Sym("circle"), [Sym("at"), x, y],
            [Sym("size"), VIA_PAD, VIA_PAD], [Sym("drill"), VIA_DRILL],
            [Sym("layers"), "*.Cu"], [Sym("zone_connect"), 2]]


def with_vias(src, name, ep, positions, descr_note):
    fp = load(src)
    fp[1] = name
    # Drop timestamps so the file is stable between runs.
    fp[:] = [c for c in fp if not (isinstance(c, list) and c and c[0] == "tstamp")]
    for c in fp:
        if isinstance(c, list):
            c[:] = [d for d in c if not (isinstance(d, list) and d and d[0] == "tstamp")]
    d = find(fp, "descr")
    d[1] = d[1] + " " + descr_note
    # Thermal vias connect the exposed pad to the ground plane.
    for p in find_all(fp, "pad"):
        if p[1] == ep and not find(p, "zone_connect"):
            p.append([Sym("zone_connect"), 2])
    idx = max(i for i, c in enumerate(fp) if isinstance(c, list) and c[0] == "pad") + 1
    for k, (x, y) in enumerate(positions):
        fp.insert(idx + k, via(ep, x, y))
    out = os.path.join(PRETTY, name + ".kicad_mod")
    with open(out, "w") as f:
        f.write(dump(fp) + "\n")
    return out


def resize_vias(src, name):
    """CapCore's WSON footprints with their via pads grown from 0.5 to 0.6 mm."""
    fp = load(src)
    for p in find_all(fp, "pad"):
        if str(p[2]) == "thru_hole":
            find(p, "size")[1:3] = [VIA_PAD, VIA_PAD]
            y = float(find(p, "at")[2])
            if name.startswith("WSON-8") and abs(y) > 0:
                find(p, "at")[2] = 0.5 if y > 0 else -0.5    # keep the pad inside the 1.6 mm EP
    out = os.path.join(PRETTY, name + ".kicad_mod")
    with open(out, "w") as f:
        f.write(dump(fp) + "\n")
    return out


def build():
    os.makedirs(PRETTY, exist_ok=True)
    note = "Thermal vias 0.3 mm drill / 0.6 mm pad (PCBWay-friendly)."
    made = [
        # RP2040: vias in the gaps between the four paste windows.
        with_vias(os.path.join(STOCK, "Package_DFN_QFN.pretty", "QFN-56-1EP_7x7mm_P0.4mm_EP3.2x3.2mm.kicad_mod"),
                  "QFN-56-1EP_7x7mm_P0.4mm_EP3.2x3.2mm_Vias0.3", "57",
                  [(0, 0), (-1.1, 0), (1.1, 0), (0, -1.1), (0, 1.1)], note),
        with_vias(os.path.join(STOCK, "Package_DFN_QFN.pretty", "TQFN-16-1EP_3x3mm_P0.5mm_EP1.23x1.23mm.kicad_mod"),
                  "TQFN-16-1EP_3x3mm_P0.5mm_EP1.23x1.23mm_Vias0.3", "17", [(0, 0)], note),
        resize_vias(os.path.join(CAPCORE, "WSON-8-1EP_2x2mm_P0.5mm_EP0.9x1.6mm_Vias0.3.kicad_mod"),
                    "WSON-8-1EP_2x2mm_P0.5mm_EP0.9x1.6mm_Vias0.3"),
        resize_vias(os.path.join(CAPCORE, "WSON-10-1EP_2.5x2.5mm_P0.5mm_EP1.2x2mm_Vias0.3.kicad_mod"),
                    "WSON-10-1EP_2.5x2.5mm_P0.5mm_EP1.2x2mm_Vias0.3"),
    ]
    for f in ("Supercap_Pads", "SW_TS-1187A_5.1x5.1mm", "L_3015_Universal"):
        dst = os.path.join(PRETTY, f + ".kicad_mod")
        shutil.copy(os.path.join(CAPCORE, f + ".kicad_mod"), dst)
        made.append(dst)
    return made


if __name__ == "__main__":
    for m in build():
        print("wrote", os.path.relpath(m, os.path.join(HERE, "..")))
