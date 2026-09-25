"""Hand-planned copper that the autorouter should not improvise:

* the USB-C escape (0.5 mm pitch pads, D+/D- pairs joined through U1),
* the buck-boost power stage around U4/L1 (short, wide switching loops),
* the charger's local connections around U2,
* a ground via for every GND pad (In1.Cu is a solid ground plane).

Everything added here is locked, so Freerouting treats it as fixed.
Coordinates are mm; ("REF", "PAD") tuples resolve to pad centres.
"""

import math

import pcbnew
from shapely.geometry import LineString, Point, Polygon
from shapely.strtree import STRtree

MM = pcbnew.FromMM
TO = pcbnew.ToMM

VIA_D, VIA_DRILL = 0.5, 0.3      # small vias for escapes and ground stitching
CLEAR = 0.2                       # target clearance for generated copper (rule minimum is 0.15)
F, IN2, B = pcbnew.F_Cu, pcbnew.In2_Cu, pcbnew.B_Cu
LAYERS = (pcbnew.F_Cu, pcbnew.In1_Cu, pcbnew.In2_Cu, pcbnew.B_Cu)


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
    for l in layers:
        ls.AddLayer(l)
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


# --------------------------------------------------------------------- USB-C
def usb(board):
    # Nothing on the top layer under the receptacle body.
    keepout(board, [(6.75, -0.5), (14.25, -0.5), (14.25, 6.25), (6.75, 6.25)])

    J = lambda pin: ("J1", pin)  # noqa: E731
    # Ground and VBUS on the left pair of wide pads drop straight into vias.
    track(board, "GND", [J("A12"), (7.25, 8.35)], 0.4)
    via(board, "GND", (7.25, 8.35))
    track(board, "VBUS", [J("A9"), (8.05, 8.35)], 0.4)
    via(board, "VBUS", (8.05, 8.35))
    # CC1/CC2 drop into vias and reach R1/R2 on In2.Cu.
    track(board, "CC2", [J("B5"), (8.8, 8.35)], 0.2)
    via(board, "CC2", (8.8, 8.35))
    track(board, "CC2", [(8.8, 8.35), (8.35, 8.95), (5.0, 8.95), (4.3, 8.35)], 0.2, IN2)
    via(board, "CC2", (4.3, 8.35))
    track(board, "CC2", [(4.3, 8.35), ("R2", "1")], 0.2)
    track(board, "CC1", [J("A5"), (11.75, 7.9), (12.15, 8.35)], 0.2)
    via(board, "CC1", (12.15, 8.35))
    track(board, "CC1", [(12.15, 8.35), (12.7, 8.9), (16.2, 8.9), (16.7, 8.4)], 0.2, IN2)
    via(board, "CC1", (16.7, 8.4))
    track(board, "CC1", [(16.7, 8.4), ("R1", "1")], 0.2)
    # D+ (B6, A6) lands on U1 pins 1 and 6, joined under U1, then leaves through a
    # via and runs to the header on B.Cu, underneath the receptacle.
    track(board, "DP", [J("B6"), (9.75, 7.95), (9.55, 8.15), (9.55, 9.65)], 0.2)
    track(board, "DP", [J("A6"), (10.75, 9.1), (11.0, 9.55)], 0.2)
    track(board, "DP", [("U1", "1"), ("U1", "6")], 0.2)
    track(board, "DP", [("U1", "6"), (12.2, 9.8)], 0.2)
    via(board, "DP", (12.2, 9.8))
    track(board, "DP", [(12.2, 9.8), (12.7, 9.3), (12.7, 4.0), (17.5, 4.0), (18.96, 2.54),
                        ("J3", "1")], 0.2, B)
    # D- (A7, B7) drops into two vias joined on In2.Cu, which also feeds U1 pins 3/4
    # from below and runs to the header underneath the receptacle.
    track(board, "DM", [J("A7"), (10.15, 8.55)], 0.2)
    via(board, "DM", (10.15, 8.55))
    track(board, "DM", [J("B7"), (11.4, 8.6)], 0.2)
    via(board, "DM", (11.4, 8.6))
    track(board, "DM", [(10.15, 8.55), (11.4, 8.6)], 0.2, IN2)
    track(board, "DM", [(10.15, 8.55), (10.35, 9.0), (10.35, 12.2)], 0.2, IN2)
    track(board, "DM", [(11.4, 8.6), (11.4, 4.6), (17.9, 4.6), (18.38, 5.08), ("J3", "2")], 0.2, IN2)
    track(board, "DM", [("U1", "3"), ("U1", "4")], 0.2)
    track(board, "DM", [(10.35, 11.55), (10.35, 12.2)], 0.2)
    via(board, "DM", (10.35, 12.2))
    # VBUS and ground on the right pair of wide pads go straight to C1.
    track(board, "VBUS", [J("A4"), (12.95, 9.0)], 0.4)
    track(board, "GND", [J("A1"), (13.75, 7.95), ("C1", "2")], 0.4)
    via(board, "GND", (14.1, 8.3))
    # U1 ground via and VBUS to C1.
    track(board, "GND", [("U1", "2"), (7.75, 10.6)], 0.3)
    via(board, "GND", (7.75, 10.6))
    track(board, "VBUS", [("U1", "5"), (12.3, 10.6), (13.2, 9.8)], 0.4)
    # The two VBUS pads meet on B.Cu, passing below U1.
    track(board, "VBUS", [(8.05, 8.35), (8.05, 9.9), (9.0, 10.85), (12.6, 10.85), (13.095, 10.4)], 0.4, B)
    via(board, "VBUS", (13.095, 10.4))


