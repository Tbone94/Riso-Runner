# Real-instrument renderer for the squish game music.
# Plays the exact notes from compose.py through recorded instruments
# (Salamander grand, VSCO-2 orchestra, FreePats nylon guitar) with a
# proper room reverb. Library lives outside the repo: ~/Music/squish-instruments
import numpy as np, soundfile as sf, glob, os, re, json, wave
from scipy.signal import resample_poly, fftconvolve, butter, sosfilt

SR = 44100
LIB = os.path.expanduser('~/Music/squish-instruments')
PC = {'C': 0, 'D': 2, 'E': 4, 'F': 5, 'G': 7, 'A': 9, 'B': 11}

def note_of(name):
    m = re.search(r'(?<![A-Za-z])([A-G])(#|b)?(-?\d)(?!\d)', name)
    return (int(m.group(3)) + 1) * 12 + PC[m.group(1)] + {'#': 1, 'b': -1, None: 0}[m.group(2)]

# ==================== SAMPLE LOADING + TUNING ====================

_cache = {}
def load(path):
    if path in _cache: return _cache[path]
    x, sr = sf.read(path, always_2d=True, dtype='float32')
    if x.shape[1] == 1: x = np.repeat(x, 2, 1)
    x = x[:, :2]
    if sr != SR:
        g = np.gcd(SR, sr); x = resample_poly(x, SR // g, sr // g, axis=0).astype('float32')
    # trim leading silence so notes land on the beat
    a = np.abs(x).max(1); thr = a.max() * 10 ** (-45 / 20)
    i = max(0, int(np.argmax(a > thr)) - int(0.003 * SR))
    _cache[path] = x[i:]
    return _cache[path]

def _f0(x):
    x = x[int(0.12 * SR):int(0.62 * SR)].mean(1); x = x - x.mean()
    if len(x) < 2048: return None
    n = 1 << 16; S = np.abs(np.fft.rfft(x * np.hanning(len(x)), n)); f = np.fft.rfftfreq(n, 1 / SR)
    hps = S.copy()
    for h in (2, 3, 4): hps[:len(S) // h] *= S[::h][:len(S) // h]
    lo, hi = np.searchsorted(f, 25), np.searchsorted(f, 5000)
    return f[lo + np.argmax(hps[lo:hi])]

_TUNE_PATH = os.path.join(LIB, 'tuning.json')
_tune = json.load(open(_TUNE_PATH)) if os.path.exists(_TUNE_PATH) else {}
def detune(path, expected):
    # measured pitch minus labelled pitch, in semitones; only trusted when small
    if path not in _tune:
        fr = _f0(load(path)); d = 0.0
        if fr:
            d = 69 + 12 * np.log2(fr / 440) - expected
            if abs(d) > 0.5: d = 0.0          # detector octave slip: trust the label
        _tune[path] = round(float(d), 3)
        json.dump(_tune, open(_TUNE_PATH, 'w'), indent=0)
    return _tune[path]

# ==================== INSTRUMENTS ====================

class Inst:
    # octave_fix: VSCO names notes an octave low (measured), so +12 there.
    # ring: seconds a plucked/struck note keeps sounding after note-off.
    # tone: recorded at one loudness only, so soft notes get darkened by a filter
    # lp: fixed low-pass (a darker, felt-like colour); fixes: {label: semitones}
    # for recordings whose label is wrong (measured two ways)
    # lead: the most a note may start ahead of the beat. Like a real player
    # anticipating a slow-speaking instrument, each note starts early by its own
    # measured speaking time (time to half loudness, as heard), capped at lead.
    def __init__(self, pattern, octave_fix=0, vel_re=r'v(\d+)', sustain=False,
                 ring=1.0, release=0.25, attack=0.0, tone=False, lp=None, fixes=None, lead=0.0):
        self.samples = []
        for p in glob.glob(os.path.join(LIB, pattern)):
            b = os.path.basename(p)
            m = re.search(vel_re, b) if vel_re else None
            fix = sum(v for k, v in (fixes or {}).items() if '_' + k + '_' in b)
            self.samples.append((note_of(b) + octave_fix + fix, int(m.group(1)) if m else 1, p))
        assert self.samples, pattern
        self.notes = sorted({n for n, _, _ in self.samples})
        self.sustain, self.ring, self.release, self.attack, self.tone, self.lp, self.lead = sustain, ring, release, attack, tone, lp, lead

    def pick(self, note, dyn, rng):
        best = min(self.notes, key=lambda s: (abs(s - note), s < note))  # tie: shift down
        cands = [(l, p) for n, l, p in self.samples if n == best]
        layers = sorted({l for l, _ in cands})
        L = layers[min(len(layers) - 1, int(dyn * len(layers)))]
        ps = sorted(p for l, p in cands if l == L)
        return best, ps[rng.integers(len(ps))]

    def play(self, note, dur, dyn, rng):
        sn, path = self.pick(note, dyn, rng)
        x = load(path)
        ratio = 2 ** ((note - sn - detune(path, sn)) / 12)
        keep = self.lead + dur + self.release + (0 if self.sustain else self.ring)
        n = min(int(keep * SR), int((len(x) - 1) / ratio))
        idx = np.arange(n) * ratio; src = np.arange(len(x))
        y = np.stack([np.interp(idx, src, x[:, c]) for c in (0, 1)], 1)
        r = min(n, int(self.release * SR))
        if r: y[-r:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, r)))[:, None]
        a = min(n, int(self.attack * SR))
        if a: y[:a] *= np.linspace(0, 1, a)[:, None] ** 1.5
        if self.lp: y = sosfilt(butter(2, self.lp, fs=SR, output='sos'), y, axis=0)
        if self.tone:
            fc = 2200 * 2 ** (2.5 * dyn) * 2 ** rng.normal(0, 0.15)
            y = sosfilt(butter(1, min(fc, 18000), fs=SR, output='sos'), y, axis=0)
        self.lead_used = 0.0
        if self.lead:
            m = np.abs(y[:int(0.7 * SR)]).mean(1); h = int(0.005 * SR); m = np.convolve(m, np.ones(h) / h, 'same')
            speak = np.argmax(m >= 0.5 * m.max()) / SR - 0.012          # piano speaks in ~12 ms: the reference
            self.lead_used = float(np.clip(speak, 0, self.lead))
            # note-off stays where written: trim what the head-start added at the end
            cut_n = int((self.lead - self.lead_used) * SR)
            if cut_n and len(y) > cut_n + int(self.release * SR):
                r = int(self.release * SR); y = y[:len(y) - cut_n]
                if r: y[-r:] *= (0.5 + 0.5 * np.cos(np.linspace(0, np.pi, r)))[:, None]
        return y * (0.6 + 0.4 * dyn)

