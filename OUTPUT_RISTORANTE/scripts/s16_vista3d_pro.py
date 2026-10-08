"""Step 16 - Vista 3D di PRESENTAZIONE (realistica) della versione finale concordata (60 coperti).
Legge la disposizione verificata dati/layout_MODIFICHE3.json (montacarichi in posizione 'F') e il rilievo vettoriale,
e prepara per il template scripts/vista3d_pro_template.html:
  - muri a tutta altezza tagliati in corrispondenza di vetrine, ingresso e porte (davanzale / architrave + vetro),
    con materiale diverso per ciascuna faccia secondo l'ambiente su cui affaccia (sala, cucina, servizi, esterno);
  - banconi e piani di lavoro come solidi estrusi; pavimenti per zona; soffitti; travi a vista nelle sale PT;
  - tavoli, sedie (orientate verso il tavolo), quadri, applique, scaffale vini, scala, montacarichi.
Le altezze di vetrine, porte e soffitti sono VALORI DI PRESENTAZIONE PROVVISORI (non rilevati).
Uso: MC_POS=F [THREE_DIR=.../three] python3 scripts/s16_vista3d_pro.py"""
import os, sys, json, pathlib
os.environ.setdefault('MC_POS', 'F')
import numpy as np
from shapely.geometry import Polygon, MultiPoint, Point, LineString, box
from shapely.ops import unary_union
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from geometria import load_vector_lines
from progetto import REMOVE, BAR_IDS, MC, FIXED, NEW_SERVICE
from disegno import chairs_of
from s12_verifica_finale import FLOOR
from s13_vista3d import CLS, stairs

ROOT = pathlib.Path(__file__).resolve().parents[1]
Z0 = {'terra': 0.0, 'int': -3.10}
H = {'terra': 2.90, 'int': 2.70}
HLOW = {'basso': 0.90, 'banco': 1.10, 'tavolo': 0.75, 'parapetto': 1.0, 'mensola': 1.9}

# aperture: box di ricerca (cm) sui muri quasi paralleli alla facciata / alla parete cucina.
#  win = vetrina (davanzale + architrave + vetro sul telaio interno), door = varco con architrave
OPEN = {
    'terra': [
        dict(n='vetrina nord', k='win', box=(2600, 2, 2800, 122), sill=0.50, head=2.55, glass=[135]),
        dict(n='vetrina centrale', k='win', box=(2560, 329, 2800, 552), sill=0.50, head=2.55, glass=[130]),
        dict(n='vetrina sala ingresso', k='win', box=(2500, 693, 2800, 920), sill=0.50, head=2.55, glass=[126]),
        dict(n='ingresso', k='door', box=(2470, 1016, 2800, 1246), head=2.60, glass=[12], door=(1026, 1117)),
        dict(n='porta cucina', k='door', box=(1975, 10, 2070, 91), head=2.15),
        dict(n='porta disimpegno', k='door', box=(1975, 1063, 2065, 1144), head=2.15),
    ],
    'int': [
        dict(n='finestra alta nord', k='win', box=(2580, 378, 2800, 499), sill=1.95, head=2.50, glass=[52]),
        dict(n='finestra alta sud', k='win', box=(2530, 740, 2800, 857), sill=1.95, head=2.50, glass=[54]),
    ],
}
SKIP_EXTRA = {'terra': {127}, 'int': set()}   # lesena esterna dentro la vetrina
OUTER = {'terra': ((2756, -140), (2548, 1337)), 'int': ((2757, -140), (2549, 1335))}   # filo esterno facciata
KITCHEN = box(1600, -100, 1992, 662)
# testate dei muri aperte nel rilievo (si vedrebbe l'interno del muro doppio) e varchi senza architrave
CAPS = {'terra': [((2187, 562), (2187, 629)), ((2079, 562), (2085, 631))], 'int': []}
LINTELS = {'terra': [dict(box=(2079, 562, 2187, 630), head=2.45)], 'int': [dict(box=(2472, 638, 2568, 725), head=2.25)]}


def m(v):
    return round(float(v) / 100.0, 3)


def outer_x(floor, y):
    (xa, ya), (xb, yb) = OUTER[floor]
    return xa + (xb - xa) * (y - ya) / (yb - ya)


