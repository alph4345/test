# CapCore: supercapacitor power module

CapCore is a 21 × 48 mm board that does the power side of a small gadget, with
a supercapacitor where a LiPo would normally go. Plug in USB-C and it charges
the capacitor. Press the button and it turns your circuit on and feeds it a
steady 3.3 V. When the capacitor is empty it turns everything off and stays
off until USB comes back.

| Top | Bottom |
|---|---|
| ![CapCore top](../../docs/images/capcore-front.png) | ![CapCore bottom](../../docs/images/capcore-back.png) |

*Renders of the actual Gerber layers. The capacitor is not shown; it solders into the pads at the bottom left.*

## What it does

| | |
|---|---|
| Input | USB-C, 5 V (5.1 kΩ CC pull-downs, so any USB-C charger works), ESD-protected (USBLC6-2SC6) |
| Charger | TI BQ25173: 300 mA constant current, then constant voltage. Red LED on while charging |
| Capacitor | **LIC build:** 3.8 V lithium-ion capacitor, charged to 3.71 V. **EDLC build:** 2.7 V supercapacitor, charged to 2.62 V |
| Cut-off | TI TPS3808: disconnects the capacitor at **2.61 V** (LIC) / **1.96 V** (EDLC) and latches off until USB returns |
| Ship mode | Firmware can disconnect the capacitor completely (for storage or shipping). Only USB wakes it |
| Output | 3.3 V from a TI TPS63031 buck-boost: stays at 3.3 V whether the capacitor is above or below 3.3 V. About 500 mA available near the cut-off, more when full |
| Power button | Press to turn on; firmware keeps power with `HOLD` and drops it to turn off |
| Wake-up clock | NXP PCF8563 real-time clock on I²C (address 0x51). Its alarm or timer can turn the gadget on, e.g. for an e-ink update once an hour |
| Monitoring | `VSENSE` = capacitor voltage ÷ 2 for your ADC; `CHG` low while charging |
| USB data | D+/D− from the USB-C port go to the header, so one port can charge *and* program/talk to your microcontroller |
| Standby drain | ~5 µA when off with the clock running; only leakage after a cut-off or in ship mode |
| Board | 4 layers, 21 × 48 mm, all parts on top, two 8-pin 0.1″ headers 0.7″ apart (breadboard-friendly, like a Raspberry Pi Pico) |

Two build variants share one PCB and differ only in two resistors:

| Variant | For | R4 | R13 | Charges to | Cuts off at |
|---|---|---|---|---|---|
| **LIC** (default) | 3.8 V lithium-ion capacitors (Eaton HS series etc.) | 120 k | 330 k | 3.71 V | 2.61 V |
| **EDLC** | ordinary 2.7 V supercapacitors | 75 k | 470 k | 2.62 V | 1.96 V |

