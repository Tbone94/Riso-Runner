# cvd.py — how frames look with colour blindness, for checking that obstacles still stand out.
#   python3 tools/cvd.py <tag> [out.jpg]     reads promo/trailer/cvd-<tag>-<0..5>.png (one frame per region)
# Simulates protanopia, deuteranopia and tritanopia at full strength (Machado, Oliveira & Fernandes 2009),
# in linear RGB, and lays out a grid: one row per region, columns normal / protan / deutan / tritan.
import os, sys
import numpy as np
from PIL import Image, ImageDraw

ROOT = os.path.join(os.path.dirname(os.path.abspath(__file__)), '..')
M = {'protan': [[0.152286, 1.052583, -0.204868], [0.114503, 0.786281, 0.099216], [-0.003882, -0.048116, 1.051998]],
     'deutan': [[0.367322, 0.860646, -0.227968], [0.280085, 0.672501, 0.047413], [-0.011820, 0.042940, 0.968881]],
     'tritan': [[1.255528, -0.076749, -0.178779], [-0.078411, 0.930809, 0.147602], [0.004733, 0.691367, 0.303900]]}
REGIONS = ['forest', 'autumn', 'jungle', 'desert', 'snow', 'night']

def lin(x): return np.where(x <= .04045, x / 12.92, ((x + .055) / 1.055) ** 2.4)
def srgb(x): return np.where(x <= .0031308, x * 12.92, 1.055 * np.power(np.clip(x, 0, 1), 1 / 2.4) - .055)
def simulate(im, kind):
    a = lin(np.asarray(im, np.float64) / 255)
    return Image.fromarray((np.clip(srgb(a @ np.array(M[kind]).T), 0, 1) * 255).astype(np.uint8))

if __name__ == '__main__':
    tag = sys.argv[1]; out = sys.argv[2] if len(sys.argv) > 2 else f'/tmp/cvd-{tag}.jpg'
    W, H = 480, 300; cols = ['normal', 'protan', 'deutan', 'tritan']
    grid = Image.new('RGB', (W * 4, H * 6), 'white'); d = ImageDraw.Draw(grid)
    for r in range(6):
        p = os.path.join(ROOT, 'promo', 'trailer', f'cvd-{tag}-{r}.png')
        if not os.path.exists(p): continue
        im = Image.open(p).convert('RGB'); im = im.resize((W, round(im.height * W / im.width))).crop((0, 0, W, H))
        for c, k in enumerate(cols):
            grid.paste(im if k == 'normal' else simulate(im, k), (c * W, r * H))
            d.rectangle([c * W, r * H, c * W + 130, r * H + 16], fill='black'); d.text((c * W + 4, r * H + 3), f'{REGIONS[r]} · {k}', fill='white')
    grid.save(out, quality=85); print(out)
