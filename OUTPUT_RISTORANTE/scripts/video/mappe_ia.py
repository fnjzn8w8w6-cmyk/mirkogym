"""Mappe per la rifinitura IA, calcolate sulla scena Blender completa (eseguito da render_blender.py con DEBUGPY=questo file).
Per ogni inquadratura di MAPPE_SCATTI (json delle foto) scrive in MAPPE_DIR:
  <nome>_prof.png   profondita' esatta (vicino = chiaro), per il ControlNet di profondita'
  <nome>_quadri.png maschera delle stampe d'arte, che dopo l'IA vengono rimesse identiche all'originale
Stessa camera di render_blender.py (sensore 36 mm, adattamento orizzontale, 16:9)."""
import json, os, bpy
import numpy as np
from mathutils import Vector
from PIL import Image

shots = json.load(open(os.environ['MAPPE_SCATTI'])); out = os.environ['MAPPE_DIR']; W, H = 512, 288   # poi ingrandite a 1024x576
sc = bpy.context.scene; dg = bpy.context.evaluated_depsgraph_get()


def is_quadro(o):
    """stampe d'arte e insegna "Dvca": immagini piane che l'IA storpierebbe (scritte, disegni)"""
    m = o.active_material
    if m and m.name.split('.')[0] == 'bronzo': return True   # sportello del montacarichi: l'IA lo scambierebbe per una vetrinetta
    if not m or not m.name.startswith(('misc', 'basic')) or not m.node_tree or len(o.data.polygons) > 4: return False
    return any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes)


quadri = {o.name for o in bpy.data.objects if o.type == 'MESH' and is_quadro(o)}
VETRI = {'vetro'}
for k in shots:
    x, y, z = k['p']; P = Vector((x, -y, z + k.get('occhio', 1.6))); L = Vector((k['look'][0], -k['look'][1], k['look'][2]))
    f = (L - P).normalized(); r = f.cross(Vector((0, 0, 1))).normalized(); u = r.cross(f); lens = k.get('lente', 24)
    dist = np.zeros((H, W), np.float32); mask = np.zeros((H, W), np.uint8)
    for py in range(H):
        for px in range(W):
            d = (f * lens + r * ((px + 0.5) / W - 0.5) * 36 + u * (0.5 - (py + 0.5) / H) * 36 * H / W).normalized()
            o0 = P
            for _ in range(6):   # vetrine e porte a vetri: si guarda attraverso (profondita' e quadri di cio' che sta dietro)
                h = sc.ray_cast(dg, o0, d, distance=60)
                if not (h[0] and h[4] is not None and h[4].active_material and h[4].active_material.name.split('.')[0] in VETRI): break
                o0 = h[1] + d * 0.002
            if h[0]:
                dist[py, px] = (h[1] - P).length
                if h[4] is not None and h[4].name in quadri: mask[py, px] = 255
            else: dist[py, px] = 60
    near, far = np.percentile(dist, 12), np.percentile(dist, 99)   # i primi piani vicinissimi (stipiti) saturano, non schiacciano il resto
    inv = ((1 / np.clip(dist, near, far) - 1 / far) / (1 / near - 1 / far)) ** 0.6
    Image.fromarray((np.clip(inv, 0, 1) * 255).astype(np.uint8)).resize((1024, 576), Image.BILINEAR).save(os.path.join(out, k['nome'] + '_prof.png'))
    Image.fromarray(mask).resize((1024, 576), Image.NEAREST).save(os.path.join(out, k['nome'] + '_quadri.png'))
    print('MAPPE', k['nome'], int(mask.sum() / 255), 'pixel di quadri', flush=True)
