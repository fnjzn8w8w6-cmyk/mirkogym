"""Seconda serie di modifiche del cliente (sulla versione 'modifiche', numerazione della PNG MODIFICHE):
PT sala-ingresso: T11 (da 4, contro il setto) spostato a sinistra, T12 (da 2) incastrato nell'angolo
setto/vetrina, T13 (da 4) piu' vicino al muro (vetrina) e fuori dalla zona della porta.
Le altre sale: come proposta da 56 (sala-cucina della versione da 52, interrato con le modifiche).
Uso: MC_POS=F python3 scripts/s14f_modifiche_2.py"""
import os, sys, json, pathlib
os.environ.setdefault('MC_POS', 'F')
sys.path.insert(0, str(pathlib.Path(__file__).parent))
import s12_verifica_finale as V
import s14e_modifiche_cliente as M

ROOT = pathlib.Path(__file__).resolve().parents[1]
t2, t4h, t4v = M.t2, M.t4h, M.t4v


def mod2(_dy=None):
    _, S1 = M.modifiche()
    PT = {
        'PT - sala davanti alla cucina':
            V.row(2200, 20, 4, 40) + [t2(2250, 217, 'EW'), t2(2494, 217, 'EW')] + V.row(2255, 420, 3, 40),
        "PT - sala dell'ingresso":
            [t4h(2285, 689)]                 # T11 da 4: 15 cm piu' a sinistra (passaggio cassa 100 cm)
            + [t2(2475, 689)]                # T12 da 2: nell'angolo setto/vetrina, 30 cm da T11
            + [t4v(2389, 840)],              # T13 da 4: verso la vetrina e verso l'alto, fuori dalla zona porta
    }
    return PT, S1


if __name__ == '__main__':
    V.layout = mod2
    V.ROUTES['int']['varco -> sala interrata (clienti)'] = ((2520, 640), (2150, 300), 90)
    V.ROUTES['int']['ex bar: lungo facciata verso il varco'] = ((2490, 950), (2520, 640), 90)
    V.CORR = False
    rep, PT, S1 = V.verify()
    rep['versione'] = 'modifiche del cliente (2)'
    rep['_PT'], rep['_S1'] = PT, S1
    V.png(rep)
    sch = ROOT / '01_analisi/schizzi'
    for f in ('PT', 'S1'):
        (sch / f'VERIFICA_FINALE_{f}.png').replace(sch / f'MODIFICHE2_{f}.png')
    out = {k: v for k, v in rep.items() if not k.startswith('_')}
    (ROOT / 'dati/verifica_MODIFICHE2.json').write_text(json.dumps(out, indent=1, ensure_ascii=False))
    (ROOT / 'dati/layout_MODIFICHE2.json').write_text(json.dumps({'PT': PT, 'S1': S1}, indent=1))
    print('ESITO', out['esito'], 'coperti', out['coperti_totali'])
    F = out['piani']['terra']
    print('PT', F['coperti'], 'schienali', F.get('passaggio_minimo_tra_schienali_cm'), 'accesso', F['accesso_sedie_cm'])
    for k, v in F['percorsi'].items(): print('   ', k, v['larghezza_utile_cm'], v['esito'])
    print('    muri:', sorted((d['dist_min_da_muri_cm'], d['T']) for d in F['tavoli_dettaglio'])[:3])
    for p in out['problemi']: print('  -', p)
