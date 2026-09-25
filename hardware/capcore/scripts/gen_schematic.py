"""Generate capcore.kicad_sch from netlist.py.

Parts inside a block are joined with real wires (WIRES below); nets that
cross blocks use labels or power symbols. check_netlist.py then proves the
drawing connects exactly the pins listed in netlist.py, and the overlap
check below keeps symbols, labels and text from colliding.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gen_symbols import symbols_by_name, write as write_symbols  # noqa: E402
from netlist import PARTS, POWER_FLAGS  # noqa: E402
from schlib import TEXT_W, Schematic, symbol_bbox  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "capcore.kicad_sch")

POWER_NETS = {"GND", "VBUS", "VCAP", "VAON", "VSYS", "3V3"}
STUB = 2.54

# ref -> (x, y, rotation[, field side]). Field side "left"/"right" puts
# Reference/Value beside the body; otherwise placement is automatic.
LAYOUT = {
    # --- USB-C input
    "J1": (33.02, 58.42, 0), "R2": (58.42, 54.61, 0), "R1": (68.58, 52.07, 0),
    "U1": (91.44, 58.42, 0),
    # --- charger
    "U2": (157.48, 55.88, 0), "C1": (134.62, 54.61, 0), "R3": (152.4, 71.12, 0, "left"),
    "R4": (182.88, 49.53, 0), "R5": (182.88, 57.15, 0), "C2": (195.58, 49.53, 0),
    "R6": (132.08, 86.36, 90), "D1": (146.05, 86.36, 180), "D4": (165.1, 86.36, 0),
    # --- capacitor + master switch
    "BT1": (223.52, 58.42, 0), "Q1": (254.0, 48.26, 180, "left"), "R7": (266.7, 44.45, 0),
    "Q2": (264.16, 63.5, 0), "R8": (241.3, 63.5, 90), "R9": (251.46, 67.31, 0, "left"),
    "Q3": (284.48, 63.5, 0),
    # --- supervisor
    "R10": (325.12, 41.91, 0), "R11": (325.12, 49.53, 0), "R12": (325.12, 57.15, 0),
    "R13": (325.12, 64.77, 0), "C3": (340.36, 64.77, 0), "U3": (370.84, 63.5, 0),
    "R14": (388.62, 59.69, 0), "C5": (347.98, 38.1, 0), "C6": (358.14, 38.1, 0),
    "Q4": (345.44, 81.28, 0), "R15": (335.28, 85.09, 0, "left"),
    # --- power switch + wake
    "Q5": (40.64, 121.92, 180, "left"), "R16": (53.34, 118.11, 0), "C7": (63.5, 118.11, 0),
    "R17": (73.66, 125.73, 0), "Q6": (71.12, 134.62, 0), "R18": (66.04, 161.29, 0),
    "C8": (76.2, 161.29, 0), "Q8": (71.12, 144.78, 0), "R20": (101.6, 153.67, 0),
    "Q7": (116.84, 127.0, 180, "left"), "R21": (114.3, 153.67, 0), "R24": (129.54, 123.19, 0),
    "SW1": (144.78, 137.16, 0), "D3": (157.48, 130.81, 270), "R25": (170.18, 130.81, 180),
    "D2": (182.88, 132.08, 90), "R22": (182.88, 139.7, 0), "JP1": (182.88, 147.32, 270),
    "JP2": (195.58, 139.7, 270), "R23": (195.58, 147.32, 0),
    # --- buck-boost + sense
    "U4": (297.18, 139.7, 0, "right"), "L1": (297.18, 119.38, 90), "C9": (259.08, 138.43, 0),
    "C10": (269.24, 138.43, 0), "C11": (325.12, 138.43, 0), "C12": (335.28, 138.43, 0),
    "C13": (345.44, 138.43, 0), "R26": (375.92, 130.81, 0), "R27": (375.92, 138.43, 0),
    "C14": (386.08, 138.43, 0),
    # --- RTC
    "U5": (68.58, 218.44, 0), "Y1": (48.26, 218.44, 270, "left"), "C15": (22.86, 218.44, 0),
    "R28": (101.6, 205.74, 0), "R29": (111.76, 205.74, 0),
    # --- headers
    "J2": (152.4, 220.98, 0), "J3": (198.12, 220.98, 0),
}

# Explicit wiring: each entry lists pins ("REF.PIN") and/or (x, y) points that
# are joined in order by straight wires. "label"/"power" add a net label or
# a power symbol at the given point.
WIRES = [
    # USB-C
    {"path": ["J1.A5", "R1.1"], "label": ("CC1", (53.34, 48.26), 0)},
    {"path": ["J1.B5", "R2.1"], "label": ("CC2", (53.34, 50.8), 0)},
    {"path": ["J1.A7", (50.8, 55.88), (50.8, 58.42), "J1.B7"], "label": ("DM", (50.8, 55.88), 0)},
    {"path": ["J1.A6", (50.8, 60.96), (50.8, 63.5), "J1.B6"], "label": ("DP", (50.8, 60.96), 0)},
    # charger
    {"path": ["U2.1", "C1.1", (134.62, 48.26)], "power": ("VBUS", (134.62, 48.26))},
    {"path": ["U2.7", "R4.2"], "label": ("FB", (178.82, 53.34), 0)},
    {"path": ["U2.6", (177.8, 58.42), (177.8, 60.96), "R5.2"], "label": ("PG_N", (171.45, 58.42), 0)},
    {"path": ["R6.2", "D1.2"], "label": ("LED_A", (135.89, 86.36), 0)},
    {"path": ["D1.1", "D4.1"], "label": ("STAT", (152.4, 86.36), 0)},
    # master switch
    {"path": ["Q1.1", "R7.2"], "label": ("QA_G", (260.35, 48.26), 0)},
    {"path": ["Q2.3", (266.7, 55.88), "R7.2"]},
    {"path": ["Q3.3", (287.02, 55.88), (266.7, 55.88)], "junction": (266.7, 55.88)},
    {"path": ["R8.2", "R9.1"], "label": ("VBUS_G", (245.11, 63.5), 0)},
    {"path": ["R9.1", "Q2.1"]},
    {"path": ["Q3.1", (276.86, 63.5), (276.86, 71.12)], "label": ("UVLO_OK", (276.86, 71.12), 270)},
    # supervisor
    {"path": ["R13.1", "C3.1"]},
    {"path": ["C3.1", "U3.5"], "label": ("SENSE", (345.44, 60.96), 0)},
    {"path": ["U3.3", (347.98, 63.5), "Q4.3"], "label": ("MR_N", (350.52, 63.5), 0)},
    {"path": ["U3.1", "R14.2"]},
    {"path": ["R14.2", (393.7, 63.5)], "label": ("UVLO_OK", (393.7, 63.5), 0)},
    {"path": ["Q4.1", "R15.1"]},
    {"path": ["R15.1", (330.2, 81.28)], "label": ("SHIP", (330.2, 81.28), 180)},
    # power switch + wake
    {"path": ["Q5.1", "R16.2"], "label": ("Q5_G", (46.99, 121.92), 0)},
    {"path": ["R16.2", "C7.2"]},
    {"path": ["C7.2", "R17.1"]},
    {"path": ["Q6.1", (58.42, 134.62), (58.42, 157.48), "R18.1"]},
    {"path": ["R18.1", "C8.1"], "label": ("EN_SYS", (80.01, 157.48), 0)},
    {"path": ["C8.1", "R20.2"]},
    {"path": ["Q8.1", (60.96, 144.78)], "label": ("UVLO_OK", (60.96, 144.78), 90)},
    {"path": ["R20.2", "R21.2"]},
    {"path": ["R21.2", (182.88, 157.48)]},
    {"path": [(182.88, 157.48), (195.58, 157.48)]},
    {"path": ["JP1.2", (182.88, 157.48)]},
    {"path": ["R23.2", (195.58, 157.48)]},
    {"path": ["Q7.3", "R21.1"], "label": ("WAKE_D", (114.3, 142.24), 90)},
    {"path": ["Q7.1", "R24.2"]},
    {"path": ["R24.2", (139.7, 127.0)]},
    {"path": [(139.7, 127.0), (149.86, 127.0)]},
    {"path": [(149.86, 127.0), "D3.1"]},
    {"path": ["D3.1", "R25.2"]},
    {"path": ["R25.2", (172.72, 127.0)], "label": ("WAKE_N", (172.72, 127.0), 0)},
    {"path": ["SW1.1", (139.7, 127.0)]},
    {"path": ["SW1.4", (149.86, 142.24)], "power": ("GND", (149.86, 142.24))},
    # buck-boost
    {"path": ["L1.1", "U4.4"], "label": ("LX1", (293.37, 127.0), 90)},
    {"path": ["L1.2", "U4.2"], "label": ("LX2", (300.99, 127.0), 90)},
    {"path": ["U4.5", (279.4, 134.62)]},
    {"path": ["U4.8", (279.4, 137.16)]},
    {"path": ["U4.6", (279.4, 142.24)]},
    {"path": [(279.4, 142.24), (279.4, 137.16)]},
    {"path": [(279.4, 137.16), (279.4, 134.62)]},
    {"path": [(279.4, 134.62), "C10.1"]},
    {"path": ["C10.1", "C9.1"]},
    {"path": [(279.4, 134.62), (279.4, 132.08)], "power": ("VSYS", (279.4, 132.08))},
    {"path": ["U4.7", (281.94, 144.78), (281.94, 147.32)], "power": ("GND", (281.94, 147.32))},
    {"path": ["U4.1", (314.96, 134.62)]},
    {"path": ["U4.10", (314.96, 137.16), (314.96, 134.62)]},
    {"path": [(314.96, 134.62), "C11.1"]},
    {"path": ["C11.1", "C12.1"]},
    {"path": ["C12.1", "C13.1"]},
    {"path": ["C13.1", (355.6, 134.62), (355.6, 132.08)], "power": ("3V3", (355.6, 132.08))},
    {"path": ["R26.2", "C14.1"]},
    {"path": ["C14.1", (391.16, 134.62)], "label": ("VSENSE", (391.16, 134.62), 0)},
    # RTC
    {"path": ["U5.1", (48.26, 213.36), "Y1.1"], "label": ("OSCI", (50.8, 213.36), 0)},
    {"path": ["U5.2", (48.26, 223.52), "Y1.2"], "label": ("OSCO", (50.8, 223.52), 0)},
]

# Pins joined by touching another pin end directly; they need no stub.
ABUT = {("R10", "2"), ("R11", "1"), ("R11", "2"), ("R12", "1"), ("R12", "2"), ("R13", "1"),
        ("R4", "2"), ("R5", "1"), ("R3", "1"), ("U2", "2"), ("R17", "2"), ("Q6", "3"),
        ("Q6", "2"), ("Q8", "3"),
        ("R26", "2"), ("R27", "1"), ("D2", "1"), ("R22", "1"), ("R22", "2"), ("JP1", "1"),
        ("JP2", "2"), ("R23", "1")}

# Net labels placed directly on abutment points (two pins touching).
ABUT_LABELS = [("ISET", (152.4, 67.31), 180), ("UV_A", (325.12, 45.72), 180),
               ("UV_B", (325.12, 53.34), 180), ("Q6_D", (73.66, 129.54), 180),
               ("Q6_S", (73.66, 139.7), 180),
               ("USBON_K", (182.88, 135.89), 180), ("USBON_J", (182.88, 143.51), 180),
               ("AON_J", (195.58, 143.51), 180)]

BLOCKS = [
    # (top-left, bottom-right, title, note, note position or None = bottom-left)
    ((12.7, 20.32), (106.68, 96.52), "USB-C input",
     "5.1k on CC1/CC2 asks any USB-C charger\nfor 5 V. D+/D- go to the header.", None),
    ((110.49, 20.32), (208.28, 96.52), "Charger - TI BQ25173",
     "300 mA constant current, then constant voltage.\n"
     "VREG = 0.8 V x (1 + R4/R5): LIC 3.71 V (R4 120k) / EDLC 2.62 V (R4 75k).\n"
     "R5 returns to /PG: no divider drain while USB is unplugged.", (111.76, 26.67)),
    ((212.09, 20.32), (298.45, 96.52), "Capacitor + master switch",
     "Q1 connects the capacitor to everything else.\n"
     "USB (Q2) turns it on; the supervisor (Q3) keeps\n"
     "it on. Below the cut-off Q1 opens and stays open\n"
     "until USB returns.", None),
    ((302.26, 20.32), (406.4, 96.52), "Cut-off + ship mode - TPS3808",
     "Cut-off = 0.405 V x (1 + 1.8M / R13)\n"
     "LIC 2.61 V (R13 330k) / EDLC 1.96 V (470k).\n"
     "SHIP high pulls /MR low: Q1 opens and the\n"
     "capacitor sees only leakage.", (359.41, 80.01)),
    ((12.7, 100.33), (208.28, 186.69), "Power switch + wake logic",
     "Q5 feeds VSYS while EN_SYS is high. EN_SYS is raised by the button, the RTC\n"
     "alarm, USB (JP1, default on), HOLD from firmware, or JP2 (always on). C8 holds\n"
     "it ~2 s after a press so firmware can raise HOLD; HOLD low = off in 0.2 s.\n"
     "Q8 (gated by the supervisor) sits under Q6: below the cut-off nothing turns it on.", None),
    ((212.09, 100.33), (406.4, 186.69), "3.3 V buck-boost - TI TPS63031",
     "1.8-5.5 V in, 3.3 V out, ~500 mA from a 2.6 V capacitor.\n"
     "VSENSE = VSYS / 2 for your ADC; draws current only while on.", None),
    ((12.7, 190.5), (120.65, 250.19), "Real-time clock - NXP PCF8563",
     "Runs from VAON. Its alarm pulls WAKE_N low to start\n"
     "the gadget. I2C address 0x51.", None),
    ((124.46, 190.5), (233.68, 250.19), "Headers (0.1 in, 0.7 in apart)",
     "Pin 1 of each header is at the USB-C end.", None),
]

NOTES = [
    "CapCore v1.0 - supercapacitor power module",
    "",
    "Build variants differ only in R4 and R13:",
    "  LIC  (3.8 V hybrid supercap): R4 120k, R13 330k",
    "       charge 3.71 V, cut-off 2.61 V",
    "  EDLC (2.7 V supercap): R4 75k, R13 470k",
    "       charge 2.62 V, cut-off 1.96 V",
    "Never fit a 2.7 V EDLC to a board built",
    "with the LIC values.",
    "",
    "Standby (gadget off) ~5 uA; cut-off and",
    "ship mode draw only leakage.",
    "Firmware: raise HOLD at boot, drop it to",
    "power off.",
]


def build():
    write_symbols()
    syms = symbols_by_name()
    sch = Schematic("CapCore - supercapacitor power module")

    for (a, b, title, note, note_at) in BLOCKS:
        sch.rect(a, b)
        for edge in ((a[0], a[1], b[0], a[1]), (a[0], b[1], b[0], b[1]),
                     (a[0], a[1], a[0], b[1]), (b[0], a[1], b[0], b[1])):
            sch.box("frame:" + title, "frame", edge)
        sch.text(title, (a[0] + 1.27, a[1] + 3.81), size=2.0, bold=True, owner="title:" + title)
        if note_at is None:
            note_at = (a[0] + 1.27, b[1] - 1.27 - 2.03 * (note.count("\n") + 1))
        sch.text(note, note_at, size=1.27, owner="note:" + title, justify="left top")

    # Place every part and remember its pin coordinates.
    pinpos = {}
    for p in PARTS:
        spec = LAYOUT[p.ref]
        x, y, rot = spec[:3]
        side = spec[3] if len(spec) > 3 else None
        sym = syms[p.symbol.split(":")[1]]
        fields = {k: v for k, v in (("LCSC", p.lcsc), ("MPN", p.mpn), ("Description", p.desc)) if v}
        ref_at = val_at = just = None
        if side:
            ref_at, val_at, just = side_fields(sym, (x, y), rot, side, p.ref, p.value)
        pins = sch.place(sym, p.ref, p.value, (x, y), rot, p.footprint, fields, in_bom=p.in_bom,
                         ref_at=ref_at, val_at=val_at, justify=just)
        for num, info in pins.items():
            pinpos[(p.ref, num)] = info

    def pt(item):
        if isinstance(item, tuple):
            return item
        ref, num = item.split(".")
        return pinpos[(ref, num)][:2]

    handled = set(ABUT)
    for w in WIRES:
        pts = [pt(i) for i in w["path"]]
        owner = "wire:" + str(w["path"][0])
        for a, b in zip(pts, pts[1:]):
            assert abs(a[0] - b[0]) < 1e-6 or abs(a[1] - b[1]) < 1e-6, f"diagonal wire {a}->{b}"
            sch.wire(a, b, owner)
        for i in w["path"]:
            if isinstance(i, str):
                handled.add(tuple(i.split(".")))
        if "label" in w:
            net, at, ang = w["label"]
            sch.label(net, at, ang, owner)
        if "power" in w:
            net, at = w["power"]
            power_sym(sch, syms, net, at, (0, 1) if net == "GND" else (0, -1))
        if "junction" in w:
            sch.junction(w["junction"])
    for net, at, ang in ABUT_LABELS:
        sch.label(net, at, ang, "abut:" + net, kind="abutlabel")

    # Every other pin gets a stub with a label or power symbol.
    for p in PARTS:
        seen = {}
        # Visible pins first so a hidden stacked pin never gets its own stub.
        for num in sorted(p.pins, key=lambda n: pinpos[(p.ref, n)][4]):
            px, py, d, name, hidden = pinpos[(p.ref, num)]
            net = p.pins[num]
            key = (px, py)
            if key in seen:
                assert seen[key] == net, f"{p.ref}.{num} stacked on a different net"
                continue
            seen[key] = net
            if (p.ref, num) in handled:
                continue
            connect(sch, syms, (px, py), d, net, p.ref)

    # Power flags so ERC knows these rails are driven.
    fx = 243.84
    for net in POWER_FLAGS:
        sch.pwr_flag(syms["PWR_FLAG"], (fx, 200.66))
        sch.wire((fx, 200.66), (fx, 205.74), "flag")
        power_sym(sch, syms, net, (fx, 205.74), (0, 1) if net == "GND" else (0, 1))
        fx += 10.16
    sch.text("Power flags (ERC only)", (241.3, 193.04), size=1.27, owner="flags")

    y = 223.52
    sch.text("\n".join(NOTES), (241.3, y), size=1.27, owner="notes", justify="left top")

    sch.write(OUT, {"date": "2026-09-25", "rev": "1.0", "company": "CapCore",
                    "comment1": "Supercapacitor power module: USB-C charging, cut-off, 3.3 V",
                    "comment2": "Generated by scripts/gen_schematic.py from scripts/netlist.py"})
    return OUT, sch


def side_fields(sym, at, rot, side, ref, value):
    """Reference/Value centred beside the body (centred text is immune to the
    justification flip KiCad applies to rotated symbols)."""
    b = symbol_bbox(sym, rot, at)
    cy = (b[1] + b[3]) / 2
    w = max(len(ref), len(value)) * TEXT_W
    cx = b[0] - 0.8 - w / 2 if side == "left" else b[2] + 0.8 + w / 2
    return (round(cx, 2), round(cy - 1.27, 2)), (round(cx, 2), round(cy + 1.27, 2)), None


def power_sym(sch, syms, net, at, d):
    """Power symbol whose body extends along direction d from `at`."""
    d = (round(d[0]), round(d[1]))
    if net == "GND":
        rot = {(0, 1): 0, (1, 0): 90, (0, -1): 180, (-1, 0): 270}[d]
    else:
        rot = {(0, -1): 0, (-1, 0): 90, (0, 1): 180, (1, 0): 270}[d]
    sch.power(syms[net], net, at, rot)


def connect(sch, syms, at, d, net, owner):
    px, py = at
    if net == "NC":
        sch.no_connect(at)
        return
    end = (round(px + d[0] * STUB, 4), round(py + d[1] * STUB, 4))
    sch.wire(at, end, owner)
    if net in POWER_NETS:
        power_sym(sch, syms, net, end, d)
    else:
        angle = {(-1, 0): 180, (1, 0): 0, (0, -1): 90, (0, 1): 270}[(round(d[0]), round(d[1]))]
        sch.label(net, end, angle, owner)


def overlaps(sch, tol=0.15):
    """Pairs of drawn items (from different owners) whose boxes intersect."""
    found = []
    boxes = sch.boxes
    for i in range(len(boxes)):
        oi, ki, bi = boxes[i]
        for j in range(i + 1, len(boxes)):
            oj, kj, bj = boxes[j]
            if oi == oj or (ki == "wire" and kj == "wire") or (ki == "frame" and kj == "frame"):
                continue
            # Labels sitting on two touching pins are meant to hug those parts.
            if {ki, kj} == {"abutlabel", "body"}:
                continue
            # A wire drawn from a part's own pin always touches that part's body.
            if (ki == "wire" and kj == "body" and str(oi).startswith(f"wire:{oj}.")) or \
               (kj == "wire" and ki == "body" and str(oj).startswith(f"wire:{oi}.")):
                continue
            if bi[0] + tol < bj[2] and bj[0] + tol < bi[2] and bi[1] + tol < bj[3] and bj[1] + tol < bi[3]:
                found.append((oi, ki, oj, kj, tuple(round(v, 1) for v in bi), tuple(round(v, 1) for v in bj)))
    return found


if __name__ == "__main__":
    path, sch = build()
    print("wrote", path)
    probs = overlaps(sch)
    for p in probs:
        print("  overlap: %s %s  <->  %s %s   %s %s" % p)
    print(f"{len(probs)} overlaps")
