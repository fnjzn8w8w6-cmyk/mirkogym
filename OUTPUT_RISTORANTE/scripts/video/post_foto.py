"""Sviluppo "fotografico" del render: cio' che fa una vera fotocamera e che un render non ha.
  - alone attorno alle sorgenti luminose (diffusione nelle lenti), su due raggi
  - leggera distorsione a barile dell'obiettivo grandangolare e aberrazione cromatica ai bordi
  - vignettatura, micro-contrasto, grana del sensore piu' visibile nelle ombre
Uso: python post_foto.py <render.png> <uscita.jpg> [forza 1.0] [seme della grana: nel video cambia a ogni fotogramma]"""
import sys
import numpy as np, cv2

src, dst = sys.argv[1], sys.argv[2]
k = float(sys.argv[3]) if len(sys.argv) > 3 else 1.0
seme = int(sys.argv[4]) if len(sys.argv) > 4 else 3
img = cv2.imread(src, cv2.IMREAD_COLOR).astype(np.float32) / 255.0
H, W = img.shape[:2]
lin = img ** 2.2

# alone luminoso: solo le zone quasi bianche (lampade, fiamme, riflessi)
lum = lin @ np.array([0.114, 0.587, 0.299], np.float32)
mask = np.clip((lum - 0.6) / 0.4, 0, 1)[..., None] * lin
glow = cv2.GaussianBlur(mask, (0, 0), W * 0.004) * 0.35 + cv2.GaussianBlur(mask, (0, 0), W * 0.02) * 0.22
lin = lin + glow * k

# distorsione a barile e aberrazione cromatica (rosso e blu con ingrandimento appena diverso)
yy, xx = np.mgrid[0:H, 0:W].astype(np.float32)
cx, cy = (W - 1) / 2, (H - 1) / 2; nx, ny = (xx - cx) / cx, (yy - cy) / cx
r2 = nx * nx + ny * ny
out = np.empty_like(lin)
for c, s in ((0, 1.0 - 0.0009 * k), (1, 1.0), (2, 1.0 + 0.0009 * k)):   # BGR
    f = (1 + 0.018 * k * r2) * s / (1 + 0.018 * k * 0.8)
    out[..., c] = cv2.remap(lin[..., c], cx + nx * cx * f, cy + ny * cx * f, cv2.INTER_LINEAR, borderMode=cv2.BORDER_REFLECT)
lin = out

# vignettatura
lin *= (1 - 0.3 * k * np.clip(r2 / 1.3, 0, 1) ** 1.3)[..., None]

img = np.clip(lin, 0, 1) ** (1 / 2.2)
# micro-contrasto (come la nitidezza di una fotocamera, non un filtro marcato)
bl = cv2.GaussianBlur(img, (0, 0), 1.6)
img = np.clip(img + (img - bl) * 0.35 * k, 0, 1)
# grana del sensore: piu' forte nelle ombre, leggermente colorata, non pixel per pixel
rng = np.random.default_rng(seme)
g = rng.normal(0, 1, (H, W, 3)).astype(np.float32)
g = cv2.GaussianBlur(g, (0, 0), 0.7) * np.array([0.8, 1.0, 0.9], np.float32)
amp = (0.012 + 0.03 * (1 - img.mean(axis=2, keepdims=True))) * k
img = np.clip(img + g * amp, 0, 1)
cv2.imwrite(dst, (img * 255 + 0.5).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 91] if dst.lower().endswith(('.jpg', '.jpeg')) else [])
print('sviluppata', dst)
