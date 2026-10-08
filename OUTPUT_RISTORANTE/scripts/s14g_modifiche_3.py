"""Terza serie di modifiche del cliente:
PT sala-cucina: fila centrale da 3 tavoli con sedie N/S (T5, nuovo, T6) come richiesto; file contro i
muri accostate al limite (schienale a ~2-3 cm dal muro) per allargare i passaggi.
PT sala-ingresso: come modifiche (2).
S1 sala: fila di T106 avvicinata alla fila di T102 (passaggio tra schienali ridotto) -> la fila passa
sopra la zona di scarico del montacarichi e parte sotto T102, con tavoli piu' distanziati.
S1 ex bar: come modifiche (T109 da 4).
Uso: MC_POS=F python3 scripts/s14g_modifiche_3.py"""
import os, sys, json, pathlib
os.environ.setdefault('MC_POS', 'F')
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import s12_verifica_finale as V
import s14e_modifiche_cliente as M
import s14f_modifiche_2 as M2

ROOT = pathlib.Path(__file__).resolve().parents[1]
t2 = M.t2


def mod3(_dy=None):
    PT0, S10 = M2.mod2()
    PT = {
        'PT - sala davanti alla cucina':
            V.row(2200, 12, 4, 40)            # contro il muro nord, accostata al limite
            + V.row(2250, 220, 3, 40)         # T5, nuovo, T6: sedie N/S, centrata tra le file
            + V.row(2255, 429, 3, 40),        # contro il setto, accostata al limite
        "PT - sala dell'ingresso": PT0["PT - sala dell'ingresso"],
    }
    S1 = {
        'S1 - sala interrata':
            [t2(2080, 22)] + V.row(2200, 22, 4, 40)    # fila di T102 (con T101 accanto)
            + V.row(2230, 242, 4, 21),                 # fila di T106: piu' vicina, sopra la zona MC, tavoli a 21 cm
        'S1 - ex area bar': S10['S1 - ex area bar'],
    }
    return PT, S1


if __name__ == '__main__':
    V.layout = mod3
    V.ROUTES['int']['varco -> sala interrata (clienti)'] = ((2520, 640), (2150, 300), 90)
    V.ROUTES['int']['ex bar: lungo facciata verso il varco'] = ((2490, 950), (2520, 640), 90)
    V.CORR = False
    rep, PT, S1 = V.verify()
    rep['versione'] = 'modifiche del cliente (3)'
    rep['_PT'], rep['_S1'] = PT, S1
    V.png(rep)
    sch = ROOT / '01_analisi/schizzi'
    for f in ('PT', 'S1'):
        (sch / f'VERIFICA_FINALE_{f}.png').replace(sch / f'MODIFICHE3_{f}.png')
    out = {k: v for k, v in rep.items() if not k.startswith('_')}
    (ROOT / 'dati/verifica_MODIFICHE3.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
    (ROOT / 'dati/layout_MODIFICHE3.json').write_text(json.dumps({'PT': PT, 'S1': S1}, indent=1))
    print('ESITO', out['esito'], 'coperti', out['coperti_totali'])
    for fl, F in out['piani'].items():
        print(fl, F['coperti'], 'schienali', F.get('passaggio_minimo_tra_schienali_cm'), 'accesso', F['accesso_sedie_cm'])
        for k, v in F['percorsi'].items(): print('   ', k, v['larghezza_utile_cm'], v['esito'])
        print('    muri:', sorted((d['dist_min_da_muri_cm'], d['T']) for d in F['tavoli_dettaglio'])[:3])
    for p in out['problemi']: print('  -', p)
