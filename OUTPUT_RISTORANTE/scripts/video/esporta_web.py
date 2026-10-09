"""Esporta la scena fotografica (la stessa delle foto) per il 3D navigabile nel browser.
Eseguito da render_blender.py con WEBPY=questo file, dopo la costruzione completa (materiali fotografati, oggetti veri, luci).
  1. architettura e arredi fissi: uniti per materiale e piano; UV ripetute per le texture fotografate (proiezione a cubo,
     come nel render) + seconda UV per la luce; la luce di Cycles (diretta + rimbalzi) viene "cotta" in una lightmap
  2. oggetti fitti (sedie, basamenti, telai, tende, quadri): luce cotta sui vertici
  3. oggetti piccoli (coperti, bottiglie, piante, lampade): semplificati, condivisi (instancing), illuminati dall'ambiente
  4. due panorami HDR a 360 gradi (sala piano terra, sala interrato) per riflessi e luce degli oggetti piccoli
Uscite in WEB_DIR: scena.glb, web.json (materiali), lm/*.jpg, tx/*.jpg, env_*.hdr
Variabili: WEB_DIR, WEB_SPP (campioni di cottura, 96), WEB_DENS (pixel di lightmap per metro, 48)"""
import bpy, bmesh, os, json, math, time
import numpy as np
from mathutils import Vector
from PIL import Image

OUT = os.environ['WEB_DIR']; SPP = int(os.environ.get('WEB_SPP', 96)); DENS = float(os.environ.get('WEB_DENS', 48))
for d in ('lm', 'tx'): os.makedirs(os.path.join(OUT, d), exist_ok=True)
sc = bpy.context.scene; vl = bpy.context.view_layer
S_LM = 8.0      # scala di codifica della luce (valori 0..8 in jpg sRGB)
T0 = time.time()
def log(*a): print('WEB', f'{time.time() - T0:6.0f}s', *a, flush=True)
def bn(m): return m.name.split('.')[0] if m else ''

LIGHTMAP = {'spina', 'cotto', 'gres', 'cucina', 'intonacoPT', 'intonaco', 'soffitto', 'mattoni', 'metro', 'boiserie', 'facciata', 'cemento',
            'noce', 'noceTavolo', 'scaffale', 'doghe', 'trave', 'gradino', 'scalaCorpo', 'marmo', 'laccato', 'laccaVerde', 'ceramica',
            'cannettato', 'tavolo_servizio', 'zerbino', 'davanzale'}
VERTICI = {'legnoSedia', 'paglia', 'ghisa_vera', 'ghisa', 'ferro', 'tenda_lino', 'bronzo'}


def is_quadro(o):
    m = o.active_material
    return bool(m and m.name.startswith('misc') and m.node_tree and len(o.data.polygons) <= 4 and any(n.type == 'TEX_IMAGE' for n in m.node_tree.nodes))


def piano(o):
    bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
    return 'S1' if sum(v.z for v in bb) / 8 < -0.45 else 'PT'


def principled(m):
    return next((n for n in m.node_tree.nodes if n.type == 'BSDF_PRINCIPLED'), None) if m and m.node_tree else None


def unisci(objs, nome):
    bm = bmesh.new()
    for o in objs:
        me = o.data.copy(); me.transform(o.matrix_world)
        for a in [a.name for a in me.attributes if 'normal' in a.name.lower()]:
            try: me.attributes.remove(me.attributes[a])
            except Exception: pass
        bm.from_mesh(me); bpy.data.meshes.remove(me)
    me = bpy.data.meshes.new(nome); bm.to_mesh(me); bm.free()
    ob = bpy.data.objects.new(nome, me); sc.collection.objects.link(ob)
    for o in objs: bpy.data.objects.remove(o)
    return ob


def seleziona(o):
    for x in vl.objects: x.select_set(False)
    o.select_set(True); vl.objects.active = o


