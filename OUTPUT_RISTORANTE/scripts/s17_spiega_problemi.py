"""Step 17 - Spiegazione grafica dei punti critici della versione finale (60 coperti).
Per ogni problema trovato dalla verifica (s12 + layout s14g) disegna un ingrandimento della pianta con:
  - lo spazio libero calpestabile (verde chiaro);
  - la strozzatura misurata (quota rossa) e gli oggetti che la creano;
  - una didascalia in parole semplici con quanto manca rispetto al minimo.
La strozzatura e' il punto piu' stretto del percorso piu' largo possibile tra i due estremi
(griglia 2 cm + trasformata di distanza), coerente con il calcolo per erosione di s12.
Uscita: 01_analisi/schizzi/SPIEGAZIONE_PROBLEMI.png (+ un PNG per riquadro) e dati/spiegazione_problemi.json
Uso: MC_POS=F python3 scripts/s17_spiega_problemi.py"""
import os, sys, json, pathlib, textwrap
os.environ.setdefault('MC_POS', 'F')
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import numpy as np
from scipy import ndimage
from shapely.geometry import Point, box, LineString
from shapely.ops import nearest_points, unary_union
from PIL import Image, ImageDraw
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MPoly, Rectangle, FancyArrowPatch
import s12_verifica_finale as V
import s14g_modifiche_3 as G
from geometria import load_vector_lines
from progetto import REMOVE

ROOT = pathlib.Path(__file__).resolve().parents[1]
RES = 2.0
COL = dict(muro='#3b352f', libero='#dcefd9', tavolo='#e6d2b5', sedia='#ffffff', bordo='#7a6a58', ostacolo='#d9d4cc',
           rosso='#c62828', testo='#221c16')


def grid(free):
    x0, y0, x1, y1 = free.bounds
    W, H = int((x1 - x0) / RES) + 3, int((y1 - y0) / RES) + 3
    img = Image.new('L', (W, H), 0); d = ImageDraw.Draw(img)
    T = lambda pts: [((x - x0) / RES + 1, (y - y0) / RES + 1) for x, y in pts]
    for p in (free.geoms if free.geom_type == 'MultiPolygon' else [free]):
        d.polygon(T(p.exterior.coords), fill=1)
        for h in p.interiors: d.polygon(T(h.coords), fill=0)
    m = np.array(img, bool)
    dt, ind = ndimage.distance_transform_edt(m, return_indices=True)
    to_cm = lambda r, c: (x0 + (c - 1) * RES, y0 + (r - 1) * RES)
    to_rc = lambda x, y: (int(round((y - y0) / RES + 1)), int(round((x - x0) / RES + 1)))
    return m, dt * RES, ind, to_cm, to_rc


def widest(m, dt, start, target):
    """percorso di larghezza massima: celle aggiunte in ordine di distanza decrescente finche' start e target
    si collegano. Restituisce (raggio di strozzatura, cella di strozzatura)."""
    H, W = m.shape
    order = np.argsort(-dt.ravel())
    par = -np.ones(H * W, np.int64)
    def find(a):
        r = a
        while par[r] != r: r = par[r]
        while par[a] != r: par[a], a = r, par[a]
        return r
    S, Tg = set(start), set(target)
    sroots, troots = set(), set()
    for k in order:
        if dt.flat[k] <= 0: break
        par[k] = k
        r0, c0 = divmod(k, W)
        for dr, dc in ((1, 0), (-1, 0), (0, 1), (0, -1)):
            r, c = r0 + dr, c0 + dc
            if 0 <= r < H and 0 <= c < W and par[r * W + c] >= 0:
                a, b = find(k), find(r * W + c)
                if a != b: par[a] = b
        if k in S: sroots.add(k)
        if k in Tg: troots.add(k)
        if sroots and troots:
            rs = {find(a) for a in sroots}
            if any(find(b) in rs for b in troots):
                return dt.flat[k], divmod(k, W)
    return 0, None


def cells_near(geom, m, to_rc, to_cm, rad):
    x0, y0, x1, y1 = geom.bounds
    out = []
    ra, ca = to_rc(x0 - rad, y0 - rad); rb, cb = to_rc(x1 + rad, y1 + rad)
    W = m.shape[1]
    for r in range(max(ra, 0), min(rb, m.shape[0] - 1) + 1):
        for c in range(max(ca, 0), min(cb, W - 1) + 1):
            if m[r, c] and geom.distance(Point(*to_cm(r, c))) <= rad: out.append(r * W + c)
    return out


