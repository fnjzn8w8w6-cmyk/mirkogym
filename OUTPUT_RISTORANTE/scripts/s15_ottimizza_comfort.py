"""Step 15 - Ricerca automatica (CP-SAT) con le regole COMFORT, con e senza tavoli da 4.
Regole: fascia seduta D=50 (sedia 45 + 5); >= 70 cm tra persone sedute di tavoli diversi;
15 cm minimi tra tavoli affiancati (lati senza sedie); 3 cm minimi tra schienale e muro; percorsi riservati
come nella versione comfort; raggiungibilita' di ogni tavolo (riparazione iterativa).
Seme iniziale: la versione comfort disegnata a mano (50 coperti), quindi il risultato non puo' peggiorare.
Uso: MC_POS=F python3 scripts/s15_ottimizza_comfort.py [secondi_per_ambiente]"""
import os, sys, json, pathlib, copy, time
os.environ.setdefault('MC_POS', 'F')
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from shapely.geometry import Polygon
from layout import Params, solve, valid_layout, unreachable, MOD
from progetto import rooms, FIXED, MC
import s14_schizzo_comfort as C

ROOT = pathlib.Path(__file__).resolve().parents[1]
T = float(sys.argv[1]) if len(sys.argv) > 1 else 120

CFG2 = [(1, 1, 'NS'), (1, 1, 'EW')]
CFG4 = CFG2 + [(2, 1, 'NS'), (1, 2, 'EW'), (1, 1, 'NSEW')]
x0, y0, x1, y1 = MC.vano()
KEEP = {
    'PT - sala nord': {'corridoio servizio ovest': (2050, -60, 2200, 575),
                       'montacarichi + zona di carico': (2050, 375, 2245, 475)},
    'PT - sala sud (ingresso)': {'corridoio cassa/varco': (2180, 620, 2295, 1190),
                                 'corridoio ingresso-scala': (2180, 1093, 2520, 1190),
                                 'ingresso (anta + 150x150)': (2410, 990, 2600, 1190)},
    'S1 - sala interrata': {'zona montacarichi + scarico': (2070, 375, 2245, 475),
                            'corridoio varco personale': (2070, 250, 2170, 385),
                            'corridoio sud (varco clienti)': (2070, 468, 2700, 575)},
    'S1 - ex area bar': {'arrivo scala + corridoio': (2050, 908, 2600, 1001),
                         'corridoio facciata': (2457, 715, 2600, 1001),
                         'pianerottolo piede scala': (2050, 880, 2175, 1001)},
}
HAND = {'PT - sala nord': 'PT - sala davanti alla cucina', 'PT - sala sud (ingresso)': "PT - sala dell'ingresso",
        'S1 - sala interrata': 'S1 - sala interrata', 'S1 - ex area bar': 'S1 - ex area bar'}


def inset(zones, d=3):
    out = {}
    for k, z in zones.items():
        P = Polygon(z).buffer(-d, join_style=2)
        out[k] = [(round(x, 1), round(y, 1)) for x, y in list(P.exterior.coords)[:-1]]
    return out


def run(cfg, label):
    prm = Params(label, D=50, g=70, W_main=90, configs=cfg, e0=7.5, time_s=T)
    PT, S1 = C.comfort()
    hand = {**PT, **S1}
    res, tot = {}, 0
    for rn, r in rooms().items():
        zones = inset(r['zones'])
        ko = KEEP[rn]
        obst = [Polygon(p) for p in FIXED[r['floor']].values()] + [MC.vano()]
        seed = [g for g in hand[HAND[rn]]]
        seed_ok = valid_layout(seed, zones, ko, prm) and not unreachable(seed, zones, ko, prm, obst)
        t = time.time()
        groups, st, _, bound = solve(zones, ko, prm, fixed_hint=seed if seed_ok else None, max_groups=len(seed) + 4)
        ko2 = dict(ko)
        for it in range(4):
            bad = unreachable(groups, zones, ko2, prm, obst)
            if not bad: break
            for i in bad:
                q = groups[i]; ko2[f'vietato_{it}_{i}'] = (q['x'] + 5, q['y'] + 5, q['x'] + q['nx']*MOD - 5, q['y'] + q['ny']*MOD - 5)
            groups, st, _, bound = solve(zones, ko2, prm, fixed_hint=[q for j, q in enumerate(groups) if j not in bad],
                                         max_groups=len(seed) + 4)
        if unreachable(groups, zones, ko, prm, obst) or not valid_layout(groups, zones, ko, prm):
            groups = [q for j, q in enumerate(groups) if j not in unreachable(groups, zones, ko, prm, obst)]
        s = sum(g['seats'] for g in groups); s_seed = sum(g['seats'] for g in seed)
        if seed_ok and s_seed >= s:
            groups, s, st = seed, s_seed, st + '+mano'
        print(f'{label:10s} | {rn:26s} | {st:14s} | coperti {s:3d} (a mano {s_seed}{"" if seed_ok else " NON valida nel modello"}) '
              f'| da4 {sum(g["seats"] == 4 for g in groups)} | {time.time() - t:5.0f}s', flush=True)
        res[rn] = dict(groups=groups, seats=s, keepouts=ko, zones=zones, floor=r['floor'], status=st)
        tot += s
    print(f'== {label}: {tot} coperti', flush=True)
    return res, tot


if __name__ == '__main__':
    out = {}
    for cfg, lab in ((CFG2, 'solo da 2'), (CFG4, 'con da 4')):
        res, tot = run(cfg, lab)
        out[lab] = dict(tot=tot, rooms=res)
    (ROOT / 'dati/ottimizzazione_comfort.json').write_text(json.dumps(out, indent=1))
