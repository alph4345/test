"""Stage 2: route the board with Freerouting, pour copper, run DRC.

    python3 route_pcb.py --autoroute   # export capcore.dsn, run Freerouting, import capcore.ses
    python3 route_pcb.py               # rebuild from the committed capcore.ses (no Java needed)

Freerouting (https://github.com/freerouting/freerouting, tested with 2.1.0 on
Java 21) is found through $FREEROUTING_JAR. In1.Cu is a solid ground plane, so
every GND pad is fanned out to it with a via; signals use F.Cu, In2.Cu and B.Cu.
"""

import json
import os
import re
import shutil
import subprocess
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

import pcbnew  # noqa: E402

import gen_pcb  # noqa: E402
import maze  # noqa: E402
import preroute  # noqa: E402
from sexpr import find, find_all, parse  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
PROJ = gen_pcb.PROJ
DSN = os.path.join(PROJ, "capcore.dsn")
SES = os.path.join(PROJ, "capcore.ses")
PRO = os.path.join(PROJ, "capcore.kicad_pro")

MM = pcbnew.FromMM

# Wider tracks for everything that carries real current (mm).
POWER = {"VBUS": 0.4, "VCAP": 0.4, "VAON": 0.4, "VSYS": 0.4, "3V3": 0.4,
         "LX1": 0.4, "LX2": 0.4, "GND": 0.4}
CLEARANCE = 0.15
ZONE_CLEARANCE = 0.2
EDGE_KEEPOUT = 0.45               # track centre to edge >= 0.3 mm clearance + half width
LAYER_NAMES = {"F.Cu": pcbnew.F_Cu, "In1.Cu": pcbnew.In1_Cu, "In2.Cu": pcbnew.In2_Cu, "B.Cu": pcbnew.B_Cu}


def zone(board, net, layer, inset=0.3, priority=0):
    z = pcbnew.ZONE(board)
    z.SetLayer(layer)
    z.SetNetCode(board.FindNet(net).GetNetCode())
    z.SetLocalClearance(MM(ZONE_CLEARANCE))
    z.SetMinThickness(MM(0.2))
    z.SetThermalReliefGap(MM(0.25))
    z.SetThermalReliefSpokeWidth(MM(0.3))
    z.SetAssignedPriority(priority)
    z.SetIslandRemovalMode(pcbnew.ISLAND_REMOVAL_MODE_ALWAYS)
    ol = z.Outline()
    ol.NewOutline()
    w, h = gen_pcb.W, gen_pcb.H
    for x, y in [(inset, inset), (w - inset, inset), (w - inset, h - inset), (inset, h - inset)]:
        ol.Append(MM(x), MM(y))
    board.Add(z)
    return z


def prepare(board):
    """Things Freerouting has to know about: the ground plane."""
    board.SetLayerType(pcbnew.In1_Cu, pcbnew.LT_POWER)
    zone(board, "GND", pcbnew.In1_Cu)


def export_dsn(board, path=DSN):
    if not pcbnew.ExportSpecctraDSN(board, path):
        raise RuntimeError("DSN export failed")
    text = open(path).read()
    # Move the power nets into their own classes with wider tracks.
    m = re.search(r'\(class kicad_default ""([^()]*)', text)
    names = m.group(1).split()
    keep = [n for n in names if n not in POWER]
    text = text.replace(m.group(0), '(class kicad_default "" ' + " ".join(keep) + "\n      ")
    classes = ""
    for net, w in POWER.items():
        classes += (f'    (class power_{net} {net}\n'
                    f'      (circuit (use_via "Via[0-3]_600:300_um"))\n'
                    f'      (rule (width {w * 1000:.0f}) (clearance {CLEARANCE * 1000 + 0.1:.1f}))\n'
                    f'    )\n')
    i = text.rindex("(class kicad_default")
    text = text[:i] + classes.lstrip() + "    " + text[i:]
    # Keep the autorouter EDGE_KEEPOUT mm away from the board edge (KiCad's copper
    # to edge rule is not part of the DSN).
    k, w, h = EDGE_KEEPOUT * 1000, gen_pcb.W * 1000, gen_pcb.H * 1000
    strips = [(0, 0, k, h), (w - k, 0, w, h), (0, 0, w, k), (0, h - k, w, h)]
    keep = ""
    for x0, y0, x1, y1 in strips:
        keep += (f'    (keepout "" (polygon signal 0  {x0:.0f} {-y0:.0f}  {x1:.0f} {-y0:.0f}'
                 f'  {x1:.0f} {-y1:.0f}  {x0:.0f} {-y1:.0f}  {x0:.0f} {-y0:.0f}))\n')
    j = text.index("    (via ")
    text = text[:j] + keep + text[j:]
    open(path, "w").write(text)
    return path


