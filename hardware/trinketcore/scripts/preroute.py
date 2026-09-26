"""Hand-planned copper that the autorouter should not improvise:

* nothing but pads on the top layer under the USB-C receptacle body, and its
  ground pads tied straight to the shield legs,
* the charger's local connections around U2 (CapCore's layout, moved),
* the buck-boost power stage around U4/L1 (CapCore's layout, moved),
* a via for every GND pad (In1.Cu is a solid ground plane) and every 3V3 pad
  (the autorouter joins those, mostly on In2.Cu, which is then poured with 3V3).

Everything added here is locked, so Freerouting treats it as fixed.
Coordinates are mm; ("REF", "PAD") tuples resolve to pad centres.
"""

import math

import pcbnew
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree

import gen_pcb

MM = pcbnew.FromMM
TO = pcbnew.ToMM

VIA_D, VIA_DRILL = 0.6, 0.3      # PCBWay: 0.15 mm annular ring
CLEAR = 0.21                      # generated copper to other nets (hole edge to copper >= 0.35)
HOLE_GAP = 0.35                   # drill edge to drill edge, extra margin over PCBWay's 0.3
F, IN1, IN2, B = pcbnew.F_Cu, pcbnew.In1_Cu, pcbnew.In2_Cu, pcbnew.B_Cu
LAYERS = (F, IN1, IN2, B)
PLANES = {"GND": IN1, "3V3": IN2}

# CapCore's charger and buck-boost blocks were copied with these offsets (mm).
CHARGER_SHIFT = (-3.5, 34.4)
BUCKBOOST_SHIFT = (14.2, 3.2)


def pad_obj(board, ref, num):
    fp = board.FindFootprintByReference(ref)
    for p in fp.Pads():
        if p.GetNumber() == num and p.GetAttribute() == pcbnew.PAD_ATTRIB_SMD:
            return p
    for p in fp.Pads():
        if p.GetNumber() == num:
            return p
    raise KeyError(f"{ref}.{num}")


def xy(board, p):
    if isinstance(p, tuple) and isinstance(p[0], str):
        pad = pad_obj(board, *p)
        return TO(pad.GetX()), TO(pad.GetY())
    return p


def track(board, net, pts, width, layer=F):
    pts = [xy(board, p) for p in pts]
    n = board.FindNet(net)
    for a, b in zip(pts, pts[1:]):
        t = pcbnew.PCB_TRACK(board)
        t.SetStart(pcbnew.VECTOR2I(MM(a[0]), MM(a[1])))
        t.SetEnd(pcbnew.VECTOR2I(MM(b[0]), MM(b[1])))
        t.SetWidth(MM(width))
        t.SetLayer(layer)
        t.SetNet(n)
        t.SetLocked(True)
        board.Add(t)


def via(board, net, at, d=VIA_D, drill=VIA_DRILL):
    x, y = xy(board, at)
    v = pcbnew.PCB_VIA(board)
    v.SetPosition(pcbnew.VECTOR2I(MM(x), MM(y)))
    v.SetViaType(pcbnew.VIATYPE_THROUGH)
    v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
    v.SetWidth(MM(d))
    v.SetDrill(MM(drill))
    v.SetNet(board.FindNet(net))
    v.SetLocked(True)
    board.Add(v)
    return x, y


def keepout(board, pts, layers=(F,), tracks=True, vias=True):
    z = pcbnew.ZONE(board)
    z.SetIsRuleArea(True)
    ls = pcbnew.LSET()
    for layer in layers:
        ls.AddLayer(layer)
    z.SetLayerSet(ls)
    z.SetDoNotAllowTracks(tracks)
    z.SetDoNotAllowVias(vias)
    z.SetDoNotAllowCopperPour(False)
    z.SetDoNotAllowPads(False)
    z.SetDoNotAllowFootprints(False)
    ol = z.Outline()
    ol.NewOutline()
    for x, y in pts:
        ol.Append(MM(x), MM(y))
    board.Add(z)


def shifted(dx, dy):
    """Point helper for blocks copied from CapCore: plain tuples move, pad refs don't."""
    def s(p):
        if isinstance(p, tuple) and isinstance(p[0], str):
            return p
        return (round(p[0] + dx, 4), round(p[1] + dy, 4))
    return s


