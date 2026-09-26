"""Generate trinketcore.kicad_pcb: 4 layers, 40 x 60 mm, parts on top only.

Stage 1 (this file): outline, PCBWay design rules, footprint placement, net
assignment from netlist.py and silkscreen. Routing is added by route_pcb.py.

Board map (top view):
  top edge      display sockets J4 (SPI) and J5 (I2C)        Qwiic J8 top right
  left edge     capacitor lead pads BT1/BT2; the cans lie flat on the back
  right edge    expansion header J6
  middle        RP2040, flash, crystal; power switch, supervisor, RTC, 3.3 V
  bottom edge   power button SW1, USB-C J1 with the charge LEDs, button SW2
"""

import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pcbnew  # noqa: E402

from netlist import PARTS  # noqa: E402
from schlib import uid  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = os.path.abspath(os.path.join(HERE, ".."))
OUT = os.path.join(PROJ, "trinketcore.kicad_pcb")
KICAD_FP = "/usr/share/kicad/footprints"

W, H = 40.0, 60.0          # board size, mm
CORNER = 1.5

MM = pcbnew.FromMM


def P(x, y):
    return pcbnew.VECTOR2I(MM(x), MM(y))


# ref -> (x, y, rotation in degrees, CCW as seen from the top)
PLACE = {
    # ---- connectors and capacitor pads around the edge
    "J4": (11.11, 2.0, 90), "J5": (16.19, 5.8, 90), "J8": (36.0, 7.6, 90),
    "J6": (38.0, 16.0, 0), "BT1": (5.0, 11.0, 270), "BT2": (5.0, 28.0, 270),
    "J7": (3.5, 39.5, 270), "R38": (28.9, 5.4, 90),
    # ---- RP2040, flash, crystal and decoupling
    "U6": (19.5, 17.5, 270), "U7": (31.0, 16.0, 180), "C31": (27.0, 19.8, 90), "R34": (32.9, 22.4, 90),
    "Y2": (11.6, 15.6, 90), "R31": (14.3, 13.9, 0), "C16": (12.4, 20.1, 90), "C17": (9.0, 14.6, 90),
    "C18": (22.1, 12.3, 90), "C19": (18.5, 12.3, 90),
    "C20": (14.3, 17.7, 180), "C28": (14.3, 18.9, 180),
    "C21": (18.5, 22.8, 270), "C22": (22.1, 22.8, 270),
    "C23": (24.9, 19.9, 0), "C24": (24.9, 20.9, 0), "C29": (24.9, 21.9, 0),
    "C27": (23.4, 23.4, 90), "C26": (24.4, 23.4, 90), "C25": (25.4, 23.4, 90),
    "C30": (13.0, 23.2, 90),
    "SW3": (30.0, 20.6, 0), "SW4": (30.0, 24.2, 0), "R35": (26.4, 24.4, 90),
    # ---- master switch (VCAP comes from the capacitor pads on the left)
    "Q1": (9.3, 26.6, 0), "R7": (12.2, 26.6, 90), "C5": (13.3, 26.6, 90),
    "Q2": (9.3, 30.1, 0), "R8": (12.2, 30.1, 90), "R9": (13.3, 30.1, 90),
    "Q3": (9.3, 33.6, 0), "R14": (12.2, 33.6, 90), "C6": (13.3, 33.6, 90),
    # ---- supervisor
    "U3": (16.9, 26.8, 0), "R10": (15.0, 30.2, 90), "R11": (16.0, 30.2, 90), "R12": (17.0, 30.2, 90),
    "R13": (18.0, 30.2, 90), "C3": (19.0, 30.2, 90), "Q4": (16.4, 33.6, 0), "R15": (19.3, 33.6, 90),
    # ---- load switch and enable
    "Q5": (22.2, 26.8, 0), "R16": (25.1, 26.3, 90), "C7": (26.2, 26.3, 90), "R17": (25.1, 29.4, 90),
    "Q6": (22.4, 30.8, 0), "Q8": (22.4, 34.3, 0), "R18": (25.1, 32.3, 90), "C8": (26.4, 32.3, 90),
    "R20": (25.1, 35.0, 90),
    # ---- wake logic
    "Q7": (21.6, 38.2, 0), "R21": (21.6, 41.0, 0), "R24": (19.0, 38.2, 90), "R25": (17.9, 38.2, 90),
    "D3": (16.4, 38.5, 90), "D2": (24.9, 47.0, 90), "R22": (26.4, 47.0, 90), "JP1": (28.4, 47.0, 90),
    "JP2": (31.0, 47.0, 90), "R23": (28.4, 50.5, 0),
    # ---- audio, lower left
    "U8": (10.3, 40.4, 180), "C32": (12.5, 37.3, 0), "C33": (9.3, 37.4, 0), "R36": (13.5, 40.2, 90),
    # ---- RTC and 3.3 V buck-boost, right
    "U5": (31.3, 29.3, 0), "Y1": (29.6, 33.5, 0), "C15": (33.2, 33.5, 90),
    "R28": (34.4, 33.5, 90), "R29": (35.4, 33.5, 90),
    "U4": (30.5, 40.4, 0), "L1": (26.4, 40.4, 90), "C11": (29.3, 37.2, 90), "C12": (31.4, 37.2, 90),
    "C13": (33.9, 39.6, 270), "C10": (33.9, 41.6, 270), "C9": (30.5, 43.2, 0),
    "R26": (34.9, 44.0, 90), "R27": (34.9, 46.1, 90), "C14": (33.8, 46.1, 90),
    # ---- charger (same layout as CapCore's), USB and charge LEDs, bottom
    "C1": (10.65, 43.75, 0), "U2": (10.5, 46.0, 0), "C2": (13.35, 46.0, 270), "R3": (7.9, 48.0, 0),
    "R4": (13.1, 49.6, 90), "R5": (12.3, 48.15, 180),
    "D4": (15.2, 44.3, 90), "D6": (17.2, 44.3, 90),
    "J1": (20.0, 56.95, 0), "U1": (19.75, 48.8, 0), "R32": (18.9, 45.9, 90), "R33": (20.6, 45.9, 90),
    "R1": (16.8, 50.2, 90), "R2": (22.8, 50.2, 90),
    "Q9": (12.3, 53.2, 0), "R6": (15.4, 49.4, 90), "R30": (8.6, 51.0, 0),
    "D1": (12.25, 56.7, 180), "D5": (12.25, 58.3, 180),
    "D7": (27.75, 58.3, 180), "R37": (27.75, 56.7, 0),
    "SW1": (5.4, 56.0, 0), "SW2": (34.6, 56.0, 0),
}