class Kit:
    # General MIDI drum notes -> soft real percussion, no pitch shifting
    def __init__(self, mapping):
        self.map = {}
        for gm, (pattern, vel_re, ring) in mapping.items():
            fs = []
            for p in sorted(glob.glob(os.path.join(LIB, pattern))):
                m = re.search(vel_re, os.path.basename(p)) if vel_re else None
                fs.append((int(m.group(1)) if m else 1, p))
            assert fs, pattern
            self.map[gm] = (fs, ring)
    def play(self, note, dur, dyn, rng):
        fs, ring = self.map[note]
        layers = sorted({l for l, _ in fs}); L = layers[min(len(layers) - 1, int(dyn * len(layers)))]
        ps = [p for l, p in fs if l == L]; x = load(ps[rng.integers(len(ps))])
        n = min(len(x), int(ring * SR)); y = x[:n].copy(); r = min(n, int(0.05 * SR))
        y[-r:] *= np.linspace(1, 0, r)[:, None]
        self.lead_used = 0.0
        return y * (0.5 + 0.5 * dyn)

class Split:
    # one "section" made of several instruments split by range, e.g. violas low, violins high
    def __init__(self, *parts): self.parts = parts  # (lowest_note_inclusive, inst), ascending
    def part(self, note): return [i for lo, i in self.parts if note >= lo][-1]
    def play(self, note, dur, dyn, rng):
        p = self.part(note); y = p.play(note, dur, dyn, rng); self.lead_used = p.lead_used; return y