def name_at(p, info, floor, W):
    P = Point(p)
    cand = []
    for it in info:
        cand.append((it['tavolo'].distance(P), f"tavolo {it['T']}"))
        for c in it['sedie']: cand.append((c.distance(P), f"sedia di {it['T']}"))
    for k, o in V.OBST[floor].items():
        if 'zona' in k or 'davanti' in k or 'ingresso' in k or 'mensola' in k: continue
        cand.append((o.distance(P), k))
    cand.append((min(w.distance(P) for w in W), 'muro'))
    cand.append((V.FLOOR[floor].exterior.distance(P) if V.FLOOR[floor].geom_type == 'Polygon' else 1e9, 'limite della sala'))
    return min(cand)[1]


def panel(ax, floor, info, W, free, center, span, title):
    cx, cy = center
    ax.set_xlim(cx - span[0] / 2, cx + span[0] / 2); ax.set_ylim(cy + span[1] / 2, cy - span[1] / 2); ax.set_aspect('equal')
    ax.axis('off')
    for p in (free.geoms if free.geom_type == 'MultiPolygon' else [free]):
        ax.add_patch(MPoly(np.array(p.exterior.coords), closed=True, fc=COL['libero'], ec='none', zorder=0))
        for h in p.interiors: ax.add_patch(MPoly(np.array(h.coords), closed=True, fc='white', ec='none', zorder=0.5))
    for k, o in V.OBST[floor].items():
        if o.geom_type == 'Polygon':
            ax.add_patch(MPoly(np.array(o.exterior.coords), closed=True, fc=COL['ostacolo'], ec='#a39b90', lw=0.6, hatch='///', zorder=1))
    for w in W:
        a = np.array(w.coords); ax.plot(a[:, 0], a[:, 1], color=COL['muro'], lw=1.1, zorder=2)
    for it in info:
        x0, y0, x1, y1 = it['tavolo'].bounds
        ax.add_patch(Rectangle((x0, y0), x1 - x0, y1 - y0, fc=COL['tavolo'], ec=COL['bordo'], lw=0.9, zorder=3))
        if cx - span[0] / 2 < (x0 + x1) / 2 < cx + span[0] / 2 and cy - span[1] / 2 < (y0 + y1) / 2 < cy + span[1] / 2:
            ax.text((x0 + x1) / 2, (y0 + y1) / 2, it['T'], ha='center', va='center', fontsize=10, weight='bold', color=COL['testo'], zorder=6)
        for c in it['sedie']:
            a, b, c2, d = c.bounds
            ax.add_patch(Rectangle((a, b), c2 - a, d - b, fc=COL['sedia'], ec=COL['bordo'], lw=0.8, zorder=3))
    ax.set_title(title, fontsize=12.5, weight='bold', color=COL['testo'], loc='left')


def quota(ax, p1, p2, label):
    p1, p2 = np.array(p1, float), np.array(p2, float)
    ax.add_patch(FancyArrowPatch(tuple(p1), tuple(p2), arrowstyle='<|-|>', mutation_scale=9, color=COL['rosso'], lw=2.2, zorder=8,
                                 shrinkA=0, shrinkB=0))
    m = (p1 + p2) / 2; d = p2 - p1; L = np.linalg.norm(d)
    n = np.array([-d[1], d[0]]) / L if L > 1e-6 else np.array([0, -1.0])
    if n[1] > 0: n = -n                       # etichetta sopra la quota
    t = m + n * 42
    ax.plot([m[0], t[0]], [m[1], t[1]], color=COL['rosso'], lw=1, zorder=8)
    ax.text(t[0], t[1], label, ha='center', va='center', fontsize=11.5, weight='bold', color='white', zorder=9,
            bbox=dict(boxstyle='round,pad=0.3', fc=COL['rosso'], ec='none'))


