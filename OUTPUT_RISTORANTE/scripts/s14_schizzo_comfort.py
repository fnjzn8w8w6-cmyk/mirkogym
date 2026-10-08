"""Step 14 - Versione COMFORT (richiesta cliente: meno coperti, tavoli meno attaccati).
Regole: tavoli 80x80 da 2; file contro parete con 30 cm tra i tavoli e ~60 cm tavolo-muro;
>= 60-70 cm liberi tra schienali di file diverse; percorsi principali >= 90 cm; piede scala libero.
La verifica usa lo stesso motore di s12_verifica_finale.py. Montacarichi in posizione 'F'.
Uso: MC_POS=F python3 scripts/s14_schizzo_comfort.py"""
import os, sys, json, pathlib
os.environ.setdefault('MC_POS', 'F')
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import s12_verifica_finale as V

ROOT = pathlib.Path(__file__).resolve().parents[1]
row, col = V.row, V.col
one = lambda x, y, sides='NS': dict(x=x, y=y, nx=1, ny=1, sides=sides, seats=2)


def comfort(_dy=None):
    PT = {
        'PT - sala davanti alla cucina':
            row(2200, 20, 4, 40)                              # contro il muro nord (schienale al muro)
            + [one(2270, 217, 'EW'), one(2490, 217, 'EW')]     # al centro: sedie affiancate alla fila
            + row(2255, 420, 3, 40),                           # contro il setto, oltre la zona di carico MC
        "PT - sala dell'ingresso":
            row(2300, 689, 2, 40)                             # schiena verso il setto
            + [one(2395, 880, 'EW')],                         # lungo la vetrina, a destra dell'ingresso
    }
    S1 = {
        'S1 - sala interrata':
            [one(2080, 110)]                                  # angolo nord-ovest
            + row(2200, 22, 4, 40)                            # contro il muro nord
            + row(2335, 272, 3, 15),                          # fila verso la facciata
        'S1 - ex area bar':
            row(2250, 778, 2, 40)                             # contro il setto (staccata dal piede scala)
            + row(2170, 1051, 3, 40),                         # verso la scala
    }
    return PT, S1


if __name__ == '__main__':
    V.layout = comfort
    # arrivo in sala: passaggio centrale (non il corridoio tra due file)
    V.ROUTES['int']['varco -> sala interrata (clienti)'] = ((2520, 640), (2290, 300), 90)
    V.CORR = False
    rep, PT, S1 = V.verify()
    rep['versione'] = 'comfort'
    rep['_PT'], rep['_S1'] = PT, S1
    V.png(rep)
    sch = ROOT / '01_analisi/schizzi'
    for f in ('PT', 'S1'):
        (sch / f'VERIFICA_FINALE_{f}.png').replace(sch / f'COMFORT_{f}.png')
    out = {k: v for k, v in rep.items() if not k.startswith('_')}
    (ROOT / 'dati/verifica_COMFORT.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
    (ROOT / 'dati/layout_COMFORT.json').write_text(json.dumps({'PT': PT, 'S1': S1}, indent=1))
    print('ESITO', out['esito'], 'coperti', out['coperti_totali'])
    for fl, F in out['piani'].items():
        print(fl, F['coperti'], 'schienali', F.get('passaggio_minimo_tra_schienali_cm'), 'fila', F['distanza_tra_tavoli_stessa_fila_cm'],
              'accesso', F['accesso_sedie_cm'])
        for k, v in F['percorsi'].items(): print('   ', k, v['larghezza_utile_cm'], v['esito'])
        print('    muri:', sorted((d['dist_min_da_muri_cm'], d['T']) for d in F['tavoli_dettaglio'])[:3])
    for p in out['problemi']: print('  -', p)
