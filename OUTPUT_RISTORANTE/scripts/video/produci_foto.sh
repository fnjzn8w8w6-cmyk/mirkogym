#!/bin/bash
# Produce le foto: render Blender con materiali fotografati, poi rifinitura IA (stessa inquadratura).
# Uso: bash produci_foto.sh <dati_scena> <texture_pbr> <python_bpy> <python_ia> <uscita>
set -e
DATI=$1; PBR=$2; PYB=$3; PYA=$4; OUT=$5; HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$OUT/render" "$OUT/ia"
PBR="$PBR" "$PYB" "$HERE/render_blender.py" "$DATI" "$OUT/render" foto "$HERE/scatti_foto.json" 1600 64 2>&1 | grep --line-buffered "^foto\|Error"
for f in "$OUT"/render/*.png; do
  n=$(basename "$f" .png); [ -f "$OUT/ia/$n.jpg" ] && continue
  desc=$(python3 -c "import json,sys;print(json.load(open('$HERE/scene_ai.json'))['$n'])")
  HF_HUB_OFFLINE=1 "$PYA" "$HERE/ai_rifinitura.py" "$f" "$OUT/ia/$n.png" "$desc" 0.42 2>&1 | grep --line-buffered "^fatto"
  python3 -c "from PIL import Image;Image.open('$OUT/ia/$n.png').convert('RGB').resize((1600,900),Image.LANCZOS).save('$OUT/ia/$n.jpg',quality=92)" && rm "$OUT/ia/$n.png"
done
echo FINE
