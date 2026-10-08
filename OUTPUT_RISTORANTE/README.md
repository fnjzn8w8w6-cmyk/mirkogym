# Dvca Rovello – Via Rovello 18, Milano – Ottimizzazione planimetrica

Studio preliminare per la nuova disposizione dei tavoli (moduli 80×80 cm) al piano terra (PT) e
al piano interrato (S1), con eliminazione dell'area bar al S1 e studio del montacarichi per le bevande
dalla cucina (PT) al S1.

> **Stato: PRELIMINARE – NON VALIDATO DIMENSIONALMENTE IN SITO.**
> La scala è ricavata dalla planimetria catastale 1:200 e dagli elementi comuni ai due piani
> (tolleranza stimata ±2%). Serve **almeno una misura reale** (vedi sotto) per validare.

## Risultati (geometria nominale, verificati da `s05_verify.py`)

| Soluzione | PT | S1 | Totale | Passaggio tra sedute | Corridoi |
|---|---|---|---|---|---|
| A – Comfort | 23 | 22 | **45** | 60 cm | 130 cm |
| **B – Equilibrata (raccomandata)** | 28 | 32 | **60** | 45 cm | 110 cm |
| C – Massima capienza | 32 | 36 | **68** | 35 cm | 100 cm |

**L'obiettivo di 70 coperti non è raggiunto in modo verificabile** (stato attuale da rilievo: 51 posti al tavolo + 5 lounge).
Il montacarichi costa circa 4 coperti (vano 80×80 con mensola ribaltabile; circa 8 con vano 90×90 e piano fisso):
senza montacarichi la C arriverebbe a 72. Dettagli in `OUTPUT/REPORT_comparativo.pdf`.

## Cartelle

| Cartella | Contenuto |
|---|---|
| `00_originali/` | i tre PDF di partenza (non modificati) |
| `01_analisi/` | immagini di analisi: rendering dei PDF, path numerati, sovrapposizioni catastale/PT/S1, log dei solver |
| `dati/` | dati geometrici: vettori estratti (`vettori_*.json`), calibrazione, layout, verifiche, montacarichi |
| `scripts/` | pipeline Python completa (gratuita) |
| `OUTPUT/SOLUZIONE_A`, `_B`, `_C` | tavole A3 1:100 per piano: PDF, SVG, PNG, DXF |
| `OUTPUT/MONTACARICHI/` | elaborato del montacarichi |
| `OUTPUT/3D/` | modello OBJ, script Blender con camera e percorso, anteprima |
| `OUTPUT/REPORT_comparativo.pdf` | confronto tra le tre soluzioni e raccomandazione |
| `OUTPUT/CONTROLLO_ELABORATI.txt` | controlli automatici sugli elaborati esportati |

## Pipeline (`./run_all.sh`)

1. `s01_extract_vectors.py`: estrazione vettoriale (PyMuPDF) delle tavole AutoCAD, in orientamento di visualizzazione.
2. `s02_calibrate_vs_catastale.py` e `s02b_scale_profile.py`: registrazione dei vettori sul raster catastale
   (scala certa: barra "10 metri" = 141,73 pt → 1 px = 25,40 mm) e profilo di sensibilità della scala.
3. `s03_register_floors.py`: sovrapposizione S1 → PT su 6 punti omologhi (facciata, muro nord, scala), RMS 2 cm.
4. `s04_optimize.py`: disposizioni A/B/C: seme a file (programmazione dinamica), poi Google OR-Tools CP-SAT,
   e ciclo di riparazione se un tavolo risulta irraggiungibile.
5. `s05_verify.py`: verifica indipendente (shapely): collisioni con le linee originali, percorsi, scala,
   vano del montacarichi, passaggi tra gruppi, raggiungibilità di ogni tavolo.
6. `s06_export.py`: tavole A3 in scala 1:100 (PDF/SVG/PNG) e DXF con layer e blocchi (tavolo 80×80, sedia).
7. `s07_montacarichi.py`: elaborato del montacarichi (sovrapposizione dei piani, dettagli, candidate scartate).
8. `s08_report.py` + `report_testi.py`: report comparativo.
9. `s09_modello3d.py`: modello 3D (OBJ) e script Blender.
10. `s10_controllo_elaborati.py`: apertura di tutti i file, audit DXF, muri originali identici, nessun taglio.

Moduli: `geometria.py` (frame comune e scala), `progetto.py` (zone utili, percorsi, montacarichi, arredi rimossi),
`layout.py` (modello di ottimizzazione), `disegno.py` (geometria di sedie e tavoli).

## Frame di coordinate

Tutte le coordinate sono in **cm** in un frame comune ai due piani: è il frame del PT ruotato di 22,6°
(i muri principali diventano ortogonali). Le tavole e i DXF sono riportati nell'orientamento delle
planimetrie originali. Nel DXF: unità cm, layer `MURI_ESISTENTI`, `TAVOLI_80x80`, `SEDIE`, `FASCIA_SEDUTA`,
`PERCORSI`, `MONTACARICHI`, `NUMERAZIONE`, `TESTI`, `ARREDI_BAR_RIMOSSI`.

## Validazione con misura in sito

Misurare la **larghezza interna della sala nord al PT lungo il muro nord**, dal filo del muro della cucina
al filo interno della facciata su via Rovello (valore di disegno: circa 610 cm). Poi creare
`dati/correzione_scala.json`:

```json
{"misura_reale_cm": 612, "misura_disegno_cm": 610}
```

e rieseguire `./run_all.sh`: tutte le coordinate del rilievo vengono corrette, le misure di progetto
(tavoli, sedie, corridoi, vano) restano invariate, e le disposizioni vengono ricalcolate e verificate.

## Requisiti

`pip install pymupdf shapely ortools ezdxf matplotlib scipy reportlab`. Blender (gratuito) serve solo
per aprire la scena 3D: `blender --python OUTPUT/3D/blender_build_B.py`.
