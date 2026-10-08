"""Disegno delle planimetrie (matplotlib -> PDF/SVG/PNG) e geometria di tavoli/sedie (shapely).
Il disegno avviene nel frame comune (cm); la base sono i vettori originali con gli arredi rimossi."""
import json, sys, pathlib
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MPoly, Rectangle, FancyArrow
from shapely.geometry import box
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from geometria import load_vector_lines
from progetto import REMOVE, BAR_IDS, MC, MC_ALT, FIXED
from layout import MOD, envelope

ROOT = pathlib.Path(__file__).resolve().parents[1]
CHAIR_W, CHAIR_D = 45, 45   # sedia (cm): ingombro in pianta
CHAIR_OFF = 5               # distanza sedia-bordo tavolo a sedia accostata (persona seduta: fascia D)

COL = dict(wall='#1a1a1a', removed='#c9c9c9', table='#2b6cb0', tablefill='#dbe8f6', chair='#4a5568',
           seatzone='#f6e05e', corridor='#38a169', keep='#e53e3e', mc='#d53f8c', bar='#ed8936')


def chairs_of(g):
    """rettangoli sedie (x0,y0,x1,y1) per un gruppo."""
    x, y, nx, ny, sides = g['x'], g['y'], g['nx'], g['ny'], g['sides']
    out = []
    for s in sides:
        n = nx if s in 'NS' else ny
        for i in range(n):
            if s in 'NS':
                cx = x + MOD*i + MOD/2
                y0 = y - CHAIR_OFF - CHAIR_D if s == 'N' else y + ny*MOD + CHAIR_OFF
                out.append((cx - CHAIR_W/2, y0, cx + CHAIR_W/2, y0 + CHAIR_D, s))
            else:
                cy = y + MOD*i + MOD/2
                x0 = x - CHAIR_OFF - CHAIR_D if s == 'W' else x + nx*MOD + CHAIR_OFF
                out.append((x0, cy - CHAIR_W/2, x0 + CHAIR_D, cy + CHAIR_W/2, s))
    return out


def draw_chair(ax, c, lw=0.6):
    x0, y0, x1, y1, s = c
    ax.add_patch(Rectangle((x0, y0), x1-x0, y1-y0, fc='white', ec=COL['chair'], lw=lw, zorder=4))
    # schienale sul lato lontano dal tavolo
    if s == 'N': ax.plot([x0+3, x1-3], [y0+5, y0+5], color=COL['chair'], lw=lw*2, zorder=5)
    if s == 'S': ax.plot([x0+3, x1-3], [y1-5, y1-5], color=COL['chair'], lw=lw*2, zorder=5)
    if s == 'W': ax.plot([x0+5, x0+5], [y0+3, y1-3], color=COL['chair'], lw=lw*2, zorder=5)
    if s == 'E': ax.plot([x1-5, x1-5], [y0+3, y1-3], color=COL['chair'], lw=lw*2, zorder=5)


def draw_base(ax, floor, remove=True, show_bar_removed=True):
    for L in load_vector_lines(floor):
        P = np.array(L['pts'])
        if remove and L['id'] in REMOVE[floor]:
            if floor == 'int' and L['id'] in BAR_IDS and show_bar_removed:
                ax.plot(P[:, 0], P[:, 1], color=COL['bar'], lw=0.5, ls=(0, (3, 2)), zorder=1)
            elif show_bar_removed:
                ax.plot(P[:, 0], P[:, 1], color=COL['removed'], lw=0.3, zorder=1)
            continue
        ax.plot(P[:, 0], P[:, 1], color=COL['wall'], lw=0.9, zorder=2, solid_capstyle='round')


def draw_groups(ax, groups, D, start_no=1, show_zone=True, fs=7):
    n = start_no
    for g in groups:
        w, h = g['nx']*MOD, g['ny']*MOD
        if show_zone:
            ex = envelope(g['x'], g['y'], g['nx'], g['ny'], g['sides'], D)
            ax.add_patch(Rectangle((ex[0], ex[1]), ex[2]-ex[0], ex[3]-ex[1], fc=COL['seatzone'],
                                   alpha=0.18, ec='none', zorder=2))
        for i in range(g['nx']):
            for j in range(g['ny']):
                ax.add_patch(Rectangle((g['x']+i*MOD, g['y']+j*MOD), MOD, MOD, fc=COL['tablefill'],
                                       ec=COL['table'], lw=0.4, zorder=3))
        ax.add_patch(Rectangle((g['x'], g['y']), w, h, fc='none', ec=COL['table'], lw=1.1, zorder=3))
        for c in chairs_of(g):
            draw_chair(ax, c)
        ax.text(g['x']+w/2, g['y']+h/2, f"T{n}\n{g['seats']}p", ha='center', va='center',
                fontsize=fs, color='#1a365d', fontweight='bold', zorder=6, linespacing=0.9)
        g['no'] = n
        n += 1
    return n


def draw_keepouts(ax, ko, fs=5):
    for name, (x0, y0, x1, y1) in ko.items():
        c = COL['mc'] if 'montacarichi' in name else (COL['keep'] if ('ingresso' in name or 'fisso' in name or 'scala' in name) else COL['corridor'])
        ax.add_patch(Rectangle((x0, y0), x1-x0, y1-y0, fc=c, alpha=0.07, ec=c, lw=0.5, ls='--', zorder=1))


def draw_mc(ax, floor, mc=MC, label=True, alt=False):
    x0, y0, x1, y1 = mc.vano()
    c = COL['mc']
    ax.add_patch(Rectangle((x0, y0), x1-x0, y1-y0, fc=c, alpha=0.25 if not alt else 0.08, ec=c, lw=1.4,
                           ls='-' if not alt else '--', zorder=7))
    ax.plot([x0, x1], [y0, y1], color=c, lw=0.8, zorder=7); ax.plot([x0, x1], [y1, y0], color=c, lw=0.8, zorder=7)
    if label:
        ax.text((x0+x1)/2, y1+12, ('M2 (alt.)' if alt else 'MC') , ha='center', va='top', fontsize=6, color=c,
                fontweight='bold', zorder=8)


if __name__ == '__main__':
    sol = sys.argv[1]
    L = json.loads((ROOT/f'dati/layout_{sol}.json').read_text())
    for floor, lim in [('terra', (1950, -80, 2720, 1340)), ('int', (1950, -80, 2720, 1340))]:
        fig, ax = plt.subplots(figsize=(10, 14))
        draw_base(ax, floor)
        n = 1
        for rn, r in L['rooms'].items():
            if r['floor'] != floor: continue
            draw_keepouts(ax, r['keepouts'])
            n = draw_groups(ax, r['groups'], L['params']['D'], n)
        draw_mc(ax, floor)
        ax.set_xlim(lim[0], lim[2]); ax.set_ylim(lim[3], lim[1]); ax.set_aspect('equal')
        ax.set_title(f"{L['name']} - {floor}: {sum(r['seats'] for r in L['rooms'].values() if r['floor']==floor)} coperti")
        fig.savefig(ROOT/f'01_analisi/prev_{sol}_{floor}.png', dpi=70, bbox_inches='tight')
