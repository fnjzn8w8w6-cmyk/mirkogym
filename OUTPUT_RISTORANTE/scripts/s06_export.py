"""Step 6 - Esportazione elaborati: tavole A3 1:100 (PDF, SVG, PNG) e DXF modificabile.
Le tavole sono disegnate nell'ORIENTAMENTO DELLE PLANIMETRIE ORIGINALI (frame comune ruotato di
-22.6 deg), cosi' da poterle confrontare direttamente con i PDF di partenza.
Il DXF (unita' cm, $INSUNITS=5) usa lo stesso orientamento; tavoli e sedie sono BLOCCHI inseriti
con rotazione, su layer separati, quindi spostabili/ruotabili in CAD."""
import json, sys, pathlib, datetime
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from matplotlib.patches import Polygon as MPoly
from matplotlib.transforms import Affine2D
import ezdxf
from ezdxf.enums import TextEntityAlignment
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from geometria import load_vector_lines, ROT_DEG
from progetto import REMOVE, BAR_IDS, MC, MC_ALT, FIXED, NEW_SERVICE
from layout import MOD, envelope
from disegno import chairs_of, COL

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'OUTPUT'
A = np.radians(ROT_DEG)
RT = np.array([[np.cos(A), -np.sin(A)], [np.sin(A), np.cos(A)]])   # frame comune -> orientamento originale
ROOMLABEL = {'terra': [('SALA NORD', (2130, 520)), ('INGRESSO / SALA SUD', (2300, 1150)), ('CUCINA', (1870, 540)),
                       ('CASSA', (2060, 900)), ('WC', (1900, 1000)), ('AREA LAVAGGIO', (1450, 210))],
             'int': [('SALA INTERRATA', (2330, 540)), ('EX AREA BAR', (2140, 890)), ('IMMONDIZIA', (1770, 120)),
                     ('LOC. TECNICO', (1300, 120)), ('WC PERS. / SPOGLIATOIO', (1790, 560))]}
FLOORNAME = {'terra': 'PIANO TERRA', 'int': 'PIANO INTERRATO (S1)'}


def T(P):
    return (np.asarray(P, float) @ RT.T)


def rect_pts(x0, y0, x1, y1):
    return [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]


def poly(ax, pts, **kw):
    ax.add_patch(MPoly(T(pts), closed=True, **kw))


def text(ax, p, s, **kw):
    q = T([p])[0]
    ax.text(q[0], q[1], s, **kw)


