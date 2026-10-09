"""Panorami HDR -> jpg sRGB divisi per S_ENV (formato web standard; il visualizzatore rimoltiplica). Uso: python env_jpg.py <cartella web>"""
import sys, json, os
import numpy as np, cv2
d = sys.argv[1]; S = 8.0
for k in ('PT', 'S1'):
    h = cv2.imread(os.path.join(d, f'env_{k}.hdr'), cv2.IMREAD_ANYDEPTH | cv2.IMREAD_COLOR).astype(np.float32)
    x = np.clip(h / S, 0, 1); x = np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)
    cv2.imwrite(os.path.join(d, f'env_{k}.jpg'), (x * 255 + 0.5).astype(np.uint8), [cv2.IMWRITE_JPEG_QUALITY, 92])
    os.remove(os.path.join(d, f'env_{k}.hdr'))
j = json.load(open(os.path.join(d, 'web.json'))); j['S_ENV'] = S; json.dump(j, open(os.path.join(d, 'web.json'), 'w'), indent=1)
print('panorami convertiti')
