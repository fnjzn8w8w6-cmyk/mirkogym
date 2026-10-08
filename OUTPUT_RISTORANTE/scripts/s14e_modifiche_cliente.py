"""Modifiche richieste dal cliente sulla versione comfort + tavoli da 4 (52 coperti):
PT  sala-cucina: T5 e T6 girati (sedie N/S come le altre file) e un tavolo in mezzo -> fila centrale da 3;
PT  sala-ingresso: T10 da 4 girato in orizzontale (contro il setto), T11 da 4 invariato, un tavolo da 2 tra i due;
S1  ex bar (ingresso-scala): T109 diventa da 4, gli altri invariati;
S1  sala-spogliatoi: T101 accanto a T102 (nella fila nord); un tavolo in piu' accanto a T106, fila ridistribuita.
Uso: MC_POS=F python3 scripts/s14e_modifiche_cliente.py"""
import os, sys, json, pathlib
os.environ.setdefault('MC_POS', 'F')
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import s12_verifica_finale as V

ROOT = pathlib.Path(__file__).resolve().parents[1]
t2 = lambda x, y, sides='NS': dict(x=x, y=y, nx=1, ny=1, sides=sides, seats=2)
t4h = lambda x, y: dict(x=x, y=y, nx=2, ny=1, sides='NS', seats=4)    # 160x80 orizzontale
t4v = lambda x, y: dict(x=x, y=y, nx=1, ny=2, sides='EW', seats=4)    # 80x160 verticale


def modifiche(_dy=None):
    PT = {
        'PT - sala davanti alla cucina':
            V.row(2200, 20, 4, 40)
            + V.row(2250, 220, 3, 40)                     # T5, nuovo, T6: girati come le altre file
            + V.row(2255, 420, 3, 40),
        "PT - sala dell'ingresso":
            [t4h(2300, 689)]                              # T10 da 4 in orizzontale, schiena al setto
            + [t2(2345, 829, 'EW')]                       # nuovo tavolo da 2 tra T10 e T11
            + [t4v(2345, 924)],                           # T11 da 4: per far posto scende di 109 cm
    }
    S1 = {
        'S1 - sala interrata':
            [t2(2080, 22)] + V.row(2200, 22, 4, 40)       # T101 accanto a T102 nella fila nord
            + V.row(2250, 272, 4, 15),                    # T106 + uno nuovo: 4 tavoli nella fila
        'S1 - ex area bar':
            [t4h(2205, 778), t2(2380, 778)]               # T109 da 4 (T110 accostato a 15 cm)
            + V.row(2170, 1051, 3, 40),
    }
    return PT, S1


if __name__ == '__main__':
    V.layout = modifiche
    V.ROUTES['int']['varco -> sala interrata (clienti)'] = ((2520, 640), (2150, 300), 90)
    V.ROUTES['int']['ex bar: lungo facciata verso il varco'] = ((2490, 950), (2520, 640), 90)
    V.CORR = False
    rep, PT, S1 = V.verify()
    rep['versione'] = 'modifiche del cliente'
    rep['_PT'], rep['_S1'] = PT, S1
    V.png(rep)
    sch = ROOT / '01_analisi/schizzi'
    for f in ('PT', 'S1'):
        (sch / f'VERIFICA_FINALE_{f}.png').replace(sch / f'MODIFICHE_{f}.png')
    out = {k: v for k, v in rep.items() if not k.startswith('_')}
    (ROOT / 'dati/verifica_MODIFICHE.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
    (ROOT / 'dati/layout_MODIFICHE.json').write_text(json.dumps({'PT': PT, 'S1': S1}, indent=1))
    print('ESITO', out['esito'], 'coperti', out['coperti_totali'])
    for fl, F in out['piani'].items():
        print(fl, F['coperti'], 'da4', F['da_4'], 'schienali', F.get('passaggio_minimo_tra_schienali_cm'),
              'accesso', F['accesso_sedie_cm'])
        for k, v in F['percorsi'].items(): print('   ', k, v['larghezza_utile_cm'], v['esito'])
    for p in out['problemi']: print('  -', p)
