# TrinketCore music box: opening the lid (or pressing A) plays a short tune with
# glowing LEDs, then the whole board switches off until the next opening.
#
# Copy lib/trinketcore.py and this file (as code.py) to the CIRCUITPY drive.
# No extra libraries: synthio, audiobusio, audiomixer, pwmio and ulab are built in.
#
# Wiring
#   speaker   8 ohm, 0.5-1 W, on J7 (a bigger speaker in a resonant box is louder
#             for the same power)
#   LEDs      up to four LEDs on J6 GP2-GP5, each through 470 ohm-1 kohm to GND
#   lid       a lid switch from J6 WAKE to GND in series with 1 uF, with 22 Mohm
#             across the capacitor. Opening the lid sends one wake pulse, so the
#             board still switches off if the lid stays open. A push button from
#             WAKE to GND works too (no capacitor needed).
#
# Why it lasts: the board is completely off (about 5 uA) between plays. One
# 20 s play costs roughly 5-8 J, so a 220 F capacitor gives ~100 plays per charge.
import trinketcore  # first: raises HOLD so the board stays on

tc = trinketcore.TrinketCore()

import time  # noqa: E402

import audiomixer  # noqa: E402
import pwmio  # noqa: E402
import synthio  # noqa: E402
import ulab.numpy as np  # noqa: E402

VOLUME = 0.35            # 0..1; speaker power grows with the square of this
REPEATS = 1              # play the tune this many extra times
SAMPLE_RATE = 22050

# Twinkle, Twinkle, Little Star (traditional). (MIDI note, beats); 0 = rest.
TUNE = [(72, 1), (72, 1), (79, 1), (79, 1), (81, 1), (81, 1), (79, 2),
        (77, 1), (77, 1), (76, 1), (76, 1), (74, 1), (74, 1), (72, 2)]
BEAT = 0.42              # seconds per beat

# ---- LEDs: soft PWM glow, one LED per pitch class ------------------------------------
leds = [pwmio.PWMOut(p, frequency=1000) for p in trinketcore.EXP[2:6]]
user_led = pwmio.PWMOut(trinketcore.LED, frequency=1000)
glow = [0.0] * len(leds)


def decay_leds(factor=0.8):
    for i, led in enumerate(leds):
        glow[i] *= factor
        led.duty_cycle = int(glow[i] * glow[i] * 30000)   # squared: looks linear to the eye
    user_led.duty_cycle = int(max(glow) * 20000)


def all_leds_off():
    for led in leds:
        led.duty_cycle = 0
    user_led.duty_cycle = 0


# ---- sound: a plucked, bell-like tone, synthesised (no sound files needed) ------------
def music_box_wave(n=256):
    t = np.linspace(0, 2 * np.pi, n, endpoint=False)
    w = np.sin(t) + 0.5 * np.sin(2 * t) + 0.25 * np.sin(5 * t)   # tine partials
    return np.array(w / np.max(abs(w)) * 32000, dtype=np.int16)


pluck = synthio.Envelope(attack_time=0.002, decay_time=0.9, sustain_level=0.0,
                         release_time=0.25, attack_level=1.0)


def play(tune, speaker):
    mixer = audiomixer.Mixer(voice_count=1, sample_rate=SAMPLE_RATE, channel_count=1,
                             bits_per_sample=16, samples_signed=True, buffer_size=2048)
    synth = synthio.Synthesizer(sample_rate=SAMPLE_RATE, channel_count=1)
    speaker.play(mixer)
    mixer.voice[0].play(synth)
    mixer.voice[0].level = VOLUME
    wave = music_box_wave()
    for midi, beats in tune:
        if midi:
            note = synthio.Note(synthio.midi_to_hz(midi), envelope=pluck, waveform=wave)
            synth.press(note)
            glow[midi % len(leds)] = 1.0
        end = time.monotonic() + beats * BEAT
        while time.monotonic() < end:
            decay_leds()
            time.sleep(0.03)
        if midi:
            synth.release(note)
    time.sleep(1.0)                      # let the last note ring out
    mixer.voice[0].stop()
    speaker.stop()


def sad_chirp(speaker):
    """Short falling tone: 'charge me'. Cheap in energy, obvious to the ear."""
    play([(76, 0.5), (72, 0.5), (67, 1)], speaker)


# ---- one burst per wake, then off -------------------------------------------------------
speaker = tc.speaker(SAMPLE_RATE)       # also switches the amplifier on
if tc.low():
    sad_chirp(speaker)
else:
    for _ in range(1 + REPEATS):
        play(TUNE, speaker)
speaker.deinit()
all_leds_off()
tc.power_off()          # returns only if USB (jumper JP1) keeps the board on
while True:             # on USB: A plays the tune again
    if tc.button():
        speaker = tc.speaker(SAMPLE_RATE)
        play(TUNE, speaker)
        speaker.deinit()
        all_leds_off()
    time.sleep(0.05)
