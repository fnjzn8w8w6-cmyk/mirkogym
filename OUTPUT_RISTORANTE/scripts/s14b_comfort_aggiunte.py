"""Variante della versione comfort con le 2 aggiunte richieste dal cliente:
 1) ex bar: terzo tavolo nella fila contro il setto (tavoli a 25 cm);
 2) interrato: quinto tavolo nella fila contro il muro nord (tavoli a 20 cm).
Stesso motore di verifica di s12. Uso: MC_POS=F python3 scripts/s14b_comfort_aggiunte.py"""
import os, sys, json, pathlib
os.environ.setdefault('MC_POS', 'F')
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import s12_verifica_finale as V
import s14_schizzo_comfort as C

ROOT = pathlib.Path(__file__).resolve().parents[1]

def aggiunte(_dy=None):
    PT, S1 = C.comfort()
    S1 = {
        'S1 - sala interrata': [C.one(2080, 110)] + V.row(2165, 22, 5, 20) + V.row(2335, 272, 3, 15),
        'S1 - ex area bar': V.row(2180, 778, 3, 25) + V.row(2170, 1051, 3, 40),
    }
    return PT, S1

if __name__ == '__main__':
    V.layout = aggiunte
    V.ROUTES['int']['varco -> sala interrata (clienti)'] = ((2520, 640), (2290, 300), 90)
    V.ROUTES['int']['ex bar: lungo facciata verso il varco'] = ((2470, 950), (2520, 640), 90)
    V.CORR = False
    rep, PT, S1 = V.verify()
    rep['versione'] = 'comfort + 2 aggiunte'
    rep['_PT'], rep['_S1'] = PT, S1
    V.png(rep)
    sch = ROOT / '01_analisi/schizzi'
    for f in ('PT', 'S1'):
        (sch / f'VERIFICA_FINALE_{f}.png').replace(sch / f'COMFORT_AGGIUNTE_{f}.png')
    out = {k: v for k, v in rep.items() if not k.startswith('_')}
    (ROOT / 'dati/verifica_COMFORT_AGGIUNTE.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
    print('ESITO', out['esito'], 'coperti', out['coperti_totali'])
    F = out['piani']['int']
    print('S1', F['coperti'], 'fila', F['distanza_tra_tavoli_stessa_fila_cm'], 'accesso', F['accesso_sedie_cm'])
    for k, v in F['percorsi'].items(): print('   ', k, v['larghezza_utile_cm'], v['esito'])
    for p in out['problemi']: print('  -', p)
