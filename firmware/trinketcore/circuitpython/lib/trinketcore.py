"""TrinketCore board support for CircuitPython (RP2040).

    import trinketcore               # first line of code.py: HOLD goes high at once
    tc = trinketcore.TrinketCore()
    print(tc.cap_volts(), tc.percent(), tc.charging(), tc.usb_power())
    tc.sleep_minutes(30)             # off now, back on in 30 minutes
    tc.power_off()                   # off until a button, the lid switch or USB wakes it

Flash any RP2040 CircuitPython build (for example "Raspberry Pi Pico", or
"Pimoroni Pico LiPo (16MB)" to use all 16 MB). Pins are named here by GPIO
number, so the build's own pin names don't matter.
"""

import time

import analogio
import busio
import digitalio
import microcontroller
from microcontroller import pin

# Holding power comes before everything else: after a button press the board
# stays on for only a few seconds on its own.
_hold = digitalio.DigitalInOut(pin.GPIO22)
_hold.switch_to_output(value=True)

# --- pin map (see hardware/trinketcore/README.md) -----------------------------
EXP = [pin.GPIO0, pin.GPIO1, pin.GPIO2, pin.GPIO3, pin.GPIO4, pin.GPIO5, pin.GPIO6, pin.GPIO7]
EXP_ADC = [pin.GPIO26, pin.GPIO27]
TFT_DC, TFT_CS, TFT_SCK, TFT_MOSI, TFT_RST, TFT_BL = (
    pin.GPIO8, pin.GPIO9, pin.GPIO10, pin.GPIO11, pin.GPIO12, pin.GPIO13)
BUTTON_B = pin.GPIO14
SHIP = pin.GPIO15
SDA, SCL = pin.GPIO16, pin.GPIO17
I2S_DATA, I2S_BCLK, I2S_LRCLK = pin.GPIO18, pin.GPIO19, pin.GPIO20
AMP_EN = pin.GPIO21
HOLD, BUTTON_A, CHG = pin.GPIO22, pin.GPIO23, pin.GPIO24
LED = pin.GPIO25
USB_DET, VSENSE = pin.GPIO28, pin.GPIO29

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


class TrinketCore:
    def __init__(self, variant=LIC, shutdown_margin=0.12, i2c=None):
        self.hold = _hold
        self.ship = digitalio.DigitalInOut(SHIP)
        self.ship.switch_to_output(value=False)
        self.amp = digitalio.DigitalInOut(AMP_EN)
        self.amp.switch_to_output(value=False)          # amplifier off until needed
        self.button_a = self._input(BUTTON_A)             # the power button, read through a diode
        self.button_b = self._input(BUTTON_B)
        self.chg = self._input(CHG)
        self.usb = self._input(USB_DET)
        self.vsense = analogio.AnalogIn(VSENSE)
        self.v_full, self.v_empty = variant
        self.v_shutdown = self.v_empty + shutdown_margin
        self.i2c = i2c or busio.I2C(SCL, SDA, frequency=100_000)
        flags = self._read(REG_CTRL2)
        self.woke_by_rtc = bool(flags & 0x0C)
        self._write(REG_CTRL2, 0x00)        # clear AF/TF, interrupts off -> releases WAKE
        self._write(REG_CLKOUT, 0x00)       # clock output off (saves ~1 uA while off)
        self._write(REG_TIMER_CTRL, 0x00)

    @staticmethod
    def _input(p):
        d = digitalio.DigitalInOut(p)
        d.switch_to_input(pull=digitalio.Pull.UP)
        return d

    # -- RTC registers ------------------------------------------------------
    def _read(self, reg):
        buf = bytearray(1)
        while not self.i2c.try_lock():
            pass
        try:
            self.i2c.writeto_then_readfrom(RTC_ADDR, bytes([reg]), buf)
        finally:
            self.i2c.unlock()
        return buf[0]

    def _write(self, reg, *values):
        while not self.i2c.try_lock():
            pass
        try:
            self.i2c.writeto(RTC_ADDR, bytes([reg, *values]))
        finally:
            self.i2c.unlock()

    # -- charge level -------------------------------------------------------
    def cap_volts(self):
        """Capacitor voltage (VSENSE is half of it, measured against the 3.3 V rail)."""
        total = 0
        for _ in range(16):
            total += self.vsense.value
        return 2 * (total / 16) * self.vsense.reference_voltage / 65535

    def percent(self):
        """Energy left between the cut-off and full: what runtime depends on."""
        v = min(max(self.cap_volts(), self.v_empty), self.v_full)
        return round(100 * (v * v - self.v_empty ** 2) / (self.v_full ** 2 - self.v_empty ** 2))

    def charging(self):
        """True while the charger is filling the capacitors (the red LED is on)."""
        return not self.chg.value

    def usb_power(self):
        """True while USB power is plugged in."""
        return not self.usb.value

    def low(self):
        """Time to save state and power off, a little above the hard cut-off."""
        return not self.usb_power() and self.cap_volts() < self.v_shutdown

    def button(self):
        """Power button (A). Also reads pressed while the RTC or WAKE pin holds the board on."""
        return not self.button_a.value

    # -- power --------------------------------------------------------------
    def power_off(self):
        """Drop HOLD. Returns only if something else keeps the board on (USB with
        jumper JP1, or jumper JP2) and the power button is pressed again."""
        self.amp.value = False
        while self.button():                 # the switch stays on while held
            time.sleep(0.01)
        self.hold.value = False
        time.sleep(3)
        while not self.button():             # still alive: USB-ON / ALWAYS-ON
            time.sleep(0.2)
        self.hold.value = True

    def sleep_minutes(self, minutes):
        """Power off and let the RTC countdown timer switch the board back on."""
        if not 1 <= minutes <= 255:
            raise ValueError("1-255 minutes")
        self._write(REG_TIMER_CTRL, 0x00)
        self._write(REG_TIMER, minutes)
        self._write(REG_CTRL2, 0x01)          # TIE, level interrupt
        self._write(REG_TIMER_CTRL, 0x83)     # TE, 1/60 Hz source
        self.power_off()

    def wake_at(self, hour, minute):
        """Power off until the RTC alarm fires at hour:minute (RTC time)."""
        self._write(REG_MIN_ALARM, _bcd(minute), _bcd(hour), 0x80, 0x80)
        self._write(REG_CTRL2, 0x02)          # AIE
        self.power_off()

    def set_time(self, year, month, day, hour, minute, second=0, weekday=0):
        self._write(0x02, _bcd(second), _bcd(minute), _bcd(hour), _bcd(day), weekday,
                    _bcd(month), _bcd(year % 100))

    def ship_mode(self):
        """Disconnect the capacitors. Only USB power brings the board back."""
        while self.button():
            time.sleep(0.01)
        self.ship.value = True
        time.sleep(2)
        self.ship.value = False               # only reached while USB is plugged in

    # -- helpers for gadgets ---------------------------------------------------
    def speaker(self, sample_rate=22050):
        """I2S output to the amplifier; call .deinit() when done. The amp is enabled."""
        import audiobusio
        self.amp.value = True
        return audiobusio.I2SOut(I2S_BCLK, I2S_LRCLK, I2S_DATA)

    @staticmethod
    def cpu_slow(freq=48_000_000):
        """Run the RP2040 slower to save power, where the build allows it."""
        try:
            microcontroller.cpu.frequency = freq
        except (AttributeError, NotImplementedError, ValueError):
            pass
