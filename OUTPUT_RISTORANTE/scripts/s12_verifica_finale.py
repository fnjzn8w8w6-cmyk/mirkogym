"""Step 12 - Verifica della VERSIONE FINALE concordata col cliente (tavoli 80x80 da 2, montacarichi 'F').

Controlli (shapely, sulla geometria rilevata dai PDF):
 1. sedie e tavoli non toccano le linee ORIGINALI (muri, scala, nicchie, cassa...): distanza minima;
 2. nessuna sovrapposizione tra tavoli/sedie e con vano montacarichi, zona di carico/scarico,
    postazione di servizio, scala, area davanti alla porta cucina e all'ingresso;
 3. distanze misurate: tra tavoli della stessa fila, tra schienali di file affiancate, sedia-parete;
 4. larghezza utile dei percorsi principali (massimo diametro che passa da A a B nello spazio libero);
 5. raggiungibilita' di ogni sedia dai percorsi principali (larghezza utile minima di accesso);
 6. montacarichi: stessa impronta ai due piani, interferenze con le linee esistenti.
Uso:  MC_POS=F python3 scripts/s12_verifica_finale.py [--corretto]
Output: dati/layout_FINALE.json, dati/verifica_FINALE.json, 01_analisi/schizzi/VERIFICA_FINALE_*.png"""
import os, sys, json, pathlib, copy
os.environ.setdefault('MC_POS', 'F')
import numpy as np
from shapely.geometry import Polygon, box, LineString, Point
from shapely.ops import unary_union
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from geometria import load_vector_lines
from progetto import REMOVE, MC, FIXED, NEW_SERVICE
from disegno import chairs_of
from layout import MOD

ROOT = pathlib.Path(__file__).resolve().parents[1]
CORR = '--corretto' in sys.argv

# ------------------------------------------------------------------ layout finale (schizzi confermati)
def row(x0, y, n, gap, sides='NS'):
    return [dict(x=x0 + i*(80+gap), y=y, nx=1, ny=1, sides=sides, seats=2) for i in range(n)]
def col(x, y0, n, gap, sides='EW'):
    return [dict(x=x, y=y0 + i*(80+gap), nx=1, ny=1, sides=sides, seats=2) for i in range(n)]

def layout(dy):
    """dy = scostamenti (cm) delle file dalle pareti, applicati nella versione corretta."""
    d = dy if CORR else {}
    g = lambda k: d.get(k, 0)
    PT = {
        'PT - sala davanti alla cucina': row(2200, 8 + g('n1'), 5, 10) + row(2245, 222, 4, 10) + row(2257, 437 - g('n3'), 4, 5),
        "PT - sala dell'ingresso": row(2295, 674 + g('i3'), 3, 10) + col(2396, 827, 2, 8)[::-1],
    }
    S1 = {
        'S1 - sala interrata': row(2170, 7 + g('s1'), 5, 10) + row(2353, 290, 3, 5)
                               + [dict(x=2080, y=110 + g('s1'), nx=1, ny=1, sides='NS', seats=2)],
        'S1 - ex area bar': [dict(x=2090, y=769 + g('b1'), nx=1, ny=1, sides='NS', seats=2)]
                            + row(2180, 769 + g('b1'), 3, 10) + row(2165, 1050, 4, 5),
    }
    return PT, S1

CORREZIONI = {'n1': 6, 'n3': 7, 'i3': 6, 's1': 6, 'b1': 6}

