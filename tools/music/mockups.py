# mockups.py — three music directions for Riso Runner, played on real recorded instruments
# (Salamander grand, VSCO-2 orchestra and percussion, FreePats nylon guitar) through sampler.py.
# The notes are written here; every sound is a recording. Library: ~/Music/squish-instruments.
#   ~/Music/squish-instruments/venv/bin/python mockups.py [citypop|kankyo|lofi] [outdir]
import sys, os, numpy as np, soundfile as sf
from scipy.signal import butter, sosfilt
import sampler as S

OUT = sys.argv[2] if len(sys.argv) > 2 else '.'
# xylophone: VSCO labels it an octave below how it sounds (measured), like the glockenspiel and marimba
S.INSTRUMENTS['xylo'] = lambda: S.Inst(S.V + 'Percussion/Xylo/*.wav', 12, vel_re=None, ring=0.6, release=0.2, tone=True)
rng = np.random.default_rng(3)

class Song:
    def __init__(self): self.ev = []
    # beat is 0-based within the bar; vel 0..1
    def n(self, bar, beat, dur, note, vel, voice, pan=0.0, rev=0.22, dly=0.0):
        self.ev.append((bar, beat + 1, dur, note, vel, voice, pan, rev, dly))
    def chord(self, bar, beat, dur, notes, vel, voice, **kw):
        for i, m in enumerate(notes): self.n(bar, beat + i * 0.006, dur, m, vel * (0.92 + 0.08 * (i == len(notes) - 1)), voice, **kw)

def active_rms(x):
    m = np.abs(x).mean(1); a = m > m.max() * 10 ** (-40 / 20) if m.max() > 0 else m > 0
    return float(np.sqrt(np.mean(x[a] ** 2))) if a.any() else 1e-9

def finish(stems, targets, name, rms=0.085, lofi=False, bpm=100, air=0.0):
    # level each stem to its target (dB, relative), master, then aim the whole mix at a gentle game level
    for k, d in targets.items():
        if k in stems: g = 0.1 * 10 ** (d / 20) / active_rms(stems[k]); stems[k] *= g
    x = sum(stems.values())
    # every filter below runs on the loop with its own end wrapped in front, so the seam stays seamless
    pad = S.SR; n0 = len(x); x = np.concatenate([x[-pad:], x])
    x = sosfilt(butter(2, 30, 'highpass', fs=S.SR, output='sos'), x, axis=0)
    if lofi:
        n = len(x); t = (np.arange(n) - pad) / S.SR
        # tape wobble: a slow wow and a little flutter in the playback speed
        T = n0 / S.SR; f1, f2 = round(0.45 * T) / T, round(6.1 * T) / T    # whole cycles per loop, so the seam stays clean
        warp = t + 0.0018 * np.sin(2 * np.pi * f1 * t) + 0.0003 * np.sin(2 * np.pi * f2 * t)
        x = np.stack([np.interp(warp * S.SR + pad, np.arange(n), x[:, c]) for c in (0, 1)], 1)
        x = sosfilt(butter(2, 5200, fs=S.SR, output='sos'), x, axis=0)          # a worn, warm top end
        hiss = sosfilt(butter(2, [800, 6000], 'bandpass', fs=S.SR, output='sos'), rng.standard_normal(n)) * 0.004
        crackle = np.zeros(n); k = rng.random(n) < 7 / S.SR                       # ~7 pops a second
        crackle[k] = rng.choice([-1, 1], k.sum()) * rng.uniform(0.02, 0.12, k.sum())
        crackle = sosfilt(butter(1, 2500, 'highpass', fs=S.SR, output='sos'), crackle)
        x = x + (hiss + crackle)[:, None] * active_rms(x) * 6
    if air: x = x + air * sosfilt(butter(2, 4500, 'highpass', fs=S.SR, output='sos'), x, axis=0)   # a lift on the top end
    x = x[pad:]; x *= rms / (np.sqrt(np.mean(x ** 2)) + 1e-12)
    c = 10 ** (-1 / 20); k = np.abs(x) > c * .8                       # soft knee on peaks only (no filtering)
    x = np.where(k, np.sign(x) * (c * .8 + c * .2 * np.tanh((np.abs(x) - c * .8) / (c * .2))), x)
    os.makedirs(OUT, exist_ok=True); p = os.path.join(OUT, name + '.wav'); S.write(p, x)
    return p

