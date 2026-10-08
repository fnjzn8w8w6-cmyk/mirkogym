"""Step 2 - Calibrazione dimensionale.
La planimetria catastale (raster CCITT 1654x2340 px su A4, scala 1:200, barra vettoriale
"10 metri" = 141.732 pt) fornisce la scala certa: 1 px raster = 25.40 mm reali.
Le planimetrie di arredo AutoCAD non riportano scala. Si stima per ciascun piano la trasformazione
di similitudine  raster_px = s * R(theta) * p_vector + t  che sovrappone le pareti vettoriali alla
catastale, massimizzando la correlazione tra punti campionati sulle linee vettoriali e la mappa
(sfocata) dei pixel neri del raster; ricerca a griglia su (s, theta) + traslazione via FFT, poi
raffinamento con chamfer distance robusta.
Output: dati/calibrazione.json con mm_per_pt per ciascun piano e trasformazioni."""
import json, pathlib, numpy as np
import matplotlib; matplotlib.use('Agg'); import matplotlib.pyplot as plt, matplotlib.image as mpimg
from scipy import ndimage, signal, optimize
ROOT = pathlib.Path(__file__).resolve().parents[1]
MM_PER_RASTER_PX = 10000/141.732 * (595.516/1654)   # mm reali per px raster (=25.40)

def sample_paths(paths, step=0.6, min_diag=0):
    pts = []
    for p in paths:
        P = np.array([q for s in p['segs'] for q in s[1:]])
        if np.hypot(*(P.max(0)-P.min(0))) < min_diag: continue
        for s in p['segs']:
            if s[0] == 'l': polys = [np.array([s[1], s[2]])]
            elif s[0] == 'c':
                t = np.linspace(0,1,10)[:,None]; c=[np.array(x) for x in s[1:]]
                polys = [(1-t)**3*c[0]+3*(1-t)**2*t*c[1]+3*(1-t)*t**2*c[2]+t**3*c[3]]
            else: polys = [np.array(s[1:]+[s[1]])]
            for L in polys:
                for a, b in zip(L[:-1], L[1:]):
                    n = max(2, int(np.hypot(*(b-a))/step))
                    pts.append(a + np.linspace(0,1,n)[:,None]*(b-a))
    return np.vstack(pts)

def register(vec_pts, dark, rows, s_range, th_range):
    PAD = 350
    sub = np.pad(dark[rows[0]:rows[1]], PAD)
    blur = ndimage.gaussian_filter(sub.astype(float), 2.0)
    best = None
    for s in s_range:
        for th in th_range:
            c, sn = np.cos(np.radians(th)), np.sin(np.radians(th))
            Q = (vec_pts @ np.array([[c, sn], [-sn, c]])) * s       # rotate (x->x c - y s) & scale
            Q -= Q.min(0)
            W, H = (Q.max(0)+2).astype(int)
            img = np.zeros((H, W)); np.add.at(img, (Q[:,1].astype(int), Q[:,0].astype(int)), 1)
            corr = signal.fftconvolve(blur, img[::-1, ::-1], mode='valid')
            idx = np.unravel_index(np.argmax(corr), corr.shape)
            score = corr[idx]/len(Q)
            if best is None or score > best[0]:
                best = (score, s, th, idx)
    score, s, th, (iy, ix) = best
    c, sn = np.cos(np.radians(th)), np.sin(np.radians(th))
    Q = (vec_pts @ np.array([[c, sn], [-sn, c]])) * s
    t = np.array([ix - PAD, iy - PAD + rows[0]]) - Q.min(0)
    return dict(score=float(score), s=float(s), theta=float(th), t=t.tolist())