# ------------------------------------------------------------------ geometria di controllo
FLOOR = {
    'terra': unary_union([
        Polygon([(2061, -37), (2671, -46), (2589, 561), (2057, 562)]),          # sala davanti alla cucina
        box(2080, 560, 2187, 631),                                              # varco tra le due sale
        Polygon([(2057, 629), (2579, 626), (2485, 1290), (2400, 1295), (2400, 1183),
                 (2185, 1183), (2185, 770), (2057, 770)]),                      # sala ingresso + disimpegno
    ]),
    'int': unary_union([
        Polygon([(2073, -38), (2674, -42), (2588, 558), (2077, 558), (2073, 385)]),  # sala interrata (filo muri 4/7)
        box(2040, 262, 2077, 385),                                              # varco personale
        Polygon([(2451, 556), (2580, 556), (2566, 727), (2474, 727)]),          # varco lungo facciata
        Polygon([(2058, 724), (2566, 725), (2500, 1184), (2164, 1184), (2164, 978), (2058, 978)]),  # ex bar
    ]),
}
x0, y0, x1, y1 = MC.vano()
OBST = {   # ingombri fissi e zone da tenere libere (rettangoli o poligoni)
    'terra': {
        'vano montacarichi': box(x0, y0, x1, y1),
        'zona di carico MC (lato est)': box(x1, y0, x1 + 90, y1),
        'postazione di servizio S1': Polygon(FIXED['terra']['S1 postazione di servizio']),
        'davanti porta cucina': box(2061, 10, 2151, 91),
        'scala': Polygon(FIXED['terra']['scala (rampa 1+2, pianerottolo)']),
        'ingresso: anta + 150x150': box(2410, 1000, 2577, 1140),
    },
    'int': {
        'vano montacarichi': box(x0, y0, x1, y1),
        'mensola + zona di scarico MC (lato est)': box(x1, y0, x1 + 90, y1),
        'elemento fisso 158': Polygon(FIXED['int']['elemento fisso 158 (da verificare)']),
        'scala': Polygon(FIXED['int']['scala']),
    },
}
ROUTES = {   # percorsi principali: (da, a, larghezza minima richiesta cm)
    'terra': {
        'porta cucina -> varco sala ingresso (camerieri)': ((2090, 50), (2133, 600), 90),
        'porta cucina -> carico montacarichi': ((2090, 50), (2200, 425), 80),
        'ingresso -> varco sala cucina (clienti)': ((2490, 1067), (2133, 600), 90),
        'ingresso -> scala per interrato': ((2490, 1067), (2440, 1240), 90),
        'ingresso -> porta disimpegno WC': ((2490, 1067), (2070, 690), 90),
    },
    'int': {
        'piede scala -> varco verso sala (clienti)': ((2110, 965), (2520, 640), 90),
        'varco -> sala interrata (clienti)': ((2520, 640), (2400, 200), 90),
        'varco -> scarico montacarichi (personale)': ((2520, 640), (2200, 425), 80),
        'scarico MC -> varco WC personale/spogliatoio': ((2200, 425), (2055, 320), 80),
    },
}
MAIN = {'terra': (2490, 1067), 'int': (2520, 640)}


def walls(floor):
    return [LineString(L['pts']) for L in load_vector_lines(floor) if L['id'] not in REMOVE[floor] and len(L['pts']) > 1]


def free_space(floor, items):
    obst = unary_union(list(items) + [o for k, o in OBST[floor].items() if 'zona' not in k and 'davanti' not in k
                                      and 'ingresso' not in k and 'mensola' not in k])
    return FLOOR[floor].difference(obst)


def route_width(free, a, b):
    lo, hi = 0.0, 250.0
    for _ in range(18):
        w = (lo + hi) / 2
        er = free.buffer(-w/2)
        comps = list(er.geoms) if er.geom_type == 'MultiPolygon' else [er]
        ok = any(c.distance(Point(a)) <= w/2 + 3 and c.distance(Point(b)) <= w/2 + 3 for c in comps if not c.is_empty)
        lo, hi = (w, hi) if ok else (lo, w)
    return lo


def access_width(free, main, target):
    lo, hi = 0.0, 200.0
    for _ in range(16):
        w = (lo + hi) / 2
        er = free.buffer(-w/2)
        comps = list(er.geoms) if er.geom_type == 'MultiPolygon' else [er]
        ok = any(c.distance(Point(main)) <= w/2 + 3 and c.distance(target) <= w/2 + 2 for c in comps if not c.is_empty)
        lo, hi = (w, hi) if ok else (lo, w)
    return lo