FIDUCIALS = [(1.6, 2.0), (38.4, 2.2), (1.6, 50.5)]


def lib_path(fp_id):
    lib, name = fp_id.split(":")
    if lib == "TrinketCore":
        return os.path.join(PROJ, "TrinketCore.pretty"), name
    return os.path.join(KICAD_FP, lib + ".pretty"), name


def outline(board):
    """Rounded rectangle on Edge.Cuts."""
    def seg(a, b):
        s = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_SEGMENT)
        s.SetStart(P(*a))
        s.SetEnd(P(*b))
        s.SetLayer(pcbnew.Edge_Cuts)
        s.SetWidth(MM(0.1))
        board.Add(s)

    def arc(c, start, end):
        s = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_ARC)
        s.SetLayer(pcbnew.Edge_Cuts)
        s.SetWidth(MM(0.1))
        mid_ang = math.atan2((start[1] + end[1]) / 2 - c[1], (start[0] + end[0]) / 2 - c[0])
        mid = (c[0] + CORNER * math.cos(mid_ang), c[1] + CORNER * math.sin(mid_ang))
        s.SetArcGeometry(P(*start), P(*mid), P(*end))
        board.Add(s)

    r = CORNER
    seg((r, 0), (W - r, 0))
    seg((W, r), (W, H - r))
    seg((W - r, H), (r, H))
    seg((0, H - r), (0, r))
    arc((W - r, r), (W - r, 0), (W, r))
    arc((W - r, H - r), (W, H - r), (W - r, H))
    arc((r, H - r), (r, H), (0, H - r))
    arc((r, r), (0, r), (r, 0))


