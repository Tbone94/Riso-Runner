# loops.py — cut seamless, bar-aligned loops from ACE-Step takes, master them, and encode them for the game.
#   python3 loops.py audition <take> [<take> ...]   loops into tools/music/out/loops/ to listen to (out/loops.html)
#   python3 loops.py build                          the picks in PICKS into music/ (committed, shipped with the game)
# Uses numpy (system python3) and macOS afconvert for decoding and AAC encoding.
#
# How a loop is made:
#  1. Find the beat grid: the onset envelope is matched against a comb near the direction's set tempo.
#  2. Keep the steady middle: bars much quieter than the median (intros, outros, breakdowns) are skipped.
#  3. Pick a start bar and a whole number of bars so the bar before the end sounds like the bar before the
#     start (same chord, same place in the phrase), then crossfade the end into the audio just before the start.
#  4. Level to about -18 dBFS RMS, with a gentle peak limiter at -1 dBFS.
#  5. Pad one second of the loop's own audio on both ends: the file is periodic throughout, so the game's loop
#     points stay seamless even if an AAC decoder shifts the audio by its priming samples.
import json, os, subprocess, sys, tempfile, wave
import numpy as np
sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from ace_api import DIRS

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, 'out')
GAME = os.path.join(HERE, '..', '..', 'music')
SR, HOP, NFFT = 48000, 512, 2048
PAD = 1.0                 # seconds of periodic padding on each side
TARGET_RMS = -18.0        # dBFS
CEIL = 10 ** (-1 / 20)    # limiter ceiling, -1 dBFS
KBPS = 128

# region -> take (file in out/): the first set, shipped in v1 (2026-10-03).
PICKS = {'forest': 'fusion-2.mp3', 'autumn': 'citypop-1.mp3', 'jungle': 'fusion-1.mp3', 'desert': 'fusion-3.mp3',
         'snow': 'kankyo-1.mp3', 'night': 'lofi-1.mp3'}

def decode(path):
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, 'a.wav')
        subprocess.run(['afconvert', '-f', 'WAVE', '-d', f'LEI24@{SR}', '-c', '2', path, w], check=True)
        with wave.open(w) as f:
            n, raw = f.getnframes(), f.readframes(f.getnframes())
    b = np.frombuffer(raw, np.uint8).reshape(-1, 3).astype(np.int32)
    v = (b[:, 0] | (b[:, 1] << 8) | (b[:, 2] << 16)); v = np.where(v >= 1 << 23, v - (1 << 24), v)
    return (v / float(1 << 23)).reshape(n, 2).astype(np.float64)

def decode_seconds(path):
    out = subprocess.run(['afinfo', path], capture_output=True, text=True).stdout
    return float(out.split('estimated duration:')[1].split()[0])

def write_wav(path, x):
    v = np.clip(np.round(x * (1 << 23)), -(1 << 23), (1 << 23) - 1).astype(np.int32).reshape(-1)
    b = np.stack([v & 255, (v >> 8) & 255, (v >> 16) & 255], 1).astype(np.uint8)
    with wave.open(path, 'wb') as f:
        f.setnchannels(2); f.setsampwidth(3); f.setframerate(SR); f.writeframes(b.tobytes())

def encode(x, path):
    with tempfile.TemporaryDirectory() as d:
        w = os.path.join(d, 'a.wav'); write_wav(w, x)
        subprocess.run(['afconvert', '-f', 'm4af', '-d', 'aac', '-b', str(KBPS * 1000), '-q', '127', w, path], check=True)

def spectra(mono):
    win = np.hanning(NFFT); n = 1 + (len(mono) - NFFT) // HOP
    idx = np.arange(NFFT)[None, :] + HOP * np.arange(n)[:, None]
    return np.abs(np.fft.rfft(mono[idx] * win, axis=1))

def bands(S, nb=32, lo=40, hi=12000):
    f = np.fft.rfftfreq(NFFT, 1 / SR); edges = np.geomspace(lo, hi, nb + 1)
    return np.stack([S[:, (f >= edges[i]) & (f < edges[i + 1])].sum(1) for i in range(nb)], 1)

def beat_grid(onset, low, bpm0):
    """Best (period in frames, phase in frames) near bpm0, and the downbeat offset 0..3."""
    fps = SR / HOP; t = np.arange(len(onset))
    best = (-1, 0, 0)
    for bpm in np.arange(bpm0 * .96, bpm0 * 1.04, .01):
        P = 60 * fps / bpm; nb = int((len(onset) - P) / P)
        for ph in np.arange(0, P, .5):
            pos = ph + P * np.arange(nb); score = np.interp(pos, t, onset).mean()
            if score > best[0]: best = (score, P, ph)
    _, P, ph = best
    beats = ph + P * np.arange(int((len(onset) - ph) / P))
    kick = np.interp(beats, t, low)
    down = int(np.argmax([kick[o::4].mean() for o in range(4)]))
    return P, ph, down, 60 * fps / P