# ---------------------------------------------------------------- charger
def charger(board):
    track(board, "VBUS", [("C1", "1"), ("U2", "1")], 0.3)
    track(board, "GND", [("U2", "3"), (13.8, 11.85)], 0.2)
    track(board, "GND", [("U2", "4"), (13.8, 12.35)], 0.2)
    # The output side fans out to the right: VCAP to C2 and a via, FB and /PG down
    # a channel to R5 and R4, STAT straight down.
    track(board, "VCAP", [("U2", "8"), ("C2", "1")], 0.4)
    track(board, "VCAP", [("C2", "1"), (16.85, 9.85)], 0.4)
    via(board, "VCAP", (16.85, 9.85))
    track(board, "FB", [("U2", "7"), (16.0, 11.35), (16.0, 13.3), ("R5", "1")], 0.2)
    track(board, "FB", [("R5", "1"), ("R4", "2")], 0.2)
    track(board, "PG_N", [("U2", "6"), (15.55, 11.85), (15.55, 13.4), ("R5", "2")], 0.2)
    track(board, "LED_A", [("R6", "2"), ("D1", "2")], 0.2)


# ------------------------------------------------------------ capacitor
def capacitor(board):
    # BT1 has two footprints-in-one (5 mm and 3.5 mm lead pitch); tie the pairs.
    track(board, "VCAP", [(3.6, 43.4), (3.6, 46.4)], 0.6)
    track(board, "GND", [(8.6, 43.4), (7.1, 46.4)], 0.6)


# ------------------------------------------------------------- buck-boost
def buckboost(board):
    U = lambda pin: ("U4", pin)  # noqa: E731
    # 0.25 mm necks where neighbouring 0.5 mm-pitch pins leave the package.
    track(board, "LX2", [U("2"), (14.4, 36.7)], 0.25)
    track(board, "LX2", [(14.4, 36.7), (14.0, 36.7), (13.4, 36.3)], 0.4)
    track(board, "LX1", [U("4"), (14.4, 37.7)], 0.25)
    track(board, "LX1", [(14.4, 37.7), (14.0, 37.7), (13.4, 38.1)], 0.4)
    for pin, end in (("3", (15.9, 37.2)), ("9", (16.6, 36.7)), ("7", (16.6, 37.7))):
        track(board, "GND", [U(pin), end], 0.25)
    # Output: VOUT -> C11 -> C12 -> FB, and C13 right at FB.
    track(board, "3V3", [U("1"), (15.088, 35.9)], 0.25)
    track(board, "3V3", [(15.088, 35.9), (15.1, 35.1)], 0.4)
    track(board, "3V3", [("C11", "1"), ("C12", "1")], 0.4)
    track(board, "3V3", [("C12", "1"), (17.512, 35.6), U("10")], 0.4)
    track(board, "3V3", [U("10"), (19.1, 36.2), ("C13", "1")], 0.4)
    # Input: VIN -> C9, VINA and EN -> C10, and the VSYS feed from Q5.
    track(board, "VSYS", [U("5"), (15.2, 38.55)], 0.25)
    track(board, "VSYS", [(15.2, 38.55), (15.35, 38.8), ("C9", "1")], 0.4)
    track(board, "VSYS", [U("8"), (18.7, 37.2), (19.4, 37.9), ("C10", "1")], 0.3)
    track(board, "VSYS", [U("6"), (18.7, 38.2), (18.7, 37.2)], 0.3)
    track(board, "VSYS", [("Q5", "3"), (18.7, 42.9), (18.7, 41.3), (18.7, 38.2)], 0.4)
    track(board, "VSYS", [(18.7, 41.3), (15.35, 41.3), ("C9", "1")], 0.4)
    # Output capacitor grounds share a via pair between them.
    track(board, "GND", [("C11", "2"), ("C12", "2")], 0.4)
    via(board, "GND", (16.15, 33.05))