def zone(floor, x, y):
    if x > outer_x(floor, y) + 1: return 'esterno'
    if FLOOR[floor].buffer(3).contains(Point(x, y)): return 'sala'
    if floor == 'terra' and KITCHEN.contains(Point(x, y)): return 'cucina'
    return 'servizio'


def classify(floor, ln):
    c = CLS[floor]
    return next((kk for kk in ('arco', 'basso', 'banco', 'tavolo', 'parapetto', 'mensola') if ln['id'] in c.get(kk, ())), 'muro')


def parallel(a, b):
    d = b - a
    return abs(d[0]) <= 0.35 * np.hypot(*d)


def clip_y(a, b, y0, y1):
    """parti del segmento a-b: [(p, q, dentro)] tagliate alle quote y0, y1 (segmento quasi verticale)."""
    ts = [0.0, 1.0]
    for yy in (y0, y1):
        if (a[1] - yy) * (b[1] - yy) < 0: ts.append((yy - a[1]) / (b[1] - a[1]))
    ts = sorted(ts)
    out = []
    for t0, t1 in zip(ts[:-1], ts[1:]):
        p, q = a + (b - a) * t0, a + (b - a) * t1
        ym = (p[1] + q[1]) / 2
        out.append((p, q, y0 <= ym <= y1))
    return out


def walls(floor):
    Hf = H[floor]
    pieces, glass, low, slabs = [], [], [], []
    band = {i: [] for i in range(len(OPEN[floor]))}
    paths = {}
    for ln in load_vector_lines(floor):
        if ln['id'] in REMOVE[floor] or ln['id'] in CLS[floor]['skip'] or ln['id'] in SKIP_EXTRA[floor]: continue
        k = classify(floor, ln)
        paths.setdefault(k, {}).setdefault(ln['id'], []).append(np.array(ln['pts']))
        if k != 'muro': continue
        P = np.array(ln['pts'], float)
        for a, b in zip(P[:-1], P[1:]):
            if np.hypot(*(b - a)) < 2: continue
            parts = [(a, b, None)]
            for i, o in enumerate(OPEN[floor]):
                bx = o['box']
                nxt = []
                for p, q, op in parts:
                    if op is None and parallel(a, b):
                        for pp, qq, ins in clip_y(p, q, bx[1], bx[3]):
                            ins = ins and min(pp[0], qq[0]) >= bx[0] - 1 and max(pp[0], qq[0]) <= bx[2] + 1
                            nxt.append((pp, qq, i if ins else None))
                    else:
                        nxt.append((p, q, op))
                parts = nxt
            for p, q, op in parts:
                if np.hypot(*(q - p)) < 1: continue
                if op is None:
                    pieces.append((p, q, 0.0, Hf)); continue
                o = OPEN[floor][op]
                band[op] += [tuple(p), tuple(q)]
                if ln['id'] in o.get('glass', []):
                    if o['k'] == 'win':
                        glass.append([m(p[0]), m(p[1]), m(q[0]), m(q[1]), o['sill'], o['head'], 'win'])
                    else:   # ingresso: porta a vetri + vetrata fissa, sopraluce fino all'architrave
                        dy0, dy1 = o['door']
                        for pp, qq, ins in clip_y(p, q, dy0, dy1):
                            glass.append([m(pp[0]), m(pp[1]), m(qq[0]), m(qq[1]), 0.0, o['head'], 'door' if ins else 'fix'])
                    pieces.append((p, q, o['head'], Hf))
                    continue
                if o['k'] == 'win': pieces.append((p, q, 0.0, o['sill']))
                pieces.append((p, q, o['head'], Hf))
    for a, b in CAPS[floor]:
        pieces.append((np.array(a, float), np.array(b, float), 0.0, Hf))
    for L in LINTELS[floor]:   # architrave: due facce lungo il lato lungo del varco + intradosso
        x0, y0, x1, y1 = L['box']
        if x1 - x0 > y1 - y0: sides = [((x0, y0), (x1, y0)), ((x1, y1), (x0, y1))]
        else: sides = [((x0, y1), (x0, y0)), ((x1, y0), (x1, y1))]
        for a, b in sides: pieces.append((np.array(a, float), np.array(b, float), L['head'], Hf))
        slabs.append({'ring': [[m(x0), m(y0)], [m(x1), m(y0)], [m(x1), m(y1)], [m(x0), m(y1)]], 'z': L['head'], 'mat': 'intradosso', 'down': True})
    # facce: materiale per lato (normale sinistra / destra), campionando 12 cm dentro l'ambiente
    out = []
    for p, q, zb, zt in pieces:
        d = (q - p) / np.hypot(*(q - p))
        n = np.array([-d[1], d[0]])
        mid = (p + q) / 2
        za, zb_ = zone(floor, *(mid + n * 12)), zone(floor, *(mid - n * 12))
        out.append([m(p[0]), m(p[1]), m(q[0]), m(q[1]), zb, zt, za, zb_])
    # davanzali / intradossi: quadrilatero della fascia di ciascuna apertura
    for i, o in enumerate(OPEN[floor]):
        pts = band[i]
        if not pts: continue
        hull = MultiPoint(pts).convex_hull
        if hull.area < 10: continue
        ring = [[m(x), m(y)] for x, y in list(hull.exterior.coords)[:-1]]
        slabs.append({'ring': ring, 'z': o['head'], 'mat': 'intradosso', 'down': True})
        slabs.append({'ring': ring, 'z': o.get('sill', 0.0) + (0.0 if o['k'] == 'win' else 0.004),
                      'mat': 'davanzale' if o['k'] == 'win' else 'soglia', 'down': False})
    return out, glass, paths, slabs


