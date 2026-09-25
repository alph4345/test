"""Generate capcore.kicad_pcb: 4-layer, 21 x 48 mm, parts on top only.

Stage 1 (this file): board outline, stack-up rules, footprint placement and
net assignment from netlist.py. Routing is added by route_pcb.py.
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
OUT = os.path.join(PROJ, "capcore.kicad_pcb")
KICAD_FP = "/usr/share/kicad/footprints"

W, H = 21.0, 48.0          # board size, mm
CORNER = 1.0

MM = pcbnew.FromMM


def P(x, y):
    return pcbnew.VECTOR2I(MM(x), MM(y))


# ref -> (x, y, rotation in degrees, CCW as seen from the top)
PLACE = {
    # USB-C, CC resistors (beside the jack) and ESD (right under the data pins)
    "J1": (10.5, 3.05, 180), "R2": (4.3, 7.0, 90), "R1": (16.7, 7.0, 90),
    "U1": (10.25, 10.6, 0),
    # headers, 0.7 in apart like a Raspberry Pi Pico
    "J2": (1.61, 2.54, 0), "J3": (19.39, 2.54, 0),
    # supervisor, left of the middle column
    "R10": (5.0, 9.2, 0), "R11": (5.0, 10.2, 0), "R12": (5.0, 11.2, 0), "R14": (6.0, 12.2, 0),
    "U3": (6.0, 14.5, 0), "C5": (9.2, 12.8, 0), "C6": (9.2, 13.8, 0), "R13": (9.2, 14.8, 0),
    "C3": (9.2, 15.8, 0), "Q4": (5.6, 18.0, 0), "R15": (5.6, 20.4, 0),
    "Q3": (9.5, 20.4, 0),
    # charger, right of the middle column
    "C1": (14.15, 9.35, 0), "U2": (14.0, 11.6, 0), "C2": (16.85, 11.6, 270), "R3": (11.4, 13.6, 0),
    "R4": (16.6, 15.2, 90), "R5": (15.8, 13.75, 180), "D1": (12.2, 15.5, 0), "R6": (14.8, 15.5, 180),
    "D4": (15.9, 17.2, 0), "Q2": (13.4, 20.2, 0), "R8": (16.5, 18.9, 0), "R9": (16.5, 20.1, 0),
    # wake + enable logic, lower left; power button lower right
    "Q7": (2.3, 24.6, 0), "R24": (5.6, 23.0, 0), "R25": (5.6, 24.1, 0), "D3": (6.1, 25.7, 0),
    "R21": (8.7, 23.0, 0), "R20": (8.7, 24.1, 0), "R18": (8.7, 25.2, 0), "C8": (9.3, 26.8, 0),
    "D2": (2.3, 28.2, 0), "R22": (5.0, 28.2, 0), "JP1": (8.0, 28.9, 0),
    "JP2": (4.2, 30.9, 0), "R23": (1.3, 30.9, 90),
    "SW1": (16.2, 25.8, 0), "Q6": (13.3, 30.6, 0),
    "Q8": (17.3, 30.6, 0),
    "R26": (19.9, 29.9, 270), "R27": (19.9, 31.8, 270), "C14": (19.9, 33.7, 270),
    # RTC, lower left
    "U5": (4.2, 37.9, 270), "Y1": (8.9, 33.6, 180), "R28": (8.2, 37.6, 0), "R29": (8.2, 38.6, 0),
    "C15": (8.2, 40.6, 0),
    # 3.3 V buck-boost, lower right
    "U4": (16.3, 37.2, 0), "L1": (12.2, 37.2, 90), "C11": (15.1, 34.0, 90), "C12": (17.2, 34.0, 90),
    "C13": (19.7, 36.4, 270), "C10": (19.7, 38.4, 270), "C9": (16.3, 40.0, 0),
    # capacitor, master switch and load switch along the bottom edge
    "BT1": (3.6, 43.4, 0), "Q1": (13.4, 43.2, 0), "Q5": (17.6, 43.2, 0),
    "R7": (12.6, 46.3, 0), "R16": (14.6, 46.3, 0), "C7": (16.6, 46.3, 0), "R17": (18.6, 46.3, 0),
}


def lib_path(fp_id):
    lib, name = fp_id.split(":")
    if lib == "CapCore":
        return os.path.join(PROJ, "CapCore.pretty"), name
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
    """JLCPCB 4-layer standard capabilities, with a little margin."""
    board.SetCopperLayerCount(4)
    ds = board.GetDesignSettings()
    ds.m_TrackMinWidth = MM(0.127)
    ds.m_MinClearance = MM(0.127)
    ds.m_ViasMinSize = MM(0.5)
    ds.m_MinThroughDrill = MM(0.3)
    ds.m_ViasMinAnnularWidth = MM(0.1)
    ds.m_HoleToHoleMin = MM(0.25)
    ds.m_HoleClearance = MM(0.2)
    ds.m_CopperEdgeClearance = MM(0.3)
    ds.m_MinSilkTextHeight = MM(0.8)
    ds.m_MinSilkTextThickness = MM(0.12)
    nc = ds.m_NetSettings.m_DefaultNetClass
    nc.SetTrackWidth(MM(0.2))
    nc.SetClearance(MM(0.15))
    nc.SetViaDiameter(MM(0.6))
    nc.SetViaDrill(MM(0.3))


J2_LABELS = ["5V", "GND", "3V3", "HOLD", "WAKE", "BTN", "SHIP", "GND"]
J3_LABELS = ["D+", "D-", "SDA", "SCL", "VSNS", "CHG", "3V3", "GND"]


def text(board, s, x, y, size=0.9, layer=pcbnew.B_SilkS, justify="center", thick=0.15):
    t = pcbnew.PCB_TEXT(board)
    t.SetText(s)
    t.SetLayer(layer)
    t.SetTextSize(pcbnew.VECTOR2I(MM(size), MM(size)))
    t.SetTextThickness(MM(thick))
    t.SetMirrored(layer == pcbnew.B_SilkS)
    t.SetHorizJustify({"left": pcbnew.GR_TEXT_H_ALIGN_LEFT, "right": pcbnew.GR_TEXT_H_ALIGN_RIGHT,
                       "center": pcbnew.GR_TEXT_H_ALIGN_CENTER}[justify])
    t.SetPosition(P(x, y))
    board.Add(t)
    return t


def box(board, x0, y0, x1, y1, layer=pcbnew.B_SilkS):
    s = pcbnew.PCB_SHAPE(board, pcbnew.SHAPE_T_RECT)
    s.SetStart(P(x0, y0))
    s.SetEnd(P(x1, y1))
    s.SetLayer(layer)
    s.SetWidth(MM(0.15))
    board.Add(s)


def labels(board):
    """Back-side legend: header pin names, title, build variant, jumper hints.
    Coordinates are top-view; KiCad mirrors B.SilkS text so it reads from below
    (mirrored text: 'right' justification extends towards +x)."""
    for k, (a, b) in enumerate(zip(J2_LABELS, J3_LABELS)):
        y = 2.54 + 2.54 * k
        text(board, a, 2.75, y, justify="right")
        text(board, b, W - 2.75, y, justify="left")
    text(board, "CapCore", W / 2, 24.6, size=1.6, thick=0.25)
    text(board, "supercap power module", W / 2, 26.6, size=0.8, thick=0.15)
    text(board, "v1.0", W / 2, 28.2, size=0.8, thick=0.15)
    # Tick the box for the capacitor chemistry this board was built for.
    box(board, 6.0, 29.95, 7.0, 30.95)
    text(board, "LIC 3.8V", 7.5, 30.45, size=0.8, thick=0.15, justify="right")
    box(board, 6.0, 31.35, 7.0, 32.35)
    text(board, "EDLC 2.7V", 7.5, 31.85, size=0.8, thick=0.15, justify="right")
    text(board, "JP1 cut: USB stays off", W / 2, 33.4, size=0.8, thick=0.15)
    text(board, "JP2 bridge: always on", W / 2, 34.6, size=0.8, thick=0.15)
    text(board, "JLCJLCJLCJLC", W / 2, 39.4, size=0.8, thick=0.15)
    text(board, "+", 1.75, 46.4, size=1.0)
    # Front: name the two solder jumpers so the back-side hints can be followed.
    text(board, "JP1", 9.75, 28.9, size=0.8, layer=pcbnew.F_SilkS, justify="left")
    text(board, "JP2", 4.2, 32.5, size=0.8, layer=pcbnew.F_SilkS)


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
        if p.lcsc:
            fp.SetProperty("LCSC", p.lcsc)
        for pad in fp.Pads():
            num = pad.GetNumber()
            if num == "":
                continue
            net = p.pins.get(num, "NC")
            if net != "NC":
                pad.SetNet(nets[net])
        # Silkscreen that would hang over the board edge (the USB-C body outline) is dropped.
        for item in list(fp.GraphicalItems()):
            if item.GetLayer() == pcbnew.F_SilkS and item.GetClass() != "PCB_TEXT" \
                    and item.GetClass() != "FP_TEXT":
                bb = item.GetBoundingBox()
                if (pcbnew.ToMM(bb.GetY()) < 0.3 or pcbnew.ToMM(bb.GetX()) < 0.3
                        or pcbnew.ToMM(bb.GetRight()) > W - 0.3 or pcbnew.ToMM(bb.GetBottom()) > H - 0.3):
                    fp.Remove(item)
        # Reference text small and out of the way; values live on the Fab layer.
        ref = fp.Reference()
        ref.SetTextSize(pcbnew.VECTOR2I(MM(0.6), MM(0.6)))
        ref.SetTextThickness(MM(0.1))
        ref.SetVisible(False)
    labels(board)
    return board


def save(board, path=OUT):
    board.Save(path)
    return path


if __name__ == "__main__":
    b = build()
    print("wrote", save(b))
