"""Versione COMFORT con tavoli da 4 (due moduli 80x80 accostati = 160x80, 2 sedie per lato lungo).
Stesse posizioni e distanze della versione comfort da 50 coperti: i tavoli da 4 nascono unendo due
tavoli da 2 vicini, eliminando i 40 cm tra loro. Uso: MC_POS=F python3 scripts/s14c_comfort_tavoli4.py"""
import os, sys, json, pathlib
os.environ.setdefault('MC_POS', 'F')
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import s12_verifica_finale as V

ROOT = pathlib.Path(__file__).resolve().parents[1]
t2 = lambda x, y, sides='NS': dict(x=x, y=y, nx=1, ny=1, sides=sides, seats=2)
t4 = lambda x, y: dict(x=x, y=y, nx=2, ny=1, sides='NS', seats=4)


def tavoli4(_dy=None):
    PT = {
        'PT - sala davanti alla cucina':
            [t2(2200, 20), t4(2320, 20), t2(2520, 20)]             # contro il muro nord: 2 + 4 + 2
            + [t2(2270, 217, 'EW'), t2(2490, 217, 'EW')]           # al centro (restano da 2)
            + [t2(2255, 420), t4(2375, 420)],                      # contro il setto: 2 + 4
        "PT - sala dell'ingresso":
            [t4(2300, 689)]                                       # schiena verso il setto: un tavolo da 4
            + [t2(2395, 880, 'EW')],                              # lungo la vetrina
    }
    S1 = {
        'S1 - sala interrata':
            [t2(2080, 110)]                                       # angolo nord-ovest
            + [t4(2200, 22), t4(2400, 22)]                        # contro il muro nord: 4 + 4
            + [t4(2335, 272), t2(2510, 272)],                     # fila verso la facciata: 4 + 2
        'S1 - ex area bar':
            [t4(2250, 778)]                                       # contro il setto
            + [t2(2170, 1051), t4(2290, 1051)],                   # verso la scala: 2 + 4
    }
    return PT, S1


if __name__ == '__main__':
    V.layout = tavoli4
    V.ROUTES['int']['varco -> sala interrata (clienti)'] = ((2520, 640), (2290, 300), 90)
    V.CORR = False
    rep, PT, S1 = V.verify()
    rep['versione'] = 'comfort con tavoli da 4'
    rep['_PT'], rep['_S1'] = PT, S1
    V.png(rep)
    sch = ROOT / '01_analisi/schizzi'
    for f in ('PT', 'S1'):
        (sch / f'VERIFICA_FINALE_{f}.png').replace(sch / f'COMFORT_TAVOLI4_{f}.png')
    out = {k: v for k, v in rep.items() if not k.startswith('_')}
    (ROOT / 'dati/verifica_COMFORT_TAVOLI4.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
    (ROOT / 'dati/layout_COMFORT_TAVOLI4.json').write_text(json.dumps({'PT': PT, 'S1': S1}, indent=1))
    print('ESITO', out['esito'], 'coperti', out['coperti_totali'])
    for fl, F in out['piani'].items():
        print(fl, F['coperti'], 'da2', F['da_2'], 'da4', F['da_4'], 'schienali', F.get('passaggio_minimo_tra_schienali_cm'),
              'fila', F['distanza_tra_tavoli_stessa_fila_cm'], 'accesso', F['accesso_sedie_cm']['minimo'], F['accesso_sedie_cm']['tavolo'])
        for k, v in F['percorsi'].items(): print('   ', k, v['larghezza_utile_cm'], v['esito'])
    for p in out['problemi']: print('  -', p)
