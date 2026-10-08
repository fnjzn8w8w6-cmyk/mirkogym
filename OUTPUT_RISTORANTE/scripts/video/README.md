# Video del tour (rendering fotorealistico, solo software libero)

1. `MC_POS=F python3 scripts/s16_vista3d_pro.py` – genera la vista 3D (OUTPUT/3D/vista_3d.html).
2. Copia locale della pagina con three.js locale (npm `three@0.128.0`), poi
   `node scripts/video/esporta_scena.cjs <pagina_locale.html> <three>/examples/js/exporters/GLTFExporter.js <dati> 24`
   → `scena.glb`, `luci.json`, `tour.json` (lo stesso percorso del "Tour guidato" della pagina, 24 fps).
3. `python render_blender.py <dati> <frame> 0 2084 2 960 20` con il modulo `bpy` di Blender 5.1 (pip install bpy)
   → un fotogramma ogni 2 (12 fps), 960×540, Cycles 20 campioni + denoiser OpenImageDenoise.
4. `python3 scripts/video/monta_video.py <frame> <dati>/tour.json OUTPUT/3D/Dvca_Rovello_tour.mp4`
   → interpolazione del movimento a 24 fps (ffmpeg minterpolate), dissolvenze, didascalie, H.264.