def main():
    V.layout = G.mod3
    V.ROUTES['int']['varco -> sala interrata (clienti)'] = ((2520, 640), (2150, 300), 90)
    V.ROUTES['int']['ex bar: lungo facciata verso il varco'] = ((2490, 950), (2520, 640), 90)
    V.CORR = False
    rep, PT, S1 = V.verify()
    cases = []
    for floor in ('terra', 'int'):
        info = rep[f'_geom_{floor}']
        items = [it['tavolo'] for it in info] + [c for it in info for c in it['sedie']]
        free = V.free_space(floor, items)
        W = [LineString(L['pts']) for L in load_vector_lines(floor) if L['id'] not in REMOVE[floor] and len(L['pts']) > 1]
        m, dt, ind, to_cm, to_rc = grid(free)
        def bottleneck(a_cells, b_cells):
            r, rc = widest(m, dt, a_cells, b_cells)
            p = np.array(to_cm(*rc)); q = ind[:, rc[0], rc[1]]; o1 = np.array(to_cm(q[0], q[1]))
            v = (p - o1) / max(np.linalg.norm(p - o1), 1e-6); o2 = p + v * r
            return 2 * r, o1, o2, p
        F = rep['piani'][floor]
        # percorsi insufficienti
        for nm, (a, b, req) in V.ROUTES[floor].items():
            w_rep = F['percorsi'][nm]['larghezza_utile_cm']
            if w_rep >= req: continue
            A = cells_near(Point(a).buffer(1), m, to_rc, to_cm, 30); B = cells_near(Point(b).buffer(1), m, to_rc, to_cm, 30)
            w, o1, o2, p = bottleneck(A, B)
            n1, n2 = name_at(o1, info, floor, W), name_at(o2, info, floor, W)
            dup = next((k for k in cases if k['floor'] == floor and k['tipo'] == 'percorso' and np.hypot(*(np.array(k['c']) - p)) < 20), None)
            if dup: dup['titolo'] += ' e ' + nm; continue
            cases.append(dict(floor=floor, tipo='percorso', titolo=nm, misura=w_rep, minimo=req, p1=o1.tolist(), p2=o2.tolist(), c=p.tolist(),
                              tra=[n1, n2], a=a, b=b))
        # sedie raggiungibili solo strette (< 30 cm, come in s12)
        acc = []
        for it in info:
            for c in it['sedie']:
                acc.append((V.access_width(free, V.MAIN[floor], c), it['T'], c, it))
        for wv, T, c, it in sorted(acc, key=lambda q: q[0]):
            if wv >= 30 or any(k['tipo'] == 'accesso' and k['floor'] == floor for k in cases): break   # il caso peggiore, come in s12
            A = cells_near(Point(V.MAIN[floor]).buffer(1), m, to_rc, to_cm, 30); B = [q for q in cells_near(c, m, to_rc, to_cm, 60)
                 if c.distance(Point(*to_cm(*divmod(q, m.shape[1])))) <= dt.flat[q] + 2]   # celle il cui cerchio libero tocca la sedia
            w, o1, o2, p = bottleneck(A, B)
            cases.append(dict(floor=floor, tipo='accesso', titolo=f'accesso a una sedia di {T}', misura=round(wv), minimo=40,
                              p1=o1.tolist(), p2=o2.tolist(), c=p.tolist(), tra=[name_at(o1, info, floor, W), name_at(o2, info, floor, W)],
                              sedia=list(c.bounds)))
            sx, sy = c.centroid.x, c.centroid.y   # inquadratura che comprende sedia e strozzatura
            cases[-1]['c'] = [(sx + p[0]) / 2, (sy + p[1]) / 2]
            cases[-1]['span'] = [max(260, abs(sx - p[0]) + 170), max(215, abs(sy - p[1]) + 150)]
        # passaggio tra schienali (avviso di comfort)
        sc = F.get('passaggio_minimo_tra_schienali_cm')
        if sc and sc['valore'] < 60:
            ta, tb = sc['tra'].split('-')
            ia = next(i for i in info if i['T'] == ta); ib = next(i for i in info if i['T'] == tb)
            best = min(((ca.distance(cb), ca, cb) for ca in ia['sedie'] for cb in ib['sedie'] if abs(ca.bounds[1] - cb.bounds[1]) > 30), key=lambda q: q[0])
            q1, q2 = nearest_points(best[1], best[2])
            cases.append(dict(floor=floor, tipo='schienali', titolo=f'schienali {ta} / {tb}', misura=round(sc['valore']), minimo=60,
                              p1=[q1.x, q1.y], p2=[q2.x, q2.y], c=[(q1.x + q2.x) / 2, (q1.y + q2.y) / 2], tra=[f'sedia di {ta}', f'sedia di {tb}']))
        for k in cases:
            if k['floor'] == floor: k['_draw'] = (info, W, free)
    # testi
    PIANO = {'terra': 'Piano terra', 'int': 'Interrato'}
    for k in cases:
        manca = k['minimo'] - k['misura']
        if k['tipo'] == 'percorso':
            k['spiega'] = (f"Il passaggio più stretto è tra {k['tra'][0]} e {k['tra'][1]}: {k['misura']} cm. "
                           f"Per un percorso dei clienti servono almeno {k['minimo']} cm: mancano {manca} cm.")
        elif k['tipo'] == 'accesso':
            k['spiega'] = (f"Per arrivare dall'ingresso alla sedia evidenziata in rosso, anche scegliendo il giro più largo, "
                           f"si passa in un varco di {k['misura']} cm tra {k['tra'][0]} e {k['tra'][1]}. "
                           f"Un ospite passa di fianco con ~40 cm, un cameriere con il piatto con ~60 cm.")
        else:
            k['spiega'] = (f"Tra gli schienali delle due file ci sono {k['misura']} cm a sedie accostate. Quando gli ospiti si siedono "
                           f"arretrano la sedia di 15-25 cm, quindi le due persone si toccano schiena contro schiena e lì non passa nessuno. "
                           f"Per il comfort servono ~60 cm (per far passare un cameriere ~90).")
        k['piano'] = PIANO[k['floor']]
    n = len(cases)
    cols = 2; rows = (n + 1) // 2
    fig = plt.figure(figsize=(16, 7.6 * rows))
    out_dir = ROOT / '01_analisi/schizzi'
    for i, k in enumerate(cases):
        info, W, free = k['_draw']
        ax = fig.add_axes([0.02 + (i % 2) * 0.5, 1 - (i // 2 + 1) / rows + 0.11 / rows, 0.46, 0.84 / rows])
        panel(ax, k['floor'], info, W, free, k['c'], k.get('span', (360, 300)), f"{i + 1}. {k['piano']} – {k['titolo']}")
        lab = f"{k['misura']} cm" + (f"  (min {k['minimo']})" if k['tipo'] != 'schienali' else "  (comfort ~60)")
        quota(ax, k['p1'], k['p2'], lab)
        if 'sedia' in k:
            a, b, c2, d = k['sedia']; ax.add_patch(Rectangle((a, b), c2 - a, d - b, fc='none', ec=COL['rosso'], lw=2.4, zorder=7))
        fig.text(0.02 + (i % 2) * 0.5, 1 - (i // 2 + 1) / rows + 0.02 / rows, textwrap.fill(k['spiega'], 100), fontsize=10.5, color=COL['testo'],
                 va='bottom', ha='left')
    fig.suptitle('Punti critici trovati dal controllo – versione finale 60 coperti (quote in cm, pianta non in scala di stampa)',
                 fontsize=14, weight='bold', y=0.999)
    fig.savefig(out_dir / 'SPIEGAZIONE_PROBLEMI.png', dpi=110)
    plt.close(fig)
    # un PNG per riquadro (piu' leggibile su telefono)
    for i, k in enumerate(cases):
        info, W, free = k['_draw']
        f2 = plt.figure(figsize=(8, 8.2))
        ax = f2.add_axes([0.02, 0.17, 0.96, 0.78])
        panel(ax, k['floor'], info, W, free, k['c'], k.get('span', (360, 300)), f"{i + 1}. {k['piano']} – {k['titolo']}")
        quota(ax, k['p1'], k['p2'], f"{k['misura']} cm" + (f"  (min {k['minimo']})" if k['tipo'] != 'schienali' else "  (comfort ~60)"))
        if 'sedia' in k:
            a, b, c2, d = k['sedia']; ax.add_patch(Rectangle((a, b), c2 - a, d - b, fc='none', ec=COL['rosso'], lw=2.4, zorder=7))
        f2.text(0.04, 0.02, textwrap.fill(k['spiega'], 92), fontsize=11, color=COL['testo'], va='bottom')
        f2.savefig(out_dir / f'SPIEGAZIONE_{i + 1}.png', dpi=110); plt.close(f2)
    (ROOT / 'dati/spiegazione_problemi.json').write_text(json.dumps([{kk: vv for kk, vv in k.items() if kk != '_draw'} for k in cases],
                                                                    indent=1, ensure_ascii=False, default=float))
    for i, k in enumerate(cases):
        print(i + 1, k['piano'], k['titolo'], k['misura'], 'tra', k['tra'], [round(v) for v in k['c']])


if __name__ == '__main__':
    main()
