"""Rendering fotorealistico del tour (Blender / Cycles, software libero).
Legge scena.glb, luci.json, tour.json prodotti da esporta_scena.cjs e renderizza i fotogrammi PNG.
Uso: python render_blender.py <cartella_dati> <cartella_frame> <da> <a> [passo] [larghezza] [campioni]
(python = interprete con il modulo bpy di Blender 5.x)"""
import sys, json, math, os, time
import bpy
from mathutils import Vector

src, dst = sys.argv[1], sys.argv[2]
f0, f1 = int(sys.argv[3]), int(sys.argv[4])
step = int(sys.argv[5]) if len(sys.argv) > 5 else 1
W = int(sys.argv[6]) if len(sys.argv) > 6 else 1280
SPP = int(sys.argv[7]) if len(sys.argv) > 7 else 64
os.makedirs(dst, exist_ok=True)

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=os.path.join(src, 'scena.glb'))
sc = bpy.context.scene
B = lambda p: Vector((p[0], -p[2], p[1]))          # three.js (y in alto) -> Blender (z in alto)


def kelvin(t):   # colore approssimato di una sorgente a temperatura t (K)
    t /= 100
    r = 1.0 if t <= 66 else min(1, 1.292936186 * (t - 60) ** -0.1332047592)
    g = (0.39008157876 * math.log(t) - 0.63184144378) if t <= 66 else 1.129890861 * (t - 60) ** -0.0755148492
    b = 1.0 if t >= 66 else (0 if t <= 19 else 0.54320678911 * math.log(t - 10) - 1.19625408914)
    return (max(0, min(1, r)), max(0, min(1, g)), max(0, min(1, b)))


def base(name):
    return name.split('.')[0]


def find(nt, kind):
    return next((n for n in nt.nodes if n.type == kind), None)


def emission_mat(m, strength, color=None, alpha=False):
    nt = m.node_tree; img = find(nt, 'TEX_IMAGE')
    for n in list(nt.nodes):
        if img is None or n.name != img.name: nt.nodes.remove(n)
    out = nt.nodes.new('ShaderNodeOutputMaterial'); em = nt.nodes.new('ShaderNodeEmission')
    em.inputs['Strength'].default_value = strength
    if img: nt.links.new(img.outputs[0], em.inputs['Color'])
    else: em.inputs['Color'].default_value = (*(color or (1, 1, 1)), 1)
    if alpha and img:
        tr = nt.nodes.new('ShaderNodeBsdfTransparent'); mx = nt.nodes.new('ShaderNodeMixShader')
        nt.links.new(img.outputs[1], mx.inputs[0]); nt.links.new(tr.outputs[0], mx.inputs[1]); nt.links.new(em.outputs[0], mx.inputs[2])
        nt.links.new(mx.outputs[0], out.inputs['Surface'])
    else:
        nt.links.new(em.outputs[0], out.inputs['Surface'])


def principled(m):
    return find(m.node_tree, 'BSDF_PRINCIPLED') if m.node_tree else None


WARM = kelvin(2700)
for m in bpy.data.materials:
    if not m.use_nodes: continue
    n = base(m.name); P = principled(m)
    if n in ('lampadina',): emission_mat(m, 40, kelvin(2600))
    elif n in ('opale',): emission_mat(m, 9, kelvin(2800))
    elif n == 'paralumeIn': emission_mat(m, 1.5, kelvin(2900))
    elif n == 'est_palazzo': emission_mat(m, 0.9)
    elif n == 'est_strada': emission_mat(m, 0.35)
    elif n in ('vetro', 'calice'):
        if P:
            P.inputs['Base Color'].default_value = (0.92, 0.97, 0.96, 1); P.inputs['Transmission Weight'].default_value = 1
            P.inputs['Roughness'].default_value = 0.01; P.inputs['IOR'].default_value = 1.45; P.inputs['Alpha'].default_value = 1
            P.inputs['Metallic'].default_value = 0
    elif n in ('bottiglia', 'foglie', 'fiori') and P:
        ca = m.node_tree.nodes.new('ShaderNodeVertexColor'); m.node_tree.links.new(ca.outputs['Color'], P.inputs['Base Color'])
        if n == 'bottiglia':
            P.inputs['Transmission Weight'].default_value = 0.7; P.inputs['Roughness'].default_value = 0.05; P.inputs['Coat Weight'].default_value = 0.6
        else:
            P.inputs['Subsurface Weight'].default_value = 0.2
    elif n == 'basic' or n.startswith('est_'):
        img = find(m.node_tree, 'TEX_IMAGE')
        if img: emission_mat(m, 1.4, alpha=True)               # insegna in ottone
        elif P is None:
            col = m.diffuse_color[:3]; emission_mat(m, 0.0, col)
            nt = m.node_tree; nt.nodes.clear(); o = nt.nodes.new('ShaderNodeOutputMaterial'); d = nt.nodes.new('ShaderNodeBsdfPrincipled')
            d.inputs['Base Color'].default_value = (*col, 1); d.inputs['Roughness'].default_value = 0.9; nt.links.new(d.outputs[0], o.inputs[0])
    elif P is not None:
        if n in ('noceTavolo', 'noce', 'marmo', 'piatto', 'ceramica', 'laccaVerde'): P.inputs['Coat Weight'].default_value = 0.35; P.inputs['Coat Roughness'].default_value = 0.08
        if n == 'candela': P.inputs['Emission Strength'].default_value = 0.4
        if n in ('mattoni', 'cotto', 'intonacoPT', 'intonaco', 'soffitto'): P.inputs['Roughness'].default_value = 0.92
    # i materiali "unlit" di glTF (MeshBasicMaterial) senza nome riconosciuto restano come importati