def design_rules(board):
    """PCBWay standard 4-layer capabilities with margin: 0.15 mm (6 mil) tracks,
    0.3 mm drills with a 0.15 mm annular ring, 0.35 mm from plated holes to copper."""
    board.SetCopperLayerCount(4)
    ds = board.GetDesignSettings()
    ds.m_TrackMinWidth = MM(0.15)
    ds.m_MinClearance = MM(0.15)
    ds.m_ViasMinSize = MM(0.6)
    ds.m_MinThroughDrill = MM(0.3)
    ds.m_ViasMinAnnularWidth = MM(0.15)
    ds.m_HoleToHoleMin = MM(0.3)
    ds.m_HoleClearance = MM(0.35)
    ds.m_CopperEdgeClearance = MM(0.3)
    ds.m_MinSilkTextHeight = MM(0.8)
    ds.m_MinSilkTextThickness = MM(0.15)
    ds.SetAuxOrigin(P(0, H))          # Gerber / drill / pick-and-place origin: bottom-left corner
    nc = ds.m_NetSettings.m_DefaultNetClass
    nc.SetTrackWidth(MM(0.15))
    nc.SetClearance(MM(0.2))
    nc.SetViaDiameter(MM(0.6))
    nc.SetViaDrill(MM(0.3))


def text(board, s, x, y, size=0.9, layer=pcbnew.B_SilkS, justify="center", thick=0.15, angle=0):
    t = pcbnew.PCB_TEXT(board)
    t.SetText(s)
    t.SetLayer(layer)
    t.SetTextSize(pcbnew.VECTOR2I(MM(size), MM(size)))
    t.SetTextThickness(MM(thick))
    t.SetMirrored(layer == pcbnew.B_SilkS)
    t.SetHorizJustify({"left": pcbnew.GR_TEXT_H_ALIGN_LEFT, "right": pcbnew.GR_TEXT_H_ALIGN_RIGHT,
                       "center": pcbnew.GR_TEXT_H_ALIGN_CENTER}[justify])
    if angle:
        t.SetTextAngleDegrees(angle)
    t.SetPosition(P(x, y))
    board.Add(t)
    return t


def rect(board, x0, y0, x1, y1, layer=pcbnew.B_SilkS, width=0.15):
    s = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_RECT)
    s.SetStart(P(x0, y0))
    s.SetEnd(P(x1, y1))
    s.SetLayer(layer)
    s.SetWidth(MM(width))
    board.Add(s)


J4_LABELS = ["GND", "VCC", "SCL", "SDA", "RES", "DC", "CS", "BLK"]
J5_LABELS = ["GND", "VCC", "SCL", "SDA"]
J6_LABELS = ["GP7", "GP6", "GP5", "GP4", "GP3", "GP2", "GP1", "GP0", "GP29", "GP28", "WAKE",
             "VSYS", "3V3", "GND"]


def line(board, a, b, layer=pcbnew.B_SilkS, width=0.15):
    s = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_SEGMENT)
    s.SetStart(P(*a))
    s.SetEnd(P(*b))
    s.SetLayer(layer)
    s.SetWidth(MM(width))
    board.Add(s)


def labels(board):
    """Silkscreen legends. Back-side text is mirrored so it reads from below; for
    mirrored text 'right' justification extends towards +x (top-view coordinates)."""
    F = pcbnew.F_SilkS
    # --- front: what you touch and plug in
    text(board, "DISP", 5.6, 2.0, 0.8, F, thick=0.15)
    text(board, "I2C", 14.9, 5.8, 0.8, F, "right")
    text(board, "QWIIC", 32.1, 7.6, 0.8, F, angle=90)
    text(board, "EXP", 38.0, 13.6, 0.8, F)
    text(board, "SPK", 3.5, 36.4, 0.8, F)
    text(board, "PWR/A", 5.4, 52.4, 0.8, F)
    text(board, "B", 34.6, 52.4, 0.8, F)
    text(board, "BOOT", 32.6, 20.6, 0.8, F, "left")
    text(board, "RST", 32.6, 24.2, 0.8, F, "left")
    # --- back: pin names, capacitor bay, build variant, jumpers
    for k, name in enumerate(J4_LABELS):
        text(board, name, 11.11 + 2.54 * k, 3.95, 0.8)
    for k, name in enumerate(J5_LABELS):
        text(board, name, 16.19 + 2.54 * k, 7.65, 0.8)
    for k, name in enumerate(J6_LABELS):
        text(board, name, 36.6, 16.0 + 2.54 * k, 0.8, justify="left")
    # Where the two capacitors lie (16 x 25 mm cans; smaller ones fit inside).
    for n, (y0, y1, lead_plus, lead_minus) in enumerate(((8.5, 21.2, 11.0, 16.0), (22.6, 38.4, 28.0, 33.0)), 1):
        rect(board, 7.6, y0, 33.0, y1)
        text(board, f"CAP {n}", 20.3, (y0 + y1) / 2 - 1.2, 1.2, thick=0.2)
        text(board, "LIC 3.8 V (or EDLC on an EDLC build)", 21.0, (y0 + y1) / 2 + 0.7, 0.8)
        text(board, "+", 8.4, lead_plus, 1.0)
        text(board, "-", 8.4, lead_minus, 1.0)
    text(board, "TrinketCore", 20.0, 42.0, 1.6, thick=0.25)
    text(board, "supercap trinket board v1.0", 20.0, 44.0, 0.8)
    # Tick the chemistry this board was built for.
    rect(board, 8.2, 45.6, 9.2, 46.6)
    text(board, "LIC 3.8V", 9.7, 46.1, 0.8, justify="right")
    rect(board, 8.2, 47.2, 9.2, 48.2)
    text(board, "EDLC 2.7V", 9.7, 47.7, 0.8, justify="right")
    text(board, "JP1 cut: USB won't switch on", 20.0, 50.0, 0.8)
    text(board, "JP2 bridge: always on", 20.0, 51.2, 0.8)
    text(board, "LEDs: red = charging, green = full", 20.0, 39.8, 0.8)
    text(board, "WayWayWay", 20.0, 48.0, 0.8)