def limiter(x, hold=.02):
    """Peak limiter for a periodic signal (worked on three copies, the middle kept). The gain is the minimum of
    the needed gain over +-hold, then averaged over hold: it reaches each peak's gain in time and eases back."""
    n = len(x); y = np.concatenate([x, x, x]); need = np.minimum(1, CEIL / np.maximum(np.abs(y).max(1), 1e-9))
    h = int(hold * SR); w = np.lib.stride_tricks.sliding_window_view
    m = w(np.pad(need, (h, h), constant_values=1), 2 * h + 1).min(1)
    g = np.convolve(m, np.ones(h) / h, 'same')
    return (y * np.minimum(g, need)[:, None])[n:2 * n]

def cut(x, start, n, bar_len, rms=TARGET_RMS):
    """x[start:start+n] with its last half bar crossfaded (equal power) into the audio just before start, then mastered."""
    Fx = int(bar_len / 2); L = x[start:start + n].copy()
    t = np.linspace(0, 1, Fx)[:, None]
    L[n - Fx:] = L[n - Fx:] * np.cos(t * np.pi / 2) + x[start - Fx:start] * np.sin(t * np.pi / 2)
    for _ in range(2):                          # level, limit, level again
        L *= 10 ** ((rms - rms_db(L)) / 20)
        L = limiter(L)
    return L

def lag(env_a, env_b, max_s=.6):
    """Frames by which env_b runs late against env_a (cross-correlation of onset envelopes)."""
    m = int(max_s * SR / HOP); n = min(len(env_a), len(env_b)) - 2 * m
    a = env_a[m:m + n] - env_a[m:m + n].mean()
    sc = [float(np.dot(a, env_b[m + k:m + k + n] - env_b[m + k:m + k + n].mean())) for k in range(-m, m + 1)]
    return int(np.argmax(sc)) - m, max(sc) / (np.linalg.norm(a) * np.linalg.norm(env_b[m:m + n] - env_b[m:m + n].mean()) + 1e-9)

def rms_db(x): return 20 * np.log10(np.sqrt((x ** 2).mean()) + 1e-12)

def make_loop(path, min_s=24, max_s=56, at=None):
    name = os.path.basename(path).rsplit('.', 1)[0]; direction = name.split('-')[0]; bpm0 = DIRS[direction]['bpm']
    x = decode(path); mono = x.mean(1)
    S = spectra(mono); B = np.log(bands(S) + 1e-6)
    onset = np.maximum(0, np.diff(B, axis=0)).sum(1); onset = np.concatenate([[0], onset]); onset -= np.convolve(onset, np.ones(32) / 32, 'same')
    onset = np.maximum(onset, 0)
    low = np.concatenate([[0], np.maximum(0, np.diff(B[:, :5], axis=0)).sum(1)])
    P, ph, down, bpm = beat_grid(onset, low, bpm0)
    bar_f = 4 * P; first = ph + down * P                       # frames
    bars = first + bar_f * np.arange(int((len(onset) - first) / bar_f))
    bar_s = (bars * HOP + NFFT / 2).astype(int)                 # bar starts in samples
    bar_len = bar_f * HOP                                       # samples per bar (float)
    # loudness per bar; the steady part is the longest run of bars within 5 dB of the median
    loud = np.array([rms_db(x[s:s + int(bar_len)]) for s in bar_s[:-1]])
    ok = loud > np.median(loud) - 5
    runs, cur = [], []
    for i, o in enumerate(ok):
        if o: cur.append(i)
        elif cur: runs.append(cur); cur = []
    if cur: runs.append(cur)
    steady = max(runs, key=len); lo_b, hi_b = steady[0] + 1, steady[-1]   # keep a bar of margin at the start
    # features per frame for matching: band energies (normalised), averaged per beat
    F = B - B.mean(0); F /= F.std(0) + 1e-6                     # timbre: how each band departs from the take's average
    f = np.fft.rfftfreq(NFFT, 1 / SR); sel = (f > 80) & (f < 4000)
    pc = np.round(12 * np.log2(f[sel] / 440)).astype(int) % 12
    C = np.stack([S[:, sel][:, pc == k].sum(1) for k in range(12)], 1); C /= C.sum(1, keepdims=True) + 1e-9
    C = (C - C.mean(0)) / (C.std(0) + 1e-6)                     # harmony: the chord being played
    F = np.concatenate([F, 1.5 * C], 1)
    def feat(b0, nbars):                                       # mean feature vector per beat over nbars from bar b0
        fr = bars[b0] + P * np.arange(int(4 * nbars) + 1)
        return np.stack([F[int(fr[i]):int(fr[i + 1])].mean(0) for i in range(len(fr) - 1)])
    def sim(a, b): a = a - a.mean(); b = b - b.mean(); return float((a * b).sum() / np.sqrt((a * a).sum() * (b * b).sum() + 1e-12))
    best = None
    for nb in range(4, 33, 4):
        secs = nb * bar_len / SR
        if secs < min_s or secs > max_s: continue
        for a in range(max(lo_b, 1), hi_b - nb + 1):
            e = a + nb
            s = sim(feat(a - 1, 1), feat(e - 1, 1))            # the bar leading into the start vs into the end
            if e + 1 <= hi_b: s = .6 * s + .4 * sim(feat(a, 1), feat(e, 1))
            s += .01 * (nb / 32)                               # nudge toward longer loops
            if best is None or s > best[0]: best = (s, a, nb)
    score, a, nb = best
    start = int(round(bars[a] * HOP + NFFT / 2)); n = int(round(nb * bar_len))
    if at is not None: start, n = at            # reuse another take's loop (a cover of it): same bars
    L = cut(x, start, n, bar_len)
    p = int(PAD * SR)
    full = np.concatenate([L[-p:], L, L[:p]])
    jump = np.abs(L[0] - L[-1]).max(); typ = np.abs(np.diff(L, axis=0)).mean(0).max()
    info = dict(take=name, bpm=round(bpm, 2), bars=nb, start=round(start / SR, 2), loop=n / SR, samples=n, pad=PAD,
                match=round(score, 3), rms=round(rms_db(L), 1), peak=round(20 * np.log10(np.abs(L).max()), 1),
                seam=round(float(jump / (typ + 1e-12)), 2), steady=[round(bar_s[lo_b] / SR, 1), round(bar_s[hi_b] / SR, 1)])
    return full, info, (start, n), onset