def uv_luce(o, margine=0.004):
    if not o.data.uv_layers: o.data.uv_layers.new(name='UVMap')   # la lightmap deve essere sempre la seconda mappa (TEXCOORD_1)
    uv = o.data.uv_layers.new(name='lm'); o.data.uv_layers.active = uv
    seleziona(o); bpy.ops.object.mode_set(mode='EDIT'); bpy.ops.mesh.select_all(action='SELECT')
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=margine)
    bpy.ops.object.mode_set(mode='OBJECT')


def uv_cubo(o, lato):
    """UV ripetute come la proiezione a cubo del render (coordinate mondo / lato della texture)"""
    me = o.data
    uv = me.uv_layers.get('UVMap') or me.uv_layers.new(name='UVMap')
    for p in me.polygons:
        n = p.normal; ax = max(range(3), key=lambda i: abs(n[i]))
        for li in p.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            a, b = [(1, 2), (0, 2), (0, 1)][ax]
            uv.data[li].uv = (v[a] / lato, v[b] / lato)
    # la prima mappa (texture) deve restare la prima, la lightmap la seconda
    me.uv_layers.active = uv


def salva_img(img, path, size=None):
    w, h = img.size
    if w == 0: return False
    px = np.array(img.pixels[:], np.float32).reshape(h, w, 4)[::-1]
    im = Image.fromarray((np.clip(px[..., :3], 0, 1) * 255).astype(np.uint8))
    if size: im = im.resize((size, size), Image.LANCZOS)
    im.save(path, quality=88); return True


def srgb(x):
    x = np.clip(x, 0, 1); return np.where(x <= 0.0031308, 12.92 * x, 1.055 * np.power(x, 1 / 2.4) - 0.055)


def sfoca_isole(px, mask, r=1):
    """riduce il rumore della cottura senza mescolare isole diverse (media pesata con la maschera)"""
    k = np.array([1, 2, 1], np.float32); k /= k.sum()
    def conv(a):
        for ax in (0, 1):
            a = sum(np.roll(a, i - 1, axis=ax) * k[i] for i in range(3))
        return a
    num, den = px * mask[..., None], mask.astype(np.float32)
    for _ in range(r): num, den = conv(num), conv(den)
    out = num / np.maximum(den, 1e-4)[..., None]
    return np.where(mask[..., None] > 0, out, px)


_DN = {}
def oidn(img):
    """denoiser di Blender (Intel Open Image Denoise, lo stesso delle foto) applicato a un'immagine, tramite il compositor"""
    if not _DN:
        s = bpy.data.scenes.new('_denoise'); s.render.engine = 'CYCLES'; s.render.use_compositing = True; s.render.resolution_percentage = 100
        ng = bpy.data.node_groups.new('_denoise', 'CompositorNodeTree'); s.compositing_node_group = ng
        ng.interface.new_socket('Image', in_out='OUTPUT', socket_type='NodeSocketColor')
        i = ng.nodes.new('CompositorNodeImage'); d = ng.nodes.new('CompositorNodeDenoise'); o = ng.nodes.new('NodeGroupOutput')
        ng.links.new(i.outputs['Image'], d.inputs['Image']); ng.links.new(d.outputs['Image'], o.inputs[0])
        s.render.image_settings.file_format = 'OPEN_EXR'; _DN.update(scena=s, nodo=i)
    s = _DN['scena']; _DN['nodo'].image = img
    s.render.resolution_x, s.render.resolution_y = img.size
    s.render.filepath = os.path.join(OUT, '_dn.exr')
    bpy.ops.render.render(write_still=True, scene=s.name)
    r = bpy.data.images.load(s.render.filepath); w, h = r.size
    px = np.array(r.pixels[:], np.float32).reshape(h, w, 4); bpy.data.images.remove(r); os.remove(s.render.filepath)
    return px


# ---------------------------------------------------------------- impostazioni di cottura
sc.render.engine = 'CYCLES'; cy = sc.cycles; cy.samples = SPP; cy.use_adaptive_sampling = False
cy.diffuse_bounces = 4; cy.max_bounces = 8; cy.glossy_bounces = 2; cy.transmission_bounces = 4
cy.use_fast_gi = False; cy.sample_clamp_indirect = 6
sc.render.bake.margin = 6; sc.render.bake.use_clear = True

