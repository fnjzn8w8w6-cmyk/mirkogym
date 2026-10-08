"""Definizione di progetto: ambienti utili, percorsi riservati, montacarichi, arredi da rimuovere.
Coordinate in cm nel FRAME COMUNE (frame locale PT; l'interrato vi e' registrato con RMS 2 cm).
Ogni elemento riporta l'origine (ID path vettoriale) o la natura di scelta progettuale.
"""
from dataclasses import dataclass
from geometria import scale_k

K = scale_k()            # correzione di scala da misura in sito (1.0 = scala nominale)
def k(v):                # applicata SOLO alle coordinate derivate dal rilievo, non alle misure di progetto
    return round(v * K, 1)
def kp(pts):
    return [(k(x), k(y)) for x, y in pts]

# ------------------------------------------------------------------ montacarichi (parametrico)
@dataclass
class Montacarichi:
    L: int = 90      # ingombro vano lungo x (cm) - PARAMETRICO, da modello scelto
    P: int = 90      # ingombro vano lungo y (cm) - PARAMETRICO
    x0: float = k(2075)   # angolo NW del vano (frame comune)
    y0: float = k(120)
    def vano(self):
        return (self.x0, self.y0, self.x0 + self.L, self.y0 + self.P)

import os
# Posizioni candidate lungo il muro cucina/sala (stessa verticale ai due livelli):
#  'M1' a nord, vicino alla porta cucina; 'M2' a sud, a fianco del varco personale S1 (y 395-485)
MC_POS = os.environ.get('MC_POS', 'M1')
_C = os.environ.get('MC_COMPACT', '1') == '1'   # DEFAULT: vano compatto 80x80, mensola ribaltabile sulla porta (MC_COMPACT=0 -> 90x90 + piano fisso)
_M = {'M1': Montacarichi(L=80 if _C else 90, P=80 if _C else 90, x0=k(2075), y0=k(120)),
      'M2': Montacarichi(x0=k(2075), y0=k(395)),
      # 'F' = posizione della versione finale concordata col cliente: vicino al varco tra le sale del PT,
      #       al S1 subito a sud del varco personale; carico/scarico dal lato est
      'F': Montacarichi(L=80, P=80, x0=k(2075), y0=k(385))}
MC = _M[MC_POS]
MC_ALT = _M['M1' if MC_POS == 'F' else ('M2' if MC_POS == 'M1' else 'M1')]

# ------------------------------------------------------------------ arredi esistenti da rimuovere
# PT: tavoli, sedie e panche delle sale (path 172-294) + mobile di servizio 37-39 (accorciato, v. sotto)
# S1: tavoli, sedie, panca della sala (93-144, 160-166) + intero arredo bar (49-50 bancone, 145-157)
REMOVE = {
    'terra': set(range(172, 295)) | {37, 38, 39},
    'int': set(range(93, 158)) | set(range(160, 167)) | {49, 50},
}
BAR_IDS = {49, 50, 145, 146, 147, 148, 149, 150, 151, 152, 153, 154, 155, 156, 157}

# ------------------------------------------------------------------ elementi fissi da evidenziare
FIXED = {
    'terra': {
        'scala (rampa 1+2, pianerottolo)': kp([(2058, 975), (2163, 975), (2163, 1183), (2400, 1183),
                                              (2400, 1318), (2058, 1318)]),
        'cassa': kp([(2016, 774), (2103, 774), (2103, 1023), (2016, 1023)]),
        'banco cassa': kp([(2140, 794), (2185, 794), (2185, 998), (2140, 998)]),
        'S1 postazione di servizio': kp([(2057, 260), (2092, 260), (2092, 375), (2057, 375)]) if MC_POS == 'F' else
                                     kp([(2057, 260), (2092, 260), (2092, 476), (2057, 476)]) if MC_POS == 'M1'
                                     else kp([(2057, 168), (2092, 168), (2092, 385), (2057, 385)]),
    },
    'int': {
        'scala': kp([(2058, 978), (2164, 978), (2164, 1184), (2389, 1184), (2492, 1241),
                     (2398, 1296), (2057, 1316)]),
        'elemento fisso 158 (da verificare)': kp([(2263, 518), (2388, 523), (2387, 565), (2263, 563)]),
    },
}

# ------------------------------------------------------------------ nuovi arredi di servizio
# Il mobile di servizio esistente lungo la parete cucina/sala (path 37, 33x308 cm) viene accorciato
# per liberare il vano MC: resta come postazione di servizio S1 da y=260 a y=476.
_ap = (MC.x0 + MC.L, MC.y0 + 40, MC.x0 + MC.L + 100, MC.y0 + 90)   # appoggio bevande 100x50 (progetto)
MENSOLA = None
if _C:   # mensola ribaltabile 80x40 sulla porta di sbarco: ingombro solo quando aperta, nessun ingombro fisso
    MENSOLA = ((MC.x0 + MC.L, MC.y0, MC.x0 + MC.L + 40, MC.y0 + MC.P) if MC_POS == 'F'
               else (MC.x0, MC.y0 + MC.P, MC.x0 + MC.L, MC.y0 + MC.P + 40))
    _ap = (MC.x0, MC.y0 + MC.P, MC.x0 + MC.L, MC.y0 + MC.P + 1)
