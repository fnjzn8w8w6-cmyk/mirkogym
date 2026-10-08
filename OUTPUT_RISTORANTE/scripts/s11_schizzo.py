"""Schizzo rapido (PNG) della disposizione richiesta dal cliente: solo tavoli 80x80 da 2 posti,
leggermente distanziati. Serve per la conferma prima di aggiornare modelli ed elaborati."""
import sys, pathlib, json
import numpy as np
import matplotlib; matplotlib.use('Agg')
import matplotlib.pyplot as plt
from shapely.geometry import box
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from s06_export import T, poly, rect_pts, text, draw_plan, plan_extent
from disegno import chairs_of, COL
from progetto import MC, facade_x

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / '01_analisi/schizzi'

def row(x0, y, n, gap, sides='NS'):
    return [dict(x=x0 + i*(80+gap), y=y, nx=1, ny=1, sides=sides, seats=2) for i in range(n)]
def col(x, y0, n, gap, sides='EW'):
    return [dict(x=x, y=y0 + i*(80+gap), nx=1, ny=1, sides=sides, seats=2) for i in range(n)]

# ---------------- PIANO TERRA
nord_1 = row(2200, 8, 5, 10)            # fila 1: contro muro nord (schienale al muro)
nord_2 = row(2245, 222, 4, 10)          # fila 2: centrale da 4 (lascia 90 cm davanti al montacarichi)
nord_3 = row(2172, 437, 5, 5)           # fila 3: contro il setto (schienale al setto)
ingr_3 = row(2295, 674, 3, 10)          # 3 tavoli con schiena verso il setto
ingr_2 = col(2396, 827, 2, 8)[::-1]     # 2 tavoli lungo la facciata a destra dell'ingresso (verso nord)
PT = {'Sala davanti alla cucina (14 tavoli)': nord_1 + nord_2 + nord_3,
      "Sala dell'ingresso (5 tavoli)": ingr_3 + ingr_2}
# ---------------- INTERRATO
s_nord = row(2170, 7, 5, 10)            # fila contro muro nord
s_fac = col(2470, 200, 3, 10)           # colonna lungo facciata (schienale verso facciata)
s_ovest = col(2125, 390, 2, 8)          # colonna lungo parete ovest, a sud del varco personale
b_nord = row(2180, 769, 3, 10)          # ex bar: fila contro il setto (schienale al setto)
b_sud = row(2165, 1050, 4, 5)           # ex bar: fila verso la scala
S1 = {'Sala interrata (10 tavoli)': s_nord + s_fac + s_ovest, 'Ex area bar (7 tavoli)': b_nord + b_sud}

def dim(ax, a, b, label, col='#c53030'):
    P = T([a, b]); ax.annotate('', P[1], P[0], arrowprops=dict(arrowstyle='<->', lw=0.7, color=col))
    m = P.mean(0); ax.text(m[0], m[1], label, fontsize=6.5, color=col, ha='center', va='center', fontweight='bold',
                           bbox=dict(fc='white', ec='none', pad=0.2, alpha=0.85))

def sheet(floor, rooms, dims, title, fname, lim):
    L = {'params': {'D': 50}, 'rooms': {}, 'tot': 0, '_start_no': {floor: 1 if floor == 'terra' else 101}}
    for rn, g in rooms.items():
        L['rooms'][rn] = {'floor': floor, 'groups': g, 'keepouts': {}, 'seats': 2*len(g), 'zones': {}}
    fig, ax = plt.subplots(figsize=(11, 11))
    draw_plan(ax, floor, L, show_keep=False, fs_t=6)
    for a, b, s in dims: dim(ax, a, b, s)
    P = T(rect_pts(*lim)); ax.set_xlim(P[:, 0].min(), P[:, 0].max()); ax.set_ylim(P[:, 1].max(), P[:, 1].min())
    ax.set_aspect('equal'); ax.axis('off')
    n = sum(len(g) for g in rooms.values())
    sub = ' | '.join(f'{k}: {2*len(g)} coperti' for k, g in rooms.items())
    ax.set_title(f'{title}\n{sub}  -  TOTALE {2*n} coperti ({n} tavoli 80x80 da 2)\nSCHIZZO DI VERIFICA - quote in cm (rosso)',
                 fontsize=10)
    fig.savefig(OUT / fname, dpi=130, bbox_inches='tight'); plt.close(fig)

x0, y0, x1, y1 = MC.vano()
sheet('terra', PT, [
    ((2155, 160), (2245, 160), '90'),                       # MC -> fila 2
    ((2300, 138), (2300, 172), '34'), ((2300, 352), (2300, 387), '35'),   # passaggi tra schienali
    ((2092, 456), (2172, 456), '80'),                       # mobile S1 -> fila 3
    ((2185, 700), (2295, 700), '110'),                      # corridoio cassa
    ((2450, 804), (2450, 827), '23'),                       # fila setto -> tavolo facciata
], 'PIANO TERRA - tutti tavoli da 2 leggermente distanziati (5-10 cm)', 'schizzo_PT.png', (1950, -80, 2720, 1340))
sheet('int', S1, [
    ((2300, 137), (2300, 200), '63'),
    ((2255, 450), (2420, 450), '165 passaggio centrale'),
    ((2300, 899), (2300, 1000), '101'),
    ((2440, 760), (2541, 760), '~100'),
], "PIANO INTERRATO - tavoli spinti verso le pareti, passaggio al centro", 'schizzo_S1.png', (1950, -80, 2720, 1340))
print('ok')
