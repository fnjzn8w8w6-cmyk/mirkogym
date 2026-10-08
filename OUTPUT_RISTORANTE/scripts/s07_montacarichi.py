"""Step 7 - Elaborato montacarichi bevande (studio preliminare).
Tavola A3: (1) sovrapposizione geometrica PT (blu) / S1 (rosso) nel frame comune con vano e candidate;
(2) dettaglio PT - punto di carico; (3) dettaglio S1 - punto di scarico e postazione di appoggio.
Il vano e' PARAMETRICO (MC.L x MC.P) e va dimensionato sul modello scelto."""
import json, sys, pathlib, datetime
import numpy as np
import matplotlib
matplotlib.use('Agg')
import matplotlib.pyplot as plt
from shapely.geometry import box, LineString
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from geometria import load_vector_lines, ROT_DEG
from progetto import REMOVE, MC, MC_ALT, NEW_SERVICE
from s06_export import T, rect_pts, poly, text, COL

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'OUTPUT' / 'MONTACARICHI'

# candidate esaminate e scartate (frame comune, cm) con motivazione
CANDIDATES = [
    ('X1', (1900, 309, 1990, 392), 'cucina, nicchia lato est tra banco e isola',
     'al S1 cade nel corridoio di servizio (117 cm) verso WC personale/spogliatoio: lo ostruirebbe'),
    ('X2', (1800, -15, 1890, 75), 'corridoio di servizio a nord della cucina (lavaggio -> sala)',
     'al S1 cade nel locale immondizia: incompatibile per igiene e funzione'),
    ('X3', (1771, 160, 1856, 316), 'cucina, zona armadio/frigo esistente',
     'al S1 cade tra locale immondizia e corridoio di servizio'),
    ('X4', (1900, 560, 1985, 648), 'cucina, angolo SE (banco sud)',
     'al S1 cade su armadietti spogliatoio e massa muraria di fondazione'),
]


def overlay(ax, lim):
    for f, c, lw in [('int', '#e53e3e', 0.6), ('terra', '#2b6cb0', 0.6)]:
        for ln in load_vector_lines(f):
            if ln['id'] in REMOVE[f]: continue
            P = T(ln['pts']); ax.plot(P[:, 0], P[:, 1], color=c, lw=lw, alpha=0.85)
    for name, r, where, why in CANDIDATES:
        poly(ax, rect_pts(*r), fc='none', ec='#718096', lw=0.8, ls='--', zorder=6)
        text(ax, ((r[0]+r[2])/2, (r[1]+r[3])/2), name, ha='center', va='center', fontsize=6, color='#4a5568', zorder=7)
    for m, lab, a in [(MC, 'MC', 0.35), (MC_ALT, 'M2', 0.12)]:
        x0, y0, x1, y1 = m.vano()
        poly(ax, rect_pts(x0, y0, x1, y1), fc=COL['mc'], alpha=a, ec=COL['mc'], lw=1.3, zorder=8)
        text(ax, ((x0+x1)/2, (y0+y1)/2), lab, ha='center', va='center', fontsize=7, color='#702459', fontweight='bold', zorder=9)
    set_lim(ax, lim)


def set_lim(ax, lim):
    P = T(rect_pts(*lim))
    ax.set_xlim(P[:, 0].min(), P[:, 0].max()); ax.set_ylim(P[:, 1].max(), P[:, 1].min())
    ax.set_aspect('equal'); ax.axis('off')