def draw_plan(ax, floor, L, show_keep=True, fs_t=5.2):
    D = L['params']['D']
    # base: linee originali conservate; arredi rimossi non disegnati (bar: tratteggio)
    for ln in load_vector_lines(floor):
        P = T(ln['pts'])
        if ln['id'] in REMOVE[floor]:
            if floor == 'int' and ln['id'] in BAR_IDS:
                ax.plot(P[:, 0], P[:, 1], color=COL['bar'], lw=0.45, ls=(0, (2.5, 1.5)), zorder=1)
            continue
        ax.plot(P[:, 0], P[:, 1], color=COL['wall'], lw=0.7, zorder=2, solid_capstyle='round')
    n = L.get('_start_no', {}).get(floor, 1)
    for rn, r in L['rooms'].items():
        if r['floor'] != floor: continue
        if show_keep:
            from shapely.geometry import Polygon as SP, box as sbox
            from shapely.ops import unary_union as su
            room = su([SP(z) for z in r['zones'].values()]).buffer(12, join_style=2)
            for k, (x0, y0, x1, y1) in r['keepouts'].items():
                if k.startswith('vietato'): continue
                c = COL['mc'] if 'montacarichi' in k else COL['corridor']
                if 'ingresso' in k or 'fisso' in k: c = COL['keep']
                cl = sbox(x0, y0, x1, y1).intersection(room)
                for gpart in (cl.geoms if hasattr(cl, 'geoms') else [cl]):
                    if gpart.is_empty or gpart.geom_type != 'Polygon': continue
                    poly(ax, list(gpart.exterior.coords)[:-1], fc=c, alpha=0.07, ec=c, lw=0.35, ls='--', zorder=1)
        for g in r['groups']:
            ex = envelope(g['x'], g['y'], g['nx'], g['ny'], g['sides'], D)
            poly(ax, rect_pts(*ex), fc=COL['seatzone'], alpha=0.16, ec='none', zorder=2)
            for i in range(g['nx']):
                for j in range(g['ny']):
                    poly(ax, rect_pts(g['x']+i*MOD, g['y']+j*MOD, g['x']+(i+1)*MOD, g['y']+(j+1)*MOD),
                         fc=COL['tablefill'], ec=COL['table'], lw=0.3, zorder=3)
            poly(ax, rect_pts(g['x'], g['y'], g['x']+g['nx']*MOD, g['y']+g['ny']*MOD), fc='none',
                 ec=COL['table'], lw=0.9, zorder=3)
            for c in chairs_of(g):
                x0, y0, x1, y1, s = c
                poly(ax, rect_pts(x0, y0, x1, y1), fc='white', ec=COL['chair'], lw=0.45, zorder=4)
                bk = {'N': [(x0+4, y0+5), (x1-4, y0+5)], 'S': [(x0+4, y1-5), (x1-4, y1-5)],
                      'W': [(x0+5, y0+4), (x0+5, y1-4)], 'E': [(x1-5, y0+4), (x1-5, y1-4)]}[s]
                P = T(bk); ax.plot(P[:, 0], P[:, 1], color=COL['chair'], lw=1.0, zorder=5)
            text(ax, (g['x']+g['nx']*MOD/2, g['y']+g['ny']*MOD/2), f"T{n}\n{g['seats']}p", ha='center',
                 va='center', fontsize=fs_t, color='#1a365d', fontweight='bold', zorder=6, linespacing=0.85)
            g['no'] = n; n += 1
    # montacarichi
    x0, y0, x1, y1 = MC.vano()
    poly(ax, rect_pts(x0, y0, x1, y1), fc=COL['mc'], alpha=0.22, ec=COL['mc'], lw=1.2, zorder=7)
    P = T([(x0, y0), (x1, y1)]); ax.plot(P[:, 0], P[:, 1], color=COL['mc'], lw=0.7, zorder=7)
    P = T([(x1, y0), (x0, y1)]); ax.plot(P[:, 0], P[:, 1], color=COL['mc'], lw=0.7, zorder=7)
    text(ax, ((x0+x1)/2, (y0+y1)/2), 'MC', ha='center', va='center', fontsize=5.5,
         color='#702459', fontweight='bold', zorder=8, bbox=dict(fc='white', ec='none', alpha=0.7, pad=0.3))
    # porta di sbarco/carico (lato)
    import progetto as _pg
    if _pg.MC_POS == 'F':   # versione finale: porte di carico (PT) e scarico (S1) sul lato est
        P = T([(x1+4, y0+10), (x1+4, y1-10)])
        if floor == 'int':
            for kname, r in NEW_SERVICE['int'].items():
                poly(ax, rect_pts(*r), fc='#fbd5e6', ec=COL['mc'], lw=0.6, ls='--', zorder=7)
        poly(ax, rect_pts(x1, y0, x1+90, y1), fc='none', ec=COL['mc'], lw=0.5, ls=':', zorder=7)
        text(ax, (x1+55, (y0+y1)/2), 'carico' if floor == 'terra' else 'scarico\n+mensola', ha='center', va='center',
             fontsize=4, color=COL['mc'], zorder=8)
    elif floor == 'terra':
        P = T([(x0+10, y0-4), (x1-10, y0-4)])
        poly(ax, rect_pts(x0, y0-90, x1, y0), fc='none', ec=COL['mc'], lw=0.5, ls=':', zorder=7)
        text(ax, ((x0+x1)/2, y0-45), 'carico', ha='center', va='center', fontsize=4, color=COL['mc'], zorder=8)
    else:
        P = T([(x0+10, y1+4), (x1-10, y1+4)])
        for kname, r in NEW_SERVICE['int'].items():
            ribalt = 'ribaltabile' in kname
            poly(ax, rect_pts(*r), fc='#fbd5e6', ec=COL['mc'], lw=0.6, ls='--' if ribalt else '-', zorder=7)
            text(ax, ((r[0]+r[2])/2, (r[1]+r[3])/2), 'mensola' if ribalt else 'appoggio\nbevande', ha='center',
                 va='center', fontsize=3.6, color=COL['mc'], zorder=8)
        poly(ax, rect_pts(x0, y1, x1, y1+90), fc='none', ec=COL['mc'], lw=0.5, ls=':', zorder=7)
        text(ax, ((x0+x1)/2, y1+65), 'sbarco', ha='center', va='center', fontsize=4, color=COL['mc'], zorder=8)
    ax.plot(P[:, 0], P[:, 1], color=COL['mc'], lw=2.2, zorder=8)
    if floor == 'terra':
        for k, r in NEW_SERVICE['terra'].items():
            poly(ax, rect_pts(*r), fc='#e2e8f0', ec='#2d3748', lw=0.6, zorder=3)
            text(ax, ((r[0]+r[2])/2, (r[1]+r[3])/2), 'S1', ha='center', va='center', fontsize=4, zorder=6)
    for lab, p in ROOMLABEL[floor]:
        text(ax, p, lab, ha='center', va='center', fontsize=5.5, color='#555', style='italic', zorder=6,
             bbox=dict(fc='white', ec='none', alpha=0.7, pad=0.5))
    return n


