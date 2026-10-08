"""Step 13 - Vista 3D navigabile "tipo Street View" (pagina web, Three.js).
Esporta in metri la geometria del rilievo (muri estrusi per classe di altezza), i pavimenti, la scala,
il montacarichi e la disposizione VERIFICATA (dati/layout_CORRETTA.json), e la inserisce nel template
scripts/vista3d_template.html -> OUTPUT/3D/vista_3d.html
Valori PROVVISORI dichiarati: h interna PT 2,90 m, S1 2,70 m (catastale), solaio 0,40 m, quota S1 -3,10 m.
Uso: MC_POS=F python3 scripts/s13_vista3d.py"""
import os, sys, json, pathlib
os.environ.setdefault('MC_POS', 'F')
import numpy as np
from shapely.geometry import Polygon, MultiPoint, box
from shapely.ops import unary_union
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from geometria import load_vector_lines
from progetto import REMOVE, BAR_IDS, MC, FIXED, NEW_SERVICE
from disegno import chairs_of

ROOT = pathlib.Path(__file__).resolve().parents[1]
Z0 = {'terra': 0.0, 'int': -3.10}
H = {'terra': 2.90, 'int': 2.70}

# classi di altezza degli elementi del rilievo (ID path): il resto sono muri a tutta altezza
CLS = {
    'terra': {
        'skip': {18, 79, 80, 81, 82, 83, 84, 85, 19, 20, 21, 22, 23, 24, 25, 161, 288, 303, 304, 9},
        'arco': {141, 113, 117, 160},
        'basso': set(range(40, 62)) | {90, 91, 92, 93, 94, 95, 96, 97, 99, 100, 101, 102, 103, 98, 63, 64, 65, 66, 67,
                                       114, 89, 162, 163, 164, 165, 166, 167, 168, 169, 170, 171, 142, 143, 144} | set(range(145, 158)),
        'banco': {78, 109, 110, 111, 158, 159, 104, 105, 106, 107, 108},
        'tavolo': {118, 119, 120, 121, 122, 123},
        'parapetto': {14, 15, 16, 17},
        'mensola': {28, 62},
    },
    'int': {
        'skip': {30, 31, 32, 33, 34, 35, 36, 37, 38, 39, 40, 41, 42, 43, 44, 45, 46, 47, 167},
        'arco': {60, 66, 71, 77, 80},
        'basso': {61, 62, 63, 64, 65, 85, 86, 87, 88, 89, 90, 91, 92, 26, 57, 158},
        'mensola': {10, 11, 12, 13, 14},
        'parapetto': {48, 25},
    },
}
HCLS = {'muro': None, 'basso': 0.9, 'banco': 1.1, 'tavolo': 0.75, 'parapetto': 1.0, 'mensola': 1.9, 'arco': 0.0}


def m(v):
    return round(float(v) / 100.0, 3)


def walls(floor):
    out = {k: [] for k in HCLS}
    pts_all = []
    for ln in load_vector_lines(floor):
        if ln['id'] in REMOVE[floor]: continue
        c = CLS[floor]
        if ln['id'] in c['skip']: continue
        k = next((kk for kk in ('arco', 'basso', 'banco', 'tavolo', 'parapetto', 'mensola') if ln['id'] in c.get(kk, ())), 'muro')
        P = np.array(ln['pts'])
        pts_all += P.tolist()
        for a, b in zip(P[:-1], P[1:]):
            if np.hypot(*(b - a)) < 2: continue
            out[k].append([m(a[0]), m(a[1]), m(b[0]), m(b[1])])
    return out, pts_all


def stairs():
    """gradini (box) della scala: rampa 2 (est->ovest, da 0 a -1,55), pianerottolo, rampa 1 (sud->nord, fino a -3,10)."""
    S = []
    top, mid, bot = 0.0, -1.55, -3.10
    n2 = 8
    for i in range(n2):
        xa, xb = 2400 - (i + 1) * (2400 - 2164) / n2, 2400 - i * (2400 - 2164) / n2
        S.append([m(xa), m(1196), m(xb), m(1310), round(top - (i + 1) * (top - mid) / (n2 + 0.0001) , 3)])
    S.append([m(2058), m(1196), m(2164), m(1310), mid])
    n1 = 8
    for i in range(n1):
        ya, yb = 1196 - (i + 1) * (1196 - 978) / n1, 1196 - i * (1196 - 978) / n1
        S.append([m(2058), m(ya), m(2164), m(yb), round(mid - (i + 1) * (mid - bot) / n1, 3)])
    return S


def main():
    L = json.loads((ROOT / 'dati/layout_CORRETTA.json').read_text())
    data = {'floors': {}, 'mc': [m(v) for v in MC.vano()], 'z0': Z0, 'h': H, 'stairs': stairs()}
    for floor, key in (('terra', 'PT'), ('int', 'S1')):
        W, pts = walls(floor)
        P = np.array(pts)
        P = P[P[:, 0] >= (1630 if floor == 'terra' else 1540)]
        hull = MultiPoint([tuple(p) for p in P]).convex_hull
        void = Polygon(FIXED['terra']['scala (rampa 1+2, pianerottolo)']) if floor == 'terra' else None
        floor_poly = hull.difference(void) if void is not None else hull
        ceil_poly = hull if floor == 'terra' else hull.difference(Polygon(FIXED['terra']['scala (rampa 1+2, pianerottolo)']))
        def rings(poly):
            polys = list(poly.geoms) if poly.geom_type == 'MultiPolygon' else [poly]
            return [{'outer': [[m(x), m(y)] for x, y in list(p.exterior.coords)[:-1]],
                     'holes': [[[m(x), m(y)] for x, y in list(h.coords)[:-1]] for h in p.interiors]} for p in polys]
        tables, chairs, labels = [], [], []
        n = 1 if floor == 'terra' else 101
        for rn, groups in L[key].items():
            for g in groups:
                tables.append([m(g['x']), m(g['y']), m(g['x'] + 80 * g.get('nx', 1)), m(g['y'] + 80 * g.get('ny', 1))])
                for c in chairs_of(g):
                    chairs.append([m(c[0]), m(c[1]), m(c[2]), m(c[3]), c[4]])
                labels.append([f'T{n}', m(g['x'] + 40 * g.get('nx', 1)), m(g['y'] + 40 * g.get('ny', 1))])
                n += 1
        bar = []
        if floor == 'int':
            for ln in load_vector_lines('int'):
                if ln['id'] in BAR_IDS:
                    Q = np.array(ln['pts'])
                    for a, b in zip(Q[:-1], Q[1:]): bar.append([m(a[0]), m(a[1]), m(b[0]), m(b[1])])
        serv = [[m(r[0]), m(r[1]), m(r[2]), m(r[3])] for k, r in NEW_SERVICE[floor].items() if r and 'ribalt' not in k]
        data['floors'][key] = {'walls': W, 'floor': rings(floor_poly), 'ceil': rings(ceil_poly), 'tables': tables,
                               'chairs': chairs, 'labels': labels, 'bar': bar, 'service': serv}
    tpl = (ROOT / 'scripts/vista3d_template.html').read_text()
    html = tpl.replace('/*__DATA__*/null', json.dumps(data, separators=(',', ':')))
    out = ROOT / 'OUTPUT/3D/vista_3d.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    print('ok', out, len(html) // 1024, 'KB', {k: {kk: len(v) for kk, v in f['walls'].items()} for k, f in data['floors'].items()})


if __name__ == '__main__':
    main()
