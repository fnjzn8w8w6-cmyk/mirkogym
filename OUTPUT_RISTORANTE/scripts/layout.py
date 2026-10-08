"""Motore di ottimizzazione della disposizione tavoli (Google OR-Tools CP-SAT).

Modello
-------
* Modulo tavolo: 80x80 cm. Un "gruppo" e' un rettangolo di nx x ny moduli (asse x/y del frame locale).
* Configurazione = (nx, ny, lati con sedie). Sedie per lato = n. moduli su quel lato (1 sedia ogni 80 cm).
* INVOLUCRO RIGIDO (hard): tavolo + fascia di profondita' D sui lati con sedie (sedia + persona seduta).
  Deve stare dentro una zona utile convessa del locale e non intersecare i percorsi riservati (keep-out).
* INVOLUCRO MORBIDO (soft): involucro rigido + g/2 su ogni lato. Gli involucri morbidi di gruppi
  diversi non si sovrappongono => tra persone sedute di tavoli diversi resta un passaggio >= g.
  Il margine g/2 puo' uscire dal locale (contro parete non serve passaggio).
* Obiettivo: max coperti, poi minor numero di moduli e di gruppi (servizio piu' semplice).
Le coordinate interne sono in unita' da 5 cm.
"""
from dataclasses import dataclass, field
from itertools import product
from ortools.sat.python import cp_model
from shapely.geometry import Polygon, box

MOD = 80  # cm
U = 5     # cm per unita' di griglia


@dataclass
class Params:
    name: str
    D: int            # profondita' fascia seduta oltre il bordo tavolo (cm)
    g: int            # passaggio minimo tra persone sedute di gruppi diversi (cm)
    W_main: int       # larghezza corridoi principali (cm)
    configs: list     # lista di (nx, ny, sides) con sides stringa tra 'NSEW'
    e0: float = 0.0   # margine sui lati SENZA sedie (0 = tavoli accostabili testa a testa)
    time_s: float = 60.0
    min_seats_per_group: int = 2


def seats_of(nx, ny, sides):
    return sum({'N': nx, 'S': nx, 'E': ny, 'W': ny}[s] for s in sides)


def envelope(x, y, nx, ny, sides, D, extra=0):
    """rettangolo (x0,y0,x1,y1) in cm dell'involucro, dato l'angolo min del tavolo (x,y)."""
    w, h = nx*MOD, ny*MOD
    x0 = x - (D if 'W' in sides else 0) - extra
    x1 = x + w + (D if 'E' in sides else 0) + extra
    y0 = y - (D if 'N' in sides else 0) - extra
    y1 = y + h + (D if 'S' in sides else 0) + extra
    return x0, y0, x1, y1


def soft_envelope(nx, ny, sides, prm, x=0, y=0):
    """involucro rigido + g/2 sui lati con sedie, + e0 sui lati senza sedie."""
    hx0, hy0, hx1, hy1 = envelope(x, y, nx, ny, sides, prm.D)
    e = lambda s: prm.g/2 if s in sides else prm.e0
    return hx0 - e('W'), hy0 - e('N'), hx1 + e('E'), hy1 + e('S')


def halfplanes(poly):
    """poligono convesso (lista vertici) -> lista (a,b,c) con a*x+b*y <= c per i punti interni."""
    P = Polygon(poly)
    if not P.exterior.is_ccw:
        pts = list(P.exterior.coords)[:-1]
    else:
        pts = list(P.exterior.coords)[:-1][::-1]
    # pts in senso orario nel frame matematico => con y verso il basso diventa antiorario; calcolo robusto:
    hp = []
    cx, cy = P.centroid.x, P.centroid.y
    n = len(pts)
    for i in range(n):
        (x1, y1), (x2, y2) = pts[i], pts[(i+1) % n]
        a, b = (y2 - y1), -(x2 - x1)
        c = a*x1 + b*y1
        if a*cx + b*cy > c:   # orientazione: interno deve soddisfare <=
            a, b, c = -a, -b, -c
        hp.append((a, b, c))
    return hp