def plan_extent(floor):
    P = np.vstack([T(l['pts']) for l in load_vector_lines(floor)])
    return P.min(0), P.max(0)


def sheet(L, floor, path_base, verifica):
    W_in, H_in = 420/25.4, 297/25.4   # A3 orizzontale
    fig = plt.figure(figsize=(W_in, H_in))
    # area disegno a 1:100 -> 1 cm reale = 0.1 mm carta
    lo, hi = plan_extent(floor)
    pad = 60
    lo, hi = lo - pad, hi + pad
    wmm, hmm = (hi[0]-lo[0]) * 0.1, (hi[1]-lo[1]) * 0.1
    left_mm, top_mm = 12, 18
    ax = fig.add_axes([left_mm/420, 1 - (top_mm + hmm)/297, wmm/420, hmm/297])
    ax.set_xlim(lo[0], hi[0]); ax.set_ylim(hi[1], lo[1]); ax.set_aspect('equal'); ax.axis('off')
    draw_plan(ax, floor, L)
    # barra di scala grafica (5 m)
    sx, sy = lo[0] + 40, hi[1] - 40
    for i in range(5):
        ax.add_patch(plt.Rectangle((sx + i*100, sy - 8), 100, 8, fc='black' if i % 2 == 0 else 'white', ec='black', lw=0.4))
        ax.text(sx + i*100, sy - 14, f'{i}', fontsize=4.5, ha='center')
    ax.text(sx + 500, sy - 14, '5 m', fontsize=4.5, ha='center')
    # freccia orientamento rispetto a via Rovello
    # testata
    fig.text(12/420, 1 - 9/297, f"DVCA ROVELLO - Via Rovello 18, Milano  |  {FLOORNAME[floor]}  |  {L['name'].upper()}",
             fontsize=11, fontweight='bold', va='center')
    fig.text(12/420, 1 - 14/297, 'Riprogettazione disposizione tavoli - studio preliminare. Moduli tavolo 80x80 cm.',
             fontsize=7, va='center', color='#333')
    # pannello laterale
    x0 = (12 + wmm + 8) / 420
    y = 1 - 24/297
    def line(s, fs=6.5, bold=False, col='black', dy=4.2):
        nonlocal y
        fig.text(x0, y, s, fontsize=fs, fontweight='bold' if bold else 'normal', color=col, va='top')
        y -= dy/297
    tot_f = sum(r['seats'] for r in L['rooms'].values() if r['floor'] == floor)
    line('CONTEGGIO COPERTI', 8, True)
    for rn, r in L['rooms'].items():
        if r['floor'] != floor: continue
        line(f"{rn}: {r['seats']} coperti ({len(r['groups'])} tavoli, {sum(g['nx']*g['ny'] for g in r['groups'])} moduli)")
    line(f"TOTALE {FLOORNAME[floor]}: {tot_f} coperti", 7.5, True)
    line(f"Totale complessivo soluzione (PT + S1): {L['tot']} coperti", 7, True, '#1a365d')
    y -= 2/297
    line('ELENCO TAVOLI', 8, True)
    rows = []
    for rn, r in L['rooms'].items():
        if r['floor'] != floor: continue
        for g in r['groups']:
            rows.append(f"T{g['no']}: {g['nx']*MOD}x{g['ny']*MOD} cm ({g['nx']*g['ny']} mod.) - {g['seats']} posti")
    for i in range(0, len(rows), 2):
        line('   '.join(rows[i:i+2]), 5.6, dy=3.4)
    y -= 2/297
    line('PARAMETRI DI PROGETTO', 8, True)
    p = L['params']
    line(f"Fascia seduta oltre bordo tavolo (sedia + persona): {p['D']} cm", 6)
    line(f"Passaggio minimo tra persone sedute di tavoli diversi: {p['g']} cm", 6)
    line(f"Corridoi principali (percorsi riservati): {p['W_main']} cm", 6)
    line('Sedia in pianta 45x45 cm; 1 sedia ogni 80 cm di lato tavolo', 6)
    y -= 2/297
    line('LEGENDA', 8, True)
    leg = [(COL['wall'], 'muri ed elementi fissi originali (vettori PDF)'),
           (COL['table'], 'tavolo modulare 80x80 (bordo gruppo spesso)'),
           (COL['chair'], 'sedia con schienale'),
           ('#d4b106', 'fascia seduta (persona seduta)'),
           (COL['corridor'], 'percorso principale riservato (tratteggio)'),
           (COL['keep'], 'zona ingresso / elemento fisso riservato'),
           (COL['mc'], 'MC = vano montacarichi bevande (ingombro parametrico)')]
    if floor == 'int': leg.append((COL['bar'], 'arredi bar rimossi (tratteggio)'))
    for c, s in leg:
        fig.patches.append(plt.Rectangle((x0, y - 2.6/297), 5/420, 2.6/297, transform=fig.transFigure, fc=c, ec=c, alpha=0.6))
        fig.text(x0 + 7/420, y, s, fontsize=6, va='top'); y -= 4/297
    y -= 2/297
    line('VERIFICHE (script s05_verify.py)', 8, True)
    v = verifica
    col = '#2f855a' if not v['blocking'] else '#c53030'
    line(f"Esito geometrico: {v['esito']}", 6.5, True, col)
    line('Collisioni con muri, percorsi, scala, MC; distanze; raggiungibilita' + "'", 5.8)
    # cartiglio
    cy = 40/297
    fig.patches.append(plt.Rectangle((x0, 8/297), (420 - 12 - (12 + wmm + 8))/420, cy - 6/297,
                                     transform=fig.transFigure, fc='#fff5f5', ec='#c53030', lw=0.8))
    fig.text(x0 + 2/420, cy - 1/297, 'STATO: STUDIO PRELIMINARE - NON VALIDATO DIMENSIONALMENTE IN SITO',
             fontsize=6.5, fontweight='bold', color='#c53030', va='top')
    fig.text(x0 + 2/420, cy - 6/297,
             'Scala ricavata dalla catastale 1:200 (barra 10 m) e da elementi comuni ai due piani\n'
             '(RMS 2 cm). Tolleranza stimata +/-2%. Confermare con almeno una misura in sito\n'
             '(es. larghezza interna sala nord PT lungo il muro nord: valore di disegno ~610 cm).\n'
             f'Montacarichi: vano parametrico max {MC.L}x{MC.P} cm, fattibilita\' strutturale da verificare.\n'
             f"Scala tavola 1:100 su A3 (stampa al 100%).  Data: {datetime.date.today():%d/%m/%Y}",
             fontsize=5.4, va='top', color='#333', linespacing=1.3)
    for ext in ('pdf', 'svg', 'png'):
        fig.savefig(f'{path_base}.{ext}', dpi=200 if ext == 'png' else None)
    plt.close(fig)


