"""Build CapCore.kicad_sym: every symbol the schematic uses, in KiCad 7 format.

Generic parts are copied from the stock KiCad libraries (derived symbols are
flattened so the file stands on its own). The four ICs without a KiCad 7
symbol are drawn here from the pin tables in the current official KiCad
library, which were checked against the TI/NXP datasheets.
"""

import copy
import os

from sexpr import Sym, dump, find, find_all, parse

KICAD_SYMBOLS = "/usr/share/kicad/symbols"
HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, "..", "CapCore.kicad_sym")

_lib_cache = {}


def _lib(name):
    if name not in _lib_cache:
        with open(os.path.join(KICAD_SYMBOLS, name + ".kicad_sym")) as f:
            _lib_cache[name] = parse(f.read())
    return _lib_cache[name]


def _get(lib, name):
    for s in find_all(_lib(lib), "symbol"):
        if s[1] == name:
            return copy.deepcopy(s)
    raise KeyError(f"{lib}:{name}")


def rename(sym, new):
    old = sym[1]
    sym[1] = new
    for sub in find_all(sym, "symbol"):
        if sub[1].startswith(old + "_"):
            sub[1] = new + sub[1][len(old):]
    return sym


def set_prop(sym, key, value):
    for p in find_all(sym, "property"):
        if p[1] == key:
            p[2] = value
            return sym
    hidden = [Sym("effects"), [Sym("font"), [Sym("size"), 1.27, 1.27]], Sym("hide")]
    idx = max(i for i, c in enumerate(sym) if isinstance(c, list) and c[0] == "property") + 1
    sym.insert(idx, [Sym("property"), key, value, [Sym("at"), 0, 0, 0], hidden])
    return sym


def stock(lib, name, new_name=None, **props):
    """Copy a stock symbol, flattening `extends`, optionally renaming it."""
    sym = _get(lib, name)
    ext = find(sym, "extends")
    if ext:
        parent = rename(_get(lib, ext[1]), name)
        # Keep the parent's body, take the child's properties.
        body = [c for c in parent if not (isinstance(c, list) and c[0] == "property")]
        child_props = find_all(sym, "property")
        head = body[:2]
        flags = [c for c in body[2:] if not (isinstance(c, list) and c[0] == "symbol")]
        units = find_all(body, "symbol")
        sym = head + flags + child_props + units
    if new_name:
        rename(sym, new_name)
    for k, v in props.items():
        set_prop(sym, k.replace("_", " ") if k != "ki_description" else k, v)
    return sym


def _effects(hide=False, justify=None):
    e = [Sym("effects"), [Sym("font"), [Sym("size"), 1.27, 1.27]]]
    if justify:
        e.append([Sym("justify"), Sym(justify)])
    if hide:
        e.append(Sym("hide"))
    return e


def _prop(key, value, x=0.0, y=0.0, hide=False, justify=None):
    return [Sym("property"), key, value, [Sym("at"), x, y, 0], _effects(hide, justify)]


def ic(name, value, footprint, datasheet, desc, width, height, pins, ref="U"):
    """Draw a rectangular IC.

    pins: list of (number, name, etype, side, offset, hidden) where side is
    L/R/T/B and offset is the position along that side (mm, 2.54 grid).
    """
    w2, h2 = width / 2, height / 2
    # Keep the reference/value text clear of any pins on the top edge.
    text_y = h2 + (3.81 if any(p[3] == "T" for p in pins) else 1.27)
    sym = [Sym("symbol"), name, [Sym("pin_names"), [Sym("offset"), 1.016]],
           [Sym("in_bom"), Sym("yes")], [Sym("on_board"), Sym("yes")],
           _prop("Reference", ref, -w2, text_y, justify="left"),
           _prop("Value", value, w2, text_y, justify="right"),
           _prop("Footprint", footprint, 0, -h2 - 3.81, hide=True),
           _prop("Datasheet", datasheet, 0, 0, hide=True),
           _prop("ki_description", desc, 0, 0, hide=True)]
    body = [Sym("symbol"), name + "_0_1",
            [Sym("rectangle"), [Sym("start"), -w2, h2], [Sym("end"), w2, -h2],
             [Sym("stroke"), [Sym("width"), 0.254], [Sym("type"), Sym("default")]],
             [Sym("fill"), [Sym("type"), Sym("background")]]]]
    unit = [Sym("symbol"), name + "_1_1"]
    for num, pname, etype, side, off, hidden in pins:
        if side == "L":
            at = [-w2 - 2.54, off, 0]
        elif side == "R":
            at = [w2 + 2.54, off, 180]
        elif side == "T":
            at = [off, h2 + 2.54, 270]
        else:
            at = [off, -h2 - 2.54, 90]
        pin = [Sym("pin"), Sym(etype), Sym("line"), [Sym("at")] + at, [Sym("length"), 2.54]]
        if hidden:
            pin.append(Sym("hide"))
        pin += [[Sym("name"), pname, _effects()], [Sym("number"), num, _effects()]]
        unit.append(pin)
    sym += [body, unit]
    return sym


