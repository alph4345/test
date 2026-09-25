# Supercapacitor-powered gadgets

Small games, e-ink displays, blinky jewellery and music toys that charge from
USB-C in minutes and run from a **supercapacitor instead of a LiPo**. The
idea comes from the
[rechargeable supercapacitor Fibonacci earrings](https://lectronz.com/products/rechargeable-supercapacitor-fibonacci-earrings-2).

This repository has:

* **[CapCore](hardware/capcore)**: an open, ready-to-order 21 × 48 mm power
  module (KiCad 7). It has a USB-C charger, capacitor protection, a power
  button, a wake-up clock and a 3.3 V output for your microcontroller.
  Gerbers and JLCPCB assembly files are included.
* **[Energy budget](docs/energy-budget.md)**: how long a capacitor actually
  runs each kind of gadget, plus a [calculator](tools/energy_calc.py).
* **[Choosing a capacitor](docs/choosing-a-capacitor.md)**: lithium-ion
  capacitors vs. ordinary supercapacitors, part numbers, safety rules.
* **[Buy or build?](docs/buy-or-build.md)**: sourcing options and costs.
* **[Firmware examples](firmware)**: Arduino and MicroPython code for power
  button, sleep/wake, capacitor gauge and shutdown.

| CapCore top | CapCore bottom |
|---|---|
| ![top](docs/images/capcore-front.png) | ![bottom](docs/images/capcore-back.png) |

## The short answer

* **Capacitors are safe and fast but small.** A 3.8 V lithium-ion capacitor
  (LIC) the size of your fingertip stores ~30 mWh, about a tenth of a
  tiny 100 mAh LiPo. The largest common one (16 × 25 mm) stores ~210 mWh. In
  exchange it charges in minutes, lasts tens of thousands of cycles, and is
  far less of a fire risk. Plain 2.7 V supercapacitors (EDLCs) are essentially
  inert but hold about a tenth as much again for the same size.
* **What that runs, per charge** (with a 120 F LIC, 12.5 × 25 mm):
  LED jewellery ~1.5 days · e-ink display updated hourly ~6 weeks ·
  OLED handheld game ~50 min · MP3 player on a speaker ~15 min.
  E-ink and jewellery are great fits, games work for short sessions, music
  players are a stretch. [Details](docs/energy-budget.md).
* **The electronics matter.** LICs must never go below 2.2 V or above 3.8 V,
  and LiPo chargers (4.2 V) would destroy them. CapCore handles that: it
  charges to 3.71 V, disconnects at 2.61 V and stays off until USB returns.
  Build it for ordinary supercapacitors instead by changing two resistors.

## Quick start

1. Pick a capacitor: [choosing a capacitor](docs/choosing-a-capacitor.md).
2. Order CapCore assembled from JLCPCB with the files in
   [`hardware/capcore/fab`](hardware/capcore/fab): see
   [ordering](hardware/capcore/README.md#ordering-from-jlcpcb).
3. Solder on the capacitor and headers, run the
   [bring-up checks](hardware/capcore/README.md#bring-up), and wire it to your
   microcontroller ([Pico, Feather, bare chips](hardware/capcore/README.md#connecting-a-microcontroller)).
4. Start from the [firmware examples](firmware).

## Status

The design is complete and machine-checked: the schematic and PCB match the
netlist pin for pin, and KiCad DRC is clean apart from three cosmetic
footprint warnings. **The boards have not been manufactured and tested yet.**
Order a small first batch and follow the bring-up steps before building
anything you depend on.

## Repository layout

```
docs/                 guides and board renders
firmware/             Arduino + MicroPython examples
hardware/capcore/     KiCad project, fab outputs, generator scripts
tools/energy_calc.py  runtime calculator
```

No license file yet. Pick one before sharing the design: for example
CERN-OHL-P-2.0 for the hardware and MIT for the code.
