# Example main.py for a Raspberry Pi Pico (3V3_EN tied to GND) on a CapCore.
# Wiring: HOLD->GP2, BTN->GP3, SHIP->GP6, CHG->GP7, VSENSE->GP26, SDA->GP4, SCL->GP5.
from capcore import CapCore  # first import, so HOLD goes high within milliseconds

cc = CapCore()

import time  # noqa: E402

print("woke by", "RTC" if cc.woke_by_rtc else "button/USB")
print("capacitor %.2f V, %d %%%s" % (cc.cap_volts(), cc.percent(), ", charging" if cc.charging() else ""))

if cc.woke_by_rtc:
    # e-ink style: do the periodic job, then sleep again
    # update_display()
    cc.sleep_minutes(60)

pressed = None
while True:
    if cc.low():
        print("capacitor low: saving and powering off")
        cc.power_off()
    if cc.button():
        pressed = pressed or time.ticks_ms()
        if time.ticks_diff(time.ticks_ms(), pressed) > 1500:   # long press = off
            cc.power_off()
            pressed = None
    else:
        pressed = None
    # game / display / audio work goes here
    time.sleep_ms(20)
