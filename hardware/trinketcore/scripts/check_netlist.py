"""Prove the generated schematic (and optionally the PCB) match netlist.py.

Exports the schematic netlist with kicad-cli and compares every pin. With
--pcb it also compares each footprint pad's net in trinketcore.kicad_pcb.
Exits non-zero on any mismatch.
"""

import os
import subprocess
import sys
import tempfile

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from netlist import PARTS  # noqa: E402
from sexpr import find, find_all, parse  # noqa: E402

HERE = os.path.dirname(os.path.abspath(__file__))
SCH = os.path.join(HERE, "..", "trinketcore.kicad_sch")
PCB = os.path.join(HERE, "..", "trinketcore.kicad_pcb")


def expected():
    out = {}
    for p in PARTS:
        for pin, net in p.pins.items():
            out[(p.ref, pin)] = net
    return out


def schematic_nets():
    with tempfile.TemporaryDirectory() as tmp:
        net_file = os.path.join(tmp, "trinketcore.net")
        subprocess.run(["kicad-cli", "sch", "export", "netlist", "--format", "kicadsexpr",
                        "-o", net_file, SCH], check=True, capture_output=True)
        tree = parse(open(net_file).read())
    got = {}
    for n in find_all(find(tree, "nets"), "net"):
        name = find(n, "name")[1].lstrip("/")
        for node in find_all(n, "node"):
            got[(find(node, "ref")[1], find(node, "pin")[1])] = name
    comps = {find(c, "ref")[1]: find(c, "value")[1] for c in find_all(find(tree, "components"), "comp")}
    return got, comps


def pcb_nets():
    import pcbnew
    board = pcbnew.LoadBoard(PCB)
    got = {}
    for fp in board.GetFootprints():
        for pad in fp.Pads():
            if pad.GetNumber() == "":
                continue
            got[(fp.GetReference(), pad.GetNumber())] = pad.GetNetname() or "NC"
    return got


def compare(label, got, exp):
    """Check connectivity (same partition of pins) and net names separately."""
    groups = {}
    for key, net in exp.items():
        if net != "NC":
            groups.setdefault(net, set()).add(got.get(key))
    owner = {}
    conn_bad = 0
    for net, names in sorted(groups.items()):
        if len(names) != 1:
            conn_bad += 1
            print(f"  {label} SPLIT net {net}: pins land on {sorted(map(str, names))}")
            continue
        name = next(iter(names))
        if name in owner:
            conn_bad += 1
            print(f"  {label} SHORT: nets {owner[name]} and {net} are both {name}")
        owner[name] = net
    if conn_bad:
        print(f"{label}: {conn_bad} connectivity problems")
    bad = conn_bad
    for key, net in sorted(exp.items()):
        g = got.get(key)
        if net == "NC":
            ok = g is None or g.startswith("unconnected") or g == "NC" or g == ""
        else:
            ok = g == net
        if not ok:
            bad += 1
            print(f"  {label} MISMATCH {key[0]}.{key[1]}: expected {net}, got {g}")
    extra = [k for k in got if k not in exp and not k[0].startswith("#")]
    for k in extra:
        if got[k] == "NC":      # a mechanical pad (e.g. a connector's mounting tab): no net, no risk
            print(f"  {label} note: mechanical pad {k[0]}.{k[1]} has no net")
            continue
        bad += 1
        print(f"  {label} EXTRA pin {k[0]}.{k[1]} on {got[k]}")
    print(f"{label}: checked {len(exp)} pins, {bad} problems")
    return bad


def main():
    exp = expected()
    got, comps = schematic_nets()
    bad = compare("schematic", got, exp)
    missing = [p.ref for p in PARTS if p.ref not in comps]
    if missing:
        bad += len(missing)
        print("  schematic is missing parts:", missing)
    if "--pcb" in sys.argv:
        bad += compare("pcb", pcb_nets(), exp)
    sys.exit(1 if bad else 0)


if __name__ == "__main__":
    main()
