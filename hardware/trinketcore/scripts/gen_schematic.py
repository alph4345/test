"""Generate trinketcore.kicad_sch from netlist.py.

Every pin gets a short wire stub ending in a net label or power symbol, so the
drawing is generated rather than hand-wired: parts are flowed into titled
blocks, check_netlist.py proves the result connects exactly the pins listed in
netlist.py, and the overlap check below keeps symbols, labels and text apart.
"""

import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from gen_symbols import symbols_by_name, write as write_symbols  # noqa: E402
from netlist import PARTS, POWER_FLAGS, POWER_NETS, parts_by_ref  # noqa: E402
from schlib import GRID, TEXT_W, Schematic, pin_dir, snap, symbol_bbox, symbol_pins, xform  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "trinketcore.kicad_sch")

STUB = 2.54
GAP = 3.81            # between parts in a row
ROW_GAP = 3.81        # between rows

# (title, refs, note). Blocks are stacked in COLUMNS on an A2 sheet.
BLOCKS = {
    "usb": ("USB-C input", ["J1", "R1", "R2", "U1", "R32", "R33"],
            "5.1k on CC1/CC2 asks any USB-C charger for 5 V.\n"
            "D+/D- reach the RP2040 through 27R, so one port\ncharges and programs."),
    "charger": ("Charger + charge LEDs - TI BQ25173",
                ["U2", "C1", "R3", "R4", "R5", "C2", "R6", "D1", "R30", "D5", "Q9", "D4", "D6"],
                "300 mA constant current, then constant voltage.\n"
                "VREG = 0.8 V x (1 + R4/R5): LIC 3.71 V (R4 120k) / EDLC 2.62 V (R4 75k).\n"
                "CHG (red) lights while STAT is low; FULL (green) when STAT lets go.\n"
                "D4/D6 let the RP2040 read charging (CHG) and USB power (USB_DET)."),
    "caps": ("Capacitors + master switch", ["BT1", "BT2", "Q1", "R7", "Q2", "R8", "R9", "Q3"],
             "BT1/BT2 in parallel, lying flat on the back.\n"
             "Q1 connects them to everything else. USB (Q2) turns it on,\n"
             "the supervisor (Q3) keeps it on; below the cut-off it opens\nand stays open until USB returns."),
    "uvlo": ("Cut-off + ship mode - TPS3808",
             ["U3", "C5", "C6", "R10", "R11", "R12", "R13", "C3", "R14", "Q4", "R15"],
             "Cut-off = 0.405 V x (1 + 1.8M / R13)\n"
             "LIC 2.61 V (R13 330k) / EDLC 1.96 V (470k).\n"
             "SHIP high pulls /MR low: Q1 opens (storage mode)."),
    "switch": ("Power switch + wake logic",
               ["Q5", "R16", "C7", "R17", "Q6", "Q8", "R18", "C8", "R20", "Q7", "R21", "R24",
                "SW1", "R25", "D3", "D2", "R22", "JP1", "JP2", "R23"],
               "Q5 feeds VSYS while EN_SYS is high: button (SW1), RTC alarm, WAKE,\n"
               "USB (JP1, default on), HOLD from firmware, or JP2 (always on).\n"
               "C8 holds EN_SYS ~4-6 s after a press so firmware can raise HOLD.\n"
               "Q8 (supervisor) sits under Q6: below the cut-off nothing turns it on."),
    "buck": ("3.3 V buck-boost - TI TPS63031", ["U4", "L1", "C9", "C10", "C11", "C12", "C13",
                                                "R26", "R27", "C14"],
             "1.8-5.5 V in, 3.3 V out, ~500 mA from a 2.6 V capacitor.\n"
             "VSENSE = VSYS / 2 for the RP2040's ADC (GP27)."),
    "rtc": ("Real-time clock - NXP PCF8563", ["U5", "Y1", "C15", "R28", "R29"],
            "Runs from VAON. Its alarm pulls WAKE_N low to start\nthe gadget. I2C address 0x51."),
    "mcu": ("RP2040 + 16 MB flash", ["U6", "U7", "C31", "Y2", "R31", "C16", "C17", "R34", "SW3",
                                     "R35", "SW4", "TP1", "TP2", "C18", "C19", "C20", "C21", "C22",
                                     "C23", "C24", "C25", "C26", "C27", "C28", "C29", "C30"],
            "12 MHz crystal, W25Q128 flash (program, sounds, pictures).\n"
            "BOOT + RESET: USB bootloader. SWD on TP1/TP2.\n"
            "GPIO use: see the README pinout."),
    "audio": ("Speaker amplifier - MAX98357A", ["U8", "R36", "C32", "C33", "J7"],
              "I2S from GP18-20. AMP_EN (GP21) high = on, mono (L+R)/2 mix;\n"
              "low = shut down. 9 dB gain; use an 8 ohm speaker."),
    "io": ("Display, buttons and connectors", ["J4", "R38", "J5", "J8", "J6", "SW2", "R37", "D7"],
           "J4: SPI TFT/OLED modules (GND VCC SCL SDA RES DC CS BLK).\n"
           "J5: I2C OLED modules (GND VCC SCL SDA). J8: Qwiic.\n"
           "J6: expansion (GP7-0, GP29, GP28, WAKE, VSYS, 3V3, GND)."),
}