def detail(ax, floor, lim):
    for ln in load_vector_lines(floor):
        if ln['id'] in REMOVE[floor]: continue
        P = T(ln['pts']); ax.plot(P[:, 0], P[:, 1], color=COL['wall'], lw=0.9)
    x0, y0, x1, y1 = MC.vano()
    poly(ax, rect_pts(x0, y0, x1, y1), fc=COL['mc'], alpha=0.3, ec=COL['mc'], lw=1.5, zorder=5)
    for a, b in [((x0, y0), (x1, y1)), ((x1, y0), (x0, y1))]:
        P = T([a, b]); ax.plot(P[:, 0], P[:, 1], color=COL['mc'], lw=0.8, zorder=5)
    text(ax, ((x0+x1)/2, (y0+y1)/2), f'VANO MC\n{MC.L}x{MC.P}\n(param.)', ha='center', va='center', fontsize=6,
         color='#702459', fontweight='bold', zorder=6, bbox=dict(fc='white', ec='none', alpha=0.6, pad=0.4))
    if floor == 'terra':
        poly(ax, rect_pts(x0, y0 - 90, x1, y0), fc='#fed7e2', alpha=0.5, ec=COL['mc'], lw=0.6, ls=':', zorder=4)
        text(ax, ((x0+x1)/2, y0 - 45), 'zona di CARICO\n(da porta cucina)', ha='center', va='center', fontsize=5.5, zorder=6)
        P = T([(x0+8, y0-3), (x1-8, y0-3)]); ax.plot(P[:, 0], P[:, 1], color=COL['mc'], lw=3, zorder=6)
        r = NEW_SERVICE['terra']['S1 postazione di servizio (mobile esistente accorciato)']
        poly(ax, rect_pts(*r), fc='#e2e8f0', ec='#2d3748', lw=0.7, zorder=4)
        text(ax, ((r[0]+r[2])/2, (r[1]+r[3])/2), 'S1', ha='center', va='center', fontsize=5, zorder=6)
        text(ax, (2025, 50), 'porta\ncucina', ha='center', va='center', fontsize=5.5, color='#2b6cb0', zorder=6)
        dims = [((2061, y1 + 25), (x0, y1 + 25), f'{x0-2061:.0f}'), ((x0, 91), (x0, y0), f'{y0-91:.0f}'),
                ((x1 + 15, y0), (x1 + 15, y1), f'{MC.P}'), ((x0, y1 + 50), (x1, y1 + 50), f'{MC.L}')]
    else:
        for kname, r in NEW_SERVICE['int'].items():
            poly(ax, rect_pts(*r), fc='#fbd5e6', ec=COL['mc'], lw=0.8, ls='--' if 'ribalt' in kname else '-', zorder=4)
            text(ax, ((r[0]+r[2])/2, (r[1]+r[3])/2), 'S2 mensola ribaltabile 80x40' if 'ribalt' in kname else 'S2 appoggio 100x50',
                 ha='center', va='center', fontsize=4.6, zorder=6)
        poly(ax, rect_pts(x0, y1, x1, y1 + 90), fc='#fed7e2', alpha=0.5, ec=COL['mc'], lw=0.6, ls=':', zorder=3)
        text(ax, ((x0+x1)/2, y1 + 70), 'zona di SCARICO', ha='center', va='center', fontsize=5.5, zorder=6)
        P = T([(x0+8, y1+3), (x1-8, y1+3)]); ax.plot(P[:, 0], P[:, 1], color=COL['mc'], lw=3, zorder=6)
        text(ax, (1990, 330), 'varco verso\nWC pers./spogl.', ha='center', va='center', fontsize=5.5, color='#c53030', zorder=6)
        dims = [((2073, y1 + 25), (x0, y1 + 25), f'{x0-2073:.0f}'), ((x0 + 20, -38), (x0 + 20, y0), f'{y0+38:.0f}'),
                ((x1 + 15, y1), (x1 + 15, 262), f'{262-y1:.0f}'), ((x0, y1 + 120), (x1, y1 + 120), f'{MC.L}')]
    for a, b, s in dims:
        P = T([a, b]); ax.annotate('', P[1], P[0], arrowprops=dict(arrowstyle='<->', lw=0.6, color='#2d3748'))
        m = P.mean(0); ax.text(m[0], m[1], s, fontsize=5.5, ha='center', va='center', color='#2d3748',
                               bbox=dict(fc='white', ec='none', pad=0.3))
    set_lim(ax, lim)


