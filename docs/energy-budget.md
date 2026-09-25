# Energy budget: what a capacitor can actually run

Supercapacitors trade energy for safety, lifetime and charging speed.
Before designing a gadget, check that its power draw fits.

## The one formula that matters

A capacitor's voltage falls steadily as it empties, and the electronics stop
at the cut-off voltage. So only the energy between the charge voltage and the
cut-off is usable:

```
E_usable = ½ · C · (V_charge² − V_cutoff²)
```

On CapCore that is 3.71 V → 2.61 V for a lithium-ion capacitor (LIC):
**3.5 J per farad**. For an ordinary 2.7 V supercapacitor (EDLC) it is
2.62 V → 1.96 V: **1.5 J per farad**. The 3.3 V converter is about 85 %
efficient, so:

```
runtime = E_usable × 0.85 / (load current × 3.3 V)
```

For scale: a 30 F LIC (10 × 16 mm) holds **29 mWh**, and the biggest
common one (220 F, 16 × 25 mm) holds **212 mWh**. A tiny 100 mAh LiPo holds
about 370 mWh. Capacitors hold much less energy, but they charge in minutes,
survive tens of thousands of cycles, and are far less of a fire risk than a LiPo
(an ordinary EDLC essentially none).

## Runtime per charge

From [`tools/energy_calc.py`](../tools/energy_calc.py) (85 % efficiency, 5 µA
standby). Charge times are for CapCore's 300 mA charger, from the cut-off to full.

| Gadget | LIC 30 F<br>10×16 mm | LIC 120 F<br>12.5×25 mm | LIC 220 F<br>16×25 mm | EDLC 10 F<br>10×20 mm | EDLC 100 F<br>22×45 mm |
|---|---|---|---|---|---|
| Usable energy | 104 J (29 mWh) | 417 J (116 mWh) | 765 J (212 mWh) | 15 J (4 mWh) | 151 J (42 mWh) |
| Charge time | ~2 min | ~9 min | ~16 min | <1 min | ~4 min |
| LED earrings (~0.8 mA average) | 9.3 h | 37 h | 3 days | 81 min | 13.5 h |
| E-ink badge, RP2040, 1 refresh/day | 71 days* | 282 days* | 518 days* | 13 days | 126 days* |
| E-ink dashboard, RP2040, 1 refresh/hour | 11 days | 44 days* | 80 days* | 39 h | 16 days |
| E-ink, nRF52 + partial refresh, hourly | 40 days | 159 days* | 292 days* | 6 days | 65 days* |
| Game: Sharp memory LCD + low-power MCU (12 mA) | 37 min | 2.5 h | 4.6 h | 5 min | 54 min |
| Game: 0.96″ OLED + RP2040 (35 mA) | 13 min | 51 min | 1.6 h | 2 min | 19 min |
| Game: 1.3″ colour TFT + backlight + RP2040 (50 mA) | 9 min | 36 min | 66 min | 78 s | 13 min |
| Chiptune synth on a small speaker (15 mA) | 30 min | 2 h | 3.6 h | 4 min | 43 min |
| MP3 player to headphones (70 mA) | 6 min | 26 min | 47 min | 56 s | 9 min |
| MP3 player to a small speaker (120 mA) | 4 min | 15 min | 27 min | 32 s | 5 min |

\* Beyond a month or two, the capacitor's own self-discharge takes over
(it isn't in the model), especially for EDLCs. Treat these as best cases and
recharge now and then.

## What that means for your ideas

* **LED jewellery, badges, blinky art: great fit.** Hours to days per charge,
  a one-minute top-up, thousands of cycles. This is what the Fibonacci
  earrings do.
* **E-ink displays: great fit** *if the whole board powers off between
  updates.* E-ink holds its image with no power. Let CapCore's RTC wake the
  gadget, update, and switch everything off again: weeks to months per charge.
* **Handheld games: OK for short sessions.** 15–90 minutes with a 120–220 F
  LIC, then a 10–15 minute charge. Memory-LCD or monochrome OLED games with a
  slow CPU stretch the most.
* **Music players: poor fit.** Audio amplifiers and SD cards draw tens to
  hundreds of mA, so even the largest LIC gives well under an hour. Use
  headphones, keep the volume low, or make a chiptune synth with a piezo
  instead of an MP3 player. For long listening, a supercapacitor is the wrong
  storage.

## Try your own numbers

```
python3 tools/energy_calc.py                                   # all presets
python3 tools/energy_calc.py --cap lic:120                     # one capacitor
python3 tools/energy_calc.py --cap lic:50 --ma 25              # 25 mA continuous
python3 tools/energy_calc.py --cap lic:30 --active-ma 40 --active-s 3 --per-day 24
```

Measure your real current with a USB power meter or a multimeter in series
with the 3V3 line. Datasheet "typical" figures are usually optimistic.
