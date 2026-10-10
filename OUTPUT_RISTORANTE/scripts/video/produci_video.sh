#!/bin/bash
# Video finale della visita guidata, in qualita' foto. Si puo' rilanciare: riparte dai fotogrammi gia' fatti.
#   1. Blender/Cycles: tutti i fotogrammi del percorso (1280x720, 24 campioni + denoiser)   -> <lavoro>/fotogrammi
#   2. sviluppo fotografico di ogni fotogramma (alone, obiettivo, vignettatura, grana che cambia) -> <lavoro>/sviluppati
#   3. montaggio: dissolvenze, didascalie, cartello finale                                  -> <uscita.mp4>
# Uso: bash produci_video.sh <dati_scena> <texture_pbr> <python_bpy> <python_ia> <lavoro> <uscita.mp4>
DATI=$1; PBR=$2; PYB=$3; PYA=$4; LAV=$5; OUT=$6; HERE=$(cd "$(dirname "$0")" && pwd)
mkdir -p "$LAV/fotogrammi" "$LAV/sviluppati"
N=$(python3 -c "import json;print(len(json.load(open('$DATI/tour.json'))['pos']))")
echo "== fotogrammi ($N) $(date '+%F %T')"
for tentativo in 1 2 3 4 5; do
  PBR="$PBR" OGGETTI=1 "$PYB" "$HERE/render_blender.py" "$DATI" "$LAV/fotogrammi" 0 $((N - 1)) 1 1280 24 2>&1 | grep --line-buffered "^fotogramma\|Traceback"
  [ "$(ls "$LAV/fotogrammi" | wc -l)" -ge "$N" ] && break
  echo "ripresa $tentativo $(date '+%T')"
done
echo "== sviluppo $(date '+%F %T')"
for f in "$LAV"/fotogrammi/f*.png; do
  n=$(basename "$f"); [ -f "$LAV/sviluppati/$n" ] && continue
  "$PYA" "$HERE/post_foto.py" "$f" "$LAV/sviluppati/$n" 0.7 "$((10#${n:1:5}))" > /dev/null
done
echo "== montaggio $(date '+%F %T')"
python3 "$HERE/monta_video.py" "$LAV/sviluppati" "$DATI/tour.json" "$OUT" "$LAV/_montaggio" && echo "FINE $(date '+%F %T')"