def autoroute(dsn=DSN, ses=SES, passes=30):
    """Freerouting 1.9 is used because it honours the pass limit and exits when done;
    it wants a display, so run it under xvfb on a headless machine."""
    jar = os.environ.get("FREEROUTING_JAR", "freerouting-1.9.0.jar")
    cmd = ["java", "-jar", jar, "-de", dsn, "-do", ses, "-mp", str(passes)]
    if not os.environ.get("DISPLAY") and shutil.which("xvfb-run"):
        cmd = ["xvfb-run", "-a"] + cmd
    print(" ".join(cmd))
    subprocess.run(cmd, check=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)


def import_ses(board, path=SES):
    """Minimal Specctra session reader: wires and vias from network_out."""
    text = open(path).read().replace('(string_quote ")', "")
    tree = parse(text)
    routes = find(tree, "routes")
    res = find(routes, "resolution")
    unit, per = res[1], float(res[2])
    scale = {"um": 1e-3, "mm": 1.0, "mil": 0.0254, "inch": 25.4}[str(unit)] / per   # file units -> mm

    def pt(x, y):
        return pcbnew.VECTOR2I(MM(float(x) * scale), MM(-float(y) * scale))

    n_tracks = n_vias = 0
    for net_node in find_all(find(routes, "network_out"), "net"):
        net = board.FindNet(str(net_node[1]))
        if net is None:
            raise KeyError(f"SES net {net_node[1]} is not on the board")
        for wire in find_all(net_node, "wire"):
            path = find(wire, "path")
            layer = LAYER_NAMES[str(path[1])]
            width = MM(float(path[2]) * scale)
            coords = [float(v) for v in path[3:]]
            pts = list(zip(coords[0::2], coords[1::2]))
            for a, b in zip(pts, pts[1:]):
                t = pcbnew.PCB_TRACK(board)
                t.SetStart(pt(*a))
                t.SetEnd(pt(*b))
                t.SetWidth(width)
                t.SetLayer(layer)
                t.SetNet(net)
                board.Add(t)
                n_tracks += 1
        for via in find_all(net_node, "via"):
            m = re.search(r"_(\d+):(\d+)_um", str(via[1]))
            v = pcbnew.PCB_VIA(board)
            v.SetPosition(pt(via[2], via[3]))
            v.SetWidth(MM(int(m.group(1)) / 1000))
            v.SetDrill(MM(int(m.group(2)) / 1000))
            v.SetLayerPair(pcbnew.F_Cu, pcbnew.B_Cu)
            v.SetNet(net)
            board.Add(v)
            n_vias += 1
    return n_tracks, n_vias


def drop_dangling(board):
    """Delete unlocked track segments with an end that touches nothing of its net.
    An end counts as connected when it lies inside a pad or via of its net, or on
    the centre line of another segment of its net on the same layer (KiCad's rule)."""
    from shapely.geometry import LineString, Point
    T = pcbnew.ToMM
    removed = 0
    while True:
        cu = preroute.Copper(board)
        pads_vias = [(g, n, ls) for g, n, ls, kind in cu.items if kind in ("pad", "via")]
        segs = []
        for t in board.GetTracks():
            if t.GetClass() == "PCB_TRACK":
                segs.append((t, LineString([(T(t.GetStart().x), T(t.GetStart().y)),
                                            (T(t.GetEnd().x), T(t.GetEnd().y))])))
        dead = []
        for t, line in segs:
            if t.IsLocked():
                continue
            net, layer = t.GetNetname(), t.GetLayer()
            for end in (line.coords[0], line.coords[-1]):
                p = Point(end)
                ok = any(n == net and layer in ls and g.distance(p) < 1e-3 for g, n, ls in pads_vias)
                ok = ok or any(o is not t and o.GetNetname() == net and o.GetLayer() == layer
                               and ol.distance(p) < 1e-3 for o, ol in segs)
                if not ok:
                    dead.append(t)
                    break
        if not dead:
            return removed
        for t in dead:
            board.Remove(t)
        removed += len(dead)