# --------------------------------------------------------------------- USB-C
def usb(board):
    # Only pads on the top layer under the receptacle body.
    keepout(board, [(16.25, 53.75), (23.75, 53.75), (23.75, 60.5), (16.25, 60.5)])
    # The two wide ground pads go straight to the neighbouring shield legs.
    legs = [p for p in board.FindFootprintByReference("J1").Pads() if p.GetNumber() == "S1"]
    left = min((p for p in legs if TO(p.GetX()) < 20), key=lambda p: p.GetY())
    right = min((p for p in legs if TO(p.GetX()) > 20), key=lambda p: p.GetY())
    track(board, "GND", [("J1", "A1"), (16.3, 53.3), (TO(left.GetX()), TO(left.GetY()))], 0.4)
    track(board, "GND", [("J1", "A12"), (23.7, 53.3), (TO(right.GetX()), TO(right.GetY()))], 0.4)


# ---------------------------------------------------------------- charger
def charger(board):
    s = shifted(*CHARGER_SHIFT)
    track(board, "VBUS", [("C1", "1"), ("U2", "1")], 0.3)
    track(board, "GND", [("U2", "3"), s((13.8, 11.85))], 0.2)
    track(board, "GND", [("U2", "4"), s((13.8, 12.35))], 0.2)
    track(board, "VCAP", [("U2", "8"), s((15.45, 10.85))], 0.25)   # narrow next to FB (pin 7)
    track(board, "VCAP", [s((15.45, 10.85)), ("C2", "1")], 0.4)
    track(board, "VCAP", [("C2", "1"), s((16.85, 9.85))], 0.4)
    via(board, "VCAP", s((16.85, 9.85)))
    track(board, "FB", [("U2", "7"), s((16.0, 11.35)), s((16.0, 13.3)), ("R5", "1")], 0.2)
    track(board, "FB", [("R5", "1"), ("R4", "2")], 0.2)
    track(board, "PG_N", [("U2", "6"), s((15.55, 11.85)), s((15.55, 13.4)), ("R5", "2")], 0.2)


# ------------------------------------------------------------- buck-boost
def buckboost(board):
    s = shifted(*BUCKBOOST_SHIFT)
    U = lambda pin: ("U4", pin)  # noqa: E731
    # 0.25 mm necks where neighbouring 0.5 mm-pitch pins leave the package.
    track(board, "LX2", [U("2"), s((14.4, 36.7))], 0.25)
    track(board, "LX2", [s((14.4, 36.7)), s((14.0, 36.7)), s((13.4, 36.3))], 0.4)
    track(board, "LX1", [U("4"), s((14.4, 37.7))], 0.25)
    track(board, "LX1", [s((14.4, 37.7)), s((14.0, 37.7)), s((13.4, 38.1))], 0.4)
    for pin, end in (("3", (15.9, 37.2)), ("9", (16.6, 36.7)), ("7", (16.6, 37.7))):
        track(board, "GND", [U(pin), s(end)], 0.25)
    # Output: VOUT -> C11 -> C12 -> FB, and C13 right at FB.
    track(board, "3V3", [U("1"), s((15.088, 35.9))], 0.25)
    track(board, "3V3", [s((15.088, 35.9)), s((15.1, 35.1))], 0.4)
    track(board, "3V3", [("C11", "1"), ("C12", "1")], 0.4)
    # 0.25 mm where the output leaves pin 10, next to the ground pin 9.
    track(board, "3V3", [("C12", "1"), s((17.512, 35.6))], 0.4)
    track(board, "3V3", [s((17.512, 35.6)), U("10"), s((18.2, 36.2))], 0.25)
    track(board, "3V3", [s((18.2, 36.2)), s((19.1, 36.2)), ("C13", "1")], 0.4)
    # Input: VIN -> C9, VINA and EN -> C10, all tied together.
    track(board, "VSYS", [U("5"), s((15.2, 38.55))], 0.25)
    track(board, "VSYS", [s((15.2, 38.55)), s((15.35, 38.8)), ("C9", "1")], 0.4)
    track(board, "VSYS", [U("8"), s((18.7, 37.2)), s((19.4, 37.9)), ("C10", "1")], 0.3)
    track(board, "VSYS", [U("6"), s((18.7, 38.2)), s((18.7, 37.2))], 0.3)
    track(board, "VSYS", [s((18.7, 38.2)), s((18.7, 41.3)), s((15.35, 41.3)), ("C9", "1")], 0.4)
    # Output capacitor grounds share a via between them.
    track(board, "GND", [("C11", "2"), ("C12", "2")], 0.4)
    via(board, "GND", s((16.15, 33.05)))