def power(name, style):
    """Global power symbol whose net name is `name`."""
    if style == "gnd":
        sym = stock("power", "GND", name)
    else:
        sym = stock("power", "+3V3", name)
    set_prop(sym, "Value", name)
    set_prop(sym, "ki_description", f'Power symbol creates a global label with name "{name}"')
    for unit in find_all(sym, "symbol"):
        for pin in find_all(unit, "pin"):
            find(pin, "name")[1] = name
    return sym


def build():
    syms = [
        stock("Device", "R"),
        stock("Device", "C"),
        stock("Device", "L"),
        stock("Device", "LED"),
        stock("Device", "Crystal"),
        stock("Device", "C_Polarized", "Supercap", Reference="BT",
              ki_description="Lithium-ion capacitor or supercapacitor (user supplied)"),
        stock("Transistor_FET", "AO3400A"),
        stock("Transistor_FET", "AO3401A"),
        stock("Diode", "1N4148WS"),
        stock("Power_Protection", "USBLC6-2SC6"),
        stock("Connector", "USB_C_Receptacle_USB2.0_16P"),
        stock("Connector", "TestPoint"),
        stock("Connector_Generic", "Conn_01x08"),
        stock("Switch", "SW_Push_Dual"),
        stock("Jumper", "SolderJumper_2_Bridged"),
        stock("Jumper", "SolderJumper_2_Open"),
        stock("Timer_RTC", "PCF8563T"),
        stock("Power_Supervisor", "TPS3808DBV", "TPS3808G01DBV"),
        stock("power", "PWR_FLAG"),
        power("GND", "gnd"),
        power("VBUS", "up"),
        power("VCAP", "up"),
        power("VAON", "up"),
        power("VSYS", "up"),
        power("3V3", "up"),
        # Pin tables from the official KiCad library (BQ25173DSG.kicad_sym,
        # TPS63030DSK.kicad_sym), which match TI datasheets SLUSEH3 / SLVS696.
        ic("BQ25173DSG", "BQ25173DSG", "Package_SON:WSON-8-1EP_2x2mm_P0.5mm_EP0.9x1.6mm_ThermalVias",
           "https://www.ti.com/lit/ds/symlink/bq25173.pdf",
           "800 mA linear charger for 1-4 cell supercapacitors, VFB = 0.8 V, ICHG = 300 V / RISET",
           17.78, 17.78, [
               ("1", "IN", "power_in", "L", 5.08, False),
               ("8", "OUT", "power_out", "R", 5.08, False),
               ("7", "FB", "input", "R", 2.54, False),
               ("5", "STAT", "open_collector", "R", 0, False),
               ("6", "~{PG}", "open_collector", "R", -2.54, False),
               ("2", "ISET", "input", "B", -5.08, False),
               ("3", "~{CE}", "input", "B", 0, False),
               ("4", "GND", "power_in", "B", 5.08, False),
               ("9", "EP", "passive", "B", 5.08, True),
           ]),
        ic("TPS63031DSK", "TPS63031DSK", "Package_SON:WSON-10-1EP_2.5x2.5mm_P0.5mm_EP1.2x2mm_ThermalVias",
           "https://www.ti.com/lit/ds/symlink/tps63031.pdf",
           "Buck-boost converter, 1.8-5.5 V in, fixed 3.3 V out, 1 A switches",
           20.32, 20.32, [
               ("5", "VIN", "power_in", "L", 5.08, False),
               ("8", "VINA", "power_in", "L", 2.54, False),
               ("6", "EN", "input", "L", -2.54, False),
               ("7", "PS/SYNC", "input", "L", -5.08, False),
               ("4", "L1", "passive", "T", -3.81, False),
               ("2", "L2", "passive", "T", 3.81, False),
               ("1", "VOUT", "power_out", "R", 5.08, False),
               ("10", "FB", "input", "R", 2.54, False),
               ("9", "GND", "power_in", "B", 0, False),
               ("3", "PGND", "power_in", "B", 5.08, False),
               ("11", "EP", "passive", "B", 5.08, True),
           ]),
    ]
    for s in syms:
        if s[1] == "PCF8563T":
            set_prop(s, "Datasheet", "https://www.nxp.com/docs/en/data-sheet/PCF8563.pdf")
        if s[1] == "TPS3808G01DBV":
            set_prop(s, "Value", "TPS3808G01DBV")
            set_prop(s, "ki_description", "Adjustable supervisor, SENSE threshold 0.405 V, open-drain RESET")
    return syms


def write(path=OUT):
    lib = [Sym("kicad_symbol_lib"), [Sym("version"), Sym("20220914")],
           [Sym("generator"), Sym("capcore_gen")]] + build()
    with open(path, "w") as f:
        f.write(dump(lib) + "\n")
    return path


def symbols_by_name():
    return {s[1]: s for s in build()}


if __name__ == "__main__":
    print("wrote", write())