spec = {'S_LM': S_LM, 'gruppi': {}, 'emissivi': {}, 'vertici': {}}
PBRMAP = globals().get('PBRMAP', {})

# ---------------------------------------------------------------- 1-2. gruppi per materiale e piano
gruppi = {}
for o in list(bpy.data.objects):
    if o.type != 'MESH' or not o.data.polygons or not o.active_material: continue
    n = bn(o.active_material)
    if n in LIGHTMAP or n in VERTICI:
        if o.data.users > 1: o.data = o.data.copy()
        gruppi.setdefault((n, piano(o)), []).append(o)
    elif is_quadro(o):
        if o.data.users > 1: o.data = o.data.copy()
        gruppi.setdefault(('quadro_' + o.name, piano(o)), [o])
log('gruppi', len(gruppi))

for (n, pz), objs in sorted(gruppi.items()):
    nome = f'{n}_{pz}'
    mat = objs[0].active_material
    quadro = n.startswith('quadro_')
    ob = objs[0] if quadro else unisci(objs, nome)
    if quadro: ob.name = nome
    ob.data.materials.clear(); ob.data.materials.append(mat)
    if n in ('legnoSedia', 'ghisa_vera', 'paglia'):   # geometrie fitte: semplificate prima della cottura (peso del file web)
        md = ob.modifiers.new('d', 'DECIMATE'); md.ratio = {'legnoSedia': 0.35, 'ghisa_vera': 0.4, 'paglia': 0.5}[n]
        seleziona(ob); bpy.ops.object.modifier_apply(modifier=md.name)
    area = sum(p.area for p in ob.data.polygons)
    vertici = n in VERTICI or quadro
    mfin = bpy.data.materials.new(('Wvc_' if vertici else 'Wlm_') + nome)   # vuoto: nel browser il materiale si ricostruisce da web.json
    P = principled(mat)
    col = list(P.inputs['Base Color'].default_value)[:3] if P else [0.7, 0.7, 0.7]
    rough = P.inputs['Roughness'].default_value if P else 0.6
    info = dict(materiale=n, piano=pz, area=round(area, 2), colore=[round(c, 4) for c in col], rugosita=round(rough, 3),
                metallo=round(P.inputs['Metallic'].default_value, 2) if P else 0)
    if n in PBRMAP:
        tex, lato, tinta, nstr, _ = PBRMAP[n]
        info.update(tex=tex, lato=lato, tinta=list(tinta), normale=nstr)
        if not vertici: uv_cubo(ob, lato)
        # tinta media della texture (per le superfici a luce sui vertici)
        im = Image.open(os.path.join(globals()['PBR'], f'{tex}_diff.jpg')).convert('RGB').resize((64, 64))
        a = (np.asarray(im, np.float32) / 255) ** 2.2
        info['colore'] = [round(float(a[..., i].mean() * tinta[i]), 4) for i in range(3)]
    else:   # immagini proprie (boiserie, quadri, facciata): si salvano
        img = next((nd.image for nd in mat.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image), None) if mat.node_tree else None
        if img is not None:
            f = f'tx/img_{nome}.jpg'
            if salva_img(img, os.path.join(OUT, f)): info['immagine'] = f
    if P: P.inputs['Metallic'].default_value = 0.0   # la cottura misura la luce diffusa: i metalli non ne avrebbero
    seleziona(ob)
    t = time.time()
    if vertici:
        ca = ob.data.color_attributes.new('luce', 'FLOAT_COLOR', 'CORNER'); ob.data.color_attributes.active_color = ca
        cy.samples = SPP * 4   # sui vertici non c'e' denoiser: piu' campioni (costano poco)
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, target='VERTEX_COLORS')
        cy.samples = SPP
        c = np.zeros(len(ca.data) * 4, np.float32); ca.data.foreach_get('color', c); c = c.reshape(-1, 4)
        c[:, :3] = np.clip(c[:, :3] / S_LM, 0, 1); c[:, 3] = 1; ca.data.foreach_set('color', c.ravel())
        info['luce'] = 'vertici'
    else:
        uv_luce(ob)
        res = int(min(2048, max(128, 2 ** math.ceil(math.log2(max(1, math.sqrt(area) * DENS * 1.4))))))
        img = bpy.data.images.new('lm_' + nome, res, res, float_buffer=True, alpha=True); img.generated_color = (0, 0, 0, 0)
        nt = mat.node_tree; node = nt.nodes.new('ShaderNodeTexImage'); node.image = img; nt.nodes.active = node
        bpy.ops.object.bake(type='DIFFUSE', pass_filter={'DIRECT', 'INDIRECT'}, target='IMAGE_TEXTURES', uv_layer='lm', margin=6)
        nt.nodes.remove(node)
        mask = np.array(img.pixels[:], np.float32).reshape(res, res, 4)[..., 3] > 0.5
        px = oidn(img)[..., :3]
        enc = (srgb(px / S_LM) * 255 + 0.5).astype(np.uint8)[::-1]
        f = f'lm/{nome}.jpg'; Image.fromarray(enc).save(os.path.join(OUT, f), quality=90)
        info.update(luce=f, res=res)
        bpy.data.images.remove(img)
    ob.data.materials.clear(); ob.data.materials.append(mfin)
    spec['gruppi'][mfin.name] = info
    log(nome, info.get('luce'), info.get('res', ''), f'{area:.1f} m2', f'{time.time() - t:.0f}s')

