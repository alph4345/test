"""CapCore power management for MicroPython (written for the RP2040 port).

    from capcore import CapCore
    cc = CapCore()            # raises HOLD at once and clears the RTC flags
    print(cc.cap_volts(), cc.percent(), cc.charging())
    cc.sleep_minutes(30)      # off now, back on in 30 minutes
    cc.power_off()            # off until the button (or USB) wakes it
    cc.ship_mode()            # capacitor disconnected until USB is plugged in

Create CapCore() as early as possible in main.py: after a button tap the board
only keeps power up for about 1-2 seconds unless HOLD goes high.
"""

import time

from machine import ADC, I2C, Pin

RTC_ADDR = 0x51          # PCF8563
REG_CTRL2 = 0x01         # bit3 AF, bit2 TF, bit1 AIE, bit0 TIE
REG_MIN_ALARM = 0x09
REG_CLKOUT = 0x0D
REG_TIMER_CTRL = 0x0E
REG_TIMER = 0x0F

LIC = (3.71, 2.61)       # (charge voltage, hardware cut-off)
EDLC = (2.62, 1.96)


def _bcd(n):
    return ((n // 10) << 4) | (n % 10)


class CapCore:
    def __init__(self, hold=2, btn=3, ship=6, chg=7, vsense=26, i2c=None,
                 variant=LIC, shutdown_margin=0.14, adc_vref=3.3):
        # HOLD first: this is what keeps the gadget powered.
        self.hold = Pin(hold, Pin.OUT, value=1)
        self.ship = Pin(ship, Pin.OUT, value=0)
        self.btn = Pin(btn, Pin.IN, Pin.PULL_UP)
        self.chg = Pin(chg, Pin.IN, Pin.PULL_UP)
        self.adc = ADC(vsense)
        self.adc_vref = adc_vref
        self.v_full, self.v_empty = variant
        self.v_shutdown = self.v_empty + shutdown_margin
        self.i2c = i2c if i2c is not None else I2C(0, sda=Pin(4), scl=Pin(5), freq=100_000)
        flags = self._read(REG_CTRL2)
        self.woke_by_rtc = bool(flags & 0x0C)
        self._write(REG_CTRL2, 0x00)        # clear AF/TF, interrupts off -> releases WAKE
        self._write(REG_CLKOUT, 0x00)       # clock output off (~1 uA)
        self._write(REG_TIMER_CTRL, 0x00)   # timer off

    # -- RTC registers ----------------------------------------------------
    def _read(self, reg):
        return self.i2c.readfrom_mem(RTC_ADDR, reg, 1)[0]

    def _write(self, reg, value):
        self.i2c.writeto_mem(RTC_ADDR, reg, bytes([value]))

    # -- status -------------------------------------------------------------
    def cap_volts(self):
        """Capacitor voltage (VSENSE is half of it)."""
        total = 0
        for _ in range(8):
            total += self.adc.read_u16()
        return 2 * (total / 8) * self.adc_vref / 65535

    def percent(self):
        """Energy left between the cut-off and full (what runtime depends on)."""
        v = min(max(self.cap_volts(), self.v_empty), self.v_full)
        return round(100 * (v * v - self.v_empty ** 2) / (self.v_full ** 2 - self.v_empty ** 2))

    def charging(self):
        return self.chg.value() == 0

    def button(self):
        return self.btn.value() == 0

    def low(self):
        """True when it is time to save state and power off."""
        return not self.charging() and self.cap_volts() < self.v_shutdown

    # -- power ----------------------------------------------------------------
    def power_off(self):
        """Drop HOLD. Returns only if something else keeps the board on
        (USB with jumper JP1, or jumper JP2) and the button is pressed again."""
        while self.button():                 # the switch stays on while held
            time.sleep_ms(10)
        self.hold.value(0)
        time.sleep(3)
        while not self.button():             # still alive: USB-ON / ALWAYS-ON
            time.sleep_ms(200)
        self.hold.value(1)

    def sleep_minutes(self, minutes):
        """Power off and let the RTC countdown timer switch us back on."""
        if not 1 <= minutes <= 255:
            raise ValueError("1-255 minutes")
        self._write(REG_TIMER_CTRL, 0x00)
        self._write(REG_TIMER, minutes)
        self._write(REG_CTRL2, 0x01)          # TIE, level interrupt
        self._write(REG_TIMER_CTRL, 0x83)     # TE, 1/60 Hz
        self.power_off()

    def wake_at(self, hour, minute):
        """Power off until the RTC alarm fires at hour:minute (RTC time)."""
        self._write(REG_MIN_ALARM, _bcd(minute))          # AE_M = 0: enabled
        self._write(REG_MIN_ALARM + 1, _bcd(hour))        # AE_H = 0: enabled
        self._write(REG_MIN_ALARM + 2, 0x80)              # day: don't care
        self._write(REG_MIN_ALARM + 3, 0x80)              # weekday: don't care
        self._write(REG_CTRL2, 0x02)                      # AIE
        self.power_off()

    def set_time(self, year, month, day, hour, minute, second=0, weekday=0):
        self.i2c.writeto_mem(RTC_ADDR, 0x02, bytes([
            _bcd(second), _bcd(minute), _bcd(hour), _bcd(day), weekday, _bcd(month), _bcd(year % 100)]))

    def now(self):
        """(year, month, day, hour, minute, second) from the RTC."""
        b = self.i2c.readfrom_mem(RTC_ADDR, 0x02, 7)

        def un(v):
            return (v >> 4) * 10 + (v & 0x0F)
        return (2000 + un(b[6]), un(b[5] & 0x1F), un(b[3] & 0x3F), un(b[2] & 0x3F),
                un(b[1] & 0x7F), un(b[0] & 0x7F))

    def clock_valid(self):
        """False after the RTC lost power (VL flag): set the time again."""
        return not self._read(0x02) & 0x80

    def ship_mode(self):
        """Disconnect the capacitor. Only USB power brings the board back."""
        while self.button():
            time.sleep_ms(10)
        self.ship.value(1)
        time.sleep(2)
        self.ship.value(0)                    # only reached while USB is plugged in
