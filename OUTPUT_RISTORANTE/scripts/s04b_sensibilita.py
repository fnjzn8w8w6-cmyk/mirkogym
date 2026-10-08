"""Step 4b - Analisi di sensibilita': quanti coperti costano i singoli vincoli.
Per le soluzioni B e C ricalcola (seme DP + CP-SAT breve, con verifica di raggiungibilita') la
capienza togliendo un vincolo alla volta. Non produce disposizioni di progetto: serve a spiegare
i limiti di capienza. Output: dati/sensibilita.json"""
import json, sys, copy, pathlib
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from shapely.geometry import Polygon
from layout import PARAMS, solve, strip_dp, valid_layout, unreachable, oriented
import progetto
from progetto import rooms, keepouts, VARIANTS, FIXED, MC

ROOT = pathlib.Path(__file__).resolve().parents[1]


def capacity(sol, W=None, no_mc=False, time_s=40):
    tot = 0
    for rn, r in rooms().items():
        prm = oriented(PARAMS[sol], r['orient']); prm.time_s = time_s
        Wm = W if W is not None else prm.W_main
        best = 0
        for v in VARIANTS.get(rn, ['v1']):
            ko = keepouts(rn, Wm, v)
            if no_mc:
                ko = {k: q for k, q in ko.items() if 'montacarichi' not in k}
            ob = [Polygon(p) for k, p in FIXED[r['floor']].items() if not (no_mc and 'appoggio' in k)]
            if not no_mc: ob.append(MC.vano())
            orients = ('cols', 'rows') if r['orient'] == 'any' else (r['orient'],)
            seed = strip_dp(r['zones'], ko, prm, orients=orients)
            if unreachable(seed, r['zones'], ko, prm, ob): seed = []
            g, st, _, _ = solve(r['zones'], ko, prm, fixed_hint=seed)
            if not valid_layout(g, r['zones'], ko, prm) or unreachable(g, r['zones'], ko, prm, ob):
                g = seed
            best = max(best, sum(q['seats'] for q in g))
        tot += best
    return tot


if __name__ == '__main__':
    import os
    if os.environ.get('MC_COMPACT') == '1':
        f = ROOT / 'dati/sensibilita.json'
        out = json.loads(f.read_text())
        for sol in 'BC':
            out[sol]['montacarichi compatto 80x80 con appoggio ribaltabile'] = capacity(sol)
            print(sol, out[sol], flush=True)
        f.write_text(json.dumps(out, indent=1, ensure_ascii=False))
        raise SystemExit
    out = {}
    for sol in 'BC':
        base = json.loads((ROOT / f'dati/layout_{sol}.json').read_text())['tot']
        r = {'progetto': base}
        r['senza montacarichi'] = capacity(sol, no_mc=True)
        r['corridoi principali 100 cm'] = capacity(sol, W=100) if PARAMS[sol].W_main != 100 else base
        r['corridoi principali 90 cm (sotto il criterio indicato)'] = capacity(sol, W=90)
        out[sol] = r
        print(sol, r, flush=True)
    (ROOT / 'dati/sensibilita.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
