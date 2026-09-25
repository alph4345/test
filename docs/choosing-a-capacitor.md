# Choosing a capacitor

CapCore works with two kinds of capacitor. **Decide before you order boards:**
the choice sets two resistors (R4 and R13) at assembly time.

| | Lithium-ion capacitor (LIC) | Supercapacitor (EDLC) |
|---|---|---|
| Voltage window on CapCore | 3.71 V → 2.61 V | 2.62 V → 1.96 V |
| Usable energy per farad | 3.5 J | 1.5 J |
| Capacitance for a given size | high (10×20 mm ≈ 50 F) | low (10×20 mm ≈ 10 F) |
| **Energy for a given size** | **~10× more** | baseline |
| Cycle life | tens of thousands of cycles | hundreds of thousands+ |
| Self-discharge | low | higher (days to weeks to lose a noticeable share) |
| Discharge to 0 V? | **no**: damaged below ~2.2 V | yes, harmless |
| Chemistry | lithium-doped carbon, organic electrolyte | carbon, organic electrolyte, no lithium |
| Fire risk | far below a LiPo, but not zero if abused | negligible |
| Build variant | LIC (R4 120k, R13 330k) | EDLC (R4 75k, R13 470k) |

**Pick an LIC** for almost everything: games, e-ink, anything where runtime
matters. It is what the Fibonacci earrings use (a 40 F, 3.8 V LIC). **Pick an
EDLC** when you want the most inert part available and a few minutes of
runtime is enough.

## Lithium-ion capacitors (3.8 V)

Eaton's HS series is easy to buy one at a time from the big distributors.
Any 3.8 V lithium-ion capacitor works.

| Part | Capacitance | Size (dia × length) | Lead pitch | Usable energy on CapCore | Notes |
|---|---|---|---|---|---|
| HS0814-3R8106-R | 10 F | 8 × 14 mm | 3.5 mm | 35 J | higher internal resistance; keep loads under ~100 mA |
| HS1016-3R8306-R | 30 F | 10 × 16 mm | 5.0 mm | 104 J | good all-rounder for small gadgets |
| HS1020-3R8506-R | 50 F | 10 × 20 mm | 5.0 mm | 174 J | |
| HS1225-3R8127-R | 120 F | 12.5 × 25 mm | 5.0 mm | 417 J | games, e-ink dashboards |
| HS1625-3R8227-R | 220 F | 16 × 25 mm | 7.5 mm (bend leads or wire) | 765 J | largest practical size |

Search [DigiKey](https://www.digikey.com/en/products/result?keywords=Eaton%20HS%203R8)
or [Mouser](https://www.mouser.com/c/?q=Eaton%20HS%203R8) for the part
number. Single pieces cost a few dollars for the small sizes and more for the
large ones, so check current prices. Always read the datasheet of the exact
part you buy.

**Rules for LICs:**

* Keep them between their minimum and 3.8 V. Eaton treats **2.2 V as the
  absolute minimum**. Below that the cell is damaged and can vent. CapCore
  charges to 3.71 V and disconnects at 2.61 V, which leaves room for
  self-discharge while the gadget sits unused.
* **Never charge one with a LiPo charger.** LiPo chargers go to 4.2 V, far
  over the 3.8 V rating.
* A dead-flat gadget still slowly loses charge. **Recharge it within a month
  or two**, and use ship mode before long storage.
* Don't short, crush, puncture or overheat it. A large LIC delivers tens of
  amps into a short.

## Supercapacitors (EDLC, 2.7 V)

Ordinary 2.7 V (or 3.0 V) supercapacitors from any reputable maker work on the
EDLC build: Eaton, Kyocera AVX, Tecate, Vinatech, Samwha and others. The
larger sizes (tens of farads and up) come in 16–22 mm diameter cans.

**Rules for EDLCs:**

* **Never fit an EDLC to a board built with the LIC values.** It would be
  charged to 3.71 V and can vent. Measure the charge voltage at BT1 before
  soldering in the capacitor (see the board's bring-up steps).
* Polarity matters: reversed, it is damaged. The **square pad is +**.
* Don't put two in series on CapCore. Series stacks need balancing, which the
  board doesn't provide.

## Physical fit

BT1 has two footprints in one: **5.0 mm** lead pitch (10–12.5 mm cans) and
**3.5 mm** (8 mm cans). The square pads are **+**. The can can stand upright,
lie flat over the board (the sleeve is insulated; add a strip of Kapton tape
over the parts to be safe), or be folded flat past the bottom edge. Glue or
strap large cans so the leads don't take mechanical stress. For 16 mm and
larger cans, or a capacitor elsewhere in your enclosure, run two short, thick
wires to the pads.