def solve(zones, keepouts, prm: Params, max_groups=None, fixed_hint=None, log=False):
    """zones: dict nome->poligono convesso (cm). keepouts: dict nome->(x0,y0,x1,y1) cm.
    Ritorna lista di gruppi {x,y,nx,ny,sides,seats,zone}."""
    m = cp_model.CpModel()
    allx = [p[0] for z in zones.values() for p in z]; ally = [p[1] for z in zones.values() for p in z]
    X0, X1, Y0, Y1 = int(min(allx))//U - 2, int(max(allx))//U + 2, int(min(ally))//U - 2, int(max(ally))//U + 2
    area = sum(Polygon(z).area for z in zones.values())
    est = int(area / ((MOD + 2*prm.D + prm.g) * (MOD + prm.g))) + 2
    max_groups = est if max_groups is None else max(max_groups, est)
    K = max_groups
    zhp = {zn: halfplanes(z) for zn, z in zones.items()}
    slots = []
    soft_x, soft_y = [], []
    obj = []
    for k in range(K):
        x = m.NewIntVar(X0, X1, f'x{k}'); y = m.NewIntVar(Y0, Y1, f'y{k}')
        pres = m.NewBoolVar(f'p{k}')
        bs = []
        for t, (nx, ny, sides) in enumerate(prm.configs):
            b = m.NewBoolVar(f'b{k}_{t}'); bs.append(b)
            hx0, hy0, hx1, hy1 = envelope(0, 0, nx, ny, sides, prm.D)
            sx0, sy0, sx1, sy1 = soft_envelope(nx, ny, sides, prm)
            # intervalli soft (unita' 5cm, arrotondati per eccesso)
            ox0, ox1 = int(sx0 // U), -int(-sx1 // U)
            oy0, oy1 = int(sy0 // U), -int(-sy1 // U)
            ix = m.NewOptionalIntervalVar(x + ox0, ox1 - ox0, x + ox1, b, f'ix{k}_{t}')
            iy = m.NewOptionalIntervalVar(y + oy0, oy1 - oy0, y + oy1, b, f'iy{k}_{t}')
            soft_x.append(ix); soft_y.append(iy)
            corners = [(hx0, hy0), (hx1, hy0), (hx1, hy1), (hx0, hy1)]
            # zona di appartenenza
            zb = []
            for zn, hps in zhp.items():
                c = m.NewBoolVar(f'z{k}_{t}_{zn}'); zb.append(c)
                for (a, bb, cc) in hps:
                    for (cx, cy) in corners:
                        # a*(U*x+cx) + bb*(U*y+cy) <= cc   (coeff. scalati x100 per interi)
                        A, B = int(round(a*U*100)), int(round(bb*U*100))
                        C = int(((cc - a*cx - bb*cy)*100)//1)
                        m.Add(A*x + B*y <= C).OnlyEnforceIf([b, c])
            m.AddBoolOr(zb).OnlyEnforceIf(b)
            # keep-out: involucro rigido separato da ogni rettangolo riservato
            for kn, (kx0, ky0, kx1, ky1) in keepouts.items():
                l = [m.NewBoolVar('') for _ in range(4)]
                m.Add(U*x + int(hx1) <= int(kx0)).OnlyEnforceIf([b, l[0]])
                m.Add(U*x + int(hx0) >= int(-(-kx1//1))).OnlyEnforceIf([b, l[1]])
                m.Add(U*y + int(hy1) <= int(ky0)).OnlyEnforceIf([b, l[2]])
                m.Add(U*y + int(hy0) >= int(-(-ky1//1))).OnlyEnforceIf([b, l[3]])
                m.AddBoolOr(l).OnlyEnforceIf(b)
            s = seats_of(nx, ny, sides)
            obj.append(b * (1000*s - 10*nx*ny - 30))
        m.Add(sum(bs) == pres)
        slots.append((x, y, pres, bs))
    m.AddNoOverlap2D(soft_x, soft_y)
    # rottura simmetrie
    for k in range(K-1):
        x, y, p, _ = slots[k]; x2, y2, p2, _ = slots[k+1]
        m.Add(p >= p2)
        m.Add(y*2000 + x <= y2*2000 + x2).OnlyEnforceIf([p, p2])
    # warm start da una soluzione precedente (stesso ambiente)
    if fixed_hint:
        for k, h in enumerate(fixed_hint[:K]):
            x, y, p, bs = slots[k]
            if (h['nx'], h['ny'], h['sides']) not in prm.configs: continue
            t = prm.configs.index((h['nx'], h['ny'], h['sides']))
            m.AddHint(x, h['x']//U); m.AddHint(y, h['y']//U); m.AddHint(p, 1)
            for i, b in enumerate(bs): m.AddHint(b, int(i == t))
    m.Maximize(sum(obj))
    sol = cp_model.CpSolver()
    sol.parameters.max_time_in_seconds = prm.time_s
    sol.parameters.num_workers = 8
    sol.parameters.log_search_progress = log
    sol.parameters.use_energetic_reasoning_in_no_overlap_2d = True
    sol.parameters.use_timetabling_in_no_overlap_2d = True
    import os as _os
    if _os.environ.get('FIX_HINT') == '1':      # diagnostica: impone esattamente la soluzione suggerita
        sol.parameters.fix_variables_to_their_hinted_value = True
    st = sol.Solve(m)
    res = []
    if st in (cp_model.OPTIMAL, cp_model.FEASIBLE):
        for k, (x, y, p, bs) in enumerate(slots):
            if not sol.Value(p): continue
            t = [i for i, b in enumerate(bs) if sol.Value(b)][0]
            nx, ny, sides = prm.configs[t]
            res.append(dict(x=sol.Value(x)*U, y=sol.Value(y)*U, nx=nx, ny=ny, sides=sides,
                            seats=seats_of(nx, ny, sides)))
    return res, sol.StatusName(st), sol.ObjectiveValue() if res else 0, sol.BestObjectiveBound()


def make_configs(level):
    """Configurazioni ammesse per soluzione. Tavoli singoli 80x80 e composizioni di moduli."""
    cfg = []
    def add(nx, ny, sides):
        if (nx, ny, sides) not in cfg: cfg.append((nx, ny, sides))
    # tavoli contro parete con sedie su un solo lato lungo
    for n in (2, 3, 4) + ((5, 6) if level in ('B', 'C') else ()):
        add(n, 1, 'N'); add(n, 1, 'S'); add(1, n, 'E'); add(1, n, 'W')
    # 80x80 da 2 (sedie contrapposte)
    add(1, 1, 'NS'); add(1, 1, 'EW')
    # 160x80 da 4 (lati lunghi) e 240x80 da 6
    add(2, 1, 'NS'); add(1, 2, 'EW'); add(3, 1, 'NS'); add(1, 3, 'EW')
    if level in ('B', 'C'):
        # capotavola su gruppi lunghi; 80x80 con sedia singola laterale in aggiunta (3 posti)
        add(2, 1, 'NSE'); add(2, 1, 'NSW'); add(1, 2, 'EWS'); add(1, 2, 'EWN')
        add(2, 1, 'NSEW'); add(1, 2, 'NSEW')
        add(3, 1, 'NSEW'); add(1, 3, 'NSEW')
        add(4, 1, 'NS'); add(1, 4, 'EW'); add(5, 1, 'NS'); add(1, 5, 'EW')
        add(4, 1, 'NSEW'); add(1, 4, 'NSEW')
        add(2, 2, 'NSEW')                     # 160x160 da 8
    if level == 'C':
        add(6, 1, 'NS'); add(1, 6, 'EW')
        add(1, 1, 'NSEW')                     # 80x80 da 4
        add(1, 1, 'NSE'); add(1, 1, 'NSW'); add(1, 1, 'EWN'); add(1, 1, 'EWS')
    return cfg


PARAMS = {
    'A': Params('A - Comfort', D=60, g=60, W_main=130, configs=make_configs('A'), e0=30),
    'B': Params('B - Equilibrata', D=55, g=45, W_main=110, configs=make_configs('B'), e0=22.5),
    'C': Params('C - Massima capienza', D=50, g=35, W_main=100, configs=make_configs('C'), e0=17.5),
}


# =============================================================================================
# Generatore strutturato "a file" (righe o colonne di tavoli accostati) + validatore geometrico
# =============================================================================================
from itertools import product as _product
from shapely.geometry import Polygon as _Poly, box as _box
from shapely.ops import unary_union as _union

_TR = {'N': 'W', 'S': 'E', 'W': 'N', 'E': 'S'}


def _transpose_groups(groups):
    return [dict(x=g['y'], y=g['x'], nx=g['ny'], ny=g['nx'], sides=''.join(sorted(_TR[s] for s in g['sides'])),
                 seats=g['seats']) for g in groups]


def _canon(sides):
    return ''.join(s for s in 'NSEW' if s in sides)


def valid_layout(groups, zones, keepouts, prm, return_reason=False):
    """stesse regole del modello CP-SAT, verificate con shapely."""
    Z = [_Poly(z) for z in zones.values()]
    K = [_box(*k) for k in keepouts.values()]
    softs = []
    for g in groups:
        hb = _box(*envelope(g['x'], g['y'], g['nx'], g['ny'], g['sides'], prm.D))
        if not any(hb.difference(z).area < 1e-6 for z in Z):
            return (False, 'zona') if return_reason else False
        if any(hb.intersection(k).area > 1e-6 for k in K):
            return (False, 'keepout') if return_reason else False
        softs.append(_box(*soft_envelope(g['nx'], g['ny'], g['sides'], prm, g['x'], g['y'])))
    for i in range(len(softs)):
        for j in range(i+1, len(softs)):
            if softs[i].intersection(softs[j]).area > 1e-6:
                return (False, 'overlap') if return_reason else False
    return (True, '') if return_reason else True


def _runs(free, a, b, ylo, yhi, step=5):
    """intervalli di y in cui il segmento [a,b] x [y, y+step] e' interamente libero."""
    out, cur = [], None
    y = ylo
    while y < yhi:
        ok = _box(a, y, b, y + step).difference(free).area < 1e-6
        if ok and cur is None: cur = y
        if not ok and cur is not None: out.append((cur, y)); cur = None
        y += step
    if cur is not None: out.append((cur, y))
    return out


def strip_layouts(zones, keepouts, prm, max_cols=5, max_group=4, head_seats=True):
    """Enumerazione di sequenze di colonne (asse y) e righe (trasposte). Ritorna il miglior layout valido."""
    best = (0, [])
    for orient in ('cols', 'rows'):
        if orient == 'rows':
            zs = {k: [(p[1], p[0]) for p in v] for k, v in zones.items()}
            ks = {k: (v[1], v[0], v[3], v[2]) for k, v in keepouts.items()}
        else:
            zs, ks = zones, keepouts
        for zn, zpoly in zs.items():
            Zp = _Poly(zpoly)
            free = Zp.difference(_union([_box(*k) for k in ks.values()])) if ks else Zp
            xmin, ymin, xmax, ymax = Zp.bounds
            D, g2, e0 = prm.D, prm.g / 2, prm.e0
            types = ['E', 'W', 'EW']
            for ncol in range(1, max_cols + 1):
                for seq in _product(types, repeat=ncol):
                    widths = [MOD + D * len(t) for t in seq]
                    gaps = []
                    for t1, t2 in zip(seq[:-1], seq[1:]):
                        r = g2 if 'E' in t1 else e0
                        l = g2 if 'W' in t2 else e0
                        gaps.append(r + l)
                    tot = sum(widths) + sum(gaps)
                    slack = (xmax - xmin) - tot
                    if slack < 0: continue
                    for off in sorted(set([0, int(slack // 2 // 5 * 5), int(slack // 5 * 5)])):
                        groups, x = [], xmin + off
                        for t, w, gp in zip(seq, widths, gaps + [0]):
                            a, b = x, x + w
                            tx = a + (D if 'W' in t else 0)
                            for (r0, r1) in _runs(free, a, b, ymin, ymax):
                                L = r1 - r0
                                n = int(L // MOD)
                                if n <= 0: continue
                                y0 = r0 + int(((L - n * MOD) / 2) // 5 * 5)
                                k = 0
                                while k < n:
                                    m = min(max_group, n - k)
                                    if n - k - m == 1 and m > 2: m -= 1   # evita moduli isolati
                                    sides = _canon(t)
                                    while m > 1 and (1, m, sides) not in prm.configs: m -= 1
                                    groups.append(dict(x=int(tx), y=int(y0 + k * MOD), nx=1, ny=m, sides=sides,
                                                       seats=seats_of(1, m, sides)))
                                    k += m
                            x = b + gp
                        groups = [gq for gq in groups if gq['seats'] >= prm.min_seats_per_group]
                        if orient == 'rows': groups = _transpose_groups(groups)
                        s = sum(gq['seats'] for gq in groups)
                        if s > best[0] and valid_layout(groups, zones, keepouts, prm):
                            best = (s, groups)
    # capotavola dove c'e' spazio (solo se la configurazione e' ammessa)
    if head_seats and best[1]:
        groups = best[1]
        improved = True
        while improved:
            improved = False
            for i, gq in enumerate(groups):
                for hs in ('N', 'S', 'E', 'W'):
                    if hs in gq['sides']: continue
                    ns = _canon(gq['sides'] + hs)
                    if (gq['nx'], gq['ny'], ns) not in prm.configs: continue
                    cand = dict(gq, sides=ns, seats=seats_of(gq['nx'], gq['ny'], ns))
                    trial = groups[:i] + [cand] + groups[i+1:]
                    if valid_layout(trial, zones, keepouts, prm):
                        groups = trial; improved = True; break
        best = (sum(gq['seats'] for gq in groups), groups)
    return best[1]


def _column_groups(free, t, a, ymin, ymax, prm, max_group):
    """gruppi di una fila (colonna lungo y) con lato/i seduta t; tavoli accostati se e0=0,
    altrimenti distanziati di 2*e0 tra testate."""
    D = prm.D
    w = MOD + D * len(t)
    tx = a + (D if 'W' in t else 0)
    sep = 2 * prm.e0
    sides = _canon(t)
    groups = []
    for (r0, r1) in _runs(free, a, a + w, ymin, ymax):
        y, cur = r0, []
        while True:
            rem = r1 - y
            m = min(max_group, int(rem // MOD))
            while m > 1 and (1, m, sides) not in prm.configs: m -= 1
            if m <= 0 or rem < MOD: break
            cur.append(dict(x=int(tx), y=int(y), nx=1, ny=m, sides=sides, seats=seats_of(1, m, sides)))
            y += m * MOD + sep
            y = int(-(-y // 5) * 5)
        if cur:   # centra la fila nello spazio disponibile
            used = cur[-1]['y'] + cur[-1]['ny'] * MOD - r0
            sh = int(((r1 - r0 - used) / 2) // 5 * 5)
            for q in cur: q['y'] += sh
        groups += [q for q in cur if q['seats'] >= prm.min_seats_per_group]
    return groups


def oriented(prm, orient):
    """copia dei parametri con le sole configurazioni coerenti con l'orientamento delle file."""
    import copy
    p = copy.copy(prm)
    if orient == 'rows':
        p.configs = [c for c in prm.configs if c[0] >= c[1]]
    elif orient == 'cols':
        p.configs = [c for c in prm.configs if c[1] >= c[0]]
    return p


import copy


def strip_dp(zones, keepouts, prm, max_group=6, step=5, orients=('cols', 'rows')):
    """Programmazione dinamica sulle file (colonne lungo y, e righe per trasposizione)."""
    best = (0, [])
    D, g2, e0 = prm.D, prm.g / 2, prm.e0
    types = ['E', 'W', 'EW']
    gap = lambda t1, t2: (g2 if 'E' in t1 else e0) + (g2 if 'W' in t2 else e0)
    for orient in orients:
        if orient == 'rows':
            zs = {k: [(p[1], p[0]) for p in v] for k, v in zones.items()}
            ks = {k: (v[1], v[0], v[3], v[2]) for k, v in keepouts.items()}
            prm_o = copy.copy(prm); prm_o.configs = [(c[1], c[0], ''.join(sorted(_TR[q] for q in c[2]))) for c in prm.configs]
            prm_o.configs = [(a, b, _canon(sd)) for a, b, sd in prm_o.configs]
        else:
            zs, ks, prm_o = zones, keepouts, prm
        Zall = _union([_Poly(z) for z in zs.values()])
        free_all = Zall.difference(_union([_box(*k) for k in ks.values()])) if ks else Zall
        for zn, zpoly in list(zs.items()) + ([('_all', None)] if len(zs) > 1 else []):
            if zpoly is None:
                Zp = Zall
            else:
                Zp = _Poly(zpoly)
            free = Zp.intersection(free_all)
            xmin, ymin, xmax, ymax = Zp.bounds
            xs = list(range(int(xmin // step * step), int(xmax) + 1, step))
            S = {}
            for t in types:
                for x in xs:
                    gr = _column_groups(free, t, x, ymin, ymax, prm_o, max_group)
                    S[(t, x)] = (sum(q['seats'] for q in gr), gr)
            # F[(i, tprev)] = miglior valore con colonne che iniziano a xs[j] >= xs[i] + gap
            import functools
            idx = {x: i for i, x in enumerate(xs)}
            @functools.lru_cache(maxsize=None)
            def F(edge, tprev):
                bestv, bestc = 0, ()
                for t in types:
                    start = edge + (gap(tprev, t) if tprev else 0)
                    s0 = int(-(-start // step) * step)
                    for x in xs:
                        if x < s0: continue
                        v, gr = S[(t, x)]
                        if v == 0: continue
                        w = MOD + D * len(t)
                        v2, c2 = F(int(x + w), t)
                        if v + v2 > bestv:
                            bestv, bestc = v + v2, ((t, x),) + c2
                return bestv, bestc
            # per efficienza: valutiamo tutte le x di partenza (la break sopra e' disattivata)
            v, cols = F(int(xmin - 1000), None)
            groups = [q for c in cols for q in S[c][1]]
            if orient == 'rows': groups = _transpose_groups(groups)
            if v > best[0] and valid_layout(groups, zones, keepouts, prm):
                best = (v, groups)
    groups = best[1]
    improved = True
    while improved and groups:
        improved = False
        for i, gq in enumerate(groups):
            for hs in ('N', 'S', 'E', 'W'):
                if hs in gq['sides']: continue
                ns = _canon(gq['sides'] + hs)
                if (gq['nx'], gq['ny'], ns) not in prm.configs: continue
                cand = dict(gq, sides=ns, seats=seats_of(gq['nx'], gq['ny'], ns))
                trial = groups[:i] + [cand] + groups[i+1:]
                if valid_layout(trial, zones, keepouts, prm):
                    groups = trial; improved = True; break
    return groups


def unreachable(groups, zones, keepouts, prm, obstacles=()):
    """indici dei gruppi non raggiungibili: lo spazio libero (zona + percorsi - involucri rigidi -
    ostacoli), aperto morfologicamente con raggio g/2, deve connettere il gruppo ai corridoi."""
    Z = _union([_Poly(z) for z in zones.values()])
    kos = {k: _box(*v) for k, v in keepouts.items()}
    hard = [_box(*envelope(g['x'], g['y'], g['nx'], g['ny'], g['sides'], prm.D)) for g in groups]
    free = Z.union(_union(list(kos.values())).intersection(Z.buffer(400))).difference(
        _union(hard + [_box(*o) if not hasattr(o, 'area') else o for o in obstacles]))
    r = prm.g / 2 - 1
    opened = free.buffer(-r).buffer(r)
    corr = _union([v for k, v in kos.items() if 'corridoio' in k or 'arrivo' in k])
    comps = list(opened.geoms) if opened.geom_type == 'MultiPolygon' else [opened]
    reach = _union([c for c in comps if c.intersects(corr)]) if comps else _Poly()
    return [i for i, hb in enumerate(hard) if not hb.buffer(2).intersects(reach)]
