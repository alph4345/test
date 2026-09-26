"""Helpers for writing KiCad 7 schematics from Python."""

import uuid as _uuid

from sexpr import Sym, dump, find, find_all

GRID = 1.27


def uid(seed=None):
    if seed is None:
        return str(_uuid.uuid4())
    return str(_uuid.uuid5(_uuid.NAMESPACE_URL, "trinketcore/" + seed))


def snap(v):
    return round(round(v / GRID) * GRID, 4)


def symbol_pins(sym):
    """pin number -> (x, y, angle, name, etype, hidden) in library coordinates."""
    pins = {}
    for unit in find_all(sym, "symbol"):
        for p in find_all(unit, "pin"):
            at = find(p, "at")
            hidden = any(isinstance(t, Sym) and t == "hide" for t in p)
            num = find(p, "number")[1]
            pins.setdefault(num, (float(at[1]), float(at[2]), int(float(at[3])),
                                  find(p, "name")[1], str(p[1]), hidden))
    return pins


def xform(px, py, rot):
    """Library point -> offset in schematic coordinates (y down).

    KiCad rotates symbols counter-clockwise as seen on screen.
    """
    x, y = px, -py
    for _ in range((rot // 90) % 4):
        x, y = y, -x
    return x, y


def pin_dir(angle, rot):
    """Unit vector pointing away from the body at a pin's connection point."""
    # Library angle is the direction the pin points *toward* the body.
    away = {0: (-1, 0), 90: (0, -1), 180: (1, 0), 270: (0, 1)}[angle]
    # Convert the library-space vector (y up) to screen space, then rotate.
    return xform(away[0], away[1], rot)


def symbol_bbox(sym, rot, at):
    """Bounding box of a symbol's graphics and pins, in schematic coordinates."""
    pts = []
    for unit in find_all(sym, "symbol"):
        for g in unit:
            if not isinstance(g, list):
                continue
            if g[0] in ("rectangle",):
                s_, e_ = find(g, "start"), find(g, "end")
                pts += [(float(s_[1]), float(s_[2])), (float(e_[1]), float(e_[2]))]
            elif g[0] in ("polyline", "bezier"):
                for xy in find_all(find(g, "pts"), "xy"):
                    pts.append((float(xy[1]), float(xy[2])))
            elif g[0] == "circle":
                c, r = find(g, "center"), float(find(g, "radius")[1])
                cx, cy = float(c[1]), float(c[2])
                pts += [(cx - r, cy - r), (cx + r, cy + r)]
            elif g[0] == "arc":
                for k in ("start", "mid", "end"):
                    q = find(g, k)
                    if q:
                        pts.append((float(q[1]), float(q[2])))
            elif g[0] == "pin":
                a = find(g, "at")
                ln = float(find(g, "length")[1])
                ang = int(float(a[3]))
                px, py = float(a[1]), float(a[2])
                dx, dy = {0: (1, 0), 90: (0, 1), 180: (-1, 0), 270: (0, -1)}[ang]
                pts += [(px, py), (px + dx * ln, py + dy * ln)]
    if not pts:
        pts = [(0, 0)]
    tp = [xform(px, py, rot) for px, py in pts]
    xs = [at[0] + p[0] for p in tp]
    ys = [at[1] + p[1] for p in tp]
    return (min(xs), min(ys), max(xs), max(ys))


def effects(size=1.27, justify=None, hide=False, bold=False):
    font = [Sym("font"), [Sym("size"), size, size]]
    if bold:
        font.append(Sym("bold"))
    e = [Sym("effects"), font]
    if justify:
        e.append([Sym("justify")] + [Sym(j) for j in justify.split()])
    if hide:
        e.append(Sym("hide"))
    return e


TEXT_W = 1.0   # approx. glyph advance of the 1.27 mm KiCad font, in mm per char


def text_box(s, at, size=1.27, angle=0, justify=None):
    """Axis-aligned box (x0, y0, x1, y1) of a single-line text item."""
    w = TEXT_W * size / 1.27 * max(len(line) for line in s.split("\n"))
    h = size * (1.6 * (s.count("\n") + 1))
    x, y = at
    if angle in (90, 270):
        w, h = h, w
    if justify and "left" in justify:
        x0 = x
    elif justify and "right" in justify:
        x0 = x - w
    else:
        x0 = x - w / 2
    if justify and "top" in justify and angle in (0, 180):
        y0 = y
    elif justify and "bottom" in justify and angle in (0, 180):
        y0 = y - h
    elif angle in (90, 270) and justify:
        y0 = y - h if ("left" in justify) == (angle == 90) else y
    else:
        y0 = y - h / 2
    return (x0, y0, x0 + w, y0 + h)


class Schematic:
    def __init__(self, title, paper="A3"):
        self.boxes = []   # (owner, kind, (x0, y0, x1, y1))
        self.items = []
        self.lib = {}
        self.root = uid("root-sheet")
        self.title = title
        self.paper = paper
        self.pwr_count = 0
        self.flg_count = 0

    # -- primitives --------------------------------------------------------
    def box(self, owner, kind, b):
        self.boxes.append((owner, kind, (min(b[0], b[2]), min(b[1], b[3]), max(b[0], b[2]), max(b[1], b[3]))))

    def wire(self, a, b, owner=None):
        if abs(a[0] - b[0]) < 1e-6 and abs(a[1] - b[1]) < 1e-6:
            return
        self.box(owner, "wire", (a[0], a[1], b[0], b[1]))
        self.items.append([Sym("wire"), [Sym("pts"), [Sym("xy"), a[0], a[1]], [Sym("xy"), b[0], b[1]]],
                           [Sym("stroke"), [Sym("width"), 0], [Sym("type"), Sym("default")]],
                           [Sym("uuid"), uid()]])

    def label(self, net, at, angle, owner=None, kind="label"):
        just = {0: "left bottom", 90: "left bottom", 180: "right bottom", 270: "right bottom"}[angle]
        w = TEXT_W * len(net) + 0.6
        box = {0: (at[0], at[1] - 1.5, at[0] + w, at[1]), 180: (at[0] - w, at[1] - 1.5, at[0], at[1]),
               90: (at[0] - 1.5, at[1] - w, at[0], at[1]), 270: (at[0] - 1.5, at[1], at[0], at[1] + w)}[angle]
        self.box(owner, kind, box)
        self.items.append([Sym("label"), net, [Sym("at"), at[0], at[1], angle],
                           [Sym("fields_autoplaced")], effects(justify=just), [Sym("uuid"), uid()]])

    def no_connect(self, at):
        self.items.append([Sym("no_connect"), [Sym("at"), at[0], at[1]], [Sym("uuid"), uid()]])

    def junction(self, at):
        self.items.append([Sym("junction"), [Sym("at"), at[0], at[1]], [Sym("diameter"), 0],
                           [Sym("color"), 0, 0, 0, 0], [Sym("uuid"), uid()]])

    def text(self, s, at, size=1.27, bold=False, justify="left bottom", owner="notes"):
        self.box(owner, "text", text_box(s, at, size, 0, justify))
        self.items.append([Sym("text"), s, [Sym("at"), at[0], at[1], 0],
                           effects(size, justify, bold=bold), [Sym("uuid"), uid()]])

    def rect(self, a, b):
        self.items.append([Sym("rectangle"), [Sym("start"), a[0], a[1]], [Sym("end"), b[0], b[1]],
                           [Sym("stroke"), [Sym("width"), 0], [Sym("type"), Sym("dash")]],
                           [Sym("fill"), [Sym("type"), Sym("none")]], [Sym("uuid"), uid()]])

    # -- symbols -----------------------------------------------------------
    def add_lib(self, sym):
        name = "TrinketCore:" + sym[1]
        if name not in self.lib:
            s = [Sym("symbol"), name] + sym[2:]
            self.lib[name] = s
        return name

    def place(self, sym, ref, value, at, rot=0, footprint="", fields=None, in_bom=True,
              ref_at=None, val_at=None, hide_value=False, justify=None):
        """Place a symbol; returns {pin: (x, y, dir, name, hidden)} in schematic coordinates."""
        lib_id = self.add_lib(sym)
        x, y = at
        pins = symbol_pins(sym)
        body = symbol_bbox(sym, rot, (x, y))
        self.box(ref, "body", body)
        props = []
        # Field text is stored relative to the symbol orientation; 90 keeps it horizontal
        # on a symbol rotated by 90 or 270 degrees.
        fangle = 90 if rot in (90, 270) else 0

        def prop(key, val, pos, hide=False, justify=None):
            props.append([Sym("property"), key, val, [Sym("at"), pos[0], pos[1], fangle],
                          effects(justify=justify, hide=hide)])
            if not hide:
                self.box(ref, "field", text_box(val, pos, 1.27, 0, justify))

        self._pending_ref, self._pending_val = ref, value
        ref_pos, val_pos, just = self._field_positions(sym, (x, y), rot, body)
        if ref_at is not None:
            just = justify
        prop("Reference", ref, ref_at or ref_pos, justify=just)
        prop("Value", value, val_at or val_pos, justify=just, hide=hide_value)
        prop("Footprint", footprint, at, hide=True)
        prop("Datasheet", "", at, hide=True)
        for k, v in (fields or {}).items():
            prop(k, v, at, hide=True)
        inst = [Sym("symbol"), [Sym("lib_id"), lib_id], [Sym("at"), x, y, rot], [Sym("unit"), 1],
                [Sym("in_bom"), Sym("yes" if in_bom else "no")], [Sym("on_board"), Sym("yes")],
                [Sym("dnp"), Sym("no")], [Sym("uuid"), uid("sym/" + ref)]] + props
        for num in pins:
            inst.append([Sym("pin"), num, [Sym("uuid"), uid(f"pin/{ref}/{num}")]])
        inst.append([Sym("instances"), [Sym("project"), "trinketcore",
                     [Sym("path"), "/" + self.root, [Sym("reference"), ref], [Sym("unit"), 1]]]])
        self.items.append(inst)
        out = {}
        for num, (px, py, ang, name, etype, hidden) in pins.items():
            dx, dy = xform(px, py, rot)
            out[num] = (round(x + dx, 4), round(y + dy, 4), pin_dir(ang, rot), name, hidden)
        return out

    def _field_positions(self, sym, at, rot, body):
        """Reference/Value placement: beside two-pin parts, library positions for ICs."""
        x, y = at
        pins = symbol_pins(sym)
        if len(pins) <= 2:
            vertical = abs(body[3] - body[1]) > abs(body[2] - body[0])
            if vertical:
                # Centred text beside the body: immune to KiCad's justification flip.
                w = max(len(self._pending_ref), len(self._pending_val)) * TEXT_W
                cx = round(body[2] + 0.8 + w / 2, 2)
                return (cx, y - 1.27), (cx, y + 1.27), None
            return (x, body[1] - 1.0), (x, body[3] + 2.3), None
        res = []
        for key in ("Reference", "Value"):
            p = next(p for p in find_all(sym, "property") if p[1] == key)
            px, py = float(find(p, "at")[1]), float(find(p, "at")[2])
            if rot == 0:
                res.append((round(x + px, 3), round(y - py, 3)))
            else:
                res.append(None)
        if rot == 0:
            eff = find(next(p for p in find_all(sym, "property") if p[1] == "Reference"), "effects")
            j = find(eff, "justify")
            just = " ".join(str(t) for t in j[1:]) if j else None
            return res[0], res[1], just
        # Rotated multi-pin part: put both fields above the body, centred.
        return (x, body[1] - 3.3), (x, body[1] - 1.0), None

    def power(self, sym, net, at, rot=0):
        """Place a power symbol at `at`, rotated so its body points away from the wire."""
        self.pwr_count += 1
        ref = f"#PWR{self.pwr_count:03d}"
        lib_id = self.add_lib(sym)
        is_gnd = net == "GND"
        d = xform(0, -1 if is_gnd else 1, rot)          # direction the body extends
        body_len = 2.54
        px, py = -d[1], d[0]                             # perpendicular
        half = 1.27 if is_gnd else 0.8                   # GND bar vs. supply arrow width
        a = (at[0] - px * half, at[1] - py * half)
        b = (at[0] + d[0] * body_len + px * half, at[1] + d[1] * body_len + py * half)
        self.box(ref, "power", (a[0], a[1], b[0], b[1]))
        w = TEXT_W * len(net)
        if abs(d[0]) > 0.5:                              # horizontal: text beyond the tip
            val_pos = (round(at[0] + d[0] * (body_len + 0.8 + w / 2), 3), at[1])
        else:
            val_pos = (at[0], round(at[1] + d[1] * (body_len + 1.4), 3))
        self.box(ref, "field", text_box(net, val_pos, 1.27, 0, None))
        fangle = 90 if rot in (90, 270) else 0
        inst = [Sym("symbol"), [Sym("lib_id"), lib_id], [Sym("at"), at[0], at[1], rot], [Sym("unit"), 1],
                [Sym("in_bom"), Sym("yes")], [Sym("on_board"), Sym("yes")], [Sym("dnp"), Sym("no")],
                [Sym("uuid"), uid("pwr/" + ref)],
                [Sym("property"), "Reference", ref, [Sym("at"), at[0], at[1], fangle], effects(hide=True)],
                [Sym("property"), "Value", net, [Sym("at"), val_pos[0], val_pos[1], fangle], effects()],
                [Sym("property"), "Footprint", "", [Sym("at"), at[0], at[1], 0], effects(hide=True)],
                [Sym("property"), "Datasheet", "", [Sym("at"), at[0], at[1], 0], effects(hide=True)],
                [Sym("pin"), "1", [Sym("uuid"), uid(f"pin/{ref}/1")]],
                [Sym("instances"), [Sym("project"), "trinketcore",
                 [Sym("path"), "/" + self.root, [Sym("reference"), ref], [Sym("unit"), 1]]]]]
        self.items.append(inst)
        return ref

    def pwr_flag(self, sym, at):
        self.flg_count += 1
        ref = f"#FLG{self.flg_count:02d}"
        lib_id = self.add_lib(sym)
        inst = [Sym("symbol"), [Sym("lib_id"), lib_id], [Sym("at"), at[0], at[1], 0], [Sym("unit"), 1],
                [Sym("in_bom"), Sym("yes")], [Sym("on_board"), Sym("yes")], [Sym("dnp"), Sym("no")],
                [Sym("uuid"), uid("flg/" + ref)],
                [Sym("property"), "Reference", ref, [Sym("at"), at[0], at[1] - 1.905, 0], effects(hide=True)],
                [Sym("property"), "Value", "PWR_FLAG", [Sym("at"), at[0], at[1] - 3.81, 0], effects()],
                [Sym("property"), "Footprint", "", [Sym("at"), at[0], at[1], 0], effects(hide=True)],
                [Sym("property"), "Datasheet", "~", [Sym("at"), at[0], at[1], 0], effects(hide=True)],
                [Sym("pin"), "1", [Sym("uuid"), uid(f"pin/{ref}/1")]],
                [Sym("instances"), [Sym("project"), "trinketcore",
                 [Sym("path"), "/" + self.root, [Sym("reference"), ref], [Sym("unit"), 1]]]]]
        self.items.append(inst)

    # -- output ------------------------------------------------------------
    def write(self, path, title_block=None):
        tb = [Sym("title_block"), [Sym("title"), self.title]]
        for k, v in (title_block or {}).items():
            if k.startswith("comment"):
                tb.append([Sym("comment"), int(k[7:]), v])
            else:
                tb.append([Sym(k), v])
        doc = [Sym("kicad_sch"), [Sym("version"), Sym("20230121")], [Sym("generator"), Sym("eeschema")],
               [Sym("uuid"), self.root], [Sym("paper"), self.paper], tb,
               [Sym("lib_symbols")] + list(self.lib.values())] + self.items + \
              [[Sym("sheet_instances"), [Sym("path"), "/", [Sym("page"), "1"]]]]
        with open(path, "w") as f:
            f.write(dump(doc) + "\n")