# ---------------------------------------------------------------------------------------------
# 1. CITY POP — "Night Drive". 102 bpm, D major. The classic loop: IVmaj7 – III7 – vi7 – v7 I7
#    (Gmaj9 – F#7(b13) – Bm9 – Am9 D13), then a lifted B section. Piano comps on the off-beats, a
#    plucked bass drives sixteenths, nylon guitar chops, strings pad and stab, flute sings.
# ---------------------------------------------------------------------------------------------
C = {  # name: (bass, voicing)
  'Gmaj9': (43, [59, 62, 66, 69]), 'F#7b13': (42, [58, 62, 64, 70]), 'Bm9': (47, [57, 61, 62, 66]),
  'Am9': (45, [55, 59, 60, 64]), 'D13': (38, [54, 60, 64, 71]), 'Em9': (40, [55, 59, 62, 66]),
  'A13': (45, [55, 61, 66, 71]), 'F#m9': (42, [57, 61, 64, 68]), 'Bm9o': (47, [57, 62, 66, 73]),
  'Gmaj9b': (43, [54, 57, 59, 62]), 'A/G': (43, [57, 61, 64, 69]), 'F#m7': (42, [57, 61, 64, 69]),
  'B7b13': (47, [57, 63, 67, 71]), 'Em7': (40, [55, 59, 62, 67]), 'A7sus': (45, [55, 59, 62, 64]),
}
CYC_A = [('Gmaj9', 4), ('F#7b13', 4), ('Bm9', 4), ('Am9', 2), ('D13', 2)]
CYC_B = [('Em9', 4), ('A13', 4), ('F#m9', 4), ('Bm9o', 4), ('Gmaj9b', 4), ('A/G', 4), ('F#m7', 2), ('B7b13', 2), ('Em7', 2), ('A7sus', 2)]