# ---------------------------------------------------------------- texture fotografate in formato web (tinta gia' applicata)
fatte = set()
for g in spec['gruppi'].values():
    tex = g.get('tex')
    if not tex or tex in fatte: continue
    fatte.add(tex)
    for kind, size in (('diff', 1024), ('nor', 1024), ('rough', 512)):
        Image.open(os.path.join(globals()['PBR'], f'{tex}_{kind}.jpg')).convert('RGB').resize((size, size), Image.LANCZOS).save(os.path.join(OUT, 'tx', f'{tex}_{kind}.jpg'), quality=86)

# ---------------------------------------------------------------- 3. oggetti piccoli: semplificati e materiali esportabili
fatti = set()
for o in bpy.data.objects:
    if o.type != 'MESH' or o.data.name in fatti: continue
    m = o.active_material
    if m and (m.name.startswith('Wlm_') or m.name.startswith('Wvc_')): continue
    fatti.add(o.data.name)
    tris = sum(len(p.vertices) - 2 for p in o.data.polygons)
    lim = 14000 if 'plant' in o.data.name or 'potted' in (m.name if m else '') else 1800
    if tris > lim:
        users = [x for x in bpy.data.objects if x.data == o.data]
        tmp = bpy.data.objects.new('_dec', o.data); sc.collection.objects.link(tmp)
        md = tmp.modifiers.new('d', 'DECIMATE'); md.ratio = max(0.04, lim / tris)
        dg = bpy.context.evaluated_depsgraph_get()
        new = bpy.data.meshes.new_from_object(tmp.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
        bpy.data.objects.remove(tmp)
        for x in users: x.data = new
for m in bpy.data.materials:   # materiali con nodi non esportabili: principled collegato direttamente, emissivi annotati
    if not m.node_tree or m.name.startswith(('Wlm_', 'Wvc_')): continue
    out = next((n for n in m.node_tree.nodes if n.type == 'OUTPUT_MATERIAL'), None)
    if not out or not out.inputs['Surface'].links: continue
    src_node = out.inputs['Surface'].links[0].from_node
    if src_node.type == 'EMISSION':
        c = list(src_node.inputs['Color'].default_value)[:3]; s = src_node.inputs['Strength'].default_value
        img = next((nd.image for nd in m.node_tree.nodes if nd.type == 'TEX_IMAGE' and nd.image), None)
        e = dict(colore=[round(x, 4) for x in c], forza=round(s, 3))
        if img is not None:
            f = f'tx/emit_{bn(m)}.jpg'
            if salva_img(img, os.path.join(OUT, f)): e['immagine'] = f
        spec['emissivi'][m.name] = e
    elif src_node.type != 'BSDF_PRINCIPLED':
        P = principled(m)
        if P: m.node_tree.links.new(P.outputs[0], out.inputs['Surface'])
    P = principled(m)
    if P and P.inputs['Emission Strength'].default_value > 0.5:
        spec['emissivi'][m.name] = dict(colore=[round(x, 4) for x in list(P.inputs['Emission Color'].default_value)[:3]], forza=round(P.inputs['Emission Strength'].default_value, 3))

os.makedirs(os.path.join(OUT, '_tmp'), exist_ok=True)
for img in bpy.data.images:   # immagini rimaste negli oggetti piccoli (etichette, piante, lino): al massimo 512 px
    if (img.size[0] > 512 or img.size[1] > 512) and img.filepath and os.path.exists(bpy.path.abspath(img.filepath)):
        p = os.path.join(OUT, '_tmp', os.path.basename(bpy.path.abspath(img.filepath)).rsplit('.', 1)[0] + '.jpg')
        im = Image.open(bpy.path.abspath(img.filepath)); im.thumbnail((512, 512)); im.convert('RGB').save(p, quality=85)
        img.filepath = p; img.reload()

# ---------------------------------------------------------------- 4. panorami HDR per riflessi e luce degli oggetti piccoli
cd = bpy.data.cameras.new('pano'); cd.type = 'PANO'
try: cd.panorama_type = 'EQUIRECTANGULAR'
except Exception: cd.cycles.panorama_type = 'EQUIRECTANGULAR'
cam = bpy.data.objects.new('pano', cd); sc.collection.objects.link(cam); sc.camera = cam
sc.render.resolution_x, sc.render.resolution_y, sc.render.resolution_percentage = 1024, 512, 100
cy.samples = 64; cy.use_denoising = True; sc.render.image_settings.file_format = 'HDR'
for nome, p in (('PT', (23.6, -3.6, 1.5)), ('S1', (23.2, -5.0, -1.6))):
    cam.location = p; cam.rotation_euler = (math.pi / 2, 0, -math.pi / 2)
    sc.render.filepath = os.path.join(OUT, f'env_{nome}.hdr'); bpy.ops.render.render(write_still=True)
    log('panorama', nome)
bpy.data.objects.remove(cam)

# ---------------------------------------------------------------- esportazione
for o in list(bpy.data.objects):
    if o.type != 'MESH': bpy.data.objects.remove(o)
json.dump(spec, open(os.path.join(OUT, 'web.json'), 'w'), indent=1)
opts = dict(filepath=os.path.join(OUT, 'scena.glb'), export_format='GLB', export_texcoords=True, export_normals=True,
            export_materials='EXPORT', export_yup=True, export_apply=False, export_cameras=False, export_lights=False,
            export_gpu_instances=True, export_vertex_color='ACTIVE', export_image_format='JPEG',
            export_draco_mesh_compression_enable=True, export_draco_mesh_compression_level=6)
while True:
    try: bpy.ops.export_scene.gltf(**opts); break
    except Exception as e:   # opzione non presente in questa versione (o Draco non disponibile): si toglie e si riprova
        bad = next((k for k in opts if k in str(e)), None) or ('export_draco_mesh_compression_enable' if 'export_draco_mesh_compression_enable' in opts else None)
        if not bad: raise
        log('opzione ignorata', bad, str(e)[:120]); opts.pop(bad); opts.pop('export_draco_mesh_compression_level', None) if 'draco' in bad else None
import shutil; shutil.rmtree(os.path.join(OUT, '_tmp'), ignore_errors=True)
log('fatto', os.path.getsize(opts['filepath']) // 1024, 'KB')
