# ace_api.py — instrumental music from ACE-Step 1.5 through the acemusic.ai API.
#   python3 ace_api.py <direction> [takes] [seconds] [--think]      new takes from a text prompt
#   python3 ace_api.py cover <source> <region> [strength] [takes]   re-arrange a take for a region, keeping its melody and timing
# The API key is read from ~/.config/acemusic/key (never stored in the repo).
# Writes tools/music/out/<name>-<n>.<ext>.
import json, sys, os, base64, time, ssl, subprocess, urllib.request, urllib.error
try:
    import certifi; CTX = ssl.create_default_context(cafile=certifi.where())   # python.org builds ship without system certificates
except ImportError: CTX = None

KEY_FILE = os.path.expanduser('~/.config/acemusic/key')   # read only when a take is made, so DIRS can be imported freely
URL = 'https://api.acemusic.ai/v1/chat/completions'
OUT = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out')

DIRS = {
  'fusion': dict(bpm=120, key='E major', prompt=(
    'Japanese jazz fusion, 1980s, bright and sunny, tropical summer, clean electric guitar lead melody with singing sustain, '
    'funky slap bass, Fender Rhodes electric piano, brass section stabs, latin percussion, congas, shaker, tight funky live drums, '
    'major seventh chords, uplifting, polished studio production')),
  'citypop': dict(bpm=104, key='D major', prompt=(
    'Japanese city pop, 1980s, smooth and jazzy, night drive, Fender Rhodes electric piano, funky fingered bass, '
    'clean electric guitar cutting, warm analog synth pads, alto saxophone melody, crisp live drums, major seventh chords, lush, nostalgic, polished')),
  'kankyo': dict(bpm=78, key='D major', prompt=(
    'Japanese ambient, kankyo ongaku, 1980s environmental music, soft Fender Rhodes, marimba, gentle warm synth pads, '
    'minimal repeating melody, calm, airy, pastel, peaceful')),
  'lofi': dict(bpm=84, key='D major', prompt=(
    'lofi jazz hop, mellow Fender Rhodes, upright bass, soft brushed drums, vinyl crackle, warm tape, relaxed, cozy')),
  # the one theme for the whole game; each region gets a cover of the chosen take (VARIANTS)
  'theme': dict(bpm=96, key='F major', prompt=(
    'chill Japanese city pop instrumental, 1980s, warm and laid-back, memorable singable alto saxophone lead melody, '
    'clean electric guitar with chorus answering the saxophone, Fender Rhodes electric piano, smooth fingered bass, soft tight drums, '
    'light shaker, major seventh chords, a simple catchy hook that comes back, relaxed sunny afternoon, polished studio production')),
}

# The theme re-arranged for each region: same melody and timing, a different band and mood.
VARIANTS = {
  'forest': 'chill Japanese city pop instrumental, warm alto saxophone lead melody, clean chorus electric guitar, Fender Rhodes, smooth bass, soft drums, sunny and relaxed',
  'autumn': 'bossa nova instrumental, nylon string acoustic guitar playing the melody, soft flute, brushed drums, upright bass, warm and wistful, golden afternoon',
  'jungle': 'Japanese jazz fusion instrumental, latin samba groove, congas, timbales, marimba, singing electric guitar lead melody, slap bass, bright and lively',
  'desert': 'sparse dusty instrumental, slide guitar playing the melody, fretless bass, hand drums, shaker, warm reverb, open and sunbaked, slow and spacious',
  'snow': 'soft winter instrumental, music box and vibraphone playing the melody, celesta, warm pads, gentle piano, no drums, quiet and sparkling',
  'night': 'late night lofi jazz instrumental, muted soft tenor saxophone melody, mellow Rhodes, upright bass, brushed drums, vinyl crackle, dreamy and calm',
}

def call(body, name, n):
    key = open(KEY_FILE).read().strip()
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {key}',
                                 'User-Agent': 'Mozilla/5.0 (Macintosh) riso-runner-music/1.0', 'Accept': 'application/json'})   # Cloudflare turns away the default urllib agent
    t0 = time.time(); res = None
    for attempt in range(4):                   # the service sometimes times out under load: wait and try again
        try: res = json.load(urllib.request.urlopen(req, timeout=300, context=CTX)); break
        except urllib.error.HTTPError as e:
            print(name, n, 'HTTP', e.code, e.read()[:120], flush=True)
            if e.code < 500: return None
        except (urllib.error.URLError, TimeoutError) as e: print(name, n, 'error', e, flush=True)
        time.sleep(20 * (attempt + 1))
    if res is None: print(name, n, 'gave up', flush=True); return None
    msg = res['choices'][0]['message']; url = msg['audio'][0]['audio_url']['url']
    ext = 'mp3' if 'mpeg' in url.split(';')[0] else url.split(';')[0].split('/')[-1]
    os.makedirs(OUT, exist_ok=True); p = os.path.join(OUT, f'{name}-{n}.{ext}')
    open(p, 'wb').write(base64.b64decode(url.split(',', 1)[1]))
    print(name, n, f'{time.time() - t0:.0f}s ->', p, '|', (msg.get('content') or '').replace('\n', ' ')[:160], flush=True)
    return p

def take(name, n, seconds=75, model='acemusic/acestep-v15-turbo', fmt='flac', think=False, tag=None):
    d = DIRS[name]
    body = {'model': model, 'messages': [{'role': 'user', 'content': f"<prompt>{d['prompt']}</prompt>"}],
            'audio_config': {'instrumental': True, 'duration': seconds, 'bpm': d['bpm'], 'key_scale': d['key'], 'time_signature': '4', 'format': fmt},
            'use_cot_caption': False, 'thinking': think}
    return call(body, tag or name, n)

def cover(source, region, strength=.6, n=1, fmt='flac', model='acemusic/acestep-v15-turbo'):
    src = os.path.join(OUT, source); stem = source.rsplit('.', 1)[0]; ext = source.rsplit('.', 1)[1]
    info = subprocess.run(['afinfo', src], capture_output=True, text=True).stdout
    seconds = float(info.split('estimated duration:')[1].split()[0]); bpm = DIRS.get(stem.split('-')[0], {}).get('bpm')
    content = [{'type': 'text', 'text': f'<prompt>{VARIANTS[region]}</prompt>'},
               {'type': 'input_audio', 'input_audio': {'data': base64.b64encode(open(src, 'rb').read()).decode(), 'format': ext}}]
    cfg = {'instrumental': True, 'duration': round(seconds, 2), 'format': fmt, 'time_signature': '4'}
    if bpm: cfg['bpm'] = bpm
    body = {'model': model, 'messages': [{'role': 'user', 'content': content}], 'task_type': 'cover', 'audio_cover_strength': strength,
            'audio_config': cfg, 'use_cot_caption': False}
    return call(body, f'{stem}-{region}-s{int(strength * 100)}', n)

if __name__ == '__main__':
    a = [x for x in sys.argv[1:] if not x.startswith('--')]; think = '--think' in sys.argv
    if a[0] == 'cover':
        strength = float(a[3]) if len(a) > 3 else .6; takes = int(a[4]) if len(a) > 4 else 1
        for i in range(1, takes + 1): cover(a[1], a[2], strength, i)
    else:
        name = a[0]; takes = int(a[1]) if len(a) > 1 else 2; secs = int(a[2]) if len(a) > 2 else 75
        tag = name + ('-think' if think else '')
        first = int(next((x.split('=')[1] for x in sys.argv if x.startswith('--from=')), 1))
        for i in range(first, first + takes): take(name, i, secs, think=think, tag=tag)
