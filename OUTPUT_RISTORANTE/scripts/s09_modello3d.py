"""Step 9 - Modello 3D (secondario rispetto al 2D) della soluzione scelta.
Produce:
 * OUTPUT/3D/modello_<sol>.obj (+ .mtl): pareti (linee del rilievo estruse come superfici sottili),
   pavimenti, tavoli 80x80 h75, sedie, montacarichi, sagoma dell'ex area bar.  Unita': metri.
 * OUTPUT/3D/blender_build_<sol>.py: script per Blender (gratuito) che importa l'OBJ, assegna i
   materiali, crea luci, una camera e un percorso virtuale (ingresso -> sala nord -> scala -> S1).
   Uso:  blender --python blender_build_<sol>.py
 * OUTPUT/3D/anteprima_<sol>.png: vista assonometrica di controllo (matplotlib).
Valori PROVVISORI dichiarati: altezze interne PT 2.90 m e S1 2.70 m (catastale), solaio 0.40 m,
quota S1 = -3.10 m; materiali neutri."""
import json, sys, pathlib
import numpy as np
sys.path.insert(0, str(pathlib.Path(__file__).parent))
from geometria import load_vector_lines
from progetto import REMOVE, BAR_IDS, MC, NEW_SERVICE
from layout import MOD
from disegno import chairs_of
from shapely.geometry import Polygon, box
from shapely.ops import unary_union

ROOT = pathlib.Path(__file__).resolve().parents[1]
OUT = ROOT / 'OUTPUT' / '3D'
H = {'terra': 2.90, 'int': 2.70}
Z0 = {'terra': 0.0, 'int': -3.10}


class Obj:
    def __init__(self):
        self.v, self.groups = [], []
    def add(self, name, mat, faces_pts):
        fs = []
        for pts in faces_pts:
            idx = []
            for p in pts:
                self.v.append(p); idx.append(len(self.v))
            fs.append(idx)
        self.groups.append((name, mat, fs))
    def box(self, name, mat, x0, y0, z0, x1, y1, z1):
        P = lambda x, y, z: (x, z, y)   # OBJ: y-up; piano x/z (z = y planimetrico)
        c = [P(x0, y0, z0), P(x1, y0, z0), P(x1, y1, z0), P(x0, y1, z0),
             P(x0, y0, z1), P(x1, y0, z1), P(x1, y1, z1), P(x0, y1, z1)]
        F = [(0, 1, 2, 3), (4, 5, 6, 7), (0, 1, 5, 4), (1, 2, 6, 5), (2, 3, 7, 6), (3, 0, 4, 7)]
        self.add(name, mat, [[c[i] for i in f] for f in F])
    def save(self, path):
        with open(path, 'w') as f:
            f.write(f'mtllib {path.stem}.mtl\n')
            for p in self.v: f.write('v %.4f %.4f %.4f\n' % p)
            for name, mat, fs in self.groups:
                f.write(f'o {name}\nusemtl {mat}\n')
                for idx in fs: f.write('f ' + ' '.join(map(str, idx)) + '\n')
        mats = {'muro': (0.92, 0.91, 0.88, 1), 'pavimento_pt': (0.55, 0.45, 0.35, 1), 'pavimento_s1': (0.5, 0.5, 0.52, 1),
                'tavolo': (0.75, 0.6, 0.42, 1), 'sedia': (0.2, 0.2, 0.22, 1), 'montacarichi': (0.85, 0.25, 0.55, 1),
                'ex_bar': (0.95, 0.55, 0.2, 0.5), 'servizio': (0.7, 0.75, 0.8, 1)}
        with open(path.with_suffix('.mtl'), 'w') as f:
            for n, (r, g, b, a) in mats.items():
                f.write(f'newmtl {n}\nKd {r} {g} {b}\nd {a}\n\n')


