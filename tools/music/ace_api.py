# ace_api.py — instrumental music from ACE-Step 1.5 through the acemusic.ai API.
#   python3 ace_api.py <direction> [takes] [seconds]
# The API key is read from ~/.config/acemusic/key (never stored in the repo).
# Writes tools/music/out/<direction>-<n>.<ext>.
import json, sys, os, base64, time, ssl, urllib.request, urllib.error
try:
    import certifi; CTX = ssl.create_default_context(cafile=certifi.where())   # python.org builds ship without system certificates
except ImportError: CTX = None

KEY = open(os.path.expanduser('~/.config/acemusic/key')).read().strip()
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
}

def take(name, n, seconds=75, model='acemusic/acestep-v15-turbo', fmt='flac'):
    d = DIRS[name]
    body = {'model': model, 'messages': [{'role': 'user', 'content': f"<prompt>{d['prompt']}</prompt>"}],
            'audio_config': {'instrumental': True, 'duration': seconds, 'bpm': d['bpm'], 'key_scale': d['key'], 'format': fmt},
            'use_cot_caption': False}
    req = urllib.request.Request(URL, data=json.dumps(body).encode(), headers={'Content-Type': 'application/json', 'Authorization': f'Bearer {KEY}',
                                 'User-Agent': 'Mozilla/5.0 (Macintosh) riso-runner-music/1.0', 'Accept': 'application/json'})   # Cloudflare turns away the default urllib agent
    t0 = time.time()
    try: res = json.load(urllib.request.urlopen(req, timeout=600, context=CTX))
    except urllib.error.HTTPError as e: print(name, n, 'HTTP', e.code, e.read()[:300]); return None
    msg = res['choices'][0]['message']; url = msg['audio'][0]['audio_url']['url']
    ext = 'mp3' if 'mpeg' in url.split(';')[0] else url.split(';')[0].split('/')[-1]
    os.makedirs(OUT, exist_ok=True); p = os.path.join(OUT, f'{name}-{n}.{ext}')
    open(p, 'wb').write(base64.b64decode(url.split(',', 1)[1]))
    print(name, n, f'{time.time() - t0:.0f}s ->', p, '|', (msg.get('content') or '').replace('\n', ' ')[:160])
    return p

if __name__ == '__main__':
    name = sys.argv[1]; takes = int(sys.argv[2]) if len(sys.argv) > 2 else 2; secs = int(sys.argv[3]) if len(sys.argv) > 3 else 75
    for i in range(1, takes + 1): take(name, i, secs)