COLUMNS = [
    (12.7, 190.5, ["usb", "charger", "caps", "uvlo"]),
    (200.66, 388.62, ["switch", "buck", "rtc", "audio"]),
    (398.78, 584.2, ["mcu", "io"]),
]
TOP = 20.32
BLOCK_GAP = 7.62


def net_label_width(net):
    return TEXT_W * len(net) + 0.6


def stub_lengths(sym, rot, pins_to_nets):
    """Stub length per pin. Power symbols on neighbouring up/down pins (2.54 mm
    apart) would collide, so every other one sits 5.08 mm further out."""
    pins = symbol_pins(sym)
    out = {}
    for num, (px, py, ang, name, etype, hidden) in pins.items():
        d = pin_dir(ang, rot)
        dx, dy = xform(px, py, rot)
        long_ = (abs(d[1]) > 0.5 and pins_to_nets.get(num) in POWER_NETS
                 and round(dx / 2.54) % 2 == 1)
        out[num] = STUB + (5.08 if long_ else 0.0)
    return out


def field_boxes(sym, rot, ref, value):
    """Where Schematic.place() will put Reference and Value (symbol origin at 0, 0)."""
    from schlib import find, find_all, text_box
    b = symbol_bbox(sym, rot, (0, 0))
    pins = symbol_pins(sym)
    if len(pins) <= 2:
        vertical = abs(b[3] - b[1]) > abs(b[2] - b[0])
        w = max(len(ref), len(value)) * TEXT_W
        if vertical:
            cx = b[2] + 0.8 + w / 2
            return [text_box(ref, (cx, -1.27)), text_box(value, (cx, 1.27))]
        return [text_box(ref, (0, b[1] - 1.0)), text_box(value, (0, b[3] + 2.3))]
    boxes = []
    for key, txt in (("Reference", ref), ("Value", value)):
        prop = next(p for p in find_all(sym, "property") if p[1] == key)
        px, py = float(find(prop, "at")[1]), float(find(prop, "at")[2])
        eff = find(next(p for p in find_all(sym, "property") if p[1] == "Reference"), "effects")
        j = find(eff, "justify")
        just = " ".join(str(t) for t in j[1:]) if j else None
        boxes.append(text_box(txt, (px, -py), 1.27, 0, just))
    return boxes


def part_extent(sym, rot, pins_to_nets, ref, value):
    """Bounding box (relative to the symbol origin) of body, stubs, labels and fields."""
    b = symbol_bbox(sym, rot, (0, 0))
    x0, y0, x1, y1 = b
    seen = set()
    pins = symbol_pins(sym)
    stubs = stub_lengths(sym, rot, pins_to_nets)
    for num in sorted(pins, key=lambda n: pins[n][5]):
        px, py, ang, name, etype, hidden = pins[num]
        dx, dy = xform(px, py, rot)
        if (round(dx, 3), round(dy, 3)) in seen:
            continue
        seen.add((round(dx, 3), round(dy, 3)))
        d = pin_dir(ang, rot)
        ex, ey = dx + d[0] * stubs[num], dy + d[1] * stubs[num]
        net = pins_to_nets.get(num, "NC")
        if net == "NC":
            reach = 1.0
        elif net in POWER_NETS:
            reach = 2.54 + 1.4 + (TEXT_W * len(net) if abs(d[0]) > 0.5 else 0)
        else:
            reach = net_label_width(net)
        tx, ty = ex + d[0] * reach, ey + d[1] * reach
        half = 1.6
        xs = [dx, ex, tx] + ([ex - half, ex + half] if abs(d[1]) > 0.5 else [])
        ys = [dy, ey, ty] + ([ey - half, ey + half] if abs(d[0]) > 0.5 else [])
        x0, x1 = min(x0, *xs), max(x1, *xs)
        y0, y1 = min(y0, *ys), max(y1, *ys)
    for fb in field_boxes(sym, rot, ref, value):
        x0, y0, x1, y1 = min(x0, fb[0]), min(y0, fb[1]), max(x1, fb[2]), max(y1, fb[3])
    return x0 - 0.5, y0 - 0.5, x1 + 0.5, y1 + 0.5


def layout_block(parts, syms, x_left, x_right, y_top):
    """Flow parts left to right, wrapping into rows. Returns placements and bottom y."""
    placed = []
    cx, row_top, row_h = x_left, y_top, 0.0
    for p in parts:
        sym = syms[p.symbol.split(":")[1]]
        rot = 0
        ext = part_extent(sym, rot, p.pins, p.ref, p.value)
        w, h = ext[2] - ext[0], ext[3] - ext[1]
        if cx + w > x_right and cx > x_left:
            cx = x_left
            row_top += row_h + ROW_GAP
            row_h = 0.0
        ox = snap(cx - ext[0] + GRID)
        oy = snap(row_top - ext[1] + GRID)
        placed.append((p, sym, (ox, oy), rot))
        cx = ox + ext[2] + GAP
        row_h = max(row_h, (oy + ext[3]) - row_top)
    return placed, row_top + row_h


