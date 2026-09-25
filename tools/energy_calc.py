#!/usr/bin/env python3
"""Supercapacitor runtime calculator for CapCore-powered gadgets.

Usable energy in a capacitor is not 1/2*C*V^2 -- the power path stops
drawing at the under-voltage cut-off, so only the band between the charge
voltage and the cut-off is usable:

    E_usable = 1/2 * C * (V_charge^2 - V_cutoff^2)

Everything the load draws also passes through the 3.3 V buck-boost
converter, so runtime = E_usable * efficiency / P_load.

Examples:
    python3 tools/energy_calc.py                      # table of all presets
    python3 tools/energy_calc.py --cap lic:120        # one capacitor, all loads
    python3 tools/energy_calc.py --cap edlc:25 --load game-oled
    python3 tools/energy_calc.py --cap lic:30 --active-ma 40 --active-s 3 --per-day 24
"""

import argparse
import math

# CapCore thresholds (see hardware/capcore/README.md). The LIC build charges
# to 3.71 V and cuts off at 2.61 V; the EDLC build charges to 2.62 V and cuts
# off at 1.96 V.
CHEMISTRY = {
    "lic": {"v_charge": 3.71, "v_cutoff": 2.61, "label": "3.8 V lithium-ion capacitor (LIC)"},
    "edlc": {"v_charge": 2.62, "v_cutoff": 1.96, "label": "2.7 V supercapacitor (EDLC)"},
}

EFFICIENCY = 0.85          # TPS63031 buck-boost, typical at 5-300 mA
STANDBY_UA = 5.0           # CapCore "off" current: supervisor + RTC + leakage
V_RAIL = 3.3

# Loads are (description, continuous mA at 3.3 V) or, for duty-cycled
# devices, (description, mA while awake, seconds awake per event, events/day).
LOADS = {
    "led-jewelry": ("LED earrings: ATtiny + charlieplexed LEDs (~0.8 mA avg)", 0.8),
    "eink-daily": ("E-ink badge, RP2040, 1 full refresh per day", (30.0, 3.0, 1)),
    "eink-hourly": ("E-ink dashboard, RP2040, 1 full refresh per hour", (30.0, 3.0, 24)),
    "eink-nrf-hourly": ("E-ink, nRF52 + partial refresh, hourly", (8.0, 2.0, 24)),
    "game-memlcd": ("Handheld game: Sharp memory LCD + low-power MCU", 12.0),
    "game-oled": ("Handheld game: 0.96in OLED + RP2040", 35.0),
    "game-tft": ("Handheld game: 1.3in color TFT + backlight + RP2040", 50.0),
    "music-chiptune": ("Chiptune synth on a small speaker, low-power MCU", 15.0),
    "music-headphones": ("MP3 from microSD to headphones (RP2040 + I2S DAC)", 70.0),
    "music-speaker": ("MP3 to a small speaker (RP2040 + MAX98357A, moderate volume)", 120.0),
}

# Common capacitor sizes: (chemistry, farads, part hint)
PRESET_CAPS = [
    ("lic", 10, "Eaton HS0814-3R8106-R, 8x14 mm (high ESR, <100 mA loads)"),
    ("lic", 30, "Eaton HS1016-3R8306-R, 10x16 mm"),
    ("lic", 50, "Eaton HS1020-3R8506-R, 10x20 mm"),
    ("lic", 120, "Eaton HS1225-3R8127-R, 12.5x25 mm"),
    ("lic", 220, "Eaton HS1625-3R8227-R, 16x25 mm"),
    ("edlc", 10, "generic 2.7 V 10 F, 10x20 mm"),
    ("edlc", 100, "generic 2.7 V 100 F, 22x45 mm"),
]


def usable_joules(chem, farads):
    c = CHEMISTRY[chem]
    return 0.5 * farads * (c["v_charge"] ** 2 - c["v_cutoff"] ** 2)


def charge_minutes(chem, farads, charge_ma=300.0):
    """Constant-current phase only; add ~20 % for the constant-voltage tail."""
    c = CHEMISTRY[chem]
    coulombs = farads * (c["v_charge"] - c["v_cutoff"])
    return coulombs / (charge_ma / 1000.0) / 60.0


def fmt_duration(seconds):
    if seconds == math.inf:
        return "forever"
    if seconds < 90:
        return f"{seconds:.0f} s"
    if seconds < 90 * 60:
        return f"{seconds / 60:.0f} min"
    if seconds < 48 * 3600:
        return f"{seconds / 3600:.1f} h"
    return f"{seconds / 86400:.0f} days"


def runtime(chem, farads, load):
    """Return a human-readable runtime for one load on one capacitor."""
    joules = usable_joules(chem, farads) * EFFICIENCY
    standby_w = STANDBY_UA * 1e-6 * CHEMISTRY[chem]["v_cutoff"]
    if isinstance(load, tuple):
        active_ma, active_s, per_day = load
        per_event_j = active_ma / 1000.0 * V_RAIL * active_s
        per_day_j = per_event_j * per_day + standby_w * 86400 * EFFICIENCY
        days = joules / per_day_j
        events = days * per_day
        return f"{fmt_duration(days * 86400)} ({events:.0f} updates)"
    watts = load / 1000.0 * V_RAIL
    return fmt_duration(joules / watts)


def print_table(caps, loads):
    for chem, farads, hint in caps:
        j = usable_joules(chem, farads)
        print(f"\n{farads:g} F {CHEMISTRY[chem]['label']} -- {hint}")
        print(f"  usable energy {j:.0f} J ({j / 3.6:.0f} mWh), "
              f"charge time ~{charge_minutes(chem, farads) * 1.2:.1f} min at 300 mA")
        for key in loads:
            desc, load = LOADS[key]
            print(f"  {runtime(chem, farads, load):>24}  {desc}")


def main():
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--cap", help="chemistry:farads, e.g. lic:120 or edlc:25")
    ap.add_argument("--load", choices=sorted(LOADS), help="one preset load")
    ap.add_argument("--ma", type=float, help="custom continuous load in mA at 3.3 V")
    ap.add_argument("--active-ma", type=float, help="custom duty-cycled load: mA while awake")
    ap.add_argument("--active-s", type=float, default=1.0, help="seconds awake per event")
    ap.add_argument("--per-day", type=float, default=24.0, help="events per day")
    args = ap.parse_args()

    if args.cap:
        chem, farads = args.cap.split(":")
        caps = [(chem.lower(), float(farads), "custom")]
    else:
        caps = PRESET_CAPS

    if args.ma is not None or args.active_ma is not None:
        LOADS["custom"] = ("custom load",
                           args.ma if args.ma is not None
                           else (args.active_ma, args.active_s, args.per_day))
        loads = ["custom"]
    elif args.load:
        loads = [args.load]
    else:
        loads = list(LOADS)

    print(f"Assumes {EFFICIENCY:.0%} converter efficiency and {STANDBY_UA:g} uA standby drain.")
    print_table(caps, loads)


if __name__ == "__main__":
    main()
