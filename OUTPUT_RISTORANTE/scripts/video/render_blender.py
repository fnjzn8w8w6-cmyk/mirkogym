"""Rendering fotorealistico del tour (Blender / Cycles, software libero).
Legge scena.glb, luci.json, tour.json prodotti da esporta_scena.cjs e renderizza i fotogrammi PNG.
Uso: python render_blender.py <cartella_dati> <cartella_frame> <da> <a> [passo] [larghezza] [campioni]
(python = interprete con il modulo bpy di Blender 5.x)"""
import sys, json, math, os, time
import bpy
from mathutils import Vector, Matrix

src, dst = sys.argv[1], sys.argv[2]
FOTO = sys.argv[3] == 'foto'          # modalita' foto: python render_blender.py <dati> <uscita> foto <scatti.json> <larghezza> <campioni>
if FOTO: f0 = f1 = 0
else: f0, f1 = int(sys.argv[3]), int(sys.argv[4])
step = int(sys.argv[5]) if len(sys.argv) > 5 and not FOTO else 1
A = sys.argv[5:] if FOTO else sys.argv[6:]     # [larghezza, campioni]
W = int(A[0]) if len(A) > 0 else 1280
SPP = int(A[1]) if len(A) > 1 else 64
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

# ---- materiali fotografati (Poly Haven / ambientCG, CC0): proiezione a cubo in coordinate mondo, normali e rugosita' reali
PBR = os.environ.get('PBR')
PBRMAP = {   # materiale della scena: (texture, lato in metri, tinta moltiplicativa, forza normale, smusso spigoli m)
    'spina': ('herringbone_parquet', 3.4, (1.0, 0.92, 0.82), 1.0, 0),
    'cotto': ('terracotta_floor_tiles', 2.08, (1.05, 0.95, 0.88), 1.0, 0),
    'gres': ('floor_tiles_06', 3.0, (0.95, 0.95, 0.95), 0.6, 0),
    'cucina': ('floor_tiles_06', 3.0, (0.8, 0.8, 0.8), 0.6, 0),
    'intonacoPT': ('painted_plaster_wall', 2.0, (1.0, 0.9, 0.76), 0.5, 0),
    'intonaco': ('painted_plaster_wall', 2.0, (1.0, 0.97, 0.92), 0.5, 0),
    'soffitto': ('painted_plaster_wall', 2.0, (1.02, 1.0, 0.96), 0.3, 0),
    'mattoni': ('brick_wall_02', 1.45, (1.0, 0.95, 0.9), 1.2, 0),
    'metro': ('long_white_tiles', 1.27, (1.0, 1.0, 1.0), 0.8, 0),
    'noce': ('walnut_veneer', 1.8, (0.62, 0.45, 0.34), 0.6, 0.004),
    'noceTavolo': ('walnut_veneer', 1.8, (0.64, 0.47, 0.35), 0.6, 0.005),
    'scaffale': ('walnut_veneer', 1.8, (0.6, 0.44, 0.33), 0.6, 0.003),
    'doghe': ('walnut_veneer', 1.8, (0.62, 0.45, 0.34), 0.6, 0.003),
    'trave': ('walnut_veneer', 1.8, (0.42, 0.3, 0.22), 0.8, 0.01),
    'tavolo_servizio': ('walnut_veneer', 1.8, (0.7, 0.52, 0.4), 0.6, 0.004),
    'gradino': ('oak_veneer_01', 1.83, (0.85, 0.72, 0.58), 0.6, 0.004),
    'legnoSedia': ('oak_veneer_01', 0.9, (0.3, 0.19, 0.12), 0.4, 0.0),
    'marmo': ('marble021', 2.0, (1.0, 1.0, 1.0), 0.4, 0.003),
    'lino': ('rough_linen', 0.27, (0.62, 0.68, 0.56), 1.0, 0.002),
    'paglia': ('wicker009a', 0.22, (1.0, 0.95, 0.85), 1.0, 0.0),
}
if PBR:
    for m in bpy.data.materials:
        n = base(m.name)
        if n not in PBRMAP or not m.node_tree: continue
        tex, size, tint, nstr, bev = PBRMAP[n]
        nt = m.node_tree; P = principled(m)
        if P is None: continue
        for l in list(nt.links):
            if l.to_node.name == P.name and l.to_socket.name in ('Base Color', 'Roughness', 'Normal', 'Metallic'): nt.links.remove(l)
        tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping')
        mp.inputs['Scale'].default_value = (1 / size, 1 / size, 1 / size)
        nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
        def img(kind, color):
            t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(os.path.join(PBR, f'{tex}_{kind}.jpg'), check_existing=True)
            t.image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'
            t.projection = 'BOX'; t.projection_blend = 0.25
            nt.links.new(mp.outputs['Vector'], t.inputs['Vector']); return t
        d, r, nm = img('diff', True), img('rough', False), img('nor', False)
        mix = nt.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1.0
        nt.links.new(d.outputs[0], mix.inputs['A']); mix.inputs['B'].default_value = (*tint, 1)
        # imperfezioni: macchie ampie e irregolari (pareti mai uniformi, legni e pavimenti consumati in modo diverso)
        LO, HI, SC = {'intonacoPT': (0.84, 1.05, 0.45), 'intonaco': (0.86, 1.05, 0.45), 'soffitto': (0.9, 1.03, 0.4),
                      'mattoni': (0.85, 1.08, 0.6), 'spina': (0.88, 1.06, 0.7), 'cotto': (0.86, 1.06, 0.7)}.get(n, (0.92, 1.05, 1.2))
        nz = nt.nodes.new('ShaderNodeTexNoise'); nz.inputs['Scale'].default_value = SC; nz.inputs['Detail'].default_value = 6
        nz.inputs['Roughness'].default_value = 0.62; nt.links.new(tc.outputs['Object'], nz.inputs['Vector'])
        mrg = nt.nodes.new('ShaderNodeMapRange'); mrg.inputs['From Min'].default_value = 0.32; mrg.inputs['From Max'].default_value = 0.68
        mrg.inputs['To Min'].default_value = LO; mrg.inputs['To Max'].default_value = HI; nt.links.new(nz.outputs['Fac'], mrg.inputs['Value'])
        mix2 = nt.nodes.new('ShaderNodeMix'); mix2.data_type = 'RGBA'; mix2.blend_type = 'MULTIPLY'; mix2.inputs['Factor'].default_value = 1.0
        nt.links.new(mix.outputs['Result'], mix2.inputs['A']); nt.links.new(mrg.outputs['Result'], mix2.inputs['B'])
        out_col = mix2.outputs['Result']
        if n in ('noce', 'noceTavolo', 'legnoSedia', 'scaffale', 'doghe', 'trave', 'gradino', 'paglia', 'lino'):   # ogni pezzo di legno ha il suo tono
            oi = nt.nodes.new('ShaderNodeObjectInfo'); mro = nt.nodes.new('ShaderNodeMapRange')
            mro.inputs['To Min'].default_value = 0.9; mro.inputs['To Max'].default_value = 1.1; nt.links.new(oi.outputs['Random'], mro.inputs['Value'])
            mix3 = nt.nodes.new('ShaderNodeMix'); mix3.data_type = 'RGBA'; mix3.blend_type = 'MULTIPLY'; mix3.inputs['Factor'].default_value = 1.0
            nt.links.new(out_col, mix3.inputs['A']); nt.links.new(mro.outputs['Result'], mix3.inputs['B']); out_col = mix3.outputs['Result']
        nt.links.new(out_col, P.inputs['Base Color'])
        if n in ('noceTavolo', 'marmo', 'laccaVerde', 'spina', 'gradino', 'noce', 'cotto'):   # aloni d'uso: zone piu' opache e piu' lucide
            nz2 = nt.nodes.new('ShaderNodeTexNoise'); nz2.inputs['Scale'].default_value = 4.0; nz2.inputs['Detail'].default_value = 3
            nt.links.new(tc.outputs['Object'], nz2.inputs['Vector'])
            mr2 = nt.nodes.new('ShaderNodeMapRange'); mr2.inputs['From Min'].default_value = 0.35; mr2.inputs['From Max'].default_value = 0.65
            mr2.inputs['To Min'].default_value = 0.75; mr2.inputs['To Max'].default_value = 1.35; nt.links.new(nz2.outputs['Fac'], mr2.inputs['Value'])
            rmul = nt.nodes.new('ShaderNodeMath'); rmul.operation = 'MULTIPLY'; nt.links.new(r.outputs[0], rmul.inputs[0]); nt.links.new(mr2.outputs['Result'], rmul.inputs[1])
            r = rmul
        if n in ('spina', 'gradino', 'noceTavolo'):   # parquet e legni a cera: meno specchiati
            mr = nt.nodes.new('ShaderNodeMath'); mr.operation = 'MULTIPLY_ADD'; mr.inputs[1].default_value = 0.9; mr.inputs[2].default_value = 0.22
            nt.links.new(r.outputs[0], mr.inputs[0]); nt.links.new(mr.outputs[0], P.inputs['Roughness'])
        else:
            nt.links.new(r.outputs[0], P.inputs['Roughness'])
        nmap = nt.nodes.new('ShaderNodeNormalMap'); nmap.inputs['Strength'].default_value = nstr
        nt.links.new(nm.outputs[0], nmap.inputs['Color'])
        if bev:
            bv = nt.nodes.new('ShaderNodeBevel'); bv.inputs['Radius'].default_value = bev; bv.samples = 6
            nt.links.new(nmap.outputs[0], bv.inputs['Normal']); nt.links.new(bv.outputs[0], P.inputs['Normal'])
        else:
            nt.links.new(nmap.outputs[0], P.inputs['Normal'])
        P.inputs['Metallic'].default_value = 0.0
        if n in ('noceTavolo', 'marmo', 'noce'): P.inputs['Coat Weight'].default_value = 0.25; P.inputs['Coat Roughness'].default_value = 0.12
    print('materiali fotografati applicati', flush=True)