# ------------------------------------------------------------ ground vias
class Copper:
    """Shapely model of the board's copper for clearance checks."""

    def __init__(self, board):
        self.items = []      # (geom, net, layers, kind)
        self.holes = []      # (Point, radius)
        self.edge = Polygon([(0.55, 0.55), (20.45, 0.55), (20.45, 47.45), (0.55, 47.45)])
        for fp in board.GetFootprints():
            for p in fp.Pads():
                poly = p.GetEffectivePolygon()
                o = poly.Outline(0)
                g = Polygon([(TO(o.CPoint(i).x), TO(o.CPoint(i).y)) for i in range(o.PointCount())])
                smd = p.GetAttribute() == pcbnew.PAD_ATTRIB_SMD
                layers = {F} if smd else set(LAYERS)
                self.items.append((g, p.GetNetname(), layers, "pad"))
                if not smd and p.GetDrillSizeX() > 0:
                    self.holes.append((Point(TO(p.GetX()), TO(p.GetY())), TO(p.GetDrillSizeX()) / 2))
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
                self.items.append((g, "", {z.GetLayer()}, "keepout"))
        self._index()

    def _index(self):
        self.tree = STRtree([i[0] for i in self.items])

    def add(self, geom, net, layers, kind):
        self.items.append((geom, net, layers, kind))
        self._index()

    def clear(self, geom, net, layers, clearance=CLEAR, avoid_pads=False):
        for idx in self.tree.query(geom.buffer(clearance)):
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


def gnd_fanout(board, skip=()):
    """Give every unconnected GND pad a short track and a via to the In1.Cu plane."""
    cu = Copper(board)
    vias = [(TO(t.GetX()), TO(t.GetY())) for t in board.GetTracks()
            if t.GetClass() == "PCB_VIA" and t.GetNetname() == "GND"]
    added, failed, grounded = 0, [], []
    for fp in board.GetFootprints():
        for p in fp.Pads():
            key = f"{fp.GetReference()}.{p.GetNumber()}"
            if p.GetNetname() != "GND" or p.GetAttribute() != pcbnew.PAD_ATTRIB_SMD or key in skip:
                continue
            if any(q.GetNumber() == p.GetNumber() and q.GetAttribute() == pcbnew.PAD_ATTRIB_PTH
                   for q in fp.Pads()):
                continue      # exposed pad with its own thermal vias
            c = (TO(p.GetX()), TO(p.GetY()))
            # 1) reuse a nearby ground via if a straight track reaches it
            done = False
            for v in sorted(vias, key=lambda v: math.dist(v, c)):
                if math.dist(v, c) > 1.4:
                    break
                line = LineString([c, v]).buffer(0.15)
                if cu.clear(line, "GND", {F}):
                    track(board, "GND", [c, v], 0.3)
                    cu.add(line, "GND", {F}, "track")
                    done = True
                    break
            if done:
                grounded.append(c)
                continue
            # 2) otherwise place a new via on the nearest free spot
            best = None
            for r in [0.45 + 0.05 * i for i in range(24)]:
                for k in range(16):
                    a = 2 * math.pi * k / 16
                    v = (c[0] + r * math.cos(a), c[1] + r * math.sin(a))
                    if not cu.edge.contains(Point(v)):
                        continue
                    disc = Point(v).buffer(VIA_D / 2)
                    if not cu.clear(disc, "GND", set(LAYERS), avoid_pads=True):
                        continue
                    if any(h.distance(Point(v)) < hr + VIA_DRILL / 2 + 0.3 for h, hr in cu.holes):
                        continue
                    line = LineString([c, v]).buffer(0.15)
                    if not cu.clear(line, "GND", {F}):
                        continue
                    best = v
                    break
                if best:
                    break
            if best is None:
                for q in sorted(grounded, key=lambda q: math.dist(q, c)):
                    if math.dist(q, c) > 1.6:
                        break
                    line = LineString([c, q]).buffer(0.15)
                    if cu.clear(line, "GND", {F}):
                        track(board, "GND", [c, q], 0.3)
                        cu.add(line, "GND", {F}, "track")
                        best = q
                        break
                if best is None:
                    failed.append(key)
                else:
                    grounded.append(c)
                continue
            track(board, "GND", [c, best], 0.3)
            via(board, "GND", best)
            cu.add(LineString([c, best]).buffer(0.15), "GND", {F}, "track")
            cu.add(Point(best).buffer(VIA_D / 2), "GND", set(LAYERS), "via")
            cu.holes.append((Point(best), VIA_DRILL / 2))
            vias.append(best)
            grounded.append(c)
            added += 1
    return added, failed


SKIP = {"J1.A1", "J1.A12", "J1.B1", "J1.B12", "C1.2", "U1.2", "U2.3", "U2.4",
        "U4.3", "U4.7", "U4.9", "C11.2", "C12.2"}


def run(board):
    usb(board)
    charger(board)
    capacitor(board)
    buckboost(board)
    return gnd_fanout(board, SKIP)