def refine(vec_pts, dist, x0):
    def f(x):
        s, th, tx, ty = x; c, sn = np.cos(np.radians(th)), np.sin(np.radians(th))
        Q = (vec_pts @ np.array([[c, sn], [-sn, c]])) * s + [tx, ty]
        d = ndimage.map_coordinates(dist, [Q[:,1], Q[:,0]], order=1, mode='nearest')
        return np.mean(np.minimum(d, 4.0)**2)      # chamfer troncata (robusta agli arredi)
    r = optimize.minimize(f, x0, method='Nelder-Mead', options=dict(xatol=1e-5, fatol=1e-6, maxiter=4000))
    return r.x, r.fun

def transform(P, s, th, t):
    c, sn = np.cos(np.radians(th)), np.sin(np.radians(th))
    return (np.asarray(P) @ np.array([[c, sn], [-sn, c]])) * s + t

if __name__ == '__main__':
    im = mpimg.imread(ROOT/'dati/catastale_raster.png')
    dark = im < 0.5
    dist = ndimage.distance_transform_edt(~dark)
    regions = {'terra': (330, 1420), 'int': (1430, 2320)}
    out = {'mm_per_raster_px': MM_PER_RASTER_PX}
    import sys
    floors = sys.argv[1:] or ['terra', 'int']
    if (ROOT/'dati/calibrazione.json').exists():
        out.update(json.loads((ROOT/'dati/calibrazione.json').read_text()))
    ranges = {'terra': (np.arange(1.50, 1.70, 0.02), np.arange(-6, 6.1, 1.0)),
              'int': (np.arange(1.40, 1.70, 0.02), np.arange(-6, 6.1, 1.0))}
    for k in floors:
        d = json.load(open(ROOT/f'dati/vettori_{k}.json'))
        paths = [p for p in d['paths'] if p['color'] in ([0,0,0], [0.0,0.0,0.0])]
        P = sample_paths(paths, min_diag=40)          # solo elementi grandi (pareti, scale)
        P = P[::3]
        r = register(P, dark, regions[k], *ranges[k])
        r = register(P, dark, regions[k], np.arange(r['s']-0.03, r['s']+0.031, 0.005),
                     np.arange(r['theta']-1.5, r['theta']+1.51, 0.25))
        x, fun = refine(sample_paths(paths, min_diag=40), dist, [r['s'], r['theta'], *r['t']])
        s, th, tx, ty = x
        # metriche di qualità: frazione di punti-parete entro 2 px (5 cm) dal raster
        Pall = sample_paths(paths, min_diag=40)
        Q = transform(Pall, s, th, [tx, ty])
        dd = ndimage.map_coordinates(dist, [Q[:,1], Q[:,0]], order=1)
        out[k] = dict(s_px_per_pt=s, theta_deg=th, t=[tx, ty], chamfer=fun,
                      mm_per_pt=s*MM_PER_RASTER_PX,
                      frac_within_2px=float(np.mean(dd <= 2)), frac_within_4px=float(np.mean(dd <= 4)),
                      median_dist_mm=float(np.median(dd)*MM_PER_RASTER_PX))
        out[k] = {kk: (float(v) if np.isscalar(v) else [float(q) for q in v]) for kk, v in out[k].items()}
        print(k, out[k], flush=True)
        # overlay di controllo
        y0, y1 = regions[k]
        Qa = transform(sample_paths(paths), s, th, [tx, ty])
        fig, ax = plt.subplots(figsize=(14, 14*(y1-y0)/1654))
        ax.imshow(im, cmap='gray', extent=(0, im.shape[1], im.shape[0], 0))
        ax.plot(Qa[:,0], Qa[:,1], 'r.', ms=0.6)
        ax.set_xlim(0, 1654); ax.set_ylim(y1, y0); ax.set_title(f'{k}: arredo AutoCAD (rosso) su catastale - 1pt = {s*MM_PER_RASTER_PX:.2f} mm')
        fig.savefig(ROOT/f'01_analisi/overlay_catastale_{k}.png', dpi=110, bbox_inches='tight')
    (ROOT/'dati/calibrazione.json').write_text(json.dumps(out, indent=1))
