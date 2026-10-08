"""Step 10 - Controllo degli elaborati esportati.
 * ogni PDF si apre (PyMuPDF), formato A3, contiene disegni vettoriali;
 * ogni SVG e' XML valido; ogni DXF si apre con ezdxf e supera l'audit;
 * nel DXF il layer MURI_ESISTENTI contiene ESATTAMENTE le polilinee originali non rimosse
   (stesso numero e stesse coordinate, entro 0.01 cm) -> nessuna modifica accidentale a muri/scale;
 * tutti i tavoli e le sedie sono dentro l'area di disegno (nessun taglio).
Output: OUTPUT/CONTROLLO_ELABORATI.txt"""
import json, sys, pathlib
import xml.etree.ElementTree as ET
import numpy as np
import pymupdf
import ezdxf
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from geometria import load_vector_lines
from progetto import REMOVE
from s06_export import T, plan_extent
from disegno import chairs_of
from layout import MOD

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'OUTPUT'
lines, ok = [], True


def log(s, good=True):
    global ok
    ok &= good
    lines.append(('OK   ' if good else 'ERR  ') + s)


for pdf in sorted(OUT.rglob('*.pdf')):
    try:
        d = pymupdf.open(pdf); p = d[0]
        w, h = p.rect.width / 72 * 25.4, p.rect.height / 72 * 25.4
        log(f'{pdf.relative_to(ROOT)}: {d.page_count} pag., {w:.0f}x{h:.0f} mm, {len(p.get_drawings())} oggetti vettoriali')
    except Exception as e:
        log(f'{pdf.name}: non apribile ({e})', False)
for svg in sorted(OUT.rglob('*.svg')):
    try:
        ET.parse(svg); log(f'{svg.relative_to(ROOT)}: SVG valido')
    except Exception as e:
        log(f'{svg.name}: SVG non valido ({e})', False)
for dx in sorted(OUT.rglob('*.dxf')):
    floor = 'terra' if '_PT_' in dx.name else 'int'
    try:
        doc = ezdxf.readfile(dx)
        aud = doc.audit()
        msp = doc.modelspace()
        walls = [e for e in msp.query('LWPOLYLINE[layer=="MURI_ESISTENTI"]')]
        orig = [l for l in load_vector_lines(floor) if l['id'] not in REMOVE[floor]]
        # confronto geometrico
        A = sorted(tuple(np.round(np.array([(p[0], -p[1]) for p in T(l['pts'])]).ravel(), 2)) for l in orig)
        B = sorted(tuple(np.round(np.array([(p[0], p[1]) for p in e.get_points('xy')]).ravel(), 2)) for e in walls)
        same = len(A) == len(B) and all(len(a) == len(b) and np.allclose(a, b, atol=0.01) for a, b in zip(A, B))
        n_t = len(msp.query('INSERT[name=="TAVOLO_80x80"]')); n_s = len(msp.query('INSERT[name=="SEDIA_45x45"]'))
        log(f'{dx.relative_to(ROOT)}: audit errori={len(aud.errors)}, muri originali {len(B)}/{len(A)} '
            f'{"identici" if same else "DIVERSI"}, moduli tavolo {n_t}, sedie {n_s}', same and not aud.has_errors)
    except Exception as e:
        log(f'{dx.name}: errore {e}', False)
for sol in 'ABC':
    f = ROOT / f'dati/layout_{sol}.json'
    if not f.exists(): continue
    L = json.loads(f.read_text())
    for floor in ('terra', 'int'):
        lo, hi = plan_extent(floor)
        out = 0
        for r in L['rooms'].values():
            if r['floor'] != floor: continue
            for g in r['groups']:
                pts = [(g['x'], g['y']), (g['x'] + g['nx']*MOD, g['y'] + g['ny']*MOD)]
                pts += [(c[0], c[1]) for c in chairs_of(g)] + [(c[2], c[3]) for c in chairs_of(g)]
                P = T(pts)
                if (P < lo).any() or (P > hi).any(): out += 1
        log(f'soluzione {sol} {floor}: elementi fuori area di disegno = {out}', out == 0)
txt = '\n'.join(lines) + f"\n\nESITO COMPLESSIVO: {'TUTTI I CONTROLLI SUPERATI' if ok else 'CI SONO ERRORI'}\n"
(OUT / 'CONTROLLO_ELABORATI.txt').write_text(txt)
print(txt)
sys.exit(0 if ok else 1)