# ------------------------------------------------------------- RP2040
def rp2040(board):
    """TESTEN into the grounded exposed pad; IOVDD pins straight to their capacitors.
    The capacitors share their pin's plane via (VDD_SKIP), which keeps the narrow
    escape channels between the 0.4 mm-pitch pins free for signals."""
    ep = xy(board, ("U6", "57"))
    t = xy(board, ("U6", "19"))
    track(board, "GND", [t, (ep[0] + (1.0 if t[0] > ep[0] else -1.0) * 1.0, t[1])]
          if abs(t[1] - ep[1]) < 2.5 else [t, (t[0], ep[1] + (1.0 if t[1] > ep[1] else -1.0))], 0.15)
    for pin, cap in (("1", "C18"), ("10", "C19"), ("22", "C20"), ("33", "C21"), ("42", "C22")):
        track(board, "3V3", [("U6", pin), (cap, "1")], 0.15)


# ------------------------------------------------------------ plane vias
class Copper:
    """Shapely model of the board's copper for clearance checks."""

    def __init__(self, board):
        self.items = []      # (geom, net, layers, kind)
        self.holes = []      # (Point, radius)
        m = 0.55
        self.edge = Polygon([(m, m), (gen_pcb.W - m, m), (gen_pcb.W - m, gen_pcb.H - m), (m, gen_pcb.H - m)])
        for fp in board.GetFootprints():
            for p in fp.Pads():
                poly = p.GetEffectivePolygon()
                o = poly.Outline(0)
                g = Polygon([(TO(o.CPoint(i).x), TO(o.CPoint(i).y)) for i in range(o.PointCount())])
                smd = p.GetAttribute() == pcbnew.PAD_ATTRIB_SMD
                layers = {F} if smd else set(LAYERS)
                self.items.append((g, p.GetNetname(), layers, "pad"))
                if not smd and p.GetDrillSizeX() > 0:
                    self.holes.append((Point(TO(p.GetX()), TO(p.GetY())), TO(min(p.GetDrillSizeX(), p.GetDrillSizeY())) / 2))
        for t in board.GetTracks():
            if t.GetClass() == "PCB_VIA":
                c = Point(TO(t.GetX()), TO(t.GetY()))
                self.items.append((c.buffer(TO(t.GetWidth()) / 2), t.GetNetname(), set(LAYERS), "via"))
                self.holes.append((c, TO(t.GetDrillValue()) / 2))
            else:
                g = LineString([(TO(t.GetStart().x), TO(t.GetStart().y)),
                                (TO(t.GetEnd().x), TO(t.GetEnd().y))]).buffer(TO(t.GetWidth()) / 2)
                self.items.append((g, t.GetNetname(), {t.GetLayer()}, "track"))
        for z in board.Zones():
            if z.GetIsRuleArea() and z.GetDoNotAllowVias():
                o = z.Outline().Outline(0)
                g = Polygon([(TO(o.CPoint(i).x), TO(o.CPoint(i).y)) for i in range(o.PointCount())])
                self.items.append((g, "", set(z.GetLayerSet().Seq()), "keepout"))
        self._index()

    def _index(self):
        self.tree = STRtree([i[0] for i in self.items])

    def add(self, geom, net, layers, kind):
        self.items.append((geom, net, layers, kind))
        self._index()

    def clear(self, geom, net, layers, clearance=CLEAR, avoid_pads=False):
        for idx in self.tree.query(geom.buffer(clearance + 0.2)):
            g, n, ls, kind = self.items[idx]
            if not (ls & layers):
                continue
            if kind == "keepout":
                if g.intersects(geom):
                    return False
                continue
            same = n == net and n != ""
            if same and not (avoid_pads and kind == "pad"):
                continue
            gap = 0.1 if same else clearance
            if g.distance(geom) < gap:
                return False
        return True