# lampadine e globi: non fanno ombra alla luce puntiforme posta al loro interno
for o in bpy.data.objects:
    if o.type == 'MESH' and o.active_material and base(o.active_material.name) in ('lampadina', 'opale', 'vetro', 'calice'):
        o.visible_shadow = base(o.active_material.name) in ('vetro',)   # i vetri delle finestre fanno ombra (leggera)
        if base(o.active_material.name) in ('lampadina', 'opale'): o.visible_shadow = False

luci = json.load(open(os.path.join(src, 'luci.json')))
POW = {'sospensione': (22, 2700, 0.035), 'globo': (30, 2800, 0.09), 'applique': (14, 2700, 0.06), 'candela': (0.35, 1900, 0.008)}
for i, l in enumerate(luci):
    p = B(l['p'])
    if l['tipo'] == 'ambiente':
        cucina = l.get('col', 0) == 0xf4f1ea
        d = bpy.data.lights.new(f'amb{i}', 'AREA'); d.shape = 'DISK'; d.size = 0.8
        d.energy = 90 if cucina else 35; d.color = kelvin(4000 if cucina else 2800)
        ob = bpy.data.objects.new(f'amb{i}', d); ob.location = p + Vector((0, 0, 0.42)); sc.collection.objects.link(ob)
        continue
    pw, k, r = POW[l['tipo']]
    d = bpy.data.lights.new(f'l{i}', 'POINT'); d.energy = pw; d.color = kelvin(k); d.shadow_soft_size = r
    ob = bpy.data.objects.new(f'l{i}', d); ob.location = p + (Vector((0, 0, -0.04)) if l['tipo'] == 'candela' else Vector((0, 0, 0)))
    sc.collection.objects.link(ob)

w = bpy.data.worlds.new('notte'); sc.world = w; w.use_nodes = True
bg = w.node_tree.nodes.get('Background'); bg.inputs['Color'].default_value = (0.02, 0.03, 0.06, 1); bg.inputs['Strength'].default_value = 0.4

tour = json.load(open(os.path.join(src, 'tour.json')))
cd = bpy.data.cameras.new('cam'); cd.lens = 20; cd.sensor_width = 36; cd.clip_start = 0.03
cam = bpy.data.objects.new('cam', cd); sc.collection.objects.link(cam); sc.camera = cam

sc.render.engine = 'CYCLES'
cy = sc.cycles; cy.device = 'CPU'; cy.samples = SPP; cy.use_adaptive_sampling = True; cy.adaptive_threshold = 0.02
cy.use_denoising = True; cy.denoiser = 'OPENIMAGEDENOISE'
cy.max_bounces = 6; cy.diffuse_bounces = 2; cy.glossy_bounces = 2; cy.transmission_bounces = 6; cy.transparent_max_bounces = 6
cy.use_fast_gi = os.environ.get('FASTGI', '1') == '1'; cy.ao_bounces_render = 1
cy.sample_clamp_indirect = 6; cy.use_light_tree = True; cy.caustics_reflective = False; cy.caustics_refractive = False
sc.render.use_persistent_data = True
sc.render.resolution_x = W; sc.render.resolution_y = round(W * 9 / 16); sc.render.resolution_percentage = 100
sc.view_settings.view_transform = 'AgX'; sc.view_settings.look = 'AgX - Medium High Contrast'; sc.view_settings.exposure = 0.6
sc.render.image_settings.file_format = 'PNG'
bpy.context.preferences.addons['cycles'].preferences.compute_device_type = 'NONE'
sc.render.threads_mode = 'AUTO'
ENG = os.environ.get('ENGINE')
if ENG: sc.render.engine = ENG

for f in range(f0, min(f1, len(tour['pos']) - 1) + 1, step):
    out = os.path.join(dst, f'f{f:05d}.png')
    if os.path.exists(out): continue
    p, d = tour['pos'][f], tour['dir'][f]
    cam.location = B(p); cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = B(d).to_track_quat('-Z', 'Y')
    t = time.time(); sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print(f'fotogramma {f} {time.time() - t:.1f}s', flush=True)
