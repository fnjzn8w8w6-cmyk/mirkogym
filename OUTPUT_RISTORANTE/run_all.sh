#!/usr/bin/env bash
# Rigenera l'intero progetto dai PDF originali (00_originali/) agli elaborati (OUTPUT/).
# Requisiti (gratuiti): python3, pymupdf, shapely, ortools, ezdxf, matplotlib, scipy, reportlab
#   pip install pymupdf shapely ortools ezdxf matplotlib scipy reportlab
# Uso:  ./run_all.sh            (tempo solver di default 150 s per ambiente)
#       SOLVER_S=300 ./run_all.sh
set -euo pipefail
cd "$(dirname "$0")"
S=${SOLVER_S:-150}
python3 scripts/s01_extract_vectors.py            # vettori -> dati/vettori_*.json
# python3 scripts/s02_calibrate_vs_catastale.py   # (lento) registrazione su catastale -> dati/calibrazione.json
# python3 scripts/s02b_scale_profile.py int terra # (lento) profilo di sensibilita' della scala
python3 scripts/s03_register_floors.py            # interrato -> frame PT (punti omologhi)
python3 scripts/s04_optimize.py ABC "$S"          # disposizioni -> dati/layout_*.json
python3 scripts/s05_verify.py ABC || true         # verifiche -> dati/verifica_*.json
python3 scripts/s06_export.py ABC                 # tavole PDF/SVG/PNG/DXF
python3 scripts/s07_montacarichi.py               # elaborato montacarichi
python3 scripts/s09_modello3d.py B                # modello 3D della soluzione raccomandata
python3 scripts/s08_report.py                     # report comparativo