def verify():
    PT, S1 = layout(CORREZIONI)
    rep = {'versione': 'corretta' if CORR else 'come da schizzo', 'piani': {}, 'problemi': [], 'avvisi': []}
    numbering = {'terra': 1, 'int': 101}
    for floor, rooms in (('terra', PT), ('int', S1)):
        W = walls(floor)
        items, info = [], []
        n = numbering[floor]
        for rn, groups in rooms.items():
            for g in groups:
                t = box(g['x'], g['y'], g['x'] + 80, g['y'] + 80)
                ch = [box(*c[:4]) for c in chairs_of(g)]
                info.append(dict(T=f'T{n}', sala=rn, x=g['x'], y=g['y'], tavolo=t, sedie=ch))
                items += [t] + ch
                n += 1
        F = {'tavoli': len(info), 'coperti': 2*len(info), 'tavoli_dettaglio': []}
        # 1-2 collisioni
        for it in info:
            parts = [('tavolo', it['tavolo'])] + [(f'sedia {i+1}', c) for i, c in enumerate(it['sedie'])]
            dmin_wall = min(min(w.distance(p) for w in W) for _, p in parts)
            for nm, p in parts:
                if any(w.intersects(p.buffer(-0.5)) for w in W):
                    rep['problemi'].append(f"{it['T']}: {nm} tocca/attraversa una linea esistente (muro/nicchia)")
                if p.difference(FLOOR[floor]).area > 1:
                    rep['problemi'].append(f"{it['T']}: {nm} esce dal pavimento utile di {p.difference(FLOOR[floor]).area:.0f} cm2")
                for k, o in OBST[floor].items():
                    if p.intersection(o).area > 1:
                        rep['problemi'].append(f"{it['T']}: {nm} invade '{k}'")
            F['tavoli_dettaglio'].append(dict(T=it['T'], sala=it['sala'], dist_min_da_muri_cm=round(dmin_wall, 1)))
        # sovrapposizioni tra tavoli/sedie di gruppi diversi
        for i in range(len(info)):
            for j in range(i+1, len(info)):
                A = unary_union([info[i]['tavolo']] + info[i]['sedie']); B = unary_union([info[j]['tavolo']] + info[j]['sedie'])
                if A.intersection(B).area > 1:
                    rep['problemi'].append(f"{info[i]['T']} e {info[j]['T']}: tavoli/sedie sovrapposti")
        # 3 distanze caratteristiche
        tables = [it['tavolo'] for it in info]
        chairs = [c for it in info for c in it['sedie']]
        same_row = [tables[i].distance(tables[j]) for i in range(len(tables)) for j in range(i+1, len(tables))
                    if abs(tables[i].bounds[1] - tables[j].bounds[1]) < 1 and tables[i].distance(tables[j]) < 30]
        F['distanza_tra_tavoli_stessa_fila_cm'] = [round(min(same_row), 1), round(max(same_row), 1)] if same_row else None
        backs = []
        for i, a in enumerate(info):
            for b in info[i+1:]:
                for ca in a['sedie']:
                    for cb in b['sedie']:
                        d = ca.distance(cb)
                        if 0 < d < 90 and abs(ca.bounds[1] - cb.bounds[1]) > 30:   # sedie di file diverse
                            backs.append((d, a['T'], b['T']))
        if backs:
            m = min(backs)
            F['passaggio_minimo_tra_schienali_cm'] = dict(valore=round(m[0], 1), tra=f'{m[1]}-{m[2]}')
        # 4 percorsi
        free = free_space(floor, items)
        F['percorsi'] = {}
        for nm, (a, b, req) in ROUTES[floor].items():
            w = route_width(free, a, b)
            F['percorsi'][nm] = dict(larghezza_utile_cm=round(w), richiesta_cm=req, esito='OK' if w >= req else 'INSUFFICIENTE')
            if w < req:
                rep['problemi'].append(f'{floor}: percorso "{nm}" largo {w:.0f} cm < {req} cm')
        # 5 accesso a ogni sedia
        acc = []
        for it in info:
            for i, c in enumerate(it['sedie']):
                w = access_width(free, MAIN[floor], c)
                acc.append((w, it['T']))
        acc.sort()
        F['accesso_sedie_cm'] = dict(minimo=round(acc[0][0]), tavolo=acc[0][1],
                                     sotto_40cm=sorted(set(t for w, t in acc if w < 40)))
        if acc[0][0] < 30:
            rep['problemi'].append(f"{floor}: sedia di {acc[0][1]} raggiungibile solo con {acc[0][0]:.0f} cm")
        rep['piani'][floor] = F
        rep[f'_geom_{floor}'] = info
    # 6 montacarichi
    mc = box(x0, y0, x1, y1)
    rep['montacarichi'] = {'vano_cm': [x0, y0, x1, y1], 'stessa_impronta_PT_S1': True,
                           'linee_attraversate_PT': [L['id'] for L in load_vector_lines('terra') if L['id'] not in REMOVE['terra'] and len(L['pts']) > 1 and LineString(L['pts']).intersects(mc.buffer(-0.5))],
                           'linee_attraversate_S1': [L['id'] for L in load_vector_lines('int') if L['id'] not in REMOVE['int'] and len(L['pts']) > 1 and LineString(L['pts']).intersects(mc.buffer(-0.5))],
                           'dentro_pavimento_PT': mc.difference(FLOOR['terra']).area < 1,
                           'dentro_pavimento_S1': mc.difference(FLOOR['int']).area < 1}
    for f in ('PT', 'S1'):
        if rep['montacarichi'][f'linee_attraversate_{f}'] or not rep['montacarichi'][f'dentro_pavimento_{f}']:
            rep['problemi'].append(f'montacarichi: interferenza al {f}')
    rep['coperti_totali'] = sum(p['coperti'] for p in rep['piani'].values())
    rep['esito'] = 'TUTTO OK' if not rep['problemi'] else f"{len(rep['problemi'])} PROBLEMI"
    return rep, PT, S1


