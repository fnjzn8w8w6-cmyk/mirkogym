"""Step 3 - Registrazione interrato -> piano terra (sovrapposizione verticale).
Punti omologhi = elementi fisicamente comuni ai due livelli (muri perimetrali e scala di collegamento).
Stima di similitudine (Umeyama) da coordinate interrato [pt ruotati di 22.6 deg] a frame locale PT [cm].
La scala dell'interrato (mm/pt) e' quindi derivata dalla scala del PT (calibrata sulla catastale)."""
import json, pathlib, numpy as np
ROOT = pathlib.Path(__file__).resolve().parents[1]
PAIRS = [  # (descrizione, interrato pt ruotati, PT cm locali)
    ('spigolo NE esterno facciata',        (696.0, -45.9), (2756, -140)),
    ('estremo S facciata esterna',         (642.2, 339.5), (2548, 1337)),
    ('cambio direzione muro nord',         (401.4, -21.0), (1630, -46)),
    ('scala: angolo SW (muro ovest/sud)',  (513.7, 334.9), (2057, 1318)),
    ('scala: fine rampa 2 (lato est)',     (602.9, 329.4), (2400, 1295)),
    ('scala: inizio rampa 1 (lato nord)',  (513.9, 246.6), (2058, 975)),
]
def umeyama(A, B):
    A, B = np.asarray(A, float), np.asarray(B, float)
    ma, mb = A.mean(0), B.mean(0); A0, B0 = A-ma, B-mb
    U, S, Vt = np.linalg.svd(B0.T @ A0 / len(A))
    D = np.eye(2); D[1, 1] = np.sign(np.linalg.det(U @ Vt))
    R = U @ D @ Vt; s = np.trace(np.diag(S) @ D) / (A0**2).sum(1).mean()
    t = mb - s * R @ ma
    return s, R, t
if __name__ == '__main__':
    A = [p[1] for p in PAIRS]; B = [p[2] for p in PAIRS]
    s, R, t = umeyama(A, B)
    res = (s * (R @ np.array(A).T)).T + t - np.array(B)
    rot = np.degrees(np.arctan2(R[1, 0], R[0, 0]))
    print('scala %.4f cm/pt = %.2f mm/pt  rotazione %.2f deg  t=%s' % (s, s*10, rot, t))
    for (n, a, b), r in zip(PAIRS, res): print('  %-38s residuo %.1f cm' % (n, np.hypot(*r)))
    rms = float(np.sqrt((res**2).sum(1).mean()))
    print('RMS %.1f cm' % rms)
    cal = json.loads((ROOT/'dati/calibrazione.json').read_text())
    cal['int_su_terra'] = dict(metodo='similitudine su punti omologhi (muri perimetrali + scala)',
        scale_cm_per_pt=float(s), mm_per_pt=float(s*10), rot_deg=float(rot), R=R.tolist(), t=t.tolist(),
        rms_cm=rms, residui_cm=[float(np.hypot(*r)) for r in res], coppie=[p[0] for p in PAIRS])
    cal['int']['mm_per_pt_catastale'] = cal['int']['mm_per_pt']
    cal['int']['mm_per_pt'] = float(s*10)
    cal['int']['nota'] = ('registrazione sulla catastale poco discriminante (bacino 36-38.6 mm/pt); '
                          'adottata la scala da elementi comuni al PT')
    (ROOT/'dati/calibrazione.json').write_text(json.dumps(cal, indent=1))