if os.environ.get('OGGETTI') and PBR:
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import oggetti_veri as OV
    OV.costruisci(src, PBR)
    OV.tende(src, OV.materiali(PBR))
    OV.piante(src, os.environ.get('MODELLI', os.path.join(PBR, '..', 'models')))
    # solidi estrusi (banconi, piani cucina): normali coerenti, niente facce nere
    import bmesh as _bm
    for o in bpy.data.objects:
        if o.type == 'MESH' and o.active_material and base(o.active_material.name) in ('inox', 'laccato', 'ceramica', 'marmo', 'noce', 'cannettato', 'scaffale', 'ferro'):
            me = o.data
            for nm_ in [a.name for a in me.attributes if 'normal' in a.name.lower()]:
                try: me.attributes.remove(me.attributes[nm_])     # normali personalizzate importate dal glTF
                except Exception: pass
            b = _bm.new(); b.from_mesh(me); _bm.ops.remove_doubles(b, verts=b.verts, dist=1e-5); _bm.ops.recalc_face_normals(b, faces=b.faces); b.to_mesh(me); b.free()
            me.shade_flat()
            if base(o.active_material.name) in ('inox', 'laccato', 'ceramica'):   # piani sovrapposti alla stessa quota: sfalsati di frazioni di mm
                o.location.z += (sum(map(ord, o.name)) % 9) * 0.0004

