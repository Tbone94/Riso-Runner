# ace.py — generate instrumental music with ACE-Step 1.5 (MIT licence) on its free Hugging Face Space.
#   tools/music/.venv/bin/python ace.py <direction> [takes]
# Writes FLAC takes to tools/music/out/<direction>-<n>.flac. The prompts describe each direction.
import sys, os, shutil, time
from gradio_client import Client

DIRS = {
  'fusion': dict(bpm=120, key='E major', prompt=(
    'instrumental, japanese jazz fusion, 1980s, bright and sunny, tropical summer, clean electric guitar lead melody with singing sustain, '
    'funky slap bass, Fender Rhodes electric piano, brass section stabs, latin percussion, congas, shaker, tight funky live drums, '
    'major seventh chords, uplifting, polished studio production')),
  'citypop': dict(bpm=104, key='D major', prompt=(
    'instrumental, japanese city pop, 1980s, smooth and jazzy, night drive, Fender Rhodes electric piano, funky fingered bass, '
    'clean electric guitar cutting, warm analog synth pads, alto saxophone melody, crisp live drums, major seventh chords, lush, nostalgic, polished')),
  'kankyo': dict(bpm=78, key='D major', prompt=(
    'instrumental, japanese ambient, kankyo ongaku, 1980s environmental music, soft Fender Rhodes, marimba, gentle warm synth pads, '
    'minimal repeating melody, calm, airy, pastel, peaceful')),
  'lofi': dict(bpm=84, key='D major', prompt=(
    'instrumental, lofi jazz hop, mellow Fender Rhodes, upright bass, soft brushed drums, vinyl crackle, warm tape, relaxed, cozy')),
}

def generate(name, takes=1, seconds=60, model='acestep-v15-turbo', think=False):
    d = DIRS[name]; c = Client('ACE-Step/Ace-Step-v1.5', verbose=False)
    t0 = time.time()
    res = c.predict(selected_model=model, generation_mode='custom', param_4=d['prompt'], param_5='[Instrumental]',
                    param_6=d['bpm'], param_7=d['key'], param_8='4', param_9='unknown', param_15=seconds, param_16=takes, param_30='flac', param_32=think,
                    simple_query_input='', param_14=None, param_17=None, param_18='', param_47='guitar',   # unused in text-to-music, but required
                    api_name='/generation_wrapper')
    out = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'out'); os.makedirs(out, exist_ok=True)
    paths = []
    for i, f in enumerate(p for p in res[:8] if p):
        dst = os.path.join(out, f'{name}-{i + 1}.flac'); shutil.copy(f, dst); paths.append(dst)
    print(name, f'{time.time() - t0:.0f}s', paths, '|', (res[10] or '')[:200].replace('\n', ' '))
    return paths

if __name__ == '__main__':
    generate(sys.argv[1], int(sys.argv[2]) if len(sys.argv) > 2 else 1, model=sys.argv[3] if len(sys.argv) > 3 else 'acestep-v15-turbo')