def interferences():
    out = {}
    for f in ('terra', 'int'):
        hits = []
        for ln in load_vector_lines(f):
            if len(ln['pts']) > 1 and LineString(ln['pts']).intersects(box(*MC.vano())):
                hits.append((ln['id'], 'rimosso/modificato' if ln['id'] in REMOVE[f] else 'ESISTENTE'))
        out[f] = sorted(set(hits))
    return out


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    fig = plt.figure(figsize=(420/25.4, 297/25.4))
    fig.text(0.03, 0.965, 'DVCA ROVELLO - MONTACARICHI BEVANDE CUCINA (PT) -> PIANO INTERRATO (S1) - STUDIO PRELIMINARE',
             fontsize=11, fontweight='bold')
    fig.text(0.03, 0.945, 'Sovrapposizione geometrica dei due livelli nel frame comune (registrazione su muri perimetrali '
             'e scala, RMS 2 cm). Blu = piano terra, rosso = interrato.', fontsize=7)
    ax1 = fig.add_axes([0.02, 0.30, 0.42, 0.62]); overlay(ax1, (1550, -150, 2780, 1450))
    ax1.set_title('Sovrapposizione PT/S1 - vano MC, alternativa M2, candidate scartate X1-X4', fontsize=7)
    ax2 = fig.add_axes([0.45, 0.50, 0.26, 0.42]); detail(ax2, 'terra', (1900, -60, 2380, 520))
    ax2.set_title('PT - punto di CARICO (dettaglio, quote in cm)', fontsize=7)
    ax3 = fig.add_axes([0.72, 0.50, 0.26, 0.42]); detail(ax3, 'int', (1900, -60, 2380, 520))
    ax3.set_title('S1 - punto di SCARICO e appoggio (dettaglio, quote in cm)', fontsize=7)
    inter = interferences()
    a_v = MC.L*MC.P/1e4; a_s = MC.L*90/1e4
    lines = [
        ('POSIZIONE PROPOSTA (MC)', True),
        (f'Vano {MC.L}x{MC.P} cm (parametrico) a ridosso del muro cucina/sala, lato sala nord, a ~30 cm dalla porta cucina.', False),
        ('PT: carico dal lato nord del vano, nella zona di servizio davanti alla porta cucina (accesso diretto dalla cucina).', False),
        ('S1: sbarco dal lato sud, nell\'angolo NW della sala interrata accanto al varco di servizio verso WC/spogliatoio,', False),
        ('fuori dai percorsi clienti (zona di servizio riservata); mensola ribaltabile 80x40 cm sulla porta di sbarco (S2) per appoggiare le casse.', False),
        (f'Superficie interessata: vano {a_v:.2f} m2 per piano (foro nel solaio ~{a_v:.2f} m2); zona carico PT ~{MC.L*90/1e4:.2f} m2; '
         f'zona scarico S1 ~{a_s:.2f} m2 (mensola inclusa).', False),
        (f'Dimensione: vano MAX {MC.L}x{MC.P} cm (cabina indicativa 60x60 cm). Con vano 90x90 e piano di appoggio fisso si perdono circa 4 coperti (analisi di sensibilita\').', False),
        (f'Interferenze con linee del rilievo: PT {inter["terra"]}  (mobile di servizio esistente, da accorciare)  S1 {inter["int"] or "nessuna"}.', False),
        ('Allineamento verticale: filo muro PT x=2061 / S1 x=2073 (12 cm di scarto): il vano si scosta 14 cm dal muro PT e 2 cm da quello S1.', False),
        ('ALTERNATIVA M2: stesso allineamento, ~3 m piu\' a sud (accanto alla postazione S1 al PT; angolo SW sala S1). Piu\' lontana dalla cucina.', False),
        ('CANDIDATE SCARTATE: ' + '; '.join(f'{n} ({w}): {y}' for n, r, w, y in CANDIDATES), False),
        ('VERIFICHE TECNICHE NECESSARIE (a cura di professionisti abilitati)', True),
        ('1) Tipologia, orditura e portata del solaio tra PT e S1; posizione di travi/nervature; progetto del foro e dei rinforzi (strutturista).', False),
        ('2) Natura del muro cucina/sala e delle masse murarie di fondazione adiacenti al vano (sporgenze di fondazione, umidita\').', False),
        ('3) Impianti nel solaio e nelle pareti (scarichi, gas, elettrico, ventilazione); quota soffitto S1 (h 2,70 m da catastale).', False),
        ('4) Modello di montacarichi (EN 81-3 / Direttiva Macchine): dimensioni cabina e vano, portata, porte, extracorsa, fossa/testata.', False),
        ('5) Compartimentazione antincendio del vano tra i due livelli e prevenzione incendi del locale; parere ASL/igiene.', False),
        ('6) Titolo edilizio, eventuale autorizzazione condominiale (parti strutturali comuni) e verifica catastale.', False),
        ('Le posizioni sono CANDIDATE DA VERIFICARE IN SITO: le dimensioni del vano non sono definitive.', True),
    ]
    y = 0.46
    for s, b in lines:
        if s.startswith('CANDIDATE SCARTATE'):
            import textwrap
            for i, w in enumerate(textwrap.wrap(s, 190)):
                fig.text(0.46, y, w, fontsize=5.6); y -= 0.017
            continue
        fig.text(0.46, y, s, fontsize=7 if b else 6, fontweight='bold' if b else 'normal',
                 color='#702459' if b else 'black'); y -= 0.02 if b else 0.0175
    fig.text(0.03, 0.27, 'STATO: STUDIO PRELIMINARE - NON VALIDATO DIMENSIONALMENTE IN SITO', fontsize=8,
             fontweight='bold', color='#c53030')
    fig.text(0.03, 0.25, 'Il vano attraversa il solaio: nessuna demolizione di muri e\' prevista. Scala grafica nel dettaglio: '
             'quote in cm dal frame comune.', fontsize=6)
    fig.text(0.03, 0.03, f'Data {datetime.date.today():%d/%m/%Y} - generato da scripts/s07_montacarichi.py', fontsize=5.5, color='#555')
    for ext in ('pdf', 'svg', 'png'):
        fig.savefig(OUT / f'MONTACARICHI_studio_preliminare.{ext}', dpi=200 if ext == 'png' else None)
    (ROOT / 'dati/montacarichi.json').write_text(json.dumps(dict(
        vano=MC.vano(), L=MC.L, P=MC.P, alternativa=MC_ALT.vano(), interferenze=inter,
        superficie_vano_m2=a_v, candidate_scartate=[dict(nome=n, rett=r, dove=w, motivo=y) for n, r, w, y in CANDIDATES]),
        indent=1))
    print('montacarichi esportato', inter)


if __name__ == '__main__':
    main()