def plane_fanout(board, net, skip=()):
    """Give every SMD pad of `net` a short track and a via down to its plane."""
    cu = Copper(board)
    vias = [(TO(t.GetX()), TO(t.GetY())) for t in board.GetTracks()
            if t.GetClass() == "PCB_VIA" and t.GetNetname() == net]
    added, failed, grounded = 0, [], []
    # Work from the most crowded footprints (most pads) outwards.
    pads = []
    for fp in board.GetFootprints():
        for p in fp.Pads():
            key = f"{fp.GetReference()}.{p.GetNumber()}"
            if p.GetNetname() != net or p.GetAttribute() != pcbnew.PAD_ATTRIB_SMD or key in skip:
                continue
            if any(q.GetNumber() == p.GetNumber() and q.GetAttribute() == pcbnew.PAD_ATTRIB_PTH
                   for q in fp.Pads()):
                continue      # exposed pad with its own thermal vias
            pads.append((-len(list(fp.Pads())), key, p))
    pads.sort(key=lambda t: (t[0], t[1]))
    for _, key, p in pads:
        c = (TO(p.GetX()), TO(p.GetY()))
        tw = 0.15 if min(TO(p.GetSizeX()), TO(p.GetSizeY())) < 0.35 else 0.25
        # 1) reuse a nearby via of the net if a straight track reaches it
        done = False
        for v in sorted(vias, key=lambda v: math.dist(v, c)):
            if math.dist(v, c) > 1.2:
                break
            line = LineString([c, v]).buffer(tw / 2)
            if cu.clear(line, net, {F}):
                track(board, net, [c, v], tw)
                cu.add(line, net, {F}, "track")
                done = True
                break
        if done:
            grounded.append(c)
            continue
        # 2) otherwise place a new via on the nearest free spot
        best = None
        for r in [0.5 + 0.05 * i for i in range(26)]:
            for k in range(24):
                a = 2 * math.pi * k / 24
                v = (c[0] + r * math.cos(a), c[1] + r * math.sin(a))
                if not cu.edge.contains(Point(v)):
                    continue
                disc = Point(v).buffer(VIA_D / 2)
                if not cu.clear(disc, net, set(LAYERS), avoid_pads=True):
                    continue
                if any(h.distance(Point(v)) < hr + VIA_DRILL / 2 + HOLE_GAP for h, hr in cu.holes):
                    continue
                line = LineString([c, v]).buffer(tw / 2)
                if not cu.clear(line, net, {F}):
                    continue
                best = v
                break
            if best:
                break
        if best is None:
            for q in sorted(grounded, key=lambda q: math.dist(q, c)):
                if math.dist(q, c) > 1.6:
                    break
                line = LineString([c, q]).buffer(tw / 2)
                if cu.clear(line, net, {F}):
                    track(board, net, [c, q], tw)
                    cu.add(line, net, {F}, "track")
                    best = q
                    break
            if best is None:
                failed.append(key)
            else:
                grounded.append(c)
            continue
        track(board, net, [c, best], tw)
        via(board, net, best)
        cu.add(LineString([c, best]).buffer(tw / 2), net, {F}, "track")
        cu.add(Point(best).buffer(VIA_D / 2), net, set(LAYERS), "via")
        cu.holes.append((Point(best), VIA_DRILL / 2))
        vias.append(best)
        grounded.append(c)
        added += 1
    return added, failed


def amplifier(board):
    """The amplifier's ground pins go straight into its grounded exposed pad, so no
    fanout vias crowd the speaker outputs."""
    ex, ey = xy(board, ("U8", "17"))
    for pin in ("3", "11", "15"):
        px, py = xy(board, ("U8", pin))
        if abs(px - ex) > abs(py - ey):
            end = (ex + (0.3 if px > ex else -0.3), py)
        else:
            end = (px, ey + (0.3 if py > ey else -0.3))
        track(board, "GND", [(px, py), end], 0.25)


GND_SKIP = {"J1.A1", "J1.A12", "J1.B1", "J1.B12", "U2.3", "U2.4",
            "U4.3", "U4.7", "U4.9", "C11.2", "C12.2", "U8.3", "U8.11", "U8.15"}
VDD_SKIP = {"C18.1", "C19.1", "C20.1", "C21.1", "C22.1"}


def solid_ground_pads(board):
    """The receptacle's ground pads join the pour solidly (no thermal spokes to starve)."""
    for p in board.FindFootprintByReference("J1").Pads():
        if p.GetNetname() == "GND":
            p.SetZoneConnection(pcbnew.ZONE_CONNECTION_FULL)


def run(board):
    usb(board)
    solid_ground_pads(board)
    charger(board)
    buckboost(board)
    rp2040(board)
    amplifier(board)
    result = {}
    for net, skip in (("GND", GND_SKIP), ("3V3", VDD_SKIP)):
        result[net] = plane_fanout(board, net, skip)
    return result
