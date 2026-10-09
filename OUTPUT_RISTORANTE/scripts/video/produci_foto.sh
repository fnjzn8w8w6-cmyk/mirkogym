#!/bin/bash
# Produce le foto finali, la stessa catena della foto di prova approvata:
#   1. render Blender (materiali fotografati, oggetti veri, luce serale)        -> render/<nome>.png
#   2. mappe esatte dalla scena: profondita' e maschera dei quadri               -> mappe/
#   3. rifinitura IA guidata da contorni + profondita', quadri originali        -> ia/<nome>.png
#   4. sviluppo fotografico (alone, obiettivo, vignettatura, grana)             -> <nome>.jpg
# Ogni passo salta le foto gia' fatte: si puo' rilanciare dopo un'interruzione.
# Uso: bash produci_foto.sh <dati_scena> <texture_pbr> <python_bpy> <python_ia> <uscita> [scatti.json]
set -e
DATI=$1; PBR=$2; PYB=$3; PYA=$4; OUT=$5; HERE=$(cd "$(dirname "$0")" && pwd); SCATTI=${6:-$HERE/scatti_foto.json}
mkdir -p "$OUT/render" "$OUT/mappe" "$OUT/ia"
echo "== render $(date +%T)"
PBR="$PBR" OGGETTI=1 "$PYB" "$HERE/render_blender.py" "$DATI" "$OUT/render" foto "$SCATTI" 1280 128 2>&1 | grep --line-buffered "^foto\|Error\|Traceback"
echo "== mappe $(date +%T)"
python3 - "$SCATTI" "$OUT/mappe" > "$OUT/mappe/_da_fare.json" <<'PY'
import json, os, sys
print(json.dumps([k for k in json.load(open(sys.argv[1])) if not os.path.exists(os.path.join(sys.argv[2], k['nome'] + '_prof.png'))]))
PY
if [ "$(cat "$OUT/mappe/_da_fare.json")" != "[]" ]; then
  PBR="$PBR" OGGETTI=1 MAPPE_SCATTI="$OUT/mappe/_da_fare.json" MAPPE_DIR="$OUT/mappe" DEBUGPY="$HERE/mappe_ia.py" \
    "$PYB" "$HERE/render_blender.py" "$DATI" "$OUT/render" foto "$SCATTI" 1280 128 2>&1 | grep --line-buffered "^MAPPE\|Error\|Traceback"
fi
echo "== IA $(date +%T)"
for f in "$OUT"/render/*.png; do
  n=$(basename "$f" .png); [ -f "$OUT/$n.jpg" ] && continue
  desc=$(python3 -c "import json;print(json.load(open('$HERE/scene_ai.json'))['$n'])")
  HF_HUB_OFFLINE=1 "$PYA" "$HERE/ai_rifinitura.py" "$f" "$OUT/ia/$n.png" "$desc" 0.5 7 "$OUT/mappe/${n}_prof.png" "$OUT/mappe/${n}_quadri.png" 2>&1 | grep --line-buffered "^fatto\|Error"
  "$PYA" "$HERE/post_foto.py" "$OUT/ia/$n.png" "$OUT/$n.jpg" 0.8
done
echo "FINE $(date +%T)"
