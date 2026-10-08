"""Step 8 - Report comparativo PDF (reportlab).
Legge dati/layout_*.json, dati/verifica_*.json, dati/calibrazione.json, dati/montacarichi.json
e le PNG delle tavole; produce OUTPUT/REPORT_comparativo.pdf"""
import json, sys, pathlib, datetime
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from reportlab.lib.pagesizes import A4
from reportlab.lib import colors
from reportlab.lib.units import mm
from reportlab.lib.styles import getSampleStyleSheet, ParagraphStyle
from reportlab.platypus import (SimpleDocTemplate, Paragraph, Spacer, Table, TableStyle, Image, PageBreak,
                                KeepTogether)
from layout import PARAMS, MOD

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'OUTPUT'
TARGET = 70
EXISTING = dict(PT=33, S1_tavoli=18, S1_bar_lounge=5)   # conteggio sedute del rilievo arredi originale

ss = getSampleStyleSheet()
H1 = ParagraphStyle('h1', parent=ss['Heading1'], fontSize=15, spaceAfter=6, textColor=colors.HexColor('#1a365d'))
H2 = ParagraphStyle('h2', parent=ss['Heading2'], fontSize=11.5, spaceBefore=8, spaceAfter=4, textColor=colors.HexColor('#1a365d'))
P = ParagraphStyle('p', parent=ss['BodyText'], fontSize=8.6, leading=11.2)
PS = ParagraphStyle('ps', parent=P, fontSize=7.6, leading=9.6)
WARN = ParagraphStyle('w', parent=P, textColor=colors.HexColor('#c53030'), fontName='Helvetica-Bold')


def tbl(data, widths, head=True, fs=7.4):
    t = Table([[Paragraph(str(c), ParagraphStyle('c', parent=PS, fontSize=fs, leading=fs*1.25)) for c in r] for r in data],
              colWidths=widths, repeatRows=1 if head else 0)
    st = [('GRID', (0, 0), (-1, -1), 0.3, colors.HexColor('#a0aec0')), ('VALIGN', (0, 0), (-1, -1), 'TOP'),
          ('LEFTPADDING', (0, 0), (-1, -1), 3), ('RIGHTPADDING', (0, 0), (-1, -1), 3)]
    if head: st += [('BACKGROUND', (0, 0), (-1, 0), colors.HexColor('#e2e8f0'))]
    t.setStyle(TableStyle(st))
    return t


def cfg_summary(L):
    from collections import Counter
    c = Counter()
    for r in L['rooms'].values():
        for g in r['groups']:
            c[f"{g['nx']*MOD}x{g['ny']*MOD} da {g['seats']}"] += 1
    return ', '.join(f'{v}x [{k}]' for k, v in sorted(c.items()))