# ------------------------------------------------------------------------------------------ DXF
def dxf(L, floor, path):
    doc = ezdxf.new('R2013', setup=True)
    doc.header['$INSUNITS'] = 5   # cm
    layers = {'MURI_ESISTENTI': 7, 'ARREDI_BAR_RIMOSSI': 30, 'TAVOLI_80x80': 5, 'SEDIE': 8, 'FASCIA_SEDUTA': 2,
              'PERCORSI': 3, 'MONTACARICHI': 6, 'TESTI': 7, 'NUMERAZIONE': 5}
    for n, c in layers.items(): doc.layers.add(n, color=c)
    doc.layers.get('ARREDI_BAR_RIMOSSI').dxf.linetype = 'DASHED'
    msp = doc.modelspace()
    flip = lambda P: [(float(p[0]), float(-p[1])) for p in T(P)]
    # blocchi
    tb = doc.blocks.new('TAVOLO_80x80')
    tb.add_lwpolyline([(0, 0), (80, 0), (80, 80), (0, 80)], close=True, dxfattribs={'layer': '0'})
    ch = doc.blocks.new('SEDIA_45x45')
    ch.add_lwpolyline([(-22.5, 0), (22.5, 0), (22.5, 45), (-22.5, 45)], close=True, dxfattribs={'layer': '0'})
    ch.add_line((-18.5, 40), (18.5, 40), dxfattribs={'layer': '0'})   # schienale (lato lontano dal tavolo)
    for ln in load_vector_lines(floor):
        if ln['id'] in REMOVE[floor]:
            if floor == 'int' and ln['id'] in BAR_IDS:
                msp.add_lwpolyline(flip(ln['pts']), dxfattribs={'layer': 'ARREDI_BAR_RIMOSSI'})
            continue
        msp.add_lwpolyline(flip(ln['pts']), dxfattribs={'layer': 'MURI_ESISTENTI'})
    rot = -ROT_DEG   # rotazione blocchi (y invertita)
    D = L['params']['D']
    for rn, r in L['rooms'].items():
        if r['floor'] != floor: continue
        for k, v in r['keepouts'].items():
            msp.add_lwpolyline(flip(rect_pts(*v)), close=True, dxfattribs={'layer': 'PERCORSI'})
        for g in r['groups']:
            for i in range(g['nx']):
                for j in range(g['ny']):
                    # punto di inserimento = angolo (x, y+80) nel frame comune (y verso il basso)
                    p = flip([(g['x'] + i*MOD, g['y'] + (j+1)*MOD)])[0]
                    msp.add_blockref('TAVOLO_80x80', p, dxfattribs={'layer': 'TAVOLI_80x80', 'rotation': rot})
            msp.add_lwpolyline(flip(rect_pts(*envelope(g['x'], g['y'], g['nx'], g['ny'], g['sides'], D))),
                               close=True, dxfattribs={'layer': 'FASCIA_SEDUTA'})
            for c in chairs_of(g):
                x0, y0, x1, y1, s = c
                # base del blocco sedia = lato verso il tavolo; asse +y blocco = verso lo schienale
                base = {'N': ((x0+x1)/2, y1), 'S': ((x0+x1)/2, y0), 'W': (x1, (y0+y1)/2), 'E': (x0, (y0+y1)/2)}[s]
                ang = {'N': 0, 'S': 180, 'W': 90, 'E': -90}[s]
                msp.add_blockref('SEDIA_45x45', flip([base])[0], dxfattribs={'layer': 'SEDIE', 'rotation': rot + ang})
            c = flip([(g['x'] + g['nx']*MOD/2, g['y'] + g['ny']*MOD/2)])[0]
            msp.add_text(f"T{g['no']} {g['seats']}p", height=14, dxfattribs={'layer': 'NUMERAZIONE', 'rotation': rot}
                         ).set_placement(c, align=TextEntityAlignment.MIDDLE_CENTER)
    for f2, items in NEW_SERVICE.items():
        if f2 != floor: continue
        for k, r in items.items():
            if r is None: continue
            msp.add_lwpolyline(flip(rect_pts(*r)), close=True, dxfattribs={'layer': 'MONTACARICHI' if 'bevande' in k else 'TESTI'})
    x0, y0, x1, y1 = MC.vano()
    msp.add_lwpolyline(flip(rect_pts(x0, y0, x1, y1)), close=True, dxfattribs={'layer': 'MONTACARICHI'})
    msp.add_line(*flip([(x0, y0), (x1, y1)]), dxfattribs={'layer': 'MONTACARICHI'})
    msp.add_line(*flip([(x1, y0), (x0, y1)]), dxfattribs={'layer': 'MONTACARICHI'})
    msp.add_text('MC montacarichi bevande (ingombro parametrico)', height=10,
                 dxfattribs={'layer': 'MONTACARICHI', 'rotation': rot}).set_placement(flip([(x0, y1 + 25)])[0])
    for lab, p in ROOMLABEL[floor]:
        msp.add_text(lab, height=18, dxfattribs={'layer': 'TESTI', 'rotation': 0}).set_placement(
            flip([p])[0], align=TextEntityAlignment.MIDDLE_CENTER)
    doc.saveas(path)


def export(sol):
    L = json.loads((ROOT / f'dati/layout_{sol}.json').read_text())
    ver = json.loads((ROOT / f'dati/verifica_{sol}.json').read_text())
    d = OUT / f'SOLUZIONE_{sol}'
    d.mkdir(parents=True, exist_ok=True)
    # numerazione: PT da T1, S1 da T101
    L['_start_no'] = {'terra': 1, 'int': 101}
    for floor, tag in [('terra', 'PT'), ('int', 'S1')]:
        base = d / f'{sol}_{tag}_planimetria'
        sheet(L, floor, str(base), ver)
        dxf(L, floor, str(base) + '.dxf')
    print('esportata soluzione', sol, '->', d)


if __name__ == '__main__':
    for s in (sys.argv[1] if len(sys.argv) > 1 else 'ABC'):
        export(s)