def solids(floor, paths):
    """banconi / piani / mensole come solidi estrusi (inviluppo convesso per ID); linee isolate -> pannelli bassi."""
    S, LOW, burners = [], [], []
    for k in ('basso', 'banco', 'tavolo', 'mensola'):
        for pid, polys in paths.get(k, {}).items():
            if floor == 'int' and pid in BAR_IDS: continue
            if floor == 'terra' and k == 'banco': continue     # cassa e banco cassa: disegnati a parte
            P = np.vstack(polys)
            hull = MultiPoint([tuple(p) for p in P]).convex_hull
            bx = hull.bounds
            if hull.geom_type != 'Polygon' or hull.area < 150 or min(bx[2] - bx[0], bx[3] - bx[1]) < 6:
                for Q in polys:
                    for a, b in zip(Q[:-1], Q[1:]):
                        if np.hypot(*(b - a)) >= 2:
                            LOW.append([m(a[0]), m(a[1]), m(b[0]), m(b[1]), 0.0, HLOW[k]])
                continue
            c = hull.centroid
            zn = zone(floor, c.x, c.y)
            small = hull.area < 2500 and max(bx[2] - bx[0], bx[3] - bx[1]) < 60
            if small and len(P) > 12 and zn == 'cucina':
                burners.append([m(c.x), m(c.y), m(max(bx[2] - bx[0], bx[3] - bx[1]) / 2)]); continue
            if k == 'mensola': mat = 'scaffale'
            elif k == 'tavolo': mat = 'tavolo_servizio'
            elif zn == 'cucina': mat = 'inox'
            elif small: mat = 'ceramica'
            else: mat = 'laccato'
            zt = HLOW[k] if not (small and mat == 'ceramica') else 0.8
            S.append({'ring': [[m(x), m(y)] for x, y in list(hull.exterior.coords)[:-1]], 'zb': 0.0, 'zt': zt, 'mat': mat, 'id': pid})
    return S, LOW, burners


def rings(poly):
    polys = list(poly.geoms) if poly.geom_type in ('MultiPolygon', 'GeometryCollection') else [poly]
    return [{'outer': [[m(x), m(y)] for x, y in list(p.exterior.coords)[:-1]],
             'holes': [[[m(x), m(y)] for x, y in list(h.coords)[:-1]] for h in p.interiors]}
            for p in polys if p.geom_type == 'Polygon' and p.area > 1]


def beams(poly, step=110, w=14):
    """travi a vista (asse est-ovest) dentro il poligono della sala."""
    out = []
    x0, y0, x1, y1 = poly.bounds
    y = y0 + step * 0.6
    while y < y1 - 30:
        seg = LineString([(x0 - 10, y), (x1 + 10, y)]).intersection(poly.buffer(-2))
        for s in (getattr(seg, 'geoms', None) or [seg]):
            if s.is_empty or s.length < 80: continue
            (ax, ay), (bx, by) = s.coords[0], s.coords[-1]
            out.append([m(ax), m(ay), m(bx), m(by)])
        y += step
    return out