def main(recommended='B'):
    cal = json.loads((ROOT / 'dati/calibrazione.json').read_text())
    mc = json.loads((ROOT / 'dati/montacarichi.json').read_text())
    sols = {}
    for s in 'ABC':
        sols[s] = (json.loads((ROOT / f'dati/layout_{s}.json').read_text()),
                   json.loads((ROOT / f'dati/verifica_{s}.json').read_text()))
    doc = SimpleDocTemplate(str(OUT / 'REPORT_comparativo.pdf'), pagesize=A4, leftMargin=16*mm, rightMargin=16*mm,
                            topMargin=14*mm, bottomMargin=14*mm, title='Dvca Rovello - report comparativo disposizioni',
                            author='Studio preliminare')
    E = []
    best = max(v[1]['coperti_tot'] for v in sols.values())
    reached = {s: v[1]['coperti_tot'] >= TARGET and not v[1]['blocking'] for s, v in sols.items()}
    E.append(Paragraph('DVCA ROVELLO - Via Rovello 18, Milano', H1))
    E.append(Paragraph('Ottimizzazione planimetrica sale (PT + interrato), eliminazione bar interrato, montacarichi bevande '
                       f'- Report comparativo - {datetime.date.today():%d/%m/%Y}', P))
    E.append(Paragraph('STATO: STUDIO PRELIMINARE - geometria verificata sui vettori originali, scala calibrata su catastale '
                       '1:200 (tolleranza stimata +/-2%) - NON VALIDATO DIMENSIONALMENTE IN SITO.', WARN))
    E.append(Spacer(1, 4))
    E.append(Paragraph('1. Sintesi', H2))
    Lr, Vr = sols[recommended]
    txt = (f"Sono state generate e verificate tre disposizioni con tavoli modulari 80x80 cm. Capienza verificata: "
           f"A = <b>{sols['A'][1]['coperti_tot']}</b>, B = <b>{sols['B'][1]['coperti_tot']}</b>, "
           f"C = <b>{sols['C'][1]['coperti_tot']}</b> coperti contemporanei (PT + S1, nessun doppio conteggio). "
           f"Capienza attuale da rilievo arredi: {EXISTING['PT']} (PT) + {EXISTING['S1_tavoli']} (S1, tavoli) + "
           f"{EXISTING['S1_bar_lounge']} sedute lounge bar.")
    E.append(Paragraph(txt, P))
    if any(reached.values()):
        ok = ', '.join(s for s, v in reached.items() if v)
        E.append(Paragraph(f"L'obiettivo di almeno {TARGET} coperti e' raggiunto, sulla geometria nominale, dalle soluzioni: <b>{ok}</b>. "
                           "Il risultato resta subordinato alla conferma della scala con una misura in sito.", P))
    else:
        E.append(Paragraph(f"<b>Nessuna soluzione raggiunge {TARGET} coperti in modo verificabile</b> con i criteri adottati: "
                           f"la capienza massima ottenibile e' {best} coperti (soluzione C). I vincoli che lo impediscono sono "
                           "descritti al paragrafo 6.", P))
    E.append(Paragraph(f"<b>Soluzione raccomandata: {recommended} - {Lr['name'].split(' - ')[1]}</b> "
                       f"({Vr['coperti_PT']} PT + {Vr['coperti_S1']} S1 = {Vr['coperti_tot']} coperti).", P))

    E.append(Paragraph('2. Fonti, metodo e precisione dimensionale', H2))
    tp = cal['terra']; ti = cal['int']; ts = cal['int_su_terra']
    rows = [['Elemento', 'Metodo', 'Esito', 'Stato'],
            ['Geometrie PT e S1', 'Estrazione vettoriale PyMuPDF dei PDF AutoCAD LT 2023 (307 e 168 path)', 'Muri, aperture, scale, arredi come polilinee', 'VERIFICATO (vettori)'],
            ['Scala catastale', 'Barra vettoriale "10 metri" = 141,73 pt; raster 200 dpi a 1:200', '1 px = 25,40 mm', 'VERIFICATO'],
            ['Scala PT', 'Registrazione chamfer dei vettori sulla catastale + profilo di sensibilita\'',
             f"{tp['mm_per_pt']:.2f} mm/pt (minimo netto 40,1-40,7)", 'STIMATO +/-2%'],
            ['Scala S1', 'Catastale poco discriminante (36-38,6 mm/pt): adottata registrazione su elementi comuni al PT',
             f"{ti['mm_per_pt']:.2f} mm/pt", 'STIMATO (coerente)'],
            ['Sovrapposizione PT/S1', 'Similitudine su 6 punti omologhi (facciata, muro nord, scala)',
             f"RMS {ts['rms_cm']:.1f} cm, rotazione {ts['rot_deg']:.2f} gradi", 'VERIFICATO (interno)'],
            ['Controlli di plausibilita\'', 'Gradini 28-29 cm, scala 105 cm, tavoli esistenti 73 cm, sedie 50-54 cm, porta ingresso 100 cm',
             'Valori realistici', 'COERENTE'],
            ['Funzioni dei locali', 'Testi delle tavole di arredo; catastale solo come confronto', 'cucina, sala, WC, scala, area bar, spogliatoio, immondizia, loc. tecnico', 'DA TAVOLE'],
            ['Masse murarie S1', 'Regioni chiuse senza aperture sotto i muri del PT, confronto con catastale', 'setto tra sala S1 ed ex bar, fondazioni muro cucina', 'INTERPRETATO - da verificare'],
            ]
    E.append(tbl(rows, [32*mm, 62*mm, 52*mm, 30*mm]))
    E.append(Spacer(1, 3))
    E.append(Paragraph('<b>Misura richiesta per la validazione:</b> almeno una quota reale, preferibilmente la larghezza interna '
                       'della sala nord del PT lungo il muro nord, dal filo del muro cucina al filo interno della facciata '
                       '(valore di disegno circa 610 cm), oppure la lunghezza interna della facciata su via Rovello. '
                       'Gli script accettano un fattore di correzione e rigenerano tutti gli elaborati.', P))

    E.append(Paragraph('3. Criteri progettuali e modello di calcolo', H2))
    E.append(Paragraph('Ottimizzazione con Google OR-Tools CP-SAT (scripts/layout.py): ogni gruppo e\' un rettangolo di nx x ny '
                       'moduli 80x80 con sedie sui lati scelti (1 sedia ogni 80 cm). L\'involucro rigido (tavolo + fascia D per '
                       'sedia e persona seduta) deve stare nella zona utile e fuori dai percorsi riservati; gli involucri estesi di g/2 '
                       'sui lati con sedute non si sovrappongono, quindi tra persone sedute di tavoli diversi resta almeno g. '
                       'Verifica indipendente (scripts/s05_verify.py): collisioni con le linee originali, percorsi, scala, vano MC, '
                       'distanze e raggiungibilita\' di ogni tavolo dallo spazio libero connesso ai corridoi.', P))
    rows = [['Parametro', 'A - Comfort', 'B - Equilibrata', 'C - Massima capienza']]
    pr = {s: sols[s][0]['params'] for s in 'ABC'}
    rows.append(['Fascia seduta D (sedia + persona)'] + [f"{pr[s]['D']} cm" for s in 'ABC'])
    rows.append(['Passaggio tra persone sedute g'] + [f"{pr[s]['g']} cm" for s in 'ABC'])
    rows.append(['Corridoi principali W'] + [f"{pr[s]['W_main']} cm" for s in 'ABC'])
    rows.append(['Testate senza sedie accostabili', 'no (30 cm)', 'si\'', 'si\''])
    rows.append(['Configurazioni ammesse', '80x80 da 2; 160/240x80 sui lati lunghi; tavoli a parete', 'A + capotavola, 160x160 da 8, 320x80',
                 'B + 80x80 da 3/4'])
    E.append(tbl(rows, [50*mm, 42*mm, 42*mm, 42*mm]))
    E.append(Paragraph('I valori di W e g sono criteri progettuali iniziali, non minimi normativi: i requisiti effettivi '
                       '(esodo, accessibilita\', affollamento) vanno verificati dal progettista abilitato.', PS))

    E.append(Paragraph('4. Tabella comparativa', H2))
    rows = [['Voce', 'A - Comfort', 'B - Equilibrata', 'C - Massima capienza']]
    def per(s, k): return sols[s][1][k]
    rows.append(['Coperti piano terra'] + [per(s, 'coperti_PT') for s in 'ABC'])
    rows.append(['Coperti piano interrato'] + [per(s, 'coperti_S1') for s in 'ABC'])
    rows.append(['<b>Coperti complessivi</b>'] + [f"<b>{per(s, 'coperti_tot')}</b>" for s in 'ABC'])
    rows.append([f'Obiettivo {TARGET}'] + ['raggiunto' if reached[s] else f"non raggiunto ({per(s, 'coperti_tot') - TARGET:+d})" for s in 'ABC'])
    rows.append(['N. moduli 80x80'] + [per(s, 'moduli_tot') for s in 'ABC'])
    rows.append(['N. tavoli (gruppi)'] + [sum(v['gruppi'] for v in sols[s][1]['rooms'].values()) for s in 'ABC'])
    rows.append(['Configurazioni'] + [cfg_summary(sols[s][0]) for s in 'ABC'])
    for rn in sols['A'][0]['rooms']:
        rows.append([rn] + [(f"{sols[s][1]['rooms'][rn]['coperti']} cop. / pass. min tra tavoli {sols[s][1]['rooms'][rn]['passaggio_min_tra_gruppi_cm']} cm"
                             if sols[s][1]['rooms'][rn]['passaggio_min_tra_gruppi_cm'] is not None else f"{sols[s][1]['rooms'][rn]['coperti']} cop. / 1 solo tavolo")
                            for s in 'ABC'])
    rows.append(['Ingombro tavolo/sedia/persona'] + [f"tavolo 80x80; sedia 45x45; fascia {pr[s]['D']} cm" for s in 'ABC'])
    rows.append(['Esito verifiche geometriche'] + [per(s, 'esito') for s in 'ABC'])
    rows.append(['Montacarichi'] + ['MC: lato sala nord a ridosso del muro cucina (PT carico / S1 sbarco)'] * 3)
    E.append(tbl(rows, [40*mm, 45*mm, 45*mm, 46*mm]))

    E.append(Paragraph('5. Raccomandazione', H2))
    E.append(Paragraph(RECOMMENDATION.get(recommended, ''), P))
    E.append(Paragraph('6. Punti critici, interferenze e vincoli', H2))
    for s in CRITICAL:
        E.append(Paragraph('- ' + s, P))
    sf = ROOT / 'dati/sensibilita.json'
    if sf.exists():
        sen = json.loads(sf.read_text())
        E.append(Paragraph('Analisi di sensibilita\' (scripts/s04b_sensibilita.py): coperti ottenibili togliendo un vincolo alla volta '
                           '(ricalcolo breve, con verifica di raggiungibilita\'; valori indicativi, non disposizioni di progetto).', P))
        keys = list(next(iter(sen.values())).keys())
        rows = [['Scenario'] + [f'Soluzione {k}' for k in sen]]
        for k in keys:
            rows.append([k] + [sen[s_][k] for s_ in sen])
        E.append(tbl(rows, [80*mm, 45*mm, 45*mm]))
        E.append(Spacer(1, 3))
    E.append(Paragraph('7. Montacarichi bevande (sintesi; elaborato separato in OUTPUT/MONTACARICHI)', H2))
    E.append(Paragraph(f"Vano parametrico massimo {mc['L']}x{mc['P']} cm (cabina indicativa 60x60; con vano 90x90 e piano fisso si perdono circa 4 coperti) (superficie {mc['superficie_vano_m2']:.2f} m2 per piano) a ridosso del "
                       "muro tra cucina e sala nord, lato sala, a circa 30 cm dalla porta cucina. PT: carico dal lato nord nella "
                       "zona di servizio davanti alla porta cucina. S1: sbarco dal lato sud nell'angolo NW della sala interrata, "
                       "accanto al varco di servizio verso WC personale/spogliatoio, con mensola ribaltabile 80x40 cm sulla porta di sbarco; zona "
                       "riservata, fuori dai percorsi clienti. La verticale e' compatibile sui due livelli (scarto fili muro 12 cm). "
                       "Le posizioni sotto la cucina sono state scartate perche' al S1 cadono su locale immondizia, corridoio di "
                       "servizio, armadietti o masse murarie. Interferenze: mobile di servizio esistente al PT (accorciato). "
                       "Da verificare: solaio (orditura, travi, foro e rinforzi), fondazioni del muro adiacente, impianti, modello "
                       "e normativa del montacarichi, compartimentazione antincendio, titoli e condominio.", P))
    E.append(Paragraph('8. Interventi subordinati a verifica tecnica (non inclusi nel conteggio)', H2))
    for s in SUBORDINATE:
        E.append(Paragraph('- ' + s, P))
    E.append(PageBreak())
    E.append(Paragraph('9. Tavole (riduzione; originali A3 in scala 1:100 in OUTPUT/SOLUZIONE_*)', H2))
    for s in 'ABC':
        for tag in ('PT', 'S1'):
            img = OUT / f'SOLUZIONE_{s}' / f'{s}_{tag}_planimetria.png'
            E.append(KeepTogether([Image(str(img), width=178*mm, height=178*mm*297/420), Spacer(1, 4)]))
    E.append(Paragraph('10. File prodotti', H2))
    for s in FILES:
        E.append(Paragraph('- ' + s, PS))
    doc.build(E)
    print('report ->', OUT / 'REPORT_comparativo.pdf')


RECOMMENDATION = {}
CRITICAL = []
SUBORDINATE = []
FILES = []

if __name__ == '__main__':
    import report_testi  # testi di progetto (raccomandazione, criticita') separati dal codice
    RECOMMENDATION.update(report_testi.RECOMMENDATION); CRITICAL.extend(report_testi.CRITICAL)
    SUBORDINATE.extend(report_testi.SUBORDINATE); FILES.extend(report_testi.FILES)
    main(report_testi.RECOMMENDED)