def build(sol):
    L = json.loads((ROOT / f'dati/layout_{sol}.json').read_text())
    o = Obj()
    m = lambda v: v / 100.0
    for fl in ('terra', 'int'):
        z0, h = Z0[fl], H[fl]
        segs = []
        for ln in load_vector_lines(fl):
            if ln['id'] in REMOVE[fl]: continue
            P = np.array(ln['pts'])
            for a, b in zip(P[:-1], P[1:]):
                if np.hypot(*(b - a)) < 3: continue
                segs.append([(m(a[0]), z0, m(a[1])), (m(b[0]), z0, m(b[1])), (m(b[0]), z0 + h, m(b[1])), (m(a[0]), z0 + h, m(a[1]))])
        o.add(f'muri_{fl}', 'muro', segs)
        # pavimento: involucro delle zone utili + corridoi
        zones = [Polygon(z) for r in L['rooms'].values() if r['floor'] == fl for z in r['zones'].values()]
        zones += [box(*k) for r in L['rooms'].values() if r['floor'] == fl for k in r['keepouts'].values()]
        fp = unary_union(zones).convex_hull if fl == 'int' else unary_union(zones).convex_hull
        fp = fp.buffer(30)
        pts = [(m(x), z0, m(y)) for x, y in list(fp.exterior.coords)[:-1]]
        o.add(f'pavimento_{fl}', 'pavimento_pt' if fl == 'terra' else 'pavimento_s1', [pts])
        for rn, r in L['rooms'].items():
            if r['floor'] != fl: continue
            for gi, g in enumerate(r['groups']):
                x0, y0 = g['x'], g['y']; x1, y1 = x0 + g['nx']*MOD, y0 + g['ny']*MOD
                o.box(f'tavolo_{fl}_{gi}', 'tavolo', m(x0), m(y0), z0 + 0.72, m(x1), m(y1), z0 + 0.75)
                for i in range(g['nx']):
                    for j in range(g['ny']):
                        cx, cy = x0 + i*MOD + MOD/2, y0 + j*MOD + MOD/2
                        o.box(f'gamba_{fl}_{gi}_{i}_{j}', 'tavolo', m(cx - 3), m(cy - 3), z0, m(cx + 3), m(cy + 3), z0 + 0.72)
                for k, c in enumerate(chairs_of(g)):
                    cx0, cy0, cx1, cy1, s = c
                    o.box(f'sedia_{fl}_{gi}_{k}', 'sedia', m(cx0), m(cy0), z0 + 0.42, m(cx1), m(cy1), z0 + 0.46)
                    bk = {'N': (cx0, cy0, cx1, cy0 + 5), 'S': (cx0, cy1 - 5, cx1, cy1),
                          'W': (cx0, cy0, cx0 + 5, cy1), 'E': (cx1 - 5, cy0, cx1, cy1)}[s]
                    o.box(f'schienale_{fl}_{gi}_{k}', 'sedia', m(bk[0]), m(bk[1]), z0 + 0.46, m(bk[2]), m(bk[3]), z0 + 0.88)
        for k, r in NEW_SERVICE[fl].items():
            zb = z0 + 0.86 if 'ribalt' in k else z0       # mensola ribaltabile: solo il piano a 0,90 m
            o.box(f'servizio_{fl}', 'servizio', m(r[0]), m(r[1]), zb, m(r[2]), m(r[3]), z0 + 0.9)
    # ex area bar: sagoma traslucida a pavimento S1 (dove c'erano bancone, divano, sgabelli)
    z0 = Z0['int']
    for ln in load_vector_lines('int'):
        if ln['id'] in BAR_IDS and len(ln['pts']) > 2:
            P = np.array(ln['pts'])
            o.add(f'ex_bar_{ln["id"]}', 'ex_bar', [[(m(x), z0 + 0.01, m(y)) for x, y in P[:-1]]])
    x0, y0, x1, y1 = MC.vano()
    o.box('montacarichi_vano', 'montacarichi', m(x0), m(y0), Z0['int'], m(x1), m(y1), H['terra'])
    OUT.mkdir(parents=True, exist_ok=True)
    o.save(OUT / f'modello_{sol}.obj')
    return L