def png(rep):
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    from s06_export import T, poly, rect_pts, text, draw_plan
    import s06_export
    s06_export.MC = MC
    for floor, rooms in (('terra', rep['_PT']), ('int', rep['_S1'])):
        L = {'params': {'D': 50}, 'rooms': {}, '_start_no': {floor: 1 if floor == 'terra' else 101}}
        for rn, g in rooms.items():
            L['rooms'][rn] = {'floor': floor, 'groups': g, 'keepouts': {}, 'seats': 2*len(g), 'zones': {}}
        fig, ax = plt.subplots(figsize=(11, 11.5))
        draw_plan(ax, floor, L, show_keep=False, fs_t=6)
        bad = set(p.split(':')[0] for p in rep['problemi'])
        for it in rep[f'_geom_{floor}']:
            if it['T'] in bad:
                for p in [it['tavolo']] + it['sedie']:
                    poly(ax, list(p.exterior.coords)[:-1], fc='#fc8181', alpha=0.55, ec='#c53030', lw=1, zorder=9)
        F = rep['piani'][floor]
        lines = [f"{k}: {v['larghezza_utile_cm']} cm (min {v['richiesta_cm']}) {v['esito']}" for k, v in F['percorsi'].items()]
        ax.text(0.01, 0.01, '\n'.join(['PERCORSI (larghezza utile misurata)'] + lines +
                [f"Passaggio minimo tra schienali: {F.get('passaggio_minimo_tra_schienali_cm', {}).get('valore')} cm "
                 f"({F.get('passaggio_minimo_tra_schienali_cm', {}).get('tra')})",
                 f"Distanza tra tavoli della stessa fila: {F['distanza_tra_tavoli_stessa_fila_cm']} cm",
                 f"Accesso minimo a una sedia: {F['accesso_sedie_cm']['minimo']} cm ({F['accesso_sedie_cm']['tavolo']})"]),
                transform=ax.transAxes, fontsize=7, va='bottom', family='monospace',
                bbox=dict(fc='white', ec='#999', alpha=0.9))
        P = T(rect_pts(1950, -80, 2720, 1340)); ax.set_xlim(P[:, 0].min(), P[:, 0].max()); ax.set_ylim(P[:, 1].max(), P[:, 1].min())
        ax.set_aspect('equal'); ax.axis('off')
        nprob = sum(1 for p in rep['problemi'] if p.split(':')[0] in {i['T'] for i in rep[f'_geom_{floor}']} or p.startswith(floor))
        ax.set_title(f"VERIFICA {('PIANO TERRA' if floor == 'terra' else 'PIANO INTERRATO')} - versione {rep['versione']}\n"
                     f"{F['coperti']} coperti - {'nessun problema' if nprob == 0 else str(nprob) + ' problemi (in rosso)'}", fontsize=10)
        fig.subplots_adjust(0.01, 0.01, 0.99, 0.93)
        fig.savefig(ROOT / f"01_analisi/schizzi/VERIFICA_{'CORRETTA' if CORR else 'FINALE'}_{'PT' if floor == 'terra' else 'S1'}.png", dpi=130)
        plt.close(fig)


if __name__ == '__main__':
    rep, PT, S1 = verify()
    rep['_PT'], rep['_S1'] = PT, S1
    png(rep)
    out = {k: v for k, v in rep.items() if not k.startswith('_')}
    tag = 'CORRETTA' if CORR else 'FINALE'
    (ROOT / f'dati/verifica_{tag}.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
    (ROOT / f'dati/layout_{tag}.json').write_text(json.dumps({'PT': PT, 'S1': S1, 'montacarichi': MC.vano()}, indent=1))
    print(json.dumps(out, indent=1, ensure_ascii=False))
