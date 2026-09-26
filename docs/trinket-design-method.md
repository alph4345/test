# The burst method: how to make capacitor trinkets last

A supercapacitor stores about a tenth of the energy of a same-size LiPo, but
it charges in minutes and survives tens of thousands of cycles. Trinkets that
last days to weeks per charge all follow the same method. It is built into
[TrinketCore](../hardware/trinketcore) and its
[firmware examples](../firmware/trinketcore).

## The method

1. **Off is the default.** Between uses the whole board is switched off, not
   asleep. TrinketCore draws about 5 µA then, so a capacitor loses almost
   nothing waiting in a drawer. (A microcontroller "sleeping" with its
   display and amplifier powered would draw a thousand times more.)
2. **Wake on an event.** Use a button, a lid or tilt switch on `WAKE`, or
   the clock's timer or alarm for scheduled jobs such as a pet getting
   hungry or an e-ink refresh.
3. **Do one short burst.** Show the screen for a few seconds, or play a
   15–30 s tune.
4. **Spend the burst efficiently:**
   * dim the backlight;
   * keep the volume moderate (speaker power grows with the square of the
     volume);
   * light LEDs at a few mA and only while needed;
   * shut the amplifier down (`AMP_EN` low) the moment the sound ends.
5. **Switch off again** (`power_off()`), or set the clock to wake up later
   (`sleep_minutes()`).
6. **Budget, then size the capacitors.** Multiply energy per burst by bursts
   per day, compare with the capacitors' usable energy, then pick one or two
   capacitors. [`tools/energy_calc.py`](../tools/energy_calc.py) does the
   arithmetic:
   `python3 tools/energy_calc.py --cap lic:220 --active-ma 70 --active-s 20 --per-day 10`.
7. **Show the charge level** as part of each burst: a battery icon for a
   second on the display, or a "sleepy" sound. The green LED shows when
   charging is complete.

Energy per burst = current × 3.3 V × seconds ÷ 0.85. Two 220 F lithium-ion
capacitors hold 1,530 J usable, so a 5 J burst gives about 300 uses per
charge.

## Colour TFT screens

Yes, colour TFTs work. What matters is the **backlight**:

| Display | Typical draw incl. the RP2040 | Two 220 F capacitors |
|---|---|---|
| 1.3–1.54″ ST7789 or 1.28″ GC9A01 colour TFT, backlight 60 % | ~45 mA | 10 s shows, 30 a day: **~4 weeks** · continuous: ~2 h |
| same, backlight dimmed to ~10 % | ~30 mA | continuous: ~3 h |
| 0.96″ SSD1306 OLED (power depends on lit pixels) | ~35–40 mA | continuous: ~2.7 h |
| e-paper (holds its image with no power) | 30 mA for ~3 s per update | updates every 30 min: **months** |

How to use a colour TFT well:

* **Show, dim, off.** Full brightness for a few seconds after a press, then
  ~10 %, then switch the board off (the `charge_gauge` example does this).
* **Keep backgrounds dark.** On a TFT this doesn't change the backlight's
  power, but a dim backlight looks fine with a dark UI. On an OLED dark
  pixels are free.
* **Redraw only what changes**, at 15–20 fps for animations. The RP2040
  sends frames over SPI with DMA, so this is easy.
* **Always-visible colour** (a pet that's always showing): use a colour e-paper
  or a memory-in-pixel LCD (JDI LPM013M126A, 8 colours). A memory LCD needs
  a microcontroller that sleeps at a few µA, such as an nRF52 or STM32L0,
  which is a different board. On TrinketCore, use e-paper for always-visible
  screens and TFT/OLED for glance-and-go screens.

## The music box

The most logical design for a music box with LEDs and quick bursts of sound:

1. **Lid opens → board wakes.** A lid switch on `WAKE`, with a 1 µF capacitor
   in series and 22 MΩ across it, sends one wake pulse. The board can still
   switch itself off if the lid is left open. A button works too.
2. **Play one short piece (15–30 s)**, then switch everything off. Closing
   and reopening the lid plays it again.
3. **Synthesise the sound** instead of decoding MP3s. A plucked, bell-like
   note is a sine wave plus two overtones with a fast attack and a ~1 s decay.
   That takes almost no memory or CPU (`synthio` in CircuitPython). Short
   recorded sounds are fine too: 16 MB of flash holds several minutes of
   22 kHz audio.
4. **Moderate volume, efficient speaker.** A 28–40 mm, 8 Ω speaker in a small
   resonant box (the music box itself) is loud at a fraction of a watt. Half
   the volume uses a quarter of the power.
5. **LEDs that pulse on each note** and fade in between, at a few mA each
   through 470 Ω–1 kΩ resistors on GP2–GP5. The eye sees the pulses, the
   capacitor barely notices them.
6. **Check the charge first.** If it's low, play a short falling "charge me"
   chirp instead of the tune and switch off.

Budget: RP2040 ~25 mA, amplifier ~15–40 mA at moderate volume, LEDs ~5–10 mA.
That's roughly 70 mA for 20 s, or **~5.5 J per play**.

| Capacitors | Plays per charge | At 10 plays a day | Charge time (300 mA) |
|---|---|---|---|
| 1 × 120 F (12.5 × 25 mm) | ~75 | ~1 week | ~9 min |
| 1 × 220 F (16 × 25 mm) | ~140 | ~2 weeks | ~16 min |
| 2 × 220 F | ~275 | **~4 weeks** | ~32 min |

To stretch it further:

* **Shorter pieces:** 10 s instead of 20 s doubles the plays.
* **Lower volume.**
* **A slower CPU:** CircuitPython keeps the RP2040 at 125 MHz. An Arduino or
  C sketch at 48 MHz saves ~15 mA.
* **Skip the display**, or show only a 1 s charge icon.

## The same method for the other trinkets

| Trinket | Wake source | Burst | Display | Two 220 F capacitors |
|---|---|---|---|---|
| **Music box** | lid (one-shot) or button | 15–30 s tune + LEDs | none, or 1 s charge icon | ~4 weeks at 10 plays/day |
| **Keychain game** | button A | play session, auto-off after 60 s idle | OLED or colour TFT | 2–3 h of play per charge |
| **Virtual pet** | clock timer (every 15–60 min) + buttons | update state, redraw, off | e-paper: always visible | months (e-paper) · weeks (TFT, only on button press) |
| **Keychain animation / charm** | button or vibration switch on `WAKE` | 5–10 s animation | round GC9A01 colour TFT | ~4 weeks at 30 shows/day |
| **Badge / photo frame** | clock alarm (daily or hourly) | e-paper refresh | e-paper | months |
| **Desk clock** | clock timer every 1–5 minutes | redraw the time | e-paper (partial refresh) | ~9 days (every minute) · ~6 weeks (every 5 min) |

The rule of thumb stays the same as in the [energy budget](energy-budget.md):
if it sleeps between uses it lasts days to weeks; if it runs continuously,
budget in minutes to hours.