> **Never fit a 2.7 V supercapacitor to a board built with the LIC values.** It
> would be charged to 3.71 V, well past its rating, and can vent. Tick the
> variant box on the back of the board when it arrives, and measure the charge
> voltage before fitting the capacitor (see [Bring-up](#bring-up)).

## Pinout

Pin 1 of both headers is at the USB-C end. The names are printed on the back.

| Pin | Left header (J2) | Direction | Right header (J3) | Direction |
|---|---|---|---|---|
| 1 | **VBUS**: 5 V from USB (silk: 5V) | out* | **D+** from USB-C | ↔ |
| 2 | **GND** | | **D−** from USB-C | ↔ |
| 3 | **3V3**: regulated output | out | **SDA**: RTC, 4.7 k pull-up to 3V3 | ↔ |
| 4 | **HOLD**: drive high to stay on | in | **SCL**: RTC, 4.7 k pull-up to 3V3 | in |
| 5 | **WAKE**: pull low to turn on | in | **VSENSE**: capacitor voltage ÷ 2 (only while on) | out |
| 6 | **BTN**: reads low while the button is pressed | out, needs pull-up | **CHG**: low while charging | out, needs pull-up |
| 7 | **SHIP**: pulse high for ship mode | in | **3V3**: regulated output | out |
| 8 | **GND** | | **GND** | |

\* VBUS can also be used as a 5 V *input* instead of the USB-C port. Never
connect both at once.

Directions are from CapCore's point of view: *in* means your microcontroller
drives it. `BTN` and `CHG` are read through diodes, so enable the internal
pull-up on those microcontroller pins. Their "low" is the diode drop (about
0.5 V), which any 3.3 V microcontroller reads as low.

## How it works

```
USB-C ──ESD──┬── BQ25173 charger ── VCAP ─┬─ capacitor (BT1)
             │                            │
             │               Q1 master switch (off below the cut-off, or in ship mode)
             │                            │
             │                          VAON ── supervisor, RTC, wake logic (always on, ~5 µA)
             │                            │
             │               Q5 load switch (on while EN_SYS is high)
             │                            │
             │                          VSYS ── TPS63031 buck-boost ── 3V3 ── your circuit
             │                            └──── VSENSE (÷2)
             └── Q2: USB turns Q1 back on after a cut-off
```

* **Master switch (Q1).** The capacitor only reaches the rest of the board
  through Q1. The supervisor (U3, TPS3808) keeps Q1 on while the capacitor is
  above the cut-off. Below it, Q1 opens. The supervisor then loses power too,
  so Q1 stays open: the capacitor sees only leakage and cannot be
  over-discharged. Plugging in USB turns Q1 on again (Q2). Once the capacitor
  has charged back above the cut-off, the supervisor takes over.
* **Load switch (Q5).** Your circuit is powered while `EN_SYS` is high. It
  goes high from the **button** (SW1), the **RTC alarm or timer**, the
  **WAKE** pin, **USB** (jumper JP1, bridged by default), **HOLD** from your
  firmware, or permanently if **JP2** is bridged. C8 keeps `EN_SYS` up for
  about 1–2 s after a button press so your firmware can raise `HOLD`.
* **Supervisor gate (Q8).** Q6 turns the load switch on only through Q8, and
  Q8 is driven by the supervisor. Below the cut-off nothing can turn the
  gadget on, not even USB. The charger then gets the capacitor back up before
  your circuit starts drawing from it.
* **Charger.** The BQ25173 regulates the capacitor to
  0.8 V × (1 + R4/R5). R5 returns to the charger's /PG pin, so the divider
  draws nothing when USB is unplugged. Charge current is 300 V / R3
  (1 kΩ → 300 mA). A smaller R3 charges faster, up to 800 mA, but the charger
  gets hot and throttles itself.

### Jumpers

| Jumper | Default | Change it to… |
|---|---|---|
| **JP1 USB-ON** | bridged | **cut** it if plugging in USB should only charge, not switch the gadget on |
| **JP2 ALWAYS-ON** | open | **bridge** it for gadgets without a power button (jewelry, badges): they run whenever the capacitor is above the cut-off |

### Power states

| State | What is on | Drain from the capacitor | Leaves the state when… |
|---|---|---|---|
| Running | everything | your load ÷ ~85 % efficiency | `HOLD` goes low and nothing else holds `EN_SYS` |
| Off | supervisor, RTC | ~5 µA | button, RTC alarm/timer, `WAKE`, USB (JP1) |
| Cut-off | nothing | leakage (< 1 µA) | USB is plugged in |
| Ship mode | nothing | leakage (< 1 µA) | USB is plugged in |

## Firmware rules

See [`firmware/`](../../firmware) for Arduino and MicroPython examples. The essentials:

1. **Raise `HOLD` as the very first thing at boot.** C8 only keeps power up for about 1 s (EDLC) to 2 s (LIC) after a button tap.
2. **Clear the RTC flags early.** The RTC's interrupt holds the gadget on (and makes `BTN` read low) until you clear its alarm/timer flag (write 0 to register 0x01). Also write 0 to register 0x0D to turn off the RTC's clock output; that saves about 1 µA.
3. **To turn off:** wait for the button to be released, then drive `HOLD` low. Power drops within ~0.5 s. It can't turn off while USB is plugged in with JP1 bridged, or with JP2 bridged.
4. **To sleep until later:** set a PCF8563 alarm or countdown timer with its interrupt enabled, then drop `HOLD`.
5. **Watch `VSENSE`:** capacitor voltage ≈ 2 × VSENSE. Save your state and power off yourself a little above the cut-off (e.g. at 2.75 V on an LIC); the hardware cut-off is abrupt.
6. **Ship mode:** drive `SHIP` high. Everything switches off, and only USB brings it back. Use it before storing or posting a charged gadget.

## Connecting a microcontroller

Wire `3V3` and `GND` to your board's 3.3 V rail, **bypassing its own regulator**:

* **Raspberry Pi Pico / Pico W:** CapCore 3V3 → Pico 3V3 (pin 36), and tie
  Pico **3V3_EN (pin 37) to GND** to switch off the Pico's own regulator. The
  Pico's USB port still works for programming. CapCore's D+/D− can only reach
  the RP2040 through the Pico's test pads (TP2/TP3).
* **Adafruit Feather (and similar):** CapCore 3V3 → Feather 3V pin, Feather **EN to GND**.
* **Bare chips / your own board** (RP2040, ATtiny, nRF52, ESP32-C3 modules…):
  run them straight from 3V3, and wire D+/D− to the chip's USB pins if it has them.
* **Seeed XIAO and other boards without a regulator-enable pin:** check the
  board's documentation before feeding 3.3 V into its 3V3 pin.

Then wire `HOLD`, `BTN`, `CHG` and `SHIP` to spare GPIOs, `VSENSE` to an ADC
pin, and `SDA`/`SCL` to I²C. Radios with big current peaks (ESP32 Wi-Fi,
~350–500 mA) need a large, low-ESR capacitor. Bluetooth LE parts like the
nRF52 are a much better match.

## Fitting the capacitor

BT1 takes radial through-hole capacitors with a **5.0 mm** (10–12.5 mm cans)
or **3.5 mm** (8 mm cans) lead pitch. **The square pads are +.** Cans with a
7.5 mm pitch (16 mm diameter) need their leads bent in, or short wires. The can
can stand upright, lie flat over the board (the sleeve is insulated; add a
strip of Kapton tape to be safe), or be folded flat past the bottom edge. See
[choosing a capacitor](../../docs/choosing-a-capacitor.md) for sizes and part
numbers.

## Ordering from JLCPCB

Everything needed is in [`fab/`](fab):

| File | What it is |
|---|---|
| `capcore-gerbers.zip` | Gerbers + drill files; upload this |
| `jlcpcb-bom-lic.csv` / `jlcpcb-bom-edlc.csv` | assembly BOM for the variant you want (they differ in R4 and R13 only) |
| `jlcpcb-cpl.csv` | pick-and-place positions (same for both variants) |
| `parts-list.csv` | every part, including the ones you fit yourself |
| `capcore-assembly-top.pdf` | assembly drawing |

1. Upload `capcore-gerbers.zip`. The site should detect 4 layers and
   21 × 48 mm. Keep 1.6 mm thickness. Any colour works. For
   *Remove Order Number* choose *Specify a location*: there is a
   `JLCJLCJLCJLC` placeholder on the back.
2. Turn on **PCB Assembly** (top side). Upload the BOM for your variant and `jlcpcb-cpl.csv`.
3. On the parts page every line should match its LCSC number. About seven
   are *Extended* parts (usually the USB-C socket, inductor, button, USBLC6,
   BQ25173, TPS3808 and TPS63031), each with a small one-time setup fee.
4. **Check the placement preview before paying.** The positions come straight
   from KiCad. Confirm that every IC's pin-1 dot sits on the pin-1 corner of its
   footprint (U1–U5), the transistors (Q1–Q8) and diodes (D1–D4, cathode bar)
   match the silkscreen, and the USB-C socket opens towards the board edge.
   Rotate any part that is off in the web viewer.
5. BT1 (the capacitor), J2/J3 (headers) and the solder jumpers are not in the
   BOM; you fit them yourself.

Prices change often, so trust the live quote. As a rough guide, five
assembled boards come to something like US$50–80 before shipping. Most of that
is fixed setup, stencil and extended-part fees, so 10–20 boards cost little
more in total.

## Bring-up

Do this **before** fitting the capacitor:

1. Plug in USB-C. The red LED may glow or flicker (there is nothing to charge).
2. Measure between the BT1 pads (square = +): about **3.7 V** means the LIC
   build and about **2.6 V** the EDLC build. If it reads 3.7 V, do not fit a
   2.7 V supercapacitor.
3. With JP1 bridged (the default), `3V3` should appear on the header a moment
   after USB is plugged in.

Then unplug USB and solder the capacitor, **square pad = +**. Plug USB back in
and let it charge; the LED turns off when it is full. Unplug USB and press the
button: 3V3 should appear for ~1–2 s and then drop, because nothing is holding
`HOLD` high yet. A new capacitor that arrives below the cut-off voltage keeps
the gadget off until it has charged past the cut-off. That is intended.

## Design files

| File | |
|---|---|
| `capcore.kicad_pro/.kicad_sch/.kicad_pcb` | KiCad 7 project; opens in KiCad 7 or newer |
| `capcore-schematic.pdf` | schematic as a PDF |
| `CapCore.kicad_sym`, `CapCore.pretty/` | project symbol and footprint libraries |
| `capcore.ses` | autorouter result that `route_pcb.py` rebuilds the board from |
| `scripts/` | the generators, below |

The design is generated from code, so the schematic and PCB can't drift apart:

```
scripts/netlist.py        single source of truth: parts, values, LCSC numbers, nets
scripts/gen_symbols.py    symbol library (CapCore.kicad_sym)
scripts/gen_schematic.py  schematic; then check_netlist.py proves it matches netlist.py
scripts/gen_pcb.py        outline, stack-up rules, placement, silkscreen
scripts/preroute.py       hand-planned copper: USB-C escape, buck-boost loop, ground vias
scripts/route_pcb.py      Freerouting + grid-router finish, ground pours, DRC
scripts/export_fab.py     Gerbers, drill, BOM/CPL, PDFs
scripts/render.py         the board images above
```

To change something, edit `netlist.py` (and the layout dictionaries if you
add parts), then run:

```
cd hardware/capcore/scripts
python3 gen_schematic.py && python3 check_netlist.py
python3 check_place.py
FREEROUTING_JAR=/path/to/freerouting-1.9.0.jar python3 route_pcb.py --autoroute
python3 check_netlist.py --pcb && python3 export_fab.py && python3 render.py
```

This needs KiCad 7's Python module (`pcbnew`) and `kicad-cli`, plus
`pip install shapely cairosvg pillow`. Autorouting also needs Java and
[Freerouting](https://github.com/freerouting/freerouting) 1.9.0 (run under
`xvfb-run` on a headless machine). Without `--autoroute` the board is rebuilt
from the committed `capcore.ses`.

**Verification status:** the schematic and PCB are checked pin-for-pin against
`netlist.py` (203 pins). KiCad DRC reports no errors and no unconnected items,
only three warnings: the headers and the USB-C footprint differ from the
library copies because their silkscreen was trimmed at the board edge. The
board has **not been built and tested yet**. Treat the first order as a
prototype run and follow the bring-up steps.