def add_fiducials(board):
    path = os.path.join(KICAD_FP, "Fiducial.pretty")
    for k, (x, y) in enumerate(FIDUCIALS, 1):
        fp = pcbnew.FootprintLoad(path, "Fiducial_1mm_Mask2mm")
        fp.SetFPID(pcbnew.LIB_ID("Fiducial", "Fiducial_1mm_Mask2mm"))
        fp.SetReference(f"FID{k}")
        fp.SetValue("Fiducial")
        fp.Reference().SetVisible(False)
        board.Add(fp)
        fp.SetPosition(P(x, y))


def build(place=PLACE):
    board = pcbnew.BOARD()
    design_rules(board)
    outline(board)

    nets = {}
    for p in PARTS:
        for net in p.pins.values():
            if net != "NC" and net not in nets:
                ni = pcbnew.NETINFO_ITEM(board, net)
                board.Add(ni)
                nets[net] = ni

    for p in PARTS:
        spec = place.get(p.ref)
        if spec is None:
            raise KeyError(f"no placement for {p.ref}")
        x, y, rot = spec
        path, name = lib_path(p.footprint)
        fp = pcbnew.FootprintLoad(path, name)
        if fp is None:
            raise FileNotFoundError(p.footprint)
        lib, fname = p.footprint.split(":")
        fp.SetFPID(pcbnew.LIB_ID(lib, fname))
        fp.SetReference(p.ref)
        fp.SetValue(p.value)
        fp.SetPath(pcbnew.KIID_PATH("/" + uid("sym/" + p.ref)))
        board.Add(fp)
        fp.SetPosition(P(x, y))
        fp.SetOrientationDegrees(rot)
        if p.mpn:
            fp.SetProperty("MPN", p.mpn)
        for pad in fp.Pads():
            num = pad.GetNumber()
            if num == "":
                continue
            net = p.pins.get(num, "NC")
            if net != "NC":
                pad.SetNet(nets[net])
        # Silkscreen that would hang over the board edge (connector outlines) is dropped.
        for item in list(fp.GraphicalItems()):
            if item.GetLayer() in (pcbnew.F_SilkS, pcbnew.B_SilkS) and item.GetClass() not in ("PCB_TEXT", "FP_TEXT"):
                bb = item.GetBoundingBox()
                if (pcbnew.ToMM(bb.GetY()) < 0.3 or pcbnew.ToMM(bb.GetX()) < 0.3
                        or pcbnew.ToMM(bb.GetRight()) > W - 0.3 or pcbnew.ToMM(bb.GetBottom()) > H - 0.3):
                    fp.Remove(item)
        ref = fp.Reference()
        ref.SetTextSize(pcbnew.VECTOR2I(MM(0.6), MM(0.6)))
        ref.SetTextThickness(MM(0.1))
        ref.SetVisible(False)
    add_fiducials(board)
    labels(board)
    return board


def save(board, path=OUT):
    board.Save(path)
    return path


if __name__ == "__main__":
    b = build()
    print("wrote", save(b))
