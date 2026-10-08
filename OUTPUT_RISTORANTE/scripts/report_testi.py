"""Testi di progetto del report (separati dal codice di impaginazione). I numeri vengono letti dai
risultati in dati/ al momento della generazione."""
import json, pathlib
ROOT = pathlib.Path(__file__).resolve().parents[1]
V = {s: json.loads((ROOT / f'dati/verifica_{s}.json').read_text()) for s in 'ABC'}
L = {s: json.loads((ROOT / f'dati/layout_{s}.json').read_text()) for s in 'ABC'}
tot = {s: V[s]['coperti_tot'] for s in 'ABC'}

RECOMMENDED = 'B'

RECOMMENDATION = {'B': (
    f"Si raccomanda la <b>soluzione B - Equilibrata</b> ({V['B']['coperti_PT']} coperti al PT + {V['B']['coperti_S1']} al S1 = "
    f"<b>{tot['B']}</b>). Rispetto alla A (+{tot['B'] - tot['A']} coperti) mantiene corridoi principali di 110 cm, passaggi di "
    "45 cm tra persone sedute di tavoli diversi e una fascia di 55 cm per sedia e persona seduta: valori adeguati a un servizio "
    "al tavolo con camerieri che portano piatti e bevande. Rispetto alla C "
    f"({tot['C'] - tot['B']:+d} coperti) evita passaggi da 35-40 cm tra persone sedute e fasce seduta da 50 cm, che rallentano "
    "il servizio e peggiorano il comfort: la C e' da considerare una configurazione di punta (eventi) piu' che l'assetto ordinario, "
    "ed e' comunque sotto i 70 coperti. "
    "Tutti i gruppi sono composti da moduli 80x80 separabili in tavoli da 2/4, quindi la sala puo' essere riconfigurata "
    "giornalmente senza perdere coperti. Il corridoio di servizio lungo il muro cucina collega direttamente porta cucina, "
    "montacarichi, postazione S1, varco verso la zona ingresso/cassa e scala; i percorsi dei clienti dall'ingresso alle sale "
    "e alla scala restano liberi.")}

CRITICAL = [
    f"<b>Obiettivo 70 coperti</b>: con i criteri adottati la capienza verificata e' A={tot['A']}, B={tot['B']}, C={tot['C']}. "
    + ("L'obiettivo e' raggiunto solo con criteri di massima capienza." if tot['C'] >= 70 > tot['B'] else
       ("L'obiettivo e' raggiunto." if tot['B'] >= 70 else "L'obiettivo NON e' raggiunto in modo verificabile.")),
    "<b>Vincoli che limitano la capienza</b>: (1) il setto murario di 67 cm che divide la sala del PT lascia un solo varco di "
    "107 cm presso il muro cucina, per cui il corridoio di servizio e quello clienti si sovrappongono lungo il lato ovest; "
    "(2) la zona sud del PT e' in gran parte occupata da ingresso, cassa e arrivo della scala; (3) al S1 la sala e l'ex area bar "
    "sono collegate solo da un varco di circa 92 cm lungo la facciata, separate da una massa muraria di circa 1,6 m: servono "
    "percorsi propri in entrambi i locali; (4) la facciata su via Rovello e' obliqua (circa 8 gradi) rispetto ai muri interni, "
    "con perdita di spazio lungo le file; (5) il montacarichi occupa parte del lato ovest delle due sale: con vano 80x80 e "
    "mensola ribaltabile costa circa 4 coperti, con vano 90x90 e piano di appoggio fisso circa 8 (vedi tabella di sensibilita'). "
    "Senza montacarichi la soluzione C arriverebbe a 72, ma il montacarichi e' un requisito del progetto.",
    "<b>Esodo dal piano interrato</b>: unica scala (larghezza circa 105 cm) e varco interno di circa 92 cm tra ex bar e sala. "
    f"Con {V['B']['coperti_S1']} (B) - {V['C']['coperti_S1']} (C) clienti piu' il personale, l'affollamento e la lunghezza "
    "dei percorsi vanno verificati dal tecnico antincendio (per prudenza si raccomanda di non superare 50 persone al S1 con una sola via di esodo).",
    "<b>Destinazione d'uso del piano interrato</b>: la catastale riporta 'sottonegozio' con h 2,70 m; l'uso come sala per il "
    "pubblico (somministrazione) va verificato su titolo edilizio, agibilita', requisiti igienico-sanitari (aerazione, "
    "illuminazione, ricambi d'aria) e regolamento edilizio/locale d'igiene di Milano.",
    "<b>Accessibilita'</b>: il S1 e' raggiungibile solo dalla scala; al PT va garantito almeno un tavolo accessibile in sala con "
    "percorso dall'ingresso (porta circa 100 cm) e WC accessibile secondo DM 236/89: da verificare sullo stato di fatto.",
    "<b>Ingresso</b>: l'anta di circa 100 cm apre verso l'interno; la zona davanti alla porta e all'arrivo della scala e' "
    "mantenuta libera (150x150 cm).",
    "<b>Finestre e nicchie in facciata</b>: i tavoli possono essere accostati al filo interno; l'apertura delle ante interne "
    "delle finestre va verificata in sito.",
    "<b>Tavolo nel disimpegno WC del PT</b> (tavolo con 2 sedie e sedute alle estremita' nel disegno originale): non e' "
    "conteggiato perche' si trova sul percorso verso i servizi igienici; si consiglia di eliminarlo o di destinarlo al personale.",
]

SUBORDINATE = [
    "Verifica della natura della massa muraria tra sala interrata ed ex area bar (circa 3,7 x 1,6 m, regione chiusa senza "
    "aperture nel disegno, coerente con un setto/fondazione nella catastale): se si trattasse di un vano o di una parte "
    "non strutturale, l'apertura di un secondo collegamento migliorerebbe esodo e servizio. Nessuna demolizione e' prevista.",
    "Elemento 158 nella sala interrata (sporgenza di circa 125 x 45 cm dal setto): natura incerta (pilastro, nicchia o "
    "arredo fisso); se rimovibile libera circa 0,6 m2 lungo il corridoio sud.",
    "Nicchia 29 a ovest della scala del S1 (circa 60 x 120 cm) e locale sotto la seconda rampa: possibili depositi di servizio.",
    "Mobile di servizio esistente al PT lungo il muro cucina: accorciato da 308 a 216 cm per il montacarichi (postazione S1).",
]

FILES = [
    "OUTPUT/SOLUZIONE_A|B|C/<sol>_PT_planimetria.pdf/.svg/.png/.dxf e <sol>_S1_planimetria.* - tavole A3 1:100",
    "OUTPUT/MONTACARICHI/MONTACARICHI_studio_preliminare.pdf/.svg/.png - elaborato montacarichi",
    "OUTPUT/3D/modello_B.obj/.mtl, blender_build_B.py, anteprima_B.png - modello 3D e percorso camera",
    "OUTPUT/REPORT_comparativo.pdf - questo documento; OUTPUT/CONTROLLO_ELABORATI.txt - controlli automatici",
    "dati/*.json - vettori estratti, calibrazione, layout, verifiche, montacarichi (ripresa del lavoro senza i PDF)",
    "scripts/*.py - pipeline completa (run_all.sh); 00_originali/ - PDF di partenza; 01_analisi/ - immagini di analisi",
]