def main():
    cmd = sys.argv[1] if len(sys.argv) > 1 else 'audition'
    if cmd == 'audition':
        d = os.path.join(OUT, 'loops'); os.makedirs(d, exist_ok=True); man_p = os.path.join(d, 'loops.json')
        man = json.load(open(man_p)) if os.path.exists(man_p) else {}
        for t in sys.argv[2:]:
            full, info, _, _ = make_loop(os.path.join(OUT, t)); encode(full, os.path.join(d, info['take'] + '.m4a'))
            man[info['take']] = info; print(json.dumps(info))
        json.dump(man, open(man_p, 'w'), indent=1)
    elif cmd == 'theme':                        # python3 loops.py theme <main> region=<cover> ... [--game]
        covers = dict(a.split('=', 1) for a in sys.argv[3:] if '=' in a)
        build_theme(sys.argv[2], covers, GAME if '--game' in sys.argv else os.path.join(OUT, 'theme'))
    elif cmd == 'build':
        os.makedirs(GAME, exist_ok=True); man = {}
        for region, t in PICKS.items():
            full, info, _, _ = make_loop(os.path.join(OUT, t)); encode(full, os.path.join(GAME, region + '.m4a'))
            man[region] = dict(file=region + '.m4a', loop=info['loop'], pad=PAD, take=info['take'], bpm=info['bpm']); print(region, json.dumps(info))
        json.dump(man, open(os.path.join(GAME, 'music.json'), 'w'), indent=1)

def build_theme(main, covers, dest):
    """The theme's loop, and the same bars from each region's cover of it (shifted if the cover runs early or late)."""
    os.makedirs(dest, exist_ok=True)
    full, info, (start, n), env0 = make_loop(os.path.join(OUT, main)); loops = {}
    print('theme', json.dumps(info))
    for region, t in covers.items():
        path = os.path.join(OUT, t)
        if t == main: f2, i2 = full, info
        else:
            _, _, _, env = make_loop(path)
            k, c = lag(env0, env); shift = int(round(k * HOP))
            f2, i2, _, _ = make_loop(path, at=(start + shift, n))
            i2['lag_ms'] = round(1000 * shift / SR); i2['beat_match'] = round(c, 2)
        encode(f2, os.path.join(dest, region + '.m4a'))
        loops[region] = dict(file=region + '.m4a', loop=n / SR, pad=PAD, take=i2['take'])
        print(region, json.dumps({k: i2[k] for k in i2 if k in ('take', 'lag_ms', 'beat_match', 'rms', 'peak', 'seam')}))
    json.dump(dict(sync=True, theme=main, bpm=info['bpm'], bars=info['bars'], loops=loops), open(os.path.join(dest, 'music.json'), 'w'), indent=1)

if __name__ == '__main__':
    main()
