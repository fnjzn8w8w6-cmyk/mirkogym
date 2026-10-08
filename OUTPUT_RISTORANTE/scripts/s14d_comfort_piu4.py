"""Versione COMFORT con tavoli da 4 che AGGIUNGONO coperti (ricerca s15_ottimizza_comfort.py):
 - sala dell'ingresso: due tavoli da 4 (80x160) in colonna, sedie verso vetrina e verso cassa: 8 coperti invece di 6;
 - sala davanti alla cucina: i due tavoli centrali allontanati (schienali affacciati ~64 cm invece di 40);
 - interrato: invariato (la ricerca automatica non trova disposizioni migliori con i tavoli da 4).
Uso: MC_POS=F python3 scripts/s14d_comfort_piu4.py"""
import os, sys, json, pathlib
os.environ.setdefault('MC_POS', 'F')
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import s12_verifica_finale as V
import s14_schizzo_comfort as C

ROOT = pathlib.Path(__file__).resolve().parents[1]
t2 = lambda x, y, sides='NS': dict(x=x, y=y, nx=1, ny=1, sides=sides, seats=2)
t4v = lambda x, y: dict(x=x, y=y, nx=1, ny=2, sides='EW', seats=4)


def piu4(_dy=None):
    PT, S1 = C.comfort()
    PT = {
        'PT - sala davanti alla cucina':
            V.row(2200, 20, 4, 40)
            + [t2(2250, 217, 'EW'), t2(2494, 217, 'EW')]
            + V.row(2255, 420, 3, 40),
        "PT - sala dell'ingresso": [t4v(2345, 640), t4v(2345, 815)],
    }
    return PT, S1


if __name__ == '__main__':
    V.layout = piu4
    V.ROUTES['int']['varco -> sala interrata (clienti)'] = ((2520, 640), (2290, 300), 90)
    V.CORR = False
    rep, PT, S1 = V.verify()
    rep['versione'] = 'comfort + tavoli da 4 nella sala ingresso'
    rep['_PT'], rep['_S1'] = PT, S1
    V.png(rep)
    sch = ROOT / '01_analisi/schizzi'
    for f in ('PT', 'S1'):
        (sch / f'VERIFICA_FINALE_{f}.png').replace(sch / f'COMFORT_PIU4_{f}.png')
    out = {k: v for k, v in rep.items() if not k.startswith('_')}
    (ROOT / 'dati/verifica_COMFORT_PIU4.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
    (ROOT / 'dati/layout_COMFORT_PIU4.json').write_text(json.dumps({'PT': PT, 'S1': S1}, indent=1))
    print('ESITO', out['esito'], 'coperti', out['coperti_totali'])
    for fl, F in out['piani'].items():
        print(fl, F['coperti'], 'da4', F['da_4'], 'schienali', F.get('passaggio_minimo_tra_schienali_cm'),
              'accesso', F['accesso_sedie_cm']['minimo'], F['accesso_sedie_cm']['tavolo'])
        for k, v in F['percorsi'].items(): print('   ', k, v['larghezza_utile_cm'], v['esito'])
    for p in out['problemi']: print('  -', p)