V = 'vsco2/'
INSTRUMENTS = {
    'piano':     lambda: Inst('salamander/Samples/[A-G]*v[0-9]*.flac', ring=0.9, release=0.45),
    'guitar':    lambda: Inst('nylon-guitar-flac/*/samples/*.flac', vel_re=None, ring=1.3, release=0.35, lead=0.04),
    'harp':      lambda: Inst(V + 'Strings/Harp/*.wav', vel_re=None, ring=1.8, release=0.5, tone=True),
    'glock':     lambda: Inst(V + 'Percussion/Glock/*.wav', 12, vel_re=None, ring=2.0, release=0.6),
    'marimba':   lambda: Inst(V + 'Percussion/Marimba/*.wav', 12, vel_re=None, ring=0.8, release=0.3, tone=True),
    'flute':     lambda: Inst(V + 'Woodwinds/Flute/susvib/*.wav', 12, sustain=True, release=0.18, attack=0.03, lead=0.12),
    'bass_pizz': lambda: Inst(V + 'Strings/Solo Contrabass/Pizz/*.wav', 12, ring=1.5, release=0.3, lead=0.04),
    'cello':     lambda: Inst(V + 'Strings/Cello Section/susvib/*.wav', 12, sustain=True, release=0.3, attack=0.04, lead=0.12),
    'cello_sus': lambda: Inst(V + 'Strings/Cello Section/susvib/*.wav', 12, sustain=True, release=0.6, attack=0.25, lead=0.15),
    'felt_piano': lambda: Inst('salamander/Samples/[A-G]*v[0-9]*.flac', ring=0.9, release=0.45, lp=2600),
    'clarinet':  lambda: Inst(V + 'Woodwinds/Clarinet/susLong/*.wav', 12, sustain=True, release=0.18, attack=0.02, fixes={'F#5': -1}, lead=0.2),
    'vln_pizz':  lambda: Inst(V + 'Strings/Violin Section/Pizz/*.wav', 12, ring=0.8, release=0.25, lead=0.04),
    'kit':       lambda: Kit({36: (V + 'VSCO 1 Percussion/drums/bass/bdrum_muted_pp*.wav', None, 0.8),
                              37: (V + 'VSCO 1 Percussion/drums/snare/OldSnare/snare_rim.wav', None, 0.4),
                              38: (V + 'Percussion/Snare2-taps_*.wav', r'_v(\d)_', 0.6),
                              42: (V + "VSCO 1 Percussion/varWood/Camo's Shaker/*.wav", None, 0.4)}),
    'pad':       lambda: Split((0, Inst(V + 'Strings/Viola Section/susvib/*.wav', 12, sustain=True, release=1.2, attack=0.8, lead=0.2)),
                               (67, Inst(V + 'Strings/Violin Section/susVib/*.wav', 12, sustain=True, release=1.2, attack=0.8, lead=0.2))),
    'strings':   lambda: Split((0, Inst(V + 'Strings/Viola Section/susvib/*.wav', 12, sustain=True, release=0.7, attack=0.35, lead=0.15)),
                               (67, Inst(V + 'Strings/Violin Section/susVib/*.wav', 12, sustain=True, release=0.7, attack=0.35, lead=0.15))),
}
_inst = {}
def inst(k):
    if k not in _inst: _inst[k] = INSTRUMENTS[k]()
    return _inst[k]

# ==================== ROOM ====================

def room_ir(rt60=2.1, predelay=0.02, seed=0):
    # band-split decaying noise: lows ring longer, highs die fast (a warm wooden room)
    rng = np.random.default_rng(seed); n = int(rt60 * 1.3 * SR); t = np.arange(n) / SR
    out = np.zeros(n)
    for lo, hi, k in [(None, 350, 1.15), (350, 2000, 1.0), (2000, 6000, 0.65), (6000, None, 0.35)]:
        sos = butter(2, [lo, hi] if lo and hi else (hi or lo), 'bandpass' if lo and hi else ('lowpass' if hi else 'highpass'), fs=SR, output='sos')
        out += sosfilt(sos, rng.standard_normal(n)) * np.exp(-6.9 * t / (rt60 * k))
    for d, g in zip(rng.uniform(0.004, 0.06, 10), np.linspace(0.6, 0.15, 10)):  # early reflections
        out[int(d * SR)] += g * rng.choice([-1, 1]) * 8
    out = np.concatenate([np.zeros(int(predelay * SR)), out])
    return out / np.sqrt(np.sum(out ** 2))

# ==================== RENDER ====================

def pan_gains(p): return np.cos((p + 1) * np.pi / 4), np.sin((p + 1) * np.pi / 4)

