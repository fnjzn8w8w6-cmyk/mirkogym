"""Schizzo variante: montacarichi spostato vicino a T10 (stessa verticale ai due piani).
Vano 80x80 a x 2075-2155, y 385-465 (frame comune): a sud del varco personale S1, a ~1 m dal varco
tra le due sale del PT. Solo per confronto: nessun modello viene modificato."""
import sys, pathlib, copy
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import s06_export
from s06_export import T, poly, rect_pts, text, draw_plan
from progetto import Montacarichi, NEW_SERVICE
import s11_schizzo as S
FINAL = '--finale' in sys.argv   # versione finale pulita (senza tavoli rimossi e posizione precedente MC)

OUT = S.OUT
MCV = Montacarichi(L=80, P=80, x0=2075, y0=385)
x0, y0, x1, y1 = MCV.vano()
s06_export.MC = Montacarichi(L=1, P=1, x0=3500, y0=3000)        # vano fittizio fuori dal foglio (nascosto)
NEW_SERVICE['terra'] = {'S1 postazione di servizio (accorciata)': (2057, 260, 2092, 375)}
NEW_SERVICE['int'] = {}

def draw_mc(ax, floor):
    c = '#d53f8c'
    poly(ax, rect_pts(x0, y0, x1, y1), fc=c, alpha=0.3, ec=c, lw=1.4, zorder=7)
    for a, b in [((x0, y0), (x1, y1)), ((x1, y0), (x0, y1))]:
        P = T([a, b]); ax.plot(P[:, 0], P[:, 1], color=c, lw=0.8, zorder=7)
    text(ax, ((x0+x1)/2, (y0+y1)/2), 'MC', ha='center', va='center', fontsize=7, color='#702459', fontweight='bold', zorder=8)
    # porta lato est (carico PT / scarico S1) e zona di manovra
    P = T([(x1+3, y0+8), (x1+3, y1-8)]); ax.plot(P[:, 0], P[:, 1], color=c, lw=2.5, zorder=8)
    poly(ax, rect_pts(x1, y0, x1+90, y1), fc='#fed7e2', alpha=0.5, ec=c, lw=0.6, ls=':', zorder=3)
    text(ax, (x1+45, (y0+y1)/2), 'carico' if floor == 'terra' else 'scarico\n+mensola', ha='center', va='center',
         fontsize=5, color=c, zorder=8)
    if FINAL: return
    # posizione attuale (tratteggio)
    poly(ax, rect_pts(2075, 120, 2155, 200), fc='none', ec=c, lw=0.8, ls='--', zorder=7)
    text(ax, (2115, 160), 'pos.\nattuale', ha='center', va='center', fontsize=4.5, color=c, zorder=8)

def removed(ax, g, label):
    poly(ax, rect_pts(g['x'], g['y'], g['x']+80, g['y']+80), fc='none', ec='#c53030', lw=1, ls='--', zorder=9)
    P = T([(g['x'], g['y']), (g['x']+80, g['y']+80)]); ax.plot(P[:, 0], P[:, 1], color='#c53030', lw=1, zorder=9)
    P = T([(g['x']+80, g['y']), (g['x'], g['y']+80)]); ax.plot(P[:, 0], P[:, 1], color='#c53030', lw=1, zorder=9)
    text(ax, (g['x']+40, g['y']+95), label, ha='center', va='top', fontsize=6, color='#c53030', fontweight='bold', zorder=9)

def sheet(floor, rooms, rem, dims, title, fname):
    L = {'params': {'D': 50}, 'rooms': {}, 'tot': 0, '_start_no': {floor: 1 if floor == 'terra' else 101}}
    for rn, g in rooms.items():
        L['rooms'][rn] = {'floor': floor, 'groups': g, 'keepouts': {}, 'seats': 2*len(g), 'zones': {}}
    fig, ax = plt.subplots(figsize=(11, 11))
    draw_plan(ax, floor, L, show_keep=False, fs_t=6)
    draw_mc(ax, floor)
    if not FINAL:
        for g, lab in rem: removed(ax, g, lab)
    for a, b, s in dims: S.dim(ax, a, b, s)
    P = T(rect_pts(1950, -80, 2720, 1340)); ax.set_xlim(P[:, 0].min(), P[:, 0].max()); ax.set_ylim(P[:, 1].max(), P[:, 1].min())
    ax.set_aspect('equal'); ax.axis('off')
    n = sum(len(g) for g in rooms.values())
    sub = ' | '.join(f'{k}: {2*len(g)} coperti' for k, g in rooms.items())
    tag = 'VERSIONE FINALE DA CONFERMARE' if FINAL else 'SCHIZZO VARIANTE MONTACARICHI'
    ax.set_title(f'{title}\n{sub}  -  TOTALE {2*n} coperti al piano  (totale PT + S1: 70)\n{tag} - quote in cm (rosso)', fontsize=10)
    for t in list(ax.texts):
        if t.get_text().startswith(('MC\n', 'sbarco', 'carico', 'mensola')) and t.get_position()[1] > 1000: t.remove()
    fig.subplots_adjust(0.01, 0.01, 0.99, 0.92)
    if FINAL: fname = fname.replace('schizzo_', 'FINALE_').replace('_variante_MC', '')
    fig.savefig(OUT / fname, dpi=130); plt.close(fig)

# ---- PT: T10 (primo tavolo della fila contro il setto) tolto
t10 = S.nord_3[0]
PT = {'Sala davanti alla cucina (13 tavoli)': S.nord_1 + S.nord_2 + S.nord_3[1:],
      "Sala dell'ingresso (5 tavoli)": S.ingr_3 + S.ingr_2}
sheet('terra', PT, [(t10, 'T10 tolto')], [
    ((2155, 425), (2257, 425), '102'),            # MC -> T11
    ((2155, 300), (2245, 300), '90'),             # corridoio verso fila 2
], 'PIANO TERRA - tavoli da 2, montacarichi vicino al varco' if FINAL else 'PIANO TERRA - VARIANTE: montacarichi vicino a T10', 'schizzo_PT_variante_MC.png')

# ---- S1: T109 spostato nell'angolo NW (dove era il montacarichi), T110 eliminato (richiesta cliente)
t109, t110 = S.s_ovest
t109n = dict(t109, x=2080, y=110, sides='NS')
extra = dict(x=2090, y=769, nx=1, ny=1, sides='NS', seats=2)   # tavolo aggiunto a ovest di T110, davanti alla scala
S1 = {'Sala interrata (9 tavoli)': S.s_nord + S.s_fac + [t109n],
      'Ex area bar (8 tavoli)': [extra] + S.b_nord + S.b_sud}
sheet('int', S1, [(t109, 'ex T109 spostato'), (t110, 'ex T110 eliminato')], [
    ((2245, 425), (2353, 425), '108'),
    ((2110, 899), (2110, 978), '79 davanti alla scala'),
    ((2058, 810), (2090, 810), '32'),
], ("PIANO INTERRATO - tavoli verso le pareti, passaggio al centro" if FINAL else "PIANO INTERRATO - VARIANTE: montacarichi vicino a T10 (sopra)"), 'schizzo_S1_variante_MC.png')
print('ok')
