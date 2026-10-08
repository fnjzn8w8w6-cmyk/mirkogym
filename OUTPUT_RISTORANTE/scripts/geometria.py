"""Modello geometrico dei due livelli, in cm, nel FRAME LOCALE di ciascun piano.

Frame locale = coordinate di pagina del PDF AutoCAD (pt, orientamento di visualizzazione)
ruotate di ROT_DEG (asse principale dei muri) e moltiplicate per MM_PER_PT/10.
x verso destra (verso Via Rovello), y verso il basso nel disegno (verso sud).

Tutte le coordinate sotto sono lette dai vettori (ID del path tra parentesi nei commenti);
'interpretazione' indica dove il significato dell'elemento e' stato dedotto e va verificato.
La scala (MM_PER_PT) deriva dalla registrazione sulla planimetria catastale 1:200
(scripts/s02_calibrate_vs_catastale.py) ed e' da confermare con UNA misura reale in sito.
"""
import json, pathlib
import numpy as np
from shapely.geometry import Polygon, box, LineString, Point
from shapely.ops import unary_union

ROOT = pathlib.Path(__file__).resolve().parents[1]
ROT_DEG = 22.6


def calib():
    c = json.loads((ROOT / 'dati/calibrazione.json').read_text())
    return c


def pt_to_local(P, mm_per_pt, rot_deg=ROT_DEG):
    a = np.radians(rot_deg)
    R = np.array([[np.cos(a), np.sin(a)], [-np.sin(a), np.cos(a)]])
    return (np.asarray(P, float) @ R.T) * mm_per_pt / 10.0


def scale_k():
    """Fattore di correzione della scala da misura in sito (dati/correzione_scala.json):
    {"misura_reale_cm": 612, "misura_disegno_cm": 610}  ->  K = 612/610.  Default 1.0."""
    f = ROOT / 'dati/correzione_scala.json'
    if f.exists():
        d = json.loads(f.read_text())
        return float(d['misura_reale_cm']) / float(d['misura_disegno_cm'])
    return 1.0


def to_local(floor, P):
    """pt di pagina (orientamento visualizzato) -> cm nel FRAME COMUNE (= frame locale del PT).
    Interrato: rotazione 22.6 deg in pt, poi similitudine stimata in s03_register_floors.py."""
    c = calib()
    K = scale_k()
    if floor == 'terra':
        return pt_to_local(P, c['terra']['mm_per_pt']) * K
    a = np.radians(ROT_DEG)
    Rr = np.array([[np.cos(a), np.sin(a)], [-np.sin(a), np.cos(a)]])
    q = np.asarray(P, float) @ Rr.T
    T = c['int_su_terra']
    return ((T['scale_cm_per_pt'] * (np.array(T['R']) @ q.T)).T + np.array(T['t'])) * K


def load_vector_lines(floor, mm_per_pt=None):
    """Tutte le polilinee originali (per il disegno di base) in cm nel frame comune."""
    d = json.loads((ROOT / f'dati/vettori_{floor}.json').read_text())
    out = []
    for p in d['paths']:
        for s in p['segs']:
            if s[0] == 'l':
                pts = [s[1], s[2]]
            elif s[0] == 'c':
                t = np.linspace(0, 1, 10)[:, None]; c = [np.array(x) for x in s[1:]]
                pts = ((1-t)**3*c[0]+3*(1-t)**2*t*c[1]+3*(1-t)*t**2*c[2]+t**3*c[3]).tolist()
            else:
                pts = s[1:] + [s[1]]
            out.append({'id': p['id'], 'pts': to_local(floor, pts).tolist()})
    return out


# ---------------------------------------------------------------------------------------------
# PIANO TERRA
# ---------------------------------------------------------------------------------------------
TERRA = {
    # Arredi mobili esistenti da rimuovere (ID path): tavoli, sedie, panche della sala
    'remove_ids': list(range(172, 271+1)) + list(range(272, 285+1)) + list(range(291, 294+1)),
    'rooms': {
        # Sala nord: filo interno muro cucina (35), muro nord (36), facciata interna obliqua (36),
        # setto spesso 67 cm (305/8) a sud.
        'sala_nord': [(2061, -37), (2671, -46), (2589, 561), (2057, 562)],
        # Zona sud (ingresso/cassa): dal setto (y=629) al parapetto scala (y~1183), facciata obliqua (8).
        'sala_sud': [(2187, 629), (2579, 626), (2485, 1290), (2400, 1295), (2400, 1183),
                     (2185, 1183), (2185, 770), (2057, 770), (2057, 629)],
    },
    'fixed': {
        # elementi fissi/da conservare (poligoni in cm)
        'mobile_servizio_S1 (37)': [(2057, 168), (2092, 169), (2089, 476), (2057, 476)],
        'cassa (78,109)': [(2016, 774), (2103, 774), (2103, 1023), (2016, 1023)],
        'banco/mensola cassa (104-108) - interpretazione': [(2140, 794), (2185, 794), (2185, 998), (2140, 998)],
        'scala rampa 1 (79-85)': [(2058, 975), (2163, 975), (2163, 1196), (2058, 1196)],
        'scala pianerottolo+rampa 2 (14,16-25)': [(2058, 1183), (2400, 1183), (2400, 1318), (2058, 1318)],
    },
    'doors': {
        # varchi/porte: segmento di apertura + eventuale raggio di apertura dell'anta
        'porta cucina->sala (68-71)': {'seg': [(2061, 10), (2061, 91)]},
        'varco sala nord/sud (286,287)': {'seg': [(2080, 595), (2187, 595)]},
        'porta disimpegno WC (72-77)': {'seg': [(2057, 649), (2057, 733)]},
        'ingresso (11,160)': {'seg': [(2577, 1017), (2560, 1117)], 'hinge': (2577, 1017), 'r': 100},
        'arrivo scala al PT (17)': {'seg': [(2400, 1196), (2400, 1295)]},
    },
    # Percorsi da lasciare liberi (keep-out per i tavoli): poligoni parametrici in funzione
    # della larghezza W del corridoio principale; definiti in layout.py
}

# Posizioni candidate montacarichi al PT (zona di servizio a nord della cucina, path 29/63)
# definite in montacarichi.py dopo la sovrapposizione con l'interrato.