def render(events, total_sec, voice_map, swing=0.0, beats_per_bar=4, bpm=96, seed=7, tail=5.0, balance=None, room=0.55, wrap=True):
    """events: compose.py tuples. voice_map: voice -> list of layers, each
    dict(inst, dyn, level_db, transpose, pan, send, delay, stem).
    balance(stems) -> {stem: gain}, applied to dry and sends before the room.
    wrap=False keeps the full song plus its tail (for songs cut into loops later)."""
    rng = np.random.default_rng(seed)
    n_total = int((total_sec + tail) * SR); beat = 60.0 / bpm
    stems, sends, dsends = {}, {}, {}
    for bar, bt, dur_b, note, vel, voice, pan, rev_w, dly_w in events:
        b = bt - 1.0; frac = b - np.floor(b)
        if swing > 0 and abs(frac - 0.5) < 0.15: b = np.floor(b) + 0.5 + swing
        t0 = (bar - 1) * beats_per_bar * beat + b * beat
        for L in voice_map.get(voice, []):
            t = t0 + 0.002 + abs(rng.normal(0, L.get('loose', 0.008)))   # players sit a hair behind
            dyn = float(np.clip(vel * L['dyn'] * (1 + rng.normal(0, 0.07)), 0.02, 1.0))
            player = inst(L['inst']); m = note + L.get('transpose', 0)
            y = player.play(m, dur_b * beat, dyn, rng); t -= player.lead_used
            y = y * 10 ** (L.get('level_db', 0) / 20)
            gl, gr = pan_gains(L.get('pan', pan)); y = y * np.array([gl, gr]) * np.sqrt(2)
            i = int(t * SR)
            if i < 0: y = y[-i:]; i = 0
            j = min(n_total, i + len(y)); y = y[:j - i]
            s = L.get('stem', L['inst'])
            if s not in stems: stems[s], sends[s], dsends[s] = (np.zeros((n_total, 2)) for _ in range(3))
            stems[s][i:j] += y; sends[s][i:j] += y * L.get('send', rev_w)
            if L.get('delay', 0): dsends[s][i:j] += y * L['delay']
    gains = balance(stems) if balance else {}
    for k, gk in gains.items(): stems[k] *= gk; sends[k] *= gk; dsends[k] *= gk
    dsend = sum(dsends.values())
    # ping-pong dotted-eighth delay, darkening repeats
    dt = int(beat * 0.75 * SR); dl = np.zeros((n_total, 2)); lp = butter(1, 3000, fs=SR, output='sos')
    for k in range(4):
        sh = dt * (k + 1)
        if sh >= n_total: break
        tap = np.zeros((n_total, 2)); tap[sh:] = dsend[:n_total - sh] * 0.38 ** (k + 1)
        tap = sosfilt(lp, tap, axis=0); ch = k % 2; dl[:, ch] += tap.sum(1) * 0.6
    stems['delay'] = dl
    # one shared room so it sounds like one band in one place
    send = sum(sends.values()) + dl * 0.5
    irl, irr = room_ir(seed=1), room_ir(seed=2)
    wet = np.stack([fftconvolve(send[:, 0], irl)[:n_total], fftconvolve(send[:, 1], irr)[:n_total]], 1)
    stems['room'] = wet * room              # ~-11 dB under the dry band: roomy, still clear
    if not wrap: return stems
    n_loop = int(total_sec * SR)
    for k in stems:                       # wrap tails into the top: seamless loop
        stems[k][:n_total - n_loop] += stems[k][n_loop:]; stems[k] = stems[k][:n_loop]
    return stems

def master(stems, match_rms=None, ceiling_db=-1.0):
    x = sum(stems.values())
    x = sosfilt(butter(2, 30, 'highpass', fs=SR, output='sos'), x, axis=0)
    if match_rms: x *= match_rms / (np.sqrt(np.mean(x ** 2)) + 1e-12)
    c = 10 ** (ceiling_db / 20)
    over = np.abs(x) > c * 0.8                       # soft knee only on peaks
    x = np.where(over, np.sign(x) * (c * 0.8 + (c * 0.2) * np.tanh((np.abs(x) - c * 0.8) / (c * 0.2))), x)
    return x

def rms_of_wav(path):
    x, _ = sf.read(path); return float(np.sqrt(np.mean(x ** 2)))

def write(path, x):
    sf.write(path, x, SR, subtype='PCM_24')
    print('wrote', os.path.basename(path), f'{len(x)/SR:.1f}s peak={20*np.log10(np.max(np.abs(x))+1e-12):.1f}dB')
