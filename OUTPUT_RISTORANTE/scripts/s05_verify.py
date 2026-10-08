"""Step 5 - Verifica indipendente delle disposizioni (shapely), separata dall'ottimizzatore.
Controlli per ogni soluzione:
 1. tavoli e sedie non intersecano muri/elementi fissi ORIGINALI (linee vettoriali non rimosse);
 2. involucro rigido (tavolo + fascia seduta) interamente nella zona utile dell'ambiente;
 3. nessuna intersezione con percorsi riservati, vano montacarichi, scala, ingresso;
 4. distanza minima tra persone sedute di gruppi diversi >= g;
 5. raggiungibilita': ogni gruppo confina con lo spazio libero connesso ai percorsi principali
    con larghezza utile >= g (erosione morfologica);
 6. montacarichi: interferenze del vano con linee esistenti ai due livelli.
Output: dati/verifica_<sol>.json e testo a video. Exit code 1 se una verifica bloccante fallisce."""
import json, sys, pathlib
import numpy as np
from shapely.geometry import box, Polygon, LineString, Point
from shapely.ops import unary_union
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from geometria import load_vector_lines
from progetto import REMOVE, MC, FIXED
from layout import MOD, envelope, soft_envelope, PARAMS
from disegno import chairs_of

ROOT = pathlib.Path(__file__).resolve().parents[1]
TOL = 0.5  # cm


def wall_lines(floor):
    return [LineString(L['pts']) for L in load_vector_lines(floor) if L['id'] not in REMOVE[floor]
            and len(L['pts']) >= 2]


