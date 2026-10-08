"""Montaggio del video del tour: dai fotogrammi Blender (uno ogni 2, 12 fps) a un MP4 a 24 fps.
- interpolazione del movimento con ffmpeg (minterpolate) e scala a 1280x720;
- dissolvenze dello stacco e didascalie (stesse del Tour guidato della pagina);
- cartello finale.
Uso: python3 monta_video.py <cartella_frame> <tour.json> <uscita.mp4> [cartella_lavoro]"""
import sys, os, json, subprocess, glob, shutil, pathlib
from PIL import Image, ImageDraw, ImageFont

fr_dir, tour_path, out_mp4 = sys.argv[1:4]
work = sys.argv[4] if len(sys.argv) > 4 else os.path.join(os.path.dirname(out_mp4), '_lavoro_video')
FONTS = pathlib.Path(__file__).parent / 'fonts'
W, H = 1280, 720
tour = json.load(open(tour_path))
N = len(tour['pos'])

shutil.rmtree(work, ignore_errors=True); os.makedirs(work + '/seq'); os.makedirs(work + '/int'); os.makedirs(work + '/out')
src = sorted(glob.glob(os.path.join(fr_dir, 'f*.png')))
idx = [int(os.path.basename(f)[1:6]) for f in src]
for k, f in enumerate(src): os.symlink(os.path.abspath(f), f'{work}/seq/s{k:05d}.png')
step = idx[1] - idx[0] if len(idx) > 1 else 1
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', str(tour['fps'] / step), '-i', f'{work}/seq/s%05d.png',
                '-vf', f'scale={W}:{H}:flags=lanczos,minterpolate=fps={tour["fps"]}:mi_mode=mci:mc_mode=aobmc:me_mode=bidir:vsbmc=1',
                f'{work}/int/i%05d.png'], check=True)
frames = sorted(glob.glob(f'{work}/int/i*.png'))

f_tit = ImageFont.truetype(str(FONTS / 'cormorant-garamond-latin-600-italic.woff'), 46)
f_txt = ImageFont.truetype(str(FONTS / 'karla-latin-400-normal.woff'), 22)
f_logo = ImageFont.truetype(str(FONTS / 'cormorant-garamond-latin-500-normal.woff'), 30)
f_small = ImageFont.truetype(str(FONTS / 'karla-latin-600-normal.woff'), 15)
OTTONE = (217, 163, 91)


def wrap(text, font, width):
    out, line = [], ''
    for w in text.split():
        t = (line + ' ' + w).strip()
        if font.getlength(t) <= width: line = t
        else: out.append(line); line = w
    return out + [line]


def didascalia(img, cap, a):
    if not cap or a <= 0: return img
    ov = Image.new('RGBA', img.size, (0, 0, 0, 0)); d = ImageDraw.Draw(ov)
    lines = wrap(cap['c'], f_txt, 560)
    h = 30 + 52 + 30 * len(lines) + 24
    x0, y1 = 56, H - 56; y0 = y1 - h
    d.rounded_rectangle((x0, y0, x0 + 640, y1), 12, fill=(18, 15, 12, int(185 * a)))
    d.rectangle((x0 + 28, y0 + 26, x0 + 70, y0 + 28), fill=(*OTTONE, int(255 * a)))
    d.text((x0 + 28, y0 + 34), cap['t'], font=f_tit, fill=(243, 236, 226, int(255 * a)))
    for i, l in enumerate(lines): d.text((x0 + 30, y0 + 92 + 30 * i), l, font=f_txt, fill=(205, 194, 178, int(255 * a)))
    return Image.alpha_composite(img, ov)


def marchio(img):
    d = ImageDraw.Draw(img)
    d.text((W - 56, 44), 'Dvca Rovello', font=f_logo, fill=(243, 236, 226, 200), anchor='ra')
    d.text((W - 56, 80), 'VIA ROVELLO 18 · MILANO', font=f_small, fill=(217, 163, 91, 200), anchor='ra')
    return img


caps = tour['didascalie']
k_change = 0
for k, f in enumerate(frames):
    t = min(k, N - 1)
    img = Image.open(f).convert('RGBA')
    ci = tour['cap'][t]
    # dissolvenza in entrata/uscita della didascalia (0,5 s) attorno ai cambi
    start = t
    while start > 0 and tour['cap'][start - 1] == ci: start -= 1
    end = t
    while end < N - 1 and tour['cap'][end + 1] == ci: end += 1
    a = min(1, (t - start) / 12, (end - t) / 12 + (1 if end == N - 1 else 0))
    img = didascalia(img, caps[ci], a)
    img = marchio(img)
    fade = max(tour['fade'][t], 1 - k / 18 if k < 18 else 0, (k - (len(frames) - 30)) / 30 if k > len(frames) - 30 else 0)
    if fade > 0: img = Image.blend(img, Image.new('RGBA', img.size, (0, 0, 0, 255)), min(1, fade))
    img.convert('RGB').save(f'{work}/out/o{k:05d}.png')
# cartello finale (3 s)
fin = Image.new('RGB', (W, H), (14, 12, 10)); d = ImageDraw.Draw(fin)
d.text((W / 2, H / 2 - 40), 'Dvca Rovello', font=ImageFont.truetype(str(FONTS / 'cormorant-garamond-latin-600-italic.woff'), 84), fill=(243, 236, 226), anchor='mm')
d.text((W / 2, H / 2 + 30), '60 coperti su due livelli · 27 tavoli', font=f_txt, fill=(205, 194, 178), anchor='mm')
d.text((W / 2, H / 2 + 66), 'STUDIO PRELIMINARE · MISURE DA VALIDARE IN SITO', font=f_small, fill=OTTONE, anchor='mm')
n0 = len(frames)
for j in range(72):
    a = min(1, j / 18, (72 - j) / 18)
    Image.blend(Image.new('RGB', (W, H), (0, 0, 0)), fin, a).save(f'{work}/out/o{n0 + j:05d}.png')
subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-y', '-framerate', str(tour['fps']), '-i', f'{work}/out/o%05d.png',
                '-c:v', 'libx264', '-preset', 'slow', '-crf', '19', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', out_mp4], check=True)
print('video', out_mp4, os.path.getsize(out_mp4) // 1024, 'KB', (n0 + 72) / tour['fps'], 's')