def build():
    write_symbols()
    syms = symbols_by_name()
    parts = parts_by_ref()
    sch = Schematic("TrinketCore - supercapacitor trinket board", paper="A2")
    assigned = [r for (_, refs, _) in BLOCKS.values() for r in refs]
    missing = [p.ref for p in PARTS if p.ref not in assigned]
    assert not missing, f"parts without a block: {missing}"

    pinpos = {}
    for x0, x1, keys in COLUMNS:
        y = TOP
        for key in keys:
            title, refs, note = BLOCKS[key]
            content_top = y + 7.62
            placed, bottom = layout_block([parts[r] for r in refs], syms, x0 + 2.54, x1 - 2.54, content_top)
            n_lines = note.count("\n") + 1
            note_y = snap(bottom + 3.81)
            y_end = snap(note_y + 2.03 * n_lines + 2.54)
            sch.rect((x0, y), (x1, y_end))
            for edge in ((x0, y, x1, y), (x0, y_end, x1, y_end), (x0, y, x0, y_end), (x1, y, x1, y_end)):
                sch.box("frame:" + title, "frame", edge)
            sch.text(title, (x0 + 1.27, y + 3.81), size=2.0, bold=True, owner="title:" + title)
            sch.text(note, (x0 + 1.27, note_y), size=1.27, owner="note:" + title, justify="left top")
            for p, sym, at, rot in placed:
                fields = {k: v for k, v in (("MPN", p.mpn), ("Manufacturer", p.mfr),
                                            ("Description", p.desc)) if v}
                pins = sch.place(sym, p.ref, p.value, at, rot, p.footprint, fields, in_bom=p.assembled)
                for num, info in pins.items():
                    pinpos[(p.ref, num)] = info
            y = y_end + BLOCK_GAP

    # Every pin gets a stub with a label or power symbol.
    for p in PARTS:
        sym = syms[p.symbol.split(":")[1]]
        stubs = stub_lengths(sym, 0, p.pins)
        seen = {}
        for num in sorted(p.pins, key=lambda n: pinpos[(p.ref, n)][4]):
            px, py, d, name, hidden = pinpos[(p.ref, num)]
            net = p.pins[num]
            key = (px, py)
            if key in seen:
                assert seen[key] == net, f"{p.ref}.{num} stacked on a different net"
                continue
            seen[key] = net
            connect(sch, syms, (px, py), d, net, p.ref, stubs[num])

    # Power flags so ERC knows these rails are driven.
    fx, fy = 401.32, 386.08
    for net in POWER_FLAGS:
        sch.pwr_flag(syms["PWR_FLAG"], (fx, fy))
        sch.wire((fx, fy), (fx, fy + 5.08), "flag")
        power_sym(sch, syms, net, (fx, fy + 5.08), (0, 1))
        fx += 10.16
    sch.text("Power flags (ERC only)", (398.78, 378.46), size=1.27, owner="flags")
    sch.text("TrinketCore v1.0 - LIC build: R4 120k, R13 330k (charge 3.71 V, cut-off 2.61 V);\n"
             "EDLC build: R4 75k, R13 470k (2.62 V / 1.96 V). Never fit a 2.7 V EDLC to a LIC build.",
             (12.7, 398.78), size=1.5, owner="notes", justify="left bottom")

    sch.write(OUT, {"date": "2026-09-26", "rev": "1.0", "company": "TrinketCore",
                    "comment1": "Supercapacitor trinket board: USB-C charging, RP2040, display, speaker",
                    "comment2": "Generated by scripts/gen_schematic.py from scripts/netlist.py"})
    return OUT, sch


def power_sym(sch, syms, net, at, d):
    """Power symbol whose body extends along direction d from `at`."""
    d = (round(d[0]), round(d[1]))
    if net == "GND":
        rot = {(0, 1): 0, (1, 0): 90, (0, -1): 180, (-1, 0): 270}[d]
    else:
        rot = {(0, -1): 0, (-1, 0): 90, (0, 1): 180, (1, 0): 270}[d]
    sch.power(syms[net], net, at, rot)


def connect(sch, syms, at, d, net, owner, stub=STUB):
    px, py = at
    if net == "NC":
        sch.no_connect(at)
        return
    end = (round(px + d[0] * stub, 4), round(py + d[1] * stub, 4))
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
            if (ki == "wire" and kj == "body" and str(oi) == str(oj)) or \
               (kj == "wire" and ki == "body" and str(oj) == str(oi)):
                continue
            if bi[0] + tol < bj[2] and bj[0] + tol < bi[2] and bi[1] + tol < bj[3] and bj[1] + tol < bi[3]:
                found.append((oi, ki, oj, kj, tuple(round(v, 1) for v in bi), tuple(round(v, 1) for v in bj)))
    return found


if __name__ == "__main__":
    path, sch = build()
    print("wrote", path)
    probs = overlaps(sch)
    for p in probs[:40]:
        print("  overlap: %s %s  <->  %s %s   %s %s" % p)
    print(f"{len(probs)} overlaps")