def decor(floor, W, keep):
    """quadri e applique sulle pareti piene delle sale, lontano da montacarichi, consolle e aperture."""
    art, sconce = [], []
    Hf = H[floor]
    v = 0
    for x1, y1, x2, y2, zb, zt, za, zbb in W:
        if zb > 0 or zt < Hf: continue
        for side, zn in ((1, za), (-1, zbb)):
            if zn != 'sala': continue
            L = np.hypot(x2 - x1, y2 - y1)
            if L < 1.5: continue
            d = np.array([x2 - x1, y2 - y1]) / L
            nrm = np.array([-d[1], d[0]]) * side
            n = int(min(4, (L - 0.3) // 1.45))
            for i in range(n):
                t = (i + 0.5) / n
                c = np.array([x1, y1]) + d * L * t
                pc = (c + nrm * 0.3) * 100
                if any(Point(*pc).distance(o) < 45 for o in keep): continue
                if floor == 'int' and i % 2 == 1:
                    sconce.append([round(c[0], 3), round(c[1], 3), round(nrm[0], 3), round(nrm[1], 3)])
                else:
                    art.append([round(c[0], 3), round(c[1], 3), round(nrm[0], 3), round(nrm[1], 3), v % 6])
                    v += 1
    return art, sconce


LIGHTS = {   # punti luce d'ambiente (cm): calde in sala, neutra in cucina
    'terra': [(2230, 140, 'w'), (2500, 150, 'w'), (2240, 420, 'w'), (2480, 430, 'w'), (2360, 800, 'w'),
              (2300, 1080, 'w'), (1820, 330, 'c')],
    'int': [(2180, 120, 'w'), (2460, 130, 'w'), (2330, 370, 'w'), (2270, 860, 'w'), (2300, 1090, 'w'), (1800, 520, 'c')],
}


def main():
    L = json.loads((ROOT / 'dati/layout_MODIFICHE3.json').read_text())
    data = {'floors': {}, 'mc': [m(v) for v in MC.vano()], 'z0': Z0, 'h': H, 'stairs': stairs(),
            'outer': {f: [[m(v) for v in p] for p in OUTER[f]] for f in OUTER}}
    for floor, key in (('terra', 'PT'), ('int', 'S1')):
        W, G, paths, slabs = walls(floor)
        S, LOW, burners = solids(floor, paths)
        pts = [tuple(p) for k in paths for pl in paths[k].values() for Q in pl for p in Q]
        P = np.array(pts); P = P[P[:, 0] >= (1630 if floor == 'terra' else 1540)]
        hull = MultiPoint([tuple(p) for p in P]).convex_hull
        void = Polygon(FIXED['terra']['scala (rampa 1+2, pianerottolo)'])
        sala = FLOOR[floor]
        floors = [{'mat': 'base', 'rings': rings(hull.difference(void) if floor == 'terra' else hull)}]
        if floor == 'terra':
            floors.append({'mat': 'cucina', 'rings': rings(KITCHEN.intersection(hull))})
            floors.append({'mat': 'parquet', 'rings': rings(sala.difference(void).difference(MC_box()))})
            floors.append({'mat': 'zerbino', 'rings': rings(Polygon([(2492, 1030), (2556, 1036), (2532, 1238), (2490, 1236)]))})
        else:
            floors.append({'mat': 'cotto', 'rings': rings(sala.difference(Polygon(FIXED['int']['scala'])).difference(MC_box()))})
        ceil = hull if floor == 'terra' else hull.difference(void)
        tables, chairs, labels = [], [], []
        n = 1 if floor == 'terra' else 101
        for rn, groups in L[key].items():
            for g in groups:
                tables.append([m(g['x']), m(g['y']), m(g['x'] + 80 * g.get('nx', 1)), m(g['y'] + 80 * g.get('ny', 1))])
                for c in chairs_of(g):
                    chairs.append([m(c[0]), m(c[1]), m(c[2]), m(c[3]), c[4]])
                labels.append([f'T{n}', m(g['x'] + 40 * g.get('nx', 1)), m(g['y'] + 40 * g.get('ny', 1))])
                n += 1
        keep = [MC_box(), MC_box().buffer(60)] + [box(*r) for r in NEW_SERVICE[floor].values() if r]
        if floor == 'terra':
            keep += [box(2058, 774, 2103, 1023), box(2470, 990, 2600, 1260)]
        else:
            keep += [box(2050, 720, 2075, 980)]     # parete vini
        art, sconce = decor(floor, W, keep)
        bar = []
        if floor == 'int':
            for ln in load_vector_lines('int'):
                if ln['id'] in BAR_IDS:
                    Q = np.array(ln['pts'])
                    for a, b in zip(Q[:-1], Q[1:]): bar.append([m(a[0]), m(a[1]), m(b[0]), m(b[1])])
        rail = [[m(a[0]), m(a[1]), m(b[0]), m(b[1])] for pl in paths.get('parapetto', {}).values() for Q in pl
                for a, b in zip(Q[:-1], Q[1:]) if np.hypot(*(b - a)) > 5]
        bm = []
        if floor == 'terra':
            for g in (sala.geoms if sala.geom_type == 'MultiPolygon' else [sala]):
                for part in [g.intersection(box(2055, -60, 2700, 566)), g.intersection(box(2180, 620, 2700, 1190))]:
                    if not part.is_empty and part.area > 1e4: bm += beams(part)
        serv = [[m(r[0]), m(r[1]), m(r[2]), m(r[3]), k] for k, r in NEW_SERVICE[floor].items() if r]
        cassa = None
        if floor == 'terra':   # banco cassa (ID 104-108), retro-banco e scrittoio in nicchia (ID 78, 109)
            pill = unary_union([MultiPoint([tuple(p) for Q in paths['banco'][i] for p in Q]).convex_hull
                                for i in (104, 105, 106, 108) if i in paths.get('banco', {})]).convex_hull
            R = lambda g: [[m(x), m(y)] for x, y in list(g.exterior.coords)[:-1]]
            cassa = {'pill': R(pill), 'pill_top': R(pill.buffer(3, join_style=1).simplify(0.5)),
                     'back': R(box(2058, 774, 2103, 1023)), 'desk': R(box(2009, 774, 2058, 842))}
        data['floors'][key] = {
            'walls': W, 'glass': G, 'slabs': slabs, 'solids': S, 'low': LOW, 'burners': burners,
            'floors': floors, 'ceil': rings(ceil), 'beams': bm, 'tables': tables, 'chairs': chairs, 'labels': labels,
            'art': art, 'sconce': sconce, 'bar': bar, 'rail': rail, 'service': serv,
            'lights': [[m(x), m(y), t] for x, y, t in LIGHTS[floor]], 'cassa': cassa,
            'sala': rings(sala),
        }
    tpl = (ROOT / 'scripts/vista3d_pro_template.html').read_text()
    html = tpl.replace('/*__DATA__*/null', json.dumps(data, separators=(',', ':')))
    out = ROOT / 'OUTPUT/3D/vista_3d.html'
    out.parent.mkdir(parents=True, exist_ok=True)
    out.write_text(html)
    (ROOT / 'dati/vista3d_pro_dati.json').write_text(json.dumps(data, indent=0))
    # versione autonoma (si apre anche senza internet): THREE_DIR = cartella del pacchetto npm three@0.128.0
    td = os.environ.get('THREE_DIR')
    if td:
        td = pathlib.Path(td)
        lib = (td / 'build/three.min.js').read_text()
        env = (td / 'examples/js/environments/RoomEnvironment.js').read_text()
        sa = html.replace('<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"></script>',
                          '<script>' + lib + '</script>')
        sa = sa.replace('<script src="https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/environments/RoomEnvironment.js"></script>',
                        '<script>' + env + '</script>')
        sa = '<!doctype html>\n<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">\n' + sa.replace('<canvas id="scena"', '</head><body>\n<canvas id="scena"', 1) + '\n</body></html>'
        (ROOT / 'OUTPUT/3D/Dvca_Rovello_vista_3D.html').write_text(sa)
        print('autonoma', len(sa) // 1024, 'KB')
    print('ok', out, len(html) // 1024, 'KB',
          {k: {kk: len(v) for kk, v in f.items() if isinstance(v, list)} for k, f in data['floors'].items()})


def MC_box():
    return box(*MC.vano())


if __name__ == '__main__':
    main()