if os.environ.get('CONTROLLO'):
    sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
    import controllo_scena as CS
    _C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))
    CS.run(src, os.environ['CONTROLLO'], _C, _C.inverted())
    sys.exit(0)

if os.environ.get('DEBUGPY'):   # script di diagnosi eseguito sulla scena completa
    exec(open(os.environ['DEBUGPY']).read(), dict(globals(), src=src))
    sys.exit(0)

# lampadine e globi: non fanno ombra alla luce puntiforme posta al loro interno
for o in bpy.data.objects:
    if o.type == 'MESH' and o.active_material and base(o.active_material.name) in ('lampadina', 'opale', 'vetro', 'calice'):
        o.visible_shadow = base(o.active_material.name) in ('vetro',)   # i vetri delle finestre fanno ombra (leggera)
        if base(o.active_material.name) in ('lampadina', 'opale'): o.visible_shadow = False

luci = json.load(open(os.path.join(src, 'luci.json')))
POW = {'sospensione': (44, 2700, 0.03), 'globo': (30, 3000, 0.09), 'applique': (14, 2900, 0.06), 'candela': (0.35, 1900, 0.008)}
for i, l in enumerate(luci):
    p = B(l['p'])
    if l['tipo'] == 'ambiente':
        cucina = l.get('col', 0) == 0xf4f1ea; servizio = l.get('col', 0) == 0xf6eee0
        d = bpy.data.lights.new(f'amb{i}', 'AREA'); d.shape = 'DISK'; d.size = 0.5 if servizio else 0.8
        d.energy = 160 if cucina else 30 if servizio else float(os.environ.get('RIEMPIMENTO', 5)); d.color = kelvin(4000 if cucina else 3500 if servizio else 3300)
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

if FOTO:
    sc.cycles.use_fast_gi = False; sc.cycles.diffuse_bounces = 4; sc.cycles.glossy_bounces = 6; sc.cycles.adaptive_threshold = 0.01
    sc.cycles.max_bounces = 16; sc.cycles.transmission_bounces = 14; sc.cycles.transparent_max_bounces = 16   # vetri spessi senza bordi neri
    for k in json.load(open(sys.argv[4])):
        out = os.path.join(dst, k['nome'] + '.png')
        if os.path.exists(out): continue
        x, y, z = k['p']; e = k.get('occhio', 1.6)
        P = Vector((x, -y, z + e)); L = Vector((k['look'][0], -k['look'][1], k['look'][2]))
        cam.location = P; cam.rotation_mode = 'QUATERNION'; cam.rotation_quaternion = (L - P).to_track_quat('-Z', 'Y')
        cd.lens = k.get('lente', 24)
        cd.dof.use_dof = True; cd.dof.focus_distance = (L - P).length; cd.dof.aperture_fstop = k.get('fuoco', 5.6)
        sc.view_settings.exposure = k.get('esposizione', 0.6)
        t = time.time(); sc.render.filepath = out
        bpy.ops.render.render(write_still=True)
        print(f"foto {k['nome']} {time.time() - t:.0f}s", flush=True)
    sys.exit(0)

for f in range(f0, min(f1, len(tour['pos']) - 1) + 1, step):
    out = os.path.join(dst, f'f{f:05d}.png')
    if os.path.exists(out): continue
    p, d = tour['pos'][f], tour['dir'][f]
    cam.location = B(p); cam.rotation_mode = 'QUATERNION'
    cam.rotation_quaternion = B(d).to_track_quat('-Z', 'Y')
    t = time.time(); sc.render.filepath = out
    bpy.ops.render.render(write_still=True)
    print(f'fotogramma {f} {time.time() - t:.1f}s', flush=True)