def split_at_junctions(board):
    """KiCad only treats segment *ends* as joints: where a track ends on the middle
    of another one, split the other one there so no end is reported dangling."""
    from shapely.geometry import LineString, Point
    T = pcbnew.ToMM
    splits = 0
    changed = True
    while changed:
        changed = False
        tracks = [t for t in board.GetTracks() if t.GetClass() == "PCB_TRACK"]
        ends = [(t.GetNetname(), t.GetLayer(), (T(p.x), T(p.y)))
                for t in tracks for p in (t.GetStart(), t.GetEnd())]
        for b in tracks:
            a0, a1 = (T(b.GetStart().x), T(b.GetStart().y)), (T(b.GetEnd().x), T(b.GetEnd().y))
            line = LineString([a0, a1])
            for net, layer, p in ends:
                if net != b.GetNetname() or layer != b.GetLayer():
                    continue
                if Point(p).distance(Point(a0)) < 1e-3 or Point(p).distance(Point(a1)) < 1e-3:
                    continue
                if line.distance(Point(p)) < 1e-4:
                    n = pcbnew.PCB_TRACK(board)
                    n.SetStart(pcbnew.VECTOR2I(MM(p[0]), MM(p[1])))
                    n.SetEnd(b.GetEnd())
                    n.SetWidth(b.GetWidth())
                    n.SetLayer(b.GetLayer())
                    n.SetNet(b.GetNet())
                    n.SetLocked(b.IsLocked())
                    b.SetEnd(pcbnew.VECTOR2I(MM(p[0]), MM(p[1])))
                    board.Add(n)
                    splits += 1
                    changed = True
                    break
            if changed:
                break
    return splits


def pour(board):
    """Ground on every layer; In1.Cu (added in prepare) is the unbroken plane."""
    for layer in (pcbnew.F_Cu, pcbnew.In2_Cu, pcbnew.B_Cu):
        zone(board, "GND", layer)


def fill(path):
    """Zone filling needs a board loaded from disk (it crashes on one built in memory)."""
    board = pcbnew.LoadBoard(path)
    board.BuildConnectivity()
    pcbnew.ZONE_FILLER(board).Fill(board.Zones())
    board.Save(path)


def write_project(path=PRO):
    """Net classes in the project file, so hand edits in KiCad use the same widths."""
    d = json.load(open(path))
    classes = d["net_settings"]["classes"]
    base = dict(classes[0])
    classes[:] = [c for c in classes if c["name"] == "Default"]
    power = dict(base, name="Power", track_width=0.4)
    classes.append(power)
    d["net_settings"]["netclass_patterns"] = [{"netclass": "Power", "pattern": n} for n in POWER]
    json.dump(d, open(path, "w"), indent=2)


def drc(board_path, report):
    board = pcbnew.LoadBoard(board_path)
    pcbnew.WriteDRCReport(board, report, pcbnew.EDA_UNITS_MILLIMETRES, True)
    text = open(report).read()
    counts = re.findall(r"\*\* Found (\d+) (.*?) \*\*", text)
    return counts, text


def main():
    board = gen_pcb.build()
    prepare(board)
    added, failed = preroute.run(board)
    print(f"ground fanout: {added} vias added, unplaced: {failed or 'none'}")
    if "--prerouted-only" in sys.argv:
        pour(board)
        path = gen_pcb.save(board)
        write_project()
        fill(path)
        report(path)
        return
    if "--autoroute" in sys.argv:
        export_dsn(board)
        autoroute()
    n_tracks, n_vias = import_ses(board)
    print(f"imported {n_tracks} track segments, {n_vias} vias")
    removed = drop_dangling(board)
    if removed:
        print(f"removed {removed} dangling autorouter segments")
    split = split_at_junctions(board)
    if split:
        print(f"split {split} segments at T-junctions")
    path = gen_pcb.save(board)
    finish(path)
    board = pcbnew.LoadBoard(path)
    pour(board)
    board.Save(path)
    write_project()
    fill(path)
    print("wrote", path)
    report(path)


def unconnected_pads(path):
    """(net, ref, pad) for every pad the DRC reports as unconnected."""
    out = os.path.join(os.environ.get("CAPCORE_SCRATCH", "/tmp"), "unconnected.rpt")
    _, text = drc(path, out)
    pads = []
    for block in text.split("[unconnected_items]")[1:]:
        for m in re.finditer(r"[Pp]ad (\S+) \[(\S+)\] of (\S+)", block.split("\n[")[0]):
            key = (m.group(2), m.group(3), m.group(1))
            if key not in pads:
                pads.append(key)
    return pads


def finish(path):
    """Route whatever Freerouting left open with the grid router (maze.py)."""
    for _ in range(3):
        fill(path)                     # the In1.Cu plane carries GND connectivity
        todo = unconnected_pads(path)
        if not todo:
            return
        board = pcbnew.LoadBoard(path)
        done = set()
        for net, ref, num in todo:
            if net in done:
                continue      # the first pad of a net may already have joined the rest
            w = 0.3 if net in POWER else 0.2
            segs, vias = maze.connect(board, net, ref, num, w)
            print(f"  grid-routed {net} from {ref}.{num}: {segs} segments, {vias} vias")
            done.add(net)
        board.Save(path)


def report(path):
    out = os.path.join(os.environ.get("CAPCORE_SCRATCH", "/tmp"), "drc.rpt")
    counts, _ = drc(path, out)
    for n, what in counts:
        print(f"  DRC: {n} {what}")
    print("report:", out)


if __name__ == "__main__":
    main()