NEW_SERVICE = {
    'terra': {'S1 postazione di servizio (mobile esistente accorciato)':
              (k(2057), k(260), k(2092), k(375)) if MC_POS == 'F' else
              (k(2057), k(260), k(2092), k(476)) if MC_POS == 'M1' else (k(2057), k(168), k(2092), k(385))},
    'int': ({'S2 mensola ribaltabile 80x40 (aperta)': MENSOLA} if _C else {'S2 piano appoggio bevande 100x50': _ap}),
}
if not _C:
  FIXED['int']['S2 appoggio bevande'] = [(_ap[0], _ap[1]), (_ap[2], _ap[1]), (_ap[2], _ap[3]), (_ap[0], _ap[3])]


def facade_x(floor, y):
    """filo interno facciata (obliquo) in funzione di y (coordinate gia' corrette di scala)."""
    y = y / K
    if floor == 'terra':
        if y <= 561:
            x = 2671 + (y + 46) * (2589 - 2671) / (561 + 46)
        else:
            x = 2579 + (y - 626) * (2485 - 2579) / (1290 - 626)
    elif y <= 640:
        x = 2674 + (y + 42) * (2576 - 2674) / (640 + 42)
    else:
        x = 2566 + (y - 725) * (2492 - 2566) / (1241 - 725)
    return x * K


def rooms(variant=None):
    """Zone utili convesse per ciascun ambiente (possono sovrapporsi: un gruppo deve stare in una).
    Vertici sul filo interno dei muri letti dai vettori (path 35/36/305/8 al PT; 4/5/7/23/24 al S1)."""
    fx = facade_x
    return {
        # orient: 'rows' = file est-ovest (corsie verso corridoio ovest); 'cols' = file nord-sud
        'PT - sala nord': {'floor': 'terra', 'orient': 'rows', 'zones': {
            'z': kp([(2061, -37), (2671, -46), (2589, 561), (2057, 562)])}},
        'PT - sala sud (ingresso)': {'floor': 'terra', 'orient': 'any', 'zones': {
            'z': kp([(2185, 629), (2579, 626), (fx('terra', k(1183)) / K, 1183), (2185, 1183)])}},
        'S1 - sala interrata': {'floor': 'int', 'orient': 'cols', 'zones': {
            'z': kp([(2075, -38), (2674, -42), (fx('int', k(558)) / K, 558), (2077, 558)])}},
        'S1 - ex area bar': {'floor': 'int', 'orient': 'any', 'zones': {
            'z1': kp([(2058, 724), (2566, 725), (fx('int', k(978)) / K, 978), (2058, 978)]),
            'z2': kp([(2164, 724), (2566, 725), (fx('int', k(1184)) / K, 1184), (2164, 1184)])}},
    }


def keepouts(room, W, variant='v1'):
    """Percorsi e zone riservate (rettangoli x0,y0,x1,y1). Ancoraggi dal rilievo (k), larghezze di progetto (W)."""
    x0, y0, x1, y1 = MC.vano()
    if room == 'PT - sala nord':
        return {
            # corridoio di servizio cucina -> varco sala sud, lungo parete ovest (postazione S1 inclusa)
            'corridoio servizio ovest': (k(2050), k(-50), k(2092) + W, k(570)),
            # vano montacarichi, zona di carico davanti alla porta cucina e bypass del corridoio
            'montacarichi + bypass': (k(2050), y0 - 10, x1 + W, y1 + 10),
        }
    if room == 'PT - sala sud (ingresso)':
        return {
            'corridoio cassa/varco': (k(2180), k(620), k(2185) + W, k(1190)),
            'corridoio ingresso-scala': (k(2180), k(1183) - W, k(2520), k(1190)),
            'ingresso (anta + 150x150)': (k(2410), k(990), k(2600), k(1190)),
        }
    if room == 'S1 - sala interrata':
        return {
            'zona ricevimento montacarichi': (k(2070), y0 - 10, (k(2073) + W) if _C else (x1 + 100), min(y1 + 90, k(570))),
            'corridoio sud (varco -> servizio)': (k(2070), k(558) - W, k(2700), k(570)),
            'corridoio ovest (varco personale)': (k(2070), k(250), k(2073) + W, k(570)),
            'elemento fisso 158': (k(2263), k(515), k(2390), k(570)),
        }
    if room == 'S1 - ex area bar':
        if variant == 'v1':   # corridoio lungo parete nord + discesa scala
            return {
                'corridoio nord (varco facciata)': (k(2050), k(720), k(2600), k(724) + W),
                'arrivo scala': (k(2050), k(720), k(2058) + max(W, 110), k(985)),
            }
        else:                 # v2: corridoio davanti alla scala + lungo facciata
            return {
                'arrivo scala + corridoio': (k(2050), k(978) - W, k(2600), k(985)),
                'corridoio facciata': (k(2530) - W, k(720), k(2600), k(985)),
            }
    raise KeyError(room)


VARIANTS = {'S1 - ex area bar': ['v1', 'v2']}
