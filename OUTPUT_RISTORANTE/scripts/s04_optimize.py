"""Step 4 - Generazione e confronto delle disposizioni (soluzioni A, B, C) con CP-SAT.
Per ogni ambiente e variante di percorso risolve il problema di massimizzazione dei coperti e
conserva la variante migliore. Output: dati/layout_<A|B|C>.json"""
import json, sys, time, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from layout import PARAMS, solve, strip_dp, valid_layout, unreachable, MOD, oriented
from progetto import FIXED, MC
from progetto import rooms, keepouts, VARIANTS

ROOT = pathlib.Path(__file__).resolve().parents[1]

def run(sol, time_s):
    prm = PARAMS[sol]; prm.time_s = time_s
    out = {'solution': sol, 'name': prm.name, 'params': dict(D=prm.D, g=prm.g, W_main=prm.W_main),
           'configs': prm.configs, 'rooms': {}}
    for rn, r in rooms().items():
        best = None
        prm = oriented(PARAMS[sol], r.get('orient'))
        for v in VARIANTS.get(rn, ['v1']):
            ko = keepouts(rn, prm.W_main, v)
            t = time.time()
            # 1) seme strutturato (programmazione dinamica a file); 2) layout precedente; 3) CP-SAT con hint
            seed = strip_dp(r['zones'], ko, prm, orients=(('cols', 'rows') if r['orient'] == 'any' else (r['orient'],)))
            cands = [('DP', seed)]
            prev = ROOT / f'dati/layout_{sol}.json'
            if prev.exists():
                pr = json.loads(prev.read_text())['rooms'].get(rn)
                if pr and pr['variant'] == v and valid_layout(pr['groups'], r['zones'], ko, prm):
                    cands.append(('prec', pr['groups']))
            # il seme deve essere raggiungibile
            from shapely.geometry import Polygon as _P0
            _ob = [_P0(p) for p in FIXED[r['floor']].values()] + [MC.vano()]
            cands = [c for c in cands if not unreachable(c[1], r['zones'], ko, prm, _ob)] or [('vuoto', [])]
            hint = max(cands, key=lambda c: sum(g['seats'] for g in c[1]))[1]
            groups, st, obj, bound = solve(r['zones'], ko, prm, fixed_hint=hint,
                                           max_groups=max(len(hint) + 3, 6))
            if not valid_layout(groups, r['zones'], ko, prm) or sum(g['seats'] for g in groups) < sum(g['seats'] for g in hint) \
                    or (unreachable(groups, r['zones'], ko, prm, _ob) and sum(g['seats'] for g in groups) <= sum(g['seats'] for g in hint)):
                groups, st = hint, st + '+seed'
            # riparazione: gruppi irraggiungibili -> posizione vietata e nuova risoluzione
            from shapely.geometry import Polygon as _P
            obst = [_P(p) for p in FIXED[r['floor']].values()] + [MC.vano()]
            ko2 = dict(ko)
            for it in range(4):
                bad = unreachable(groups, r['zones'], ko2, prm, obst)
                if not bad: break
                for i in bad:
                    q = groups[i]
                    ko2[f'vietato_{it}_{i}'] = (q['x'] + 5, q['y'] + 5, q['x'] + q['nx']*MOD - 5, q['y'] + q['ny']*MOD - 5)
                print(f'   riparazione {it+1}: gruppi irraggiungibili {bad}', flush=True)
                good = [q for j, q in enumerate(groups) if j not in bad]
                groups, st, obj, bound = solve(r['zones'], ko2, prm, fixed_hint=good, max_groups=max(len(groups) + 2, 6))
                st += f'+rip{it+1}'
            bad = unreachable(groups, r['zones'], ko, prm, obst)
            if bad:
                groups = [q for j, q in enumerate(groups) if j not in bad]; st += '+rimossi'
            seats = sum(g['seats'] for g in groups)
            print(f'{sol} | {rn:28s} | {v} | {st:8s} | coperti {seats:3d} | gruppi {len(groups):2d} '
                  f'| {time.time()-t:5.1f}s | bound {bound/1000:.1f}', flush=True)
            if best is None or seats > best['seats']:
                best = dict(variant=v, status=st, seats=seats, groups=groups, keepouts=ko,
                            zones=r['zones'], floor=r['floor'], bound_seats=bound/1000)
        out['rooms'][rn] = best
    out['tot_terra'] = sum(v['seats'] for v in out['rooms'].values() if v['floor'] == 'terra')
    out['tot_int'] = sum(v['seats'] for v in out['rooms'].values() if v['floor'] == 'int')
    out['tot'] = out['tot_terra'] + out['tot_int']
    print(f'== {sol}: PT {out["tot_terra"]}  S1 {out["tot_int"]}  TOT {out["tot"]}', flush=True)
    (ROOT / f'dati/layout_{sol}.json').write_text(json.dumps(out, indent=1))
    return out

if __name__ == '__main__':
    sols = sys.argv[1] if len(sys.argv) > 1 else 'ABC'
    ts = float(sys.argv[2]) if len(sys.argv) > 2 else 60
    for s in sols:
        run(s, ts)