BLENDER = r'''# Script Blender (>= 3.6/4.x). Esecuzione:  blender --python blender_build_{sol}.py
import bpy, math, os
from mathutils import Vector
here = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
obj = os.path.join(here, 'modello_{sol}.obj')
if hasattr(bpy.ops.wm, 'obj_import'):
    bpy.ops.wm.obj_import(filepath=obj, forward_axis='NEGATIVE_Z', up_axis='Y')
else:
    bpy.ops.import_scene.obj(filepath=obj, axis_forward='-Z', axis_up='Y')
scene = bpy.context.scene
# luci provvisorie
for loc, en in [((22.5, 3, 2.6), 300), ((22.5, 8, 2.6), 300), ((22.5, 3, -0.6), 300), ((22.5, 9, -0.6), 300)]:
    l = bpy.data.lights.new('luce', 'POINT'); l.energy = en
    ob = bpy.data.objects.new('luce', l); ob.location = (loc[0], -loc[1], loc[2]) if False else loc
    scene.collection.objects.link(ob)
sun = bpy.data.lights.new('sole', 'SUN'); sun.energy = 2
so = bpy.data.objects.new('sole', sun); so.rotation_euler = (0.6, 0.2, 0.8); scene.collection.objects.link(so)
# percorso virtuale (coordinate Blender: x = x planimetrico, y = -y planimetrico, z = quota)
pts = {path}
cu = bpy.data.curves.new('percorso', 'CURVE'); cu.dimensions = '3D'
sp = cu.splines.new('NURBS'); sp.points.add(len(pts) - 1)
for i, p in enumerate(pts): sp.points[i].co = (p[0], p[1], p[2], 1)
sp.use_endpoint_u = True; sp.order_u = 3
path = bpy.data.objects.new('percorso_camera', cu); scene.collection.objects.link(path)
cam_data = bpy.data.cameras.new('camera'); cam_data.lens = 18
cam = bpy.data.objects.new('camera', cam_data); scene.collection.objects.link(cam); scene.camera = cam
c = cam.constraints.new('FOLLOW_PATH'); c.target = path; c.use_curve_follow = True; c.forward_axis = 'TRACK_NEGATIVE_Z'; c.up_axis = 'UP_Y'
cu.path_duration = 600; scene.frame_end = 600
c.offset = 0; c.keyframe_insert('offset', frame=1); c.offset = -100; c.keyframe_insert('offset', frame=600)
cam.rotation_euler = (math.radians(90), 0, math.radians(-90))
scene.render.engine = 'BLENDER_EEVEE_NEXT' if 'BLENDER_EEVEE_NEXT' in [e.identifier for e in bpy.types.RenderSettings.bl_rna.properties['engine'].enum_items] else 'BLENDER_EEVEE'
print('Scena pronta: premere Ctrl+F12 per il video del percorso, F12 per un fotogramma.')
'''


def blender_script(sol):
    # percorso: ingresso -> sala sud -> varco -> sala nord -> ritorno -> scala -> S1 ex bar -> varco -> sala S1
    P = [(25.4, 10.7, 1.6), (23.5, 9.0, 1.6), (22.4, 7.0, 1.6), (21.3, 5.9, 1.6), (21.5, 3.5, 1.6), (23.0, 1.5, 1.6),
         (24.5, 3.0, 1.6), (22.5, 7.5, 1.6), (24.5, 11.5, 1.6), (23.0, 12.4, 0.2), (21.1, 12.4, -0.8), (21.1, 10.0, -1.5),
         (21.5, 9.3, -1.5), (23.8, 9.3, -1.5), (25.3, 8.0, -1.5), (25.2, 6.8, -1.5), (24.0, 5.0, -1.5), (22.0, 5.0, -1.5),
         (21.5, 3.4, -1.5), (21.4, 2.6, -1.5)]
    pts = [(x, -y, z) for x, y, z in P]
    (OUT / f'blender_build_{sol}.py').write_text(BLENDER.replace('{sol}', sol).replace('{path}', repr(pts)))
    return P


