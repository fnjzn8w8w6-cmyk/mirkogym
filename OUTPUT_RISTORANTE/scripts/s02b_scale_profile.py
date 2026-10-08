"""Step 2b - Profilo di sensibilita' della registrazione dell'interrato: per ogni scala fissata
ottimizza rotazione+traslazione e riporta la chamfer distance. Serve a valutare l'affidabilita'
della scala stimata (minimo netto = scala ben determinata)."""
import json, sys, pathlib, numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from s02_calibrate_vs_catastale import *
import matplotlib.image as mpimg
im = mpimg.imread(ROOT/'dati/catastale_raster.png'); dark = im < 0.5
dist = ndimage.distance_transform_edt(~dark)
cal = json.loads((ROOT/'dati/calibrazione.json').read_text())
res = {}
for k in sys.argv[1:]:
    d = json.load(open(ROOT/f'dati/vettori_{k}.json'))
    paths = [p for p in d['paths'] if p['color'] in ([0,0,0],)]
    P = sample_paths(paths, min_diag=40)
    c0 = cal[k]; s0 = c0['s_px_per_pt']; th0 = c0['theta_deg']; t0 = np.array(c0['t'])
    cen = P.mean(0)
    rows = []
    for s in np.arange(1.30, 1.70, 0.02):
        # traslazione iniziale: mantiene il baricentro
        def tr(s, th):
            c, sn = np.cos(np.radians(th)), np.sin(np.radians(th))
            return (cen @ np.array([[c, sn], [-sn, c]]))
        tinit = transform(cen[None], s0, th0, t0)[0] - tr(s, th0)*s
        def f(x):
            th, tx, ty = x
            Q = transform(P, s, th, [tx, ty])
            dd = ndimage.map_coordinates(dist, [Q[:,1], Q[:,0]], order=1, mode='nearest')
            return np.mean(np.minimum(dd, 4.0)**2)
        best = None
        for dx in (-6, 0, 6):
            for dy in (-6, 0, 6):
                r = optimize.minimize(f, [th0, tinit[0]+dx, tinit[1]+dy], method='Nelder-Mead',
                                      options=dict(xatol=1e-4, fatol=1e-6, maxiter=3000))
                if best is None or r.fun < best.fun: best = r
        rows.append((float(s), float(s*MM_PER_RASTER_PX), float(best.fun)))
        print(k, '%.2f px/pt  %.2f mm/pt  chamfer %.3f' % rows[-1], flush=True)
    res[k] = rows
(ROOT/'dati/profilo_scala.json').write_text(json.dumps(res, indent=1))
