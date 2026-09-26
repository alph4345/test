# Buy or build?

You want a board that charges from USB, stores energy in a capacitor
instead of a LiPo, and powers small games, e-ink gadgets and music toys. Here
are your options, cheapest effort first.

## 1. Order TrinketCore from PCBWay (all-in-one, recommended for trinkets)

[`hardware/trinketcore`](../hardware/trinketcore) is a complete gadget board:
two capacitor positions, USB-C charging with charge LEDs, an RP2040 with
16 MB of flash, a display socket, a speaker amplifier, buttons and a wake-up
clock. Upload the Gerber zip, BOM and centroid file to PCBWay and it arrives
assembled. You fit the capacitors, a display module and a speaker.

* **Cost:** roughly US$100–180 for five assembled boards before shipping.
  Most of that is setup and parts; ten boards cost little more in total. Trust
  the live quote.
* **Skill:** soldering two capacitor leads each and a pin socket. Then
  CircuitPython: copy two files to a USB drive.
* **Why:** one board covers the music box, games, pets and charms, so you
  prototype every idea on the same hardware and firmware.

See [ordering from PCBWay](../hardware/trinketcore/README.md#ordering-from-pcbway).

## 2. Order CapCore from JLCPCB (bring your own microcontroller)

This repository contains a complete, ready-to-order design:
[`hardware/capcore`](../hardware/capcore). Upload the Gerber zip, BOM and
placement file, and JLCPCB builds and solders all the small parts. You fit
three things yourself with an ordinary soldering iron: the capacitor and two
pin headers.

* **Cost:** roughly US$50–80 for five assembled boards before shipping; most
  of that is one-time setup fees, so 20 boards cost little more in total.
  Plus a few dollars per capacitor. Prices change, so trust the live quote.
* **Time:** about 1–3 weeks including shipping.
* **Skill:** basic through-hole soldering. The fine-pitch parts (0402
  resistors, 2 × 2 mm chips) really need machine assembly, so don't order bare
  boards unless you have a hot-air station and practice.
* **Why it's worth it:** the 3.8 V lithium-ion capacitors that make these
  gadgets practical need a charger with the right voltage (3.71 V, not a LiPo
  charger's 4.2 V) and a hard cut-off above 2.2 V. Off-the-shelf modules
  rarely do both. CapCore also adds the pieces a gadget needs: power button,
  wake-up timer, 3.3 V regulation and USB data pass-through.

See [`hardware/capcore/README.md`](../hardware/capcore/README.md) for the
ordering steps.

## 3. Off-the-shelf modules

There is no common, cheap, off-the-shelf equivalent for lithium-ion
capacitors. What you will find:

* **Generic "supercapacitor charger / boost" modules** (marketplaces like
  AliExpress and Amazon). They are made for 2.7 V EDLCs and usually lack an
  under-voltage cut-off, a power switch and low standby current. They're
  fine for an EDLC-powered blinky toy. **Do not put a 3.8 V LIC on a module
  unless you know its charge voltage and cut-off.**
* **Energy-harvesting evaluation boards** (for example TI's BQ25570 and
  e-peas' AEM series). They are built to trickle solar energy into
  supercapacitors: excellent parts, but expensive boards, slow to charge from
  USB and not gadget-shaped.
* **LiPo charger/power boards** (Adafruit, SparkFun, most dev boards'
  built-in chargers): **not suitable**. They charge to 4.2 V, which ruins a
  3.8 V LIC.

## 4. Buy the finished jewellery

The [Fibonacci earrings](https://lectronz.com/products/rechargeable-supercapacitor-fibonacci-earrings-2)
that inspired this are a finished product: an ATtiny microcontroller, LEDs
and a 40 F lithium-ion capacitor for many hours per charge. Great as a
reference for what's possible, but not a platform for your own designs.

## 5. Design your own

Everything here is generated from Python scripts
([`hardware/capcore/scripts`](../hardware/capcore/scripts)), so changing the
charge current, cut-off voltage or board shape means editing values and
regenerating. The key parts, if you'd rather start from scratch:

| Job | Part used here | Why |
|---|---|---|
| Charger | TI BQ25173 | 800 mA linear charger whose output voltage is set by two resistors, so it suits supercapacitors |
| Cut-off | TI TPS3808G01 | 2.4 µA supervisor with an adjustable threshold |
| 3.3 V | TI TPS63031 | buck-boost: keeps 3.3 V as the capacitor drains from 3.7 V to 2.6 V |
| Clock / wake-up | NXP PCF8563 | 0.25 µA RTC whose alarm can switch the gadget on |
| ESD | ST USBLC6-2SC6 | protects the USB-C data lines |