def verify(sol):
    Ls = json.loads((ROOT / f'dati/layout_{sol}.json').read_text())
    D, g = Ls['params']['D'], Ls['params']['g']
    walls = {f: wall_lines(f) for f in ('terra', 'int')}
    report = {'solution': sol, 'rooms': {}, 'blocking': [], 'warnings': []}
    tno = 1
    for rn, r in Ls['rooms'].items():
        f = r['floor']
        zone = unary_union([Polygon(z) for z in r['zones'].values()])
        kos = {k: box(*v) for k, v in r['keepouts'].items()}
        fixed = {k: Polygon(v) for k, v in FIXED[f].items()}
        hard, soft, seatz, rows = [], [], [], []
        prm = PARAMS[sol]
        for gi, gr in enumerate(r['groups']):
            tb = box(gr['x'], gr['y'], gr['x'] + gr['nx']*MOD, gr['y'] + gr['ny']*MOD)
            hb = box(*envelope(gr['x'], gr['y'], gr['nx'], gr['ny'], gr['sides'], D))
            ch = [box(*c[:4]) for c in chairs_of(gr)]
            hard.append(hb)
            soft.append(box(*soft_envelope(gr['nx'], gr['ny'], gr['sides'], prm, gr['x'], gr['y'])))
            seatz.append(hb.difference(tb))
            issues = []
            for wl in walls[f]:
                if wl.intersects(tb.buffer(-TOL)): issues.append('tavolo interseca linea esistente')
                if any(wl.intersects(c.buffer(-TOL)) for c in ch): issues.append('sedia interseca linea esistente')
            if hb.difference(zone.buffer(TOL)).area > 1: issues.append('fuori zona utile')
            for k, kp in {**kos, **fixed}.items():
                if hb.intersection(kp).area > 1: issues.append(f'interseca {k}')
            if f == 'terra' or f == 'int':
                if hb.intersection(box(*MC.vano())).area > 1: issues.append('interseca montacarichi')
            issues = sorted(set(issues))
            if issues: report['blocking'].append(f'{rn} T{tno}: ' + '; '.join(issues))
            rows.append(dict(T=tno, moduli=f"{gr['nx']}x{gr['ny']}", dim_cm=f"{gr['nx']*MOD}x{gr['ny']*MOD}",
                             coperti=gr['seats'], lati_seduta=gr['sides'], x=gr['x'], y=gr['y'], esito='OK' if not issues else 'KO'))
            tno += 1
        # distanze tra gruppi
        dmin = None
        for i in range(len(hard)):
            for j in range(i+1, len(hard)):
                if soft[i].intersection(soft[j]).area > 1:
                    report['blocking'].append(f'{rn}: involucri sovrapposti T{rows[i]["T"]}-T{rows[j]["T"]}')
                d = hard[i].distance(hard[j])
                dmin = d if dmin is None else min(dmin, d)
                if d < g - TOL: report['blocking'].append(f'{rn}: passaggio tra T{rows[i]["T"]} e T{rows[j]["T"]} {d:.0f} < {g} cm')
        # raggiungibilita': spazio libero connesso ai percorsi riservati (sorgente = corridoi)
        free = zone.union(unary_union(list(kos.values())).intersection(zone.buffer(400))).difference(unary_union(hard + list(fixed.values()) + [box(*MC.vano())]))
        opened = free.buffer(-(g/2 - 1)).buffer(g/2 - 1)
        corr = unary_union([v for k, v in kos.items() if 'corridoio' in k or 'arrivo' in k])
        comps = list(opened.geoms) if opened.geom_type == 'MultiPolygon' else [opened]
        reach = unary_union([c for c in comps if c.intersects(corr)]) if comps else Polygon()
        unreach = []
        for k, hb in enumerate(hard):
            if not hb.buffer(2).intersects(reach):
                unreach.append(rows[k]['T'])
        if unreach: report['blocking'].append(f'{rn}: gruppi non raggiungibili {unreach}')
        # margine verso pareti (indicativo)
        report['rooms'][rn] = dict(floor=f, variante=r['variant'], solver=r['status'], coperti=r['seats'],
                                   gruppi=len(r['groups']), moduli=sum(gr['nx']*gr['ny'] for gr in r['groups']),
                                   passaggio_min_tra_gruppi_cm=None if dmin is None else round(dmin),
                                   tavoli=rows, area_zona_m2=round(zone.area/1e4, 1))
    # montacarichi: interferenze con linee esistenti
    mc = box(*MC.vano())
    for f in ('terra', 'int'):
        hits = [L['id'] for L in load_vector_lines(f) if L['id'] not in REMOVE[f] and len(L['pts']) > 1
                and LineString(L['pts']).intersects(mc)]
        report[f'montacarichi_interferenze_{f}'] = sorted(set(hits))
    report['coperti_PT'] = sum(v['coperti'] for v in report['rooms'].values() if v['floor'] == 'terra')
    report['coperti_S1'] = sum(v['coperti'] for v in report['rooms'].values() if v['floor'] == 'int')
    report['coperti_tot'] = report['coperti_PT'] + report['coperti_S1']
    report['moduli_tot'] = sum(v['moduli'] for v in report['rooms'].values())
    report['esito'] = 'VERIFICATO (geometria nominale)' if not report['blocking'] else 'NON VERIFICATO'
    (ROOT / f'dati/verifica_{sol}.json').write_text(json.dumps(report, indent=1, ensure_ascii=False))
    return report


if __name__ == '__main__':
    bad = False
    for s in (sys.argv[1] if len(sys.argv) > 1 else 'ABC'):
        r = verify(s)
        print(f"== {s}: PT {r['coperti_PT']}  S1 {r['coperti_S1']}  TOT {r['coperti_tot']}  moduli {r['moduli_tot']}  -> {r['esito']}")
        for rn, v in r['rooms'].items():
            print(f"   {rn:28s} {v['coperti']:3d} coperti  {v['gruppi']:2d} gruppi  pass.min {v['passaggio_min_tra_gruppi_cm']}  [{v['solver']}]")
        for b in r['blocking']: print('   KO:', b)
        print('   montacarichi interferenze PT', r['montacarichi_interferenze_terra'], 'S1', r['montacarichi_interferenze_int'])
        bad |= bool(r['blocking'])
    sys.exit(1 if bad else 0)
