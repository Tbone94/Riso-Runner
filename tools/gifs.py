# gifs.py — build the itch GIFs from the frame sequences trailer.js uploads (?trailer#kit → promo/trailer/gif-<name>-<nnn>.jpg).
#   python3 tools/gifs.py            all of them, into promo/itch/
# Gameplay GIFs are 480×270 at 15 fps (like Riso Rider's); the cover's hover GIF is 630×500. Each is kept under ~3 MB
# by lowering the palette until it fits.
import glob, os, re, sys
from PIL import Image, ImageFilter

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
SRC, DST = os.path.join(ROOT, 'promo', 'trailer'), os.path.join(ROOT, 'promo', 'itch')
LIMIT = 3_000_000

def frames(name):
    return [Image.open(p).convert('RGB') for p in sorted(glob.glob(os.path.join(SRC, f'gif-{name}-*.jpg')))]

def fit(im, size):
    w, h = size; iw, ih = im.size; k = max(w / iw, h / ih)
    im = im.resize((round(iw * k), round(ih * k)), Image.LANCZOS)
    x, y = (im.width - w) // 2, (im.height - h) // 2
    return im.crop((x, y, x + w, y + h))

def save(name, size, out_name=None, step=1, soften=0, secs=None):
    fr = [fit(f, size) for f in frames(name)[:round(secs * 15) if secs else None:step]]
    if soften: fr = [f.filter(ImageFilter.GaussianBlur(soften)) for f in fr]   # less grain, a much smaller file
    if not fr: print('no frames for', name); return
    p = os.path.join(DST, (out_name or name) + '.gif')
    for colors in (192, 128, 96, 64, 48):
        # one palette for the whole clip (from a strip of sample frames), so the grain doesn't flicker between frames
        strip = Image.new('RGB', (size[0], size[1] * 6))
        for i in range(6): strip.paste(fr[i * (len(fr) - 1) // 5], (0, size[1] * i))
        pal = strip.quantize(colors=colors, method=Image.MEDIANCUT)
        q = [f.quantize(palette=pal, dither=Image.Dither.NONE) for f in fr]
        q[0].save(p, save_all=True, append_images=q[1:], duration=67 * step, loop=0, optimize=True, disposal=1)
        if os.path.getsize(p) <= LIMIT: break
    print(f'{os.path.basename(p)}: {len(fr)} frames, {colors} colours, {os.path.getsize(p) / 1e6:.2f} MB')

if __name__ == '__main__':
    os.makedirs(DST, exist_ok=True)
    names = sorted({re.match(r'gif-(.+)-\d+\.jpg', os.path.basename(p)).group(1) for p in glob.glob(os.path.join(SRC, 'gif-*-*.jpg'))})
    for n in (sys.argv[1:] or names):
        if n == 'cover': save(n, (630, 500), 'cover-hover', step=2, soften=.9, secs=2.7)   # big: a short loop, every other frame, slightly soft
        else: save(n, (480, 270))