def citypop():
    s = Song(); bar = 1
    # sections: intro (2×A, no melody), A (2×A + flute), B (+ stabs), A' (1×A + flute), a last Gmaj9 bar
    plan = [('intro', CYC_A), ('intro2', CYC_A), ('A', CYC_A), ('A', CYC_A), ('B', CYC_B), ('A2', CYC_A), ('end', [('Gmaj9', 4)])]
    timeline = []
    for sec, cyc in plan:
        t = 0
        for name, d in cyc: timeline.append((sec, bar + t // 4, t % 4, name, d)); t += d
        bar += (t + 3) // 4
    total_bars = bar - 1
    for i, (sec, b, bt, name, d) in enumerate(timeline):
        root, v = C[name]; nxt = C[timeline[(i + 1) % len(timeline)][3]][0]
        appr = nxt - 1 if nxt > root else nxt + 1
        # bass: sixteenth push, octave pops, chromatic approach into the next chord
        pat = [(0, root, .45, .95), (.75, root, .18, .6), (1.5, root + 12, .2, .8), (2, root + 7, .4, .85), (2.75, root + 7, .18, .55), (3.25, root + 12, .18, .7), (3.5, appr, .45, .85)] if d == 4 \
            else [(0, root, .45, .95), (.75, root + 12, .2, .75), (1.25, root + 7, .2, .6), (1.5, appr, .45, .85)]
        for o, m, du, ve in pat:
            bb, bo = b + int((bt + o) // 4), (bt + o) % 4; s.n(bb, bo, du, m, ve, 'bass')
        # piano comping: on the beat, then pushes on the off-beats
        hits = [(0, 1.3, .62), (1.75, .5, .5), (2.5, .9, .55)] if d == 4 else [(0, .9, .6), (1.5, .4, .5)]
        for o, du, ve in hits: s.chord(b, bt + o, du, v, ve, 'keys')
        if sec != 'intro':   # nylon guitar chops on the off-beats, high voicing
            for o in ([.5, 1.5, 2.5, 3.25, 3.5] if d == 4 else [.5, 1.5]): s.chord(b, bt + o, .12, [m + 12 for m in v[1:]], .5, 'gtr')
        if sec in ('A', 'B', 'A2', 'end'): s.chord(b, bt, d - .1, [m + 12 for m in v[:3]], .5, 'pad')
    # string stabs at phrase ends in B, and into the last A
    for b in range(1, total_bars + 1):
        sec = next(x[0] for x in timeline if x[1] == b)
        if sec == 'B' and (b - 1) % 2 == 1: nm = next(x[3] for x in timeline if x[1] == b + 1) if b + 1 <= total_bars else 'Gmaj9'; s.chord(b, 3.5, .35, [m + 12 for m in C[nm][1]], .8, 'stab')
    # drums: muted kick, rim on 2 and 4, shaker sixteenths, a snare-tap fill every 8 bars
    for b in range(1, total_bars + 1):
        for o, ve in [(0, .9), (1.75, .55), (2.5, .75)]: s.n(b, o, .2, 36, ve, 'kit')
        if b > 2: [s.n(b, o, .2, 37, .75, 'kit') for o in (1, 3)]
        for k in range(16): s.n(b, k / 4, .1, 42, .55 if k % 2 == 0 else .32, 'kit')
        s.n(b, 3.75, .1, 38, .28, 'kit')
        if b % 8 == 0: [s.n(b, 3 + k / 4, .1, 38, .35 + .15 * k, 'kit') for k in range(4)]
    # the flute tune (A sections) and its lifted answer (B)
    A1 = [(0, 1, 78, .5), (0, 1.5, 81, .5), (0, 2, 83, 1), (0, 3, 81, .5), (0, 3.5, 78, .5),
          (1, 0, 76, 1), (1, 1, 74, .5), (1, 1.5, 73, .5), (1, 2, 70, 1.5),
          (2, .5, 71, .5), (2, 1, 74, .5), (2, 1.5, 78, .5), (2, 2, 81, 1), (2, 3, 78, 1),
          (3, 0, 79, .75), (3, .75, 76, .75), (3, 1.5, 72, .5), (3, 2, 78, .5), (3, 2.5, 76, .5), (3, 3, 74, 1)]
    A2 = A1[:9] + [(2, 0, 71, .5), (2, .5, 74, .5), (2, 1, 76, .5), (2, 1.5, 78, .5), (2, 2, 81, 1.5), (3, 0, 83, 1), (3, 1, 81, 1), (3, 2, 81, 2)]
    Bm = [(0, 0, 83, 2), (0, 2, 81, 1), (0, 3, 79, 1), (1, 0, 78, 3), (1, 3, 76, 1), (2, 0, 81, 1.5), (2, 1.5, 76, .5), (2, 2, 73, 2),
          (3, 0, 74, 1), (3, 1, 78, 1), (3, 2, 83, 2), (4, 0, 86, 2), (4, 2, 85, 1), (4, 3, 83, 1), (5, 0, 81, 3), (5, 3, 76, 1),
          (6, 0, 78, 1.5), (6, 1.5, 81, .5), (6, 2, 79, 1), (6, 3, 75, 1), (7, 0, 76, 2)]
    starts = {}
    for sec, b, bt, name, d in timeline: starts.setdefault((sec, (b - 1)), b)
    a_bars = sorted({b for sec, b, *_ in timeline if sec == 'A'})
    for k, b0 in enumerate([a_bars[0], a_bars[4]]): [s.n(b0 + bb, o, du, m, .78, 'lead', dly=.25) for bb, o, m, du in (A1 if k == 0 else A2)]
    b0 = min(b for sec, b, *_ in timeline if sec == 'B'); [s.n(b0 + bb, o, du, m, .82, 'lead', dly=.25) for bb, o, m, du in Bm]
    b0 = min(b for sec, b, *_ in timeline if sec == 'A2'); [s.n(b0 + bb, o, du, m, .78, 'lead', dly=.25) for bb, o, m, du in A1]
    bpm = 102
    vm = {'keys': [dict(inst='piano', dyn=.75, pan=-.12, send=.22)], 'bass': [dict(inst='bass_pizz', dyn=1.0, send=.08)],
          'gtr': [dict(inst='guitar', dyn=.7, pan=.35, send=.18)], 'pad': [dict(inst='pad', dyn=.55, send=.4)],
          'stab': [dict(inst='strings', dyn=.9, send=.3, stem='stab')], 'lead': [dict(inst='flute', dyn=.85, pan=.05, send=.35, delay=.22)],
          'kit': [dict(inst='kit', dyn=.95, send=.1)]}
    stems = S.render(s.ev, total_bars * 4 * 60 / bpm, vm, bpm=bpm, seed=11)
    return finish(stems, {'piano': -3, 'bass_pizz': -3, 'guitar': -6, 'pad': -10, 'stab': -7, 'flute': -2, 'kit': -3}, 'riso-citypop-night-drive', bpm=bpm, air=.9)

# ---------------------------------------------------------------------------------------------
# 2. KANKYŌ ONGAKU — "Paper Garden". 78 bpm, D lydian colours. Two marimbas play the same eighth-note
#    figure and drift a step apart (Reich-style phasing), harp rolls each chord, felt piano holds it,
#    glockenspiel and flute float on top in the last pass.
# ---------------------------------------------------------------------------------------------
def kankyo():
    s = Song(); bpm = 78
    chords = [(38, [57, 61, 64, 66], [66, 69, 76, 69, 74, 69, 71, 69]),          # Dmaj9
              (35, [57, 62, 64, 66], [66, 69, 74, 69, 73, 69, 71, 66]),          # Bm11
              (43, [54, 57, 59, 61], [66, 71, 73, 71, 78, 71, 69, 66]),          # Gmaj9#11
              (45, [62, 64, 71, 69], [69, 71, 76, 71, 74, 71, 69, 64])]          # A6/9sus
    passes = 3; bars = passes * 8
    for p in range(passes):
        for c, (root, v, fig) in enumerate(chords):
            b0 = 1 + p * 8 + c * 2
            s.chord(b0, 0, 7.8, v, .35, 'keys')
            for k, m in enumerate(v + [v[-1] + 12]): s.n(b0, k * .25, 2, m + 12, .45, 'harp', pan=-.3)
            s.n(b0, 0, 7.5, root, .55, 'bass')
            if p >= 1: s.chord(b0, 0, 7.6, [m + 12 for m in v[:3]], .45, 'pad')
            for bb in range(2):
                for k in range(8):
                    s.n(b0 + bb, k * .5, .45, fig[k], .62 if k % 4 == 0 else .48, 'mar1', pan=-.45)
                    if p >= 1: s.n(b0 + bb, k * .5 + (.5 if p == 1 else .25), .45, fig[(k + 3) % 8], .4, 'mar2', pan=.45)
            if p >= 1: [s.n(b0 + bb, 3.5, .1, 42, .25, 'kit') for bb in range(2)]
    mel = [(0, 0, 81, 3), (0, 3, 78, 1), (1, 0, 76, 4), (2, 0, 78, 2), (2, 2, 81, 2), (3, 0, 74, 4),
           (4, 0, 78, 3), (4, 3, 81, 1), (5, 0, 83, 2), (5, 2, 81, 2), (6, 0, 76, 3), (6, 3, 74, 1), (7, 0, 76, 4)]
    for bb, o, m, du in mel: s.n(17 + bb * 1, o, du * 1, m, .7, 'lead', dly=.3)
    for b, o, m in [(9, 2, 85), (11, 0, 83), (13, 2, 81), (15, 1, 78), (18, 2, 85), (20, 0, 90), (22, 2, 88)]: s.n(b, o, 1, m, .35, 'glock', pan=.25)
    vm = {'keys': [dict(inst='felt_piano', dyn=.6, send=.35)], 'harp': [dict(inst='harp', dyn=.7, send=.4)], 'bass': [dict(inst='cello_sus', dyn=.6, send=.3)],
          'pad': [dict(inst='pad', dyn=.5, send=.5)], 'mar1': [dict(inst='marimba', dyn=.8, send=.3, stem='mar1')], 'mar2': [dict(inst='marimba', dyn=.7, send=.3, stem='mar2')],
          'kit': [dict(inst='kit', dyn=.6, send=.2)], 'lead': [dict(inst='flute', dyn=.75, send=.45, delay=.3)], 'glock': [dict(inst='glock', dyn=.5, send=.5)]}
    stems = S.render(s.ev, bars * 4 * 60 / bpm, vm, bpm=bpm, seed=5)
    return finish(stems, {'felt_piano': -6, 'harp': -7, 'cello_sus': -8, 'pad': -11, 'mar1': -2, 'mar2': -5, 'kit': -14, 'flute': -3, 'glock': -9}, 'riso-kankyo-paper-garden', rms=.075, air=.7)

# ---------------------------------------------------------------------------------------------
# 3. JAZZY LO-FI — "Rain on the Plate". 82 bpm, swung. ii–V–I–VI7 in D (Em9 – A13 – Dmaj9 – B7b13),
#    felt piano, walking double bass, soft kit, a clarinet tune, then tape wobble and vinyl crackle.
# ---------------------------------------------------------------------------------------------
def lofi():
    s = Song(); bpm = 82
    prog = [([40, 43, 45, 44], [55, 59, 62, 66]), ([45, 49, 52, 51], [55, 61, 66, 71]), ([50, 54, 52, 48], [57, 61, 64, 66]), ([47, 51, 54, 41], [57, 63, 67, 72])]
    bars = 20
    for b in range(1, bars + 1):
        walk, v = prog[(b - 1) % 4]
        for k, m in enumerate(walk): s.n(b, k, .85, m, .72 if k == 0 else .6, 'bass')
        s.chord(b, 0, 1.4, v, .5, 'keys'); s.chord(b, 1.5, .45, v, .38, 'keys')
        if b % 2 == 0: s.chord(b, 3.5, .4, [m + 12 for m in v[1:]], .3, 'keys')
        for o, ve in [(0, .8), (2.5, .6)] + ([(1.5, .4)] if b % 4 == 3 else []): s.n(b, o, .2, 36, ve, 'kit')
        for o in (1, 3): s.n(b, o, .2, 38, .5, 'kit')
        for k in range(8): s.n(b, k * .5, .1, 42, .38 if k % 2 == 0 else .26, 'kit')
    ph1 = [(0, 1, 71, .5), (0, 1.5, 74, .5), (0, 2, 76, 1.5), (0, 3.5, 74, .5), (1, 0, 73, 1), (1, 1, 71, .5), (1, 1.5, 69, 1.5),
           (2, .5, 66, .5), (2, 1, 69, .5), (2, 1.5, 73, .5), (2, 2, 76, 2), (3, 0, 75, 1), (3, 1, 72, .5), (3, 1.5, 69, 1.5)]
    ph2 = [(0, 1, 76, .5), (0, 1.5, 78, .5), (0, 2, 79, 1.5), (0, 3.5, 78, .5), (1, 0, 76, 1), (1, 1, 73, .5), (1, 1.5, 71, 1.5),
           (2, .5, 69, .5), (2, 1, 73, .5), (2, 1.5, 76, .5), (2, 2, 78, 1), (2, 3, 76, 1), (3, 0, 75, 1.5), (3, 1.5, 71, .5), (3, 2, 69, 2)]
    for b0, ph in [(5, ph1), (9, ph2), (13, ph1), (17, ph2)]:
        for bb, o, m, du in ph: s.n(b0 + bb, o, du, m, .7, 'lead', dly=.2)
    vm = {'keys': [dict(inst='felt_piano', dyn=.75, pan=-.1, send=.25)], 'bass': [dict(inst='bass_pizz', dyn=.95, send=.1)],
          'kit': [dict(inst='kit', dyn=.8, send=.12)], 'lead': [dict(inst='clarinet', dyn=.75, pan=.1, send=.3, delay=.2)]}
    stems = S.render(s.ev, bars * 4 * 60 / bpm, vm, bpm=bpm, swing=.16, seed=9)
    return finish(stems, {'felt_piano': -3, 'bass_pizz': -1, 'kit': -5, 'clarinet': -3}, 'riso-lofi-rain-on-the-plate', lofi=True, rms=.08)

# ---------------------------------------------------------------------------------------------
# 4. FUSION — "Summer Press", in the spirit of Masayoshi Takanaka: bright, sunny jazz-fusion with a samba
#    lift. 120 bpm, E major. Nylon guitar sings the tune with flute an octave above it; montuno piano,
#    a samba bass, partido-alto rim clicks and shaker, xylophone answers and string hits. Original tune.
# ---------------------------------------------------------------------------------------------
F = {'Emaj9': (40, [56, 59, 63, 66]), 'C#m9': (37, [52, 56, 59, 63]), 'Amaj9': (45, [56, 59, 61, 64]), 'B13sus': (47, [57, 61, 64, 68]),
     'F#m9': (42, [57, 61, 64, 68]), 'G#m7': (44, [54, 59, 63, 66]), 'C#m7': (37, [52, 56, 59, 64]), 'F#9': (42, [52, 56, 58, 61]),
     'Bsus': (47, [52, 57, 59, 64]), 'B7#9': (47, [51, 57, 62, 63])}
A_CH = ['Emaj9', 'C#m9', 'Amaj9', 'B13sus']
B_CH = ['F#m9', 'G#m7', 'Amaj9', 'B13sus', 'C#m7', 'F#9', 'Bsus', 'B7#9']
def fusion():
    s = Song(); bpm = 120
    plan = [('intro', A_CH), ('A', A_CH), ('A2', A_CH), ('B', B_CH), ('A', A_CH), ('A3', A_CH)]
    bars = []
    for sec, ch in plan: bars += [(sec, c) for c in ch]
    for i, (sec, name) in enumerate(bars):
        b = i + 1; root, v = F[name]; nxt = F[bars[(i + 1) % len(bars)][1]][0]
        # samba bass: root on one, the fifth on the "a" of two and on three, a pickup into the next bar
        for o, m, du, ve in [(0, root, .7, .95), (1.75, root + 7, .25, .7), (2, root + 7, .7, .85), (3.5, root + 12, .2, .6), (3.75, nxt - 1 if nxt > root else nxt + 1, .25, .75)]:
            s.n(b, o, du, m, ve, 'bass')
        # montuno piano: syncopated stabs, the top note alternating up an octave
        for k, (o, du) in enumerate([(0, .4), (.75, .25), (1.5, .4), (2.5, .4), (3.25, .25), (3.5, .4)]):
            vv = v if k % 2 == 0 else v[1:] + [v[0] + 12]; s.chord(b, o, du, [m + 12 for m in vv], .55 if k % 2 == 0 else .45, 'keys')
        if sec != 'intro': s.chord(b, 0, 3.8, [m + 12 for m in v[:3]], .4, 'pad')
        # kit: kick on one and three (surdo feel, three stronger), partido-alto rim, shaker sixteenths
        for o, ve in [(0, .7), (2, .9), (3.5, .45)]: s.n(b, o, .2, 36, ve, 'kit')
        for k in (3, 6, 10, 12, 14) if b % 2 else (2, 4, 7, 10, 13): s.n(b, k / 4, .1, 37, .7, 'kit')
        for k in range(16): s.n(b, k / 4, .1, 42, .6 if k % 4 == 0 else .42 if k % 2 == 0 else .3, 'kit')
        if b % 4 == 0: [s.n(b, 3 + k / 4, .1, 38, .3 + .15 * k, 'kit') for k in range(4)]
        if sec == 'B' and b % 2 == 0: s.chord(b, 3.5, .3, [m + 12 for m in F[bars[(i + 1) % len(bars)][1]][1]], .85, 'stab')
    TA = [(0, .5, 71, .5), (0, 1, 76, .5), (0, 1.5, 78, .25), (0, 1.75, 80, .75), (0, 2.5, 78, .5), (0, 3, 76, .5), (0, 3.5, 71, .5),
          (1, 0, 73, .75), (1, .75, 76, .25), (1, 1, 80, 1), (1, 2, 78, .5), (1, 2.5, 76, .5), (1, 3, 75, 1),
          (2, 0, 73, .5), (2, .5, 76, .5), (2, 1, 80, .5), (2, 1.5, 83, 1.5), (2, 3, 81, .5), (2, 3.5, 80, .5),
          (3, 0, 78, 1.5), (3, 1.5, 76, .25), (3, 1.75, 78, .25), (3, 2, 81, 1), (3, 3, 80, .5), (3, 3.5, 78, .5)]
    TA2 = TA[:-6] + [(3, 0, 76, 2), (3, 2.5, 83, .25), (3, 2.75, 85, .25), (3, 3, 88, 1)]
    TB = [(0, 0, 81, 1.5), (0, 1.5, 80, .5), (0, 2, 78, 2), (1, 0, 83, 2), (1, 2, 80, 1), (1, 3, 75, 1),
          (2, 0, 76, .5), (2, .5, 80, .5), (2, 1, 83, .5), (2, 1.5, 85, 2.5), (3, 0, 83, 1), (3, 1, 81, 1), (3, 2, 78, 2),
          (4, 0, 80, 1.5), (4, 1.5, 76, .5), (4, 2, 73, 2), (5, 0, 82, 1), (5, 1, 80, 1), (5, 2, 76, 2),
          (6, 0, 78, 2), (6, 2, 76, 1), (6, 3, 78, 1), (7, 0, 81, 1), (7, 1, 74, 1), (7, 2, 75, 2)]
    first = {}
    for i, (sec, _) in enumerate(bars): first.setdefault(sec, []).append(i + 1)
    starts = [i + 1 for i in range(len(bars)) if i == 0 or bars[i][0] != bars[i - 1][0] or (bars[i][0] == 'A' and i % 4 == 0)]
    for b0 in starts:
        sec = bars[b0 - 1][0]
        tune = {'A': TA, 'A2': TA2, 'A3': TA, 'B': TB}.get(sec)
        if tune:
            for bb, o, m, du in tune:
                s.n(b0 + bb, o, du, m, .8, 'lead', dly=.15)
                s.n(b0 + bb, o, du, m + 12 if m + 12 <= 93 else m, .8, 'lead_fl', dly=.15)   # flute an octave up, in unison where that's past its range
    # xylophone answers in the tune's rests (end of each A phrase)
    for b0 in starts:
        if bars[b0 - 1][0] in ('A', 'A2', 'A3'):
            for o, m in [(3.25, 83), (3.5, 85), (3.75, 88)]: s.n(b0 + 1, o, .2, m, .5, 'xylo', pan=.4)
    vm = {'keys': [dict(inst='piano', dyn=.7, pan=-.2, send=.18)], 'bass': [dict(inst='bass_pizz', dyn=1.0, send=.06)],
          'pad': [dict(inst='strings', dyn=.5, send=.35)], 'stab': [dict(inst='strings', dyn=.9, send=.3, stem='stab')],
          'kit': [dict(inst='kit', dyn=.95, send=.08)], 'xylo': [dict(inst='xylo', dyn=.7, send=.3)],
          'lead': [dict(inst='guitar', dyn=.95, pan=.1, send=.22, delay=.15, stem='lead_gtr')], 'lead_fl': [dict(inst='flute', dyn=.6, pan=-.05, send=.3, stem='lead_fl')]}
    stems = S.render(s.ev, len(bars) * 4 * 60 / bpm, vm, bpm=bpm, seed=21)
    return finish(stems, {'piano': -4, 'bass_pizz': -2, 'strings': -11, 'stab': -6, 'kit': -2, 'xylo': -9, 'lead_gtr': -1, 'lead_fl': -8},
                  'riso-fusion-summer-press', bpm=bpm, air=1.0)

if __name__ == '__main__':
    which = sys.argv[1] if len(sys.argv) > 1 else 'all'
    for name, fn in [('citypop', citypop), ('kankyo', kankyo), ('lofi', lofi), ('fusion', fusion)]:
        if which in ('all', name): fn()
