"""
Synthesizes the app's two alert sounds so they ship as real assets without
depending on a licensed sound-effect library:
  - notification.wav: a short two-note chime for an incoming chat message
  - ringtone.wav: one loop-cycle of a classic dual-tone telephone ring, for
    an incoming audio/video call (looped in JS via AudioPlayer.loop = true
    while CallContext's callState is 'incoming-ringing')
"""
import numpy as np
import wave

SAMPLE_RATE = 44100

def envelope(n, attack=0.01, release=0.15):
    env = np.ones(n)
    a = int(attack * SAMPLE_RATE)
    r = int(release * SAMPLE_RATE)
    if a > 0:
        env[:a] = np.linspace(0, 1, a)
    if r > 0:
        env[-r:] *= np.linspace(1, 0, r)
    return env

def tone(freq, duration, amp=0.5, attack=0.01, release=0.15):
    n = int(duration * SAMPLE_RATE)
    t = np.arange(n) / SAMPLE_RATE
    wave_data = np.sin(2 * np.pi * freq * t) * amp
    return wave_data * envelope(n, attack, release)

def dual_tone(freq1, freq2, duration, amp=0.35, attack=0.01, release=0.05):
    n = int(duration * SAMPLE_RATE)
    t = np.arange(n) / SAMPLE_RATE
    wave_data = (np.sin(2 * np.pi * freq1 * t) + np.sin(2 * np.pi * freq2 * t)) * amp
    return wave_data * envelope(n, attack, release)

def silence(duration):
    return np.zeros(int(duration * SAMPLE_RATE))

def save_wav(path, samples):
    samples = np.clip(samples, -1, 1)
    pcm = (samples * 32767).astype(np.int16)
    with wave.open(path, 'w') as f:
        f.setnchannels(1)
        f.setsampwidth(2)
        f.setframerate(SAMPLE_RATE)
        f.writeframes(pcm.tobytes())

# --- notification.wav: bright ascending two-note chime (E6 -> G#6-ish), like
# a gentle "ding-ding" — short and non-intrusive for a chat message. ---
note1 = tone(1318.51, 0.16, amp=0.45, attack=0.005, release=0.09)   # E6
gap = silence(0.03)
note2 = tone(1661.22, 0.28, amp=0.45, attack=0.005, release=0.22)   # G#6
notification = np.concatenate([note1, gap, note2])
save_wav('/home/kamsu-perold/riskyc-chat/mobile/assets/sounds/notification.wav', notification)

# --- ringtone.wav: one cycle of a classic dual-tone (440Hz + 480Hz) phone
# ring — two short pulses then a pause, matching the familiar "ring-ring...
# ring-ring..." cadence when looped. ---
pulse = dual_tone(440, 480, 0.4, amp=0.3, attack=0.02, release=0.08)
short_gap = silence(0.15)
pause = silence(0.7)
ringtone = np.concatenate([pulse, short_gap, pulse, pause])
save_wav('/home/kamsu-perold/riskyc-chat/mobile/assets/sounds/ringtone.wav', ringtone)

print("done")