ZP = {'terra': 0.0, 'int': -7.0}   # solo anteprima: separazione verticale esagerata per leggibilita'


def preview(sol, L, cam_path):
    import matplotlib; matplotlib.use('Agg')
    import matplotlib.pyplot as plt
    fig = plt.figure(figsize=(14, 10)); ax = fig.add_subplot(111, projection='3d')
    for fl, col in [('terra', '#555'), ('int', '#777')]:
        z0 = ZP[fl]
        for ln in load_vector_lines(fl):
            if ln['id'] in REMOVE[fl]: continue
            P = np.array(ln['pts']) / 100
            if P[:, 0].min() < 18.5: continue
            ax.plot(P[:, 0], P[:, 1], z0, color=col, lw=0.5)
        for r in L['rooms'].values():
            if r['floor'] != fl: continue
            for g in r['groups']:
                x0, y0 = g['x']/100, g['y']/100; x1, y1 = x0 + g['nx']*0.8, y0 + g['ny']*0.8
                ax.plot([x0, x1, x1, x0, x0], [y0, y0, y1, y1, y0], z0 + 0.75, color='#2b6cb0', lw=1)
                for c in chairs_of(g):
                    a = np.array(c[:4]) / 100
                    ax.plot([a[0], a[2], a[2], a[0], a[0]], [a[1], a[1], a[3], a[3], a[1]], z0 + 0.45, color='#333', lw=0.4)
    for ln in load_vector_lines('int'):
        if ln['id'] in BAR_IDS:
            P = np.array(ln['pts']) / 100; ax.plot(P[:, 0], P[:, 1], ZP['int'], color='#ed8936', lw=1)
    x0, y0, x1, y1 = np.array(MC.vano()) / 100
    for z in (ZP['int'], 0, 1.2):
        ax.plot([x0, x1, x1, x0, x0], [y0, y0, y1, y1, y0], z, color='#d53f8c', lw=1.5)
    for x, y in [(x0, y0), (x1, y0), (x1, y1), (x0, y1)]:
        ax.plot([x, x], [y, y], [ZP['int'], 1.2], color='#d53f8c', lw=1.5)
    C = np.array(cam_path, float); C[:, 2] = np.where(C[:, 2] < -0.5, ZP['int'] + 0.3, np.where(C[:, 2] < 1.0, C[:, 2] * 3, 0.3))
    ax.plot(C[:, 0], C[:, 1], C[:, 2], color='green', lw=1.6, ls='--')
    ax.text(19.6, -1.0, 1.0, 'PIANO TERRA', fontsize=10, fontweight='bold')
    ax.text(19.6, -1.0, ZP['int'] + 1.0, 'PIANO INTERRATO', fontsize=10, fontweight='bold')
    ax.set_xlim(19.5, 27.5); ax.set_ylim(14, -1.5); ax.set_zlim(-7.5, 1.5)
    ax.set_box_aspect((8, 15.5, 9)); ax.view_init(elev=32, azim=-58); ax.axis('off')
    ax.set_title(f'Anteprima 3D soluzione {sol} (separazione verticale tra i piani esagerata): tavoli (blu), vano montacarichi (rosa),\n'
                 'arredi bar rimossi (arancio), percorso camera ingresso -> sala nord -> scala -> S1 (verde)', fontsize=9)
    fig.savefig(OUT / f'anteprima_{sol}.png', dpi=120, bbox_inches='tight')


if __name__ == '__main__':
    sol = sys.argv[1] if len(sys.argv) > 1 else 'B'
    L = build(sol); P = blender_script(sol); preview(sol, L, P)
    print('3D esportato in', OUT)
