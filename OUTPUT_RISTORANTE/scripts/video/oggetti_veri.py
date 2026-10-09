"""Oggetti dettagliati per le foto (Blender): sostituiscono quelli semplificati della vista web.
Bottiglie in vetro con spessore, vino, etichetta e capsula; calici e bicchieri con spessore; piatti in porcellana;
posate in acciaio; tovaglioli in lino; candele in cera; vasetti con un rametto; tende in lino alle vetrine.
Le posizioni arrivano da istanze.json (esportato dalla pagina: matrici mondo di three.js, asse y in alto).
Uso: dentro render_blender.py, con OGGETTI=1 e PBR=<cartella texture>."""
import bpy, bmesh, json, math, os, random
from mathutils import Matrix, Vector

C = Matrix(((1, 0, 0, 0), (0, 0, -1, 0), (0, 1, 0, 0), (0, 0, 0, 1)))    # three (x, y, z) -> Blender (x, -z, y)
CI = C.inverted()
COLL = None


def coll():
    global COLL
    if COLL is None:
        COLL = bpy.data.collections.new('oggetti_veri'); bpy.context.scene.collection.children.link(COLL)
    return COLL


def lathe(name, prof, segs=64):
    """profilo [(r, z)] ruotato attorno a z"""
    bm = bmesh.new()
    vs = [bm.verts.new((r, 0, z)) for r, z in prof]
    es = [bm.edges.new((vs[i], vs[i + 1])) for i in range(len(vs) - 1)]
    bmesh.ops.spin(bm, geom=vs + es, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=segs, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
    for p in me.polygons: p.use_smooth = True
    return me


def evaluated(me, mods):
    """applica modificatori a una mesh e restituisce la mesh risultante"""
    ob = bpy.data.objects.new('_tmp', me); bpy.context.scene.collection.objects.link(ob)
    for kind, opts in mods:
        md = ob.modifiers.new(kind, kind)
        for k, v in opts.items(): setattr(md, k, v)
    dg = bpy.context.evaluated_depsgraph_get()
    new = bpy.data.meshes.new_from_object(ob.evaluated_get(dg), preserve_all_data_layers=True, depsgraph=dg)
    bpy.data.objects.remove(ob)
    normali_fuori(new)
    for p in new.polygons: p.use_smooth = True
    new.name = me.name + '_m'
    return new


def normali_fuori(me):
    """normali rivolte verso l'esterno dei solidi chiusi (necessario per vetro e liquidi)"""
    bm = bmesh.new(); bm.from_mesh(me); bmesh.ops.recalc_face_normals(bm, faces=bm.faces); bm.to_mesh(me); bm.free()


def mat_principled(name, **kw):
    m = bpy.data.materials.new(name); m.use_nodes = True
    P = m.node_tree.nodes['Principled BSDF']
    for k, v in kw.items():
        P.inputs[k].default_value = v
    return m, P


def tex_node(m, path, color=True, scale=1.0):
    nt = m.node_tree
    tc = nt.nodes.new('ShaderNodeTexCoord'); mp = nt.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (scale,) * 3
    nt.links.new(tc.outputs['Object'], mp.inputs['Vector'])
    t = nt.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(path, check_existing=True)
    t.image.colorspace_settings.name = 'sRGB' if color else 'Non-Color'; t.projection = 'BOX'; t.projection_blend = 0.3
    nt.links.new(mp.outputs['Vector'], t.inputs['Vector'])
    return t


def materiali(pbr):
    M = {}
    M['vetro'], _ = mat_principled('vetro_vero', **{'Base Color': (1, 1, 1, 1), 'Transmission Weight': 1.0, 'Roughness': 0.0, 'IOR': 1.5})
    M['votivo'], _ = mat_principled('vetro_votivo', **{'Base Color': (1.0, 0.86, 0.66, 1), 'Transmission Weight': 1.0, 'Roughness': 0.28, 'IOR': 1.5})
    M['porcellana'], P = mat_principled('porcellana', **{'Base Color': (0.88, 0.87, 0.84, 1), 'Roughness': 0.12,
                                                        'Coat Weight': 1.0, 'Coat Roughness': 0.03, 'Subsurface Weight': 0.1})
    M['acciaio'], _ = mat_principled('acciaio', **{'Base Color': (0.82, 0.82, 0.8, 1), 'Metallic': 1.0, 'Roughness': 0.16, 'Anisotropic': 0.4})
    M['cera'], _ = mat_principled('cera', **{'Base Color': (0.93, 0.89, 0.8, 1), 'Roughness': 0.35, 'Subsurface Weight': 0.6})
    M['fiamma'] = bpy.data.materials.new('fiamma'); M['fiamma'].use_nodes = True
    nt = M['fiamma'].node_tree; nt.nodes.clear(); o = nt.nodes.new('ShaderNodeOutputMaterial'); e = nt.nodes.new('ShaderNodeEmission')
    e.inputs['Color'].default_value = (1.0, 0.55, 0.18, 1); e.inputs['Strength'].default_value = 25; nt.links.new(e.outputs[0], o.inputs[0])
    M['vino'], P = mat_principled('vino', **{'Base Color': (0.55, 0.03, 0.06, 1), 'Transmission Weight': 1.0, 'Roughness': 0.0, 'IOR': 1.34})
    nt = M['vino'].node_tree; va = nt.nodes.new('ShaderNodeVolumeAbsorption'); va.inputs['Color'].default_value = (0.5, 0.02, 0.05, 1)
    va.inputs['Density'].default_value = 60; nt.links.new(va.outputs[0], nt.nodes['Material Output'].inputs['Volume'])
    M['acqua'], _ = mat_principled('acqua', **{'Base Color': (1, 1, 1, 1), 'Transmission Weight': 1.0, 'Roughness': 0.0, 'IOR': 1.33})
    M['foglia'], _ = mat_principled('foglia', **{'Base Color': (0.16, 0.24, 0.12, 1), 'Roughness': 0.5, 'Subsurface Weight': 0.3})
    M['stelo'], _ = mat_principled('stelo', **{'Base Color': (0.25, 0.3, 0.15, 1), 'Roughness': 0.6})
    M['lino'], P = mat_principled('lino_vero', **{'Roughness': 0.85, 'Sheen Weight': 0.6})
    t = tex_node(M['lino'], os.path.join(pbr, 'rough_linen_diff.jpg'), True, 1 / 0.27)
    mix = M['lino'].node_tree.nodes.new('ShaderNodeMix'); mix.data_type = 'RGBA'; mix.blend_type = 'MULTIPLY'; mix.inputs['Factor'].default_value = 1
    M['lino'].node_tree.links.new(t.outputs[0], mix.inputs['A']); mix.inputs['B'].default_value = (0.62, 0.66, 0.55, 1)
    M['lino'].node_tree.links.new(mix.outputs['Result'], P.inputs['Base Color'])
    tn = tex_node(M['lino'], os.path.join(pbr, 'rough_linen_nor.jpg'), False, 1 / 0.27)
    nm = M['lino'].node_tree.nodes.new('ShaderNodeNormalMap'); M['lino'].node_tree.links.new(tn.outputs[0], nm.inputs['Color'])
    M['lino'].node_tree.links.new(nm.outputs[0], P.inputs['Normal'])
    M['tenda'], P = mat_principled('tenda_lino', **{'Base Color': (0.86, 0.82, 0.74, 1), 'Roughness': 0.9, 'Sheen Weight': 0.5,
                                                   'Transmission Weight': 0.0, 'Subsurface Weight': 0.0})
    nt = M['tenda'].node_tree; tr = nt.nodes.new('ShaderNodeBsdfTranslucent'); tr.inputs['Color'].default_value = (0.9, 0.8, 0.62, 1)
    mx = nt.nodes.new('ShaderNodeMixShader'); mx.inputs[0].default_value = 0.35
    nt.links.new(nt.nodes['Principled BSDF'].outputs[0], mx.inputs[1]); nt.links.new(tr.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], nt.nodes['Material Output'].inputs['Surface'])
    M['ottone'], _ = mat_principled('ottone_vero', **{'Base Color': (0.8, 0.6, 0.32, 1), 'Metallic': 1.0, 'Roughness': 0.25})
    return M


def etichette(n=8):
    """etichette di vino generiche (denominazioni, non marchi), carta avorio con caratteri da vino"""
    from PIL import Image, ImageDraw, ImageFont
    base = os.path.dirname(__file__); ft = os.path.join(base, 'fonts')
    big = ImageFont.truetype(os.path.join(ft, 'cormorant-garamond-latin-600-italic.woff'), 120)
    small = ImageFont.truetype(os.path.join(ft, 'karla-latin-600-normal.woff'), 34)
    nomi = [('Barolo', 'DOCG · 2016'), ('Chianti', 'CLASSICO'), ('Nebbiolo', 'LANGHE DOC'), ('Amarone', 'DELLA VALPOLICELLA'),
            ('Vermentino', 'DI SARDEGNA'), ('Barbera', "D'ALBA"), ('Lugana', 'DOC · 2022'), ('Primitivo', 'DI MANDURIA')]
    carte = [(236, 228, 208), (244, 238, 224), (228, 216, 190), (30, 30, 32), (240, 232, 214), (210, 196, 168), (248, 246, 240), (60, 22, 28)]
    out = []
    for i in range(n):
        W, H = 1024, 384; im = Image.new('RGB', (W, H), carte[i]); d = ImageDraw.Draw(im)
        ink = (40, 32, 26) if sum(carte[i]) > 300 else (214, 184, 120)
        rnd = random.Random(i)
        for _ in range(4000):   # grana della carta
            x, y = rnd.randrange(W), rnd.randrange(H); c = rnd.randint(-10, 10)
            im.putpixel((x, y), tuple(max(0, min(255, v + c)) for v in carte[i]))
        d.rectangle((28, 28, W - 28, H - 28), outline=ink, width=3)
        d.text((W / 2, H / 2 - 30), nomi[i][0], font=big, fill=ink, anchor='mm')
        d.text((W / 2, H / 2 + 80), nomi[i][1], font=small, fill=ink, anchor='mm')
        p = os.path.join(bpy.app.tempdir or '/tmp', f'etichetta_{i}.png'); im.save(p); out.append(p)
    return out


def prototipi(M, pbr):
    P = {}
    # calice da vino: vetro sottile 1,2 mm
    prof = [(0.0001, 0.0), (0.034, 0.0), (0.036, 0.002), (0.012, 0.006), (0.0035, 0.012), (0.003, 0.085), (0.008, 0.096),
            (0.03, 0.115), (0.042, 0.145), (0.043, 0.175), (0.039, 0.21), (0.037, 0.218)]
    P['calice'] = [(evaluated(lathe('calice', prof, 64), [('SOLIDIFY', dict(thickness=0.0012, offset=-1))]), M['vetro'])]
    # bicchiere / portacandela
    prof = [(0.0001, 0.0), (0.031, 0.0), (0.033, 0.004), (0.033, 0.075)]
    P['portacandela'] = [(evaluated(lathe('bicchiere', prof, 48), [('SOLIDIFY', dict(thickness=0.002, offset=-1))]), M['votivo'])]
    # piatto piano: fondo, tesa, bordo arrotondato
    prof = [(0.0001, 0.004), (0.07, 0.004), (0.075, 0.0), (0.082, 0.001), (0.095, 0.007), (0.12, 0.012), (0.133, 0.016), (0.137, 0.018)]
    P['piatto'] = [(evaluated(lathe('piatto', prof, 96), [('SOLIDIFY', dict(thickness=0.004, offset=1)), ('SUBSURF', dict(levels=1, render_levels=1))]), M['porcellana'])]
    # candela con stoppino e fiamma
    wax = lathe('cera', [(0.0001, 0.0), (0.0185, 0.0), (0.0185, 0.052), (0.016, 0.055), (0.004, 0.053), (0.0001, 0.054)], 40)
    flame = lathe('fiamma', [(0.0001, 0.06), (0.004, 0.066), (0.0045, 0.072), (0.002, 0.082), (0.0001, 0.088)], 16)
    P['candela'] = [(wax, M['cera']), (flame, M['fiamma'])]
    # vasetto in vetro con acqua e rametto
    vprof = [(0.0001, 0.0), (0.026, 0.0), (0.03, 0.03), (0.022, 0.08), (0.011, 0.11), (0.013, 0.125)]
    vas = evaluated(lathe('vasetto', vprof, 48), [('SOLIDIFY', dict(thickness=0.0025, offset=-1))])
    acq = lathe('acqua_vaso', [(0.0001, 0.003), (0.023, 0.003), (0.026, 0.03), (0.02, 0.07), (0.0001, 0.07)], 32)
    P['vasetto'] = [(vas, M['vetro']), (acq, M['acqua'])]
    # rametto: stelo + foglie lanceolate (tipo ulivo / rosmarino)
    bm = bmesh.new(); rnd = random.Random(3)
    def foglia(base, ang, tilt, L=0.03, Wd=0.006):
        ca, sa = math.cos(ang), math.sin(ang)
        pts = [(0, 0), (Wd, L * 0.4), (0, L), (-Wd, L * 0.4)]
        vv = []
        for px, py in pts:
            z = py * math.sin(tilt); r = py * math.cos(tilt)
            vv.append(bm.verts.new((base[0] + ca * r - sa * px, base[1] + sa * r + ca * px, base[2] + z)))
        bm.faces.new(vv)
    stem_pts = [(0, 0, 0), (0.004, 0.002, 0.08), (0.01, 0.0, 0.16)]
    for k in range(14):
        t = 0.25 + 0.75 * k / 13; b = (stem_pts[1][0] * t * 2 if t < 0.5 else 0.004 + (t - 0.5) * 0.012, 0.001, 0.16 * t)
        foglia(b, rnd.random() * math.tau, 0.6 + rnd.random() * 0.6)
    me = bpy.data.meshes.new('foglie'); bm.to_mesh(me); bm.free()
    cu = bpy.data.curves.new('stelo', 'CURVE'); cu.dimensions = '3D'; cu.bevel_depth = 0.0012
    sp = cu.splines.new('POLY'); sp.points.add(len(stem_pts) - 1)
    for i, p in enumerate(stem_pts): sp.points[i].co = (*p, 1)
    so = bpy.data.objects.new('_s', cu); bpy.context.scene.collection.objects.link(so)
    dg = bpy.context.evaluated_depsgraph_get(); stelo = bpy.data.meshes.new_from_object(so.evaluated_get(dg)); bpy.data.objects.remove(so)
    P['fiore'] = [(stelo, M['stelo']), (me, M['foglia'])]
    # tovagliolo piegato in lino: morbido, con pieghe leggere
    bm = bmesh.new(); bmesh.ops.create_cube(bm, size=1.0); bm.transform(Matrix.Diagonal((0.1, 0.17, 0.008, 1)))
    me = bpy.data.meshes.new('tovagliolo'); bm.to_mesh(me); bm.free()
    tx = bpy.data.textures.new('pieghe', 'CLOUDS'); tx.noise_scale = 0.03
    P['tovagliolo'] = [(evaluated(me, [('BEVEL', dict(width=0.003, segments=3)), ('SUBSURF', dict(levels=2, render_levels=2)),
                                       ('DISPLACE', dict(texture=tx, strength=0.0025, mid_level=0.5))]), M['lino'])]
    # posate: coltello e forchetta (profilo estruso, smussato, leggermente curvato)
    def piatta(name, outline, holes=()):
        bm = bmesh.new(); vs = [bm.verts.new((x, y, 0)) for x, y in outline]; f = bm.faces.new(vs)
        bmesh.ops.triangulate(bm, faces=[f])
        r = bmesh.ops.extrude_face_region(bm, geom=bm.faces[:]); top = [g for g in r['geom'] if isinstance(g, bmesh.types.BMVert)]
        bmesh.ops.translate(bm, verts=top, vec=(0, 0, 0.0022))
        for v in bm.verts:   # curvatura: punta e manico leggermente rialzati
            v.co.z += 0.12 * max(0, v.co.y - 0.04) ** 2 * 40 + 0.08 * max(0, -v.co.y - 0.06) ** 2 * 30
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        return evaluated(me, [('BEVEL', dict(width=0.0006, segments=2)), ('WEIGHTED_NORMAL', dict())])
    kn = [(-0.007, -0.105), (0.007, -0.105), (0.0075, -0.01), (0.009, 0.0), (0.0095, 0.06), (0.0075, 0.095), (0.002, 0.106),
          (-0.004, 0.1), (-0.0065, 0.04), (-0.0065, 0.0), (-0.0075, -0.01)]
    fk = [(-0.007, -0.095), (0.007, -0.095), (0.0075, -0.02), (0.004, 0.015), (0.011, 0.03), (0.0115, 0.092), (0.0085, 0.092),
          (0.0075, 0.05), (0.0045, 0.05), (0.0042, 0.094), (0.0012, 0.094), (0.0012, 0.05), (-0.0012, 0.05), (-0.0012, 0.094),
          (-0.0042, 0.094), (-0.0045, 0.05), (-0.0075, 0.05), (-0.0085, 0.092), (-0.0115, 0.092), (-0.011, 0.03), (-0.004, 0.015),
          (-0.0075, -0.02)]
    P['coltello'] = [(piatta('coltello', kn), M['acciaio'])]
    P['forchetta'] = [(piatta('forchetta', fk), M['acciaio'])]
    # bottiglia bordolese: vetro 3 mm, vino, etichetta, capsula
    bprof = [(0.0001, 0.012), (0.012, 0.004), (0.03, 0.0), (0.036, 0.004), (0.037, 0.02), (0.037, 0.2), (0.033, 0.225),
             (0.022, 0.245), (0.0145, 0.262), (0.0135, 0.3), (0.015, 0.302), (0.015, 0.31), (0.0125, 0.312)]
    glass = evaluated(lathe('bottiglia', bprof, 64), [('SOLIDIFY', dict(thickness=0.003, offset=-1))])
    vino = lathe('vino', [(0.0001, 0.015), (0.033, 0.006), (0.0335, 0.2), (0.03, 0.222), (0.0001, 0.222)], 40)
    caps = lathe('capsula', [(0.0001, 0.313), (0.0152, 0.313), (0.0152, 0.268), (0.0146, 0.262)], 40)
    lab = lathe('etichetta', [(0.0375, 0.055), (0.0375, 0.15)], 64)
    uv = lab.uv_layers.new(name='UVMap')
    for poly in lab.polygons:
        for li in poly.loop_indices:
            v = lab.vertices[lab.loops[li].vertex_index].co
            uv.data[li].uv = ((math.atan2(v.y, v.x) / math.tau) % 1.0, (v.z - 0.055) / 0.095)
    P['_bottiglia'] = dict(glass=glass, vino=vino, caps=caps, lab=lab)
    return P


def bottle_materials(M, labels):
    G = []
    for i, col in enumerate([(0.05, 0.16, 0.06), (0.02, 0.08, 0.03), (0.22, 0.12, 0.03), (0.6, 0.62, 0.5)]):
        m, _ = mat_principled(f'vetro_bottiglia_{i}', **{'Base Color': (*col, 1), 'Transmission Weight': 1.0, 'Roughness': 0.03, 'IOR': 1.5})
        G.append(m)
    L = []
    for i, p in enumerate(labels):
        m, Pn = mat_principled(f'etichetta_{i}', **{'Roughness': 0.7})
        t = m.node_tree.nodes.new('ShaderNodeTexImage'); t.image = bpy.data.images.load(p); t.extension = 'REPEAT'
        uvn = m.node_tree.nodes.new('ShaderNodeUVMap'); uvn.uv_map = 'UVMap'
        mp = m.node_tree.nodes.new('ShaderNodeMapping'); mp.inputs['Scale'].default_value = (2.2, 1, 1); mp.inputs['Location'].default_value = (-0.6, 0, 0)
        m.node_tree.links.new(uvn.outputs[0], mp.inputs['Vector']); m.node_tree.links.new(mp.outputs[0], t.inputs['Vector'])
        # l'etichetta copre circa meta' della circonferenza: fuori dal riquadro e' trasparente
        t.extension = 'CLIP'
        tr = m.node_tree.nodes.new('ShaderNodeBsdfTransparent'); mx = m.node_tree.nodes.new('ShaderNodeMixShader')
        m.node_tree.links.new(t.outputs['Alpha'], mx.inputs[0]); m.node_tree.links.new(tr.outputs[0], mx.inputs[1])
        m.node_tree.links.new(Pn.outputs[0], mx.inputs[2]); m.node_tree.links.new(mx.outputs[0], m.node_tree.nodes['Material Output'].inputs['Surface'])
        m.node_tree.links.new(t.outputs['Color'], Pn.inputs['Base Color'])
        L.append(m)
    K = []
    for i, col in enumerate([(0.35, 0.03, 0.06), (0.75, 0.6, 0.3), (0.05, 0.05, 0.05), (0.6, 0.6, 0.62)]):
        m, _ = mat_principled(f'capsula_{i}', **{'Base Color': (*col, 1), 'Metallic': 0.9, 'Roughness': 0.3}); K.append(m)
    return G, L, K


def place(name, parts, mw, coll_):
    for k, (me, mat) in enumerate(parts):
        ob = bpy.data.objects.new(f'{name}', me); ob.matrix_world = C @ mw @ CI
        ob.active_material = mat if me.materials == [] or True else None
        if len(ob.material_slots) == 0: me.materials.append(mat)
        coll_.objects.link(ob)


def matrix_from(e):
    m = e['m']   # three.js: colonne
    return Matrix(((m[0], m[4], m[8], m[12]), (m[1], m[5], m[9], m[13]), (m[2], m[6], m[10], m[14]), (m[3], m[7], m[11], m[15])))


def costruisci(dati_dir, pbr):
    ist = json.load(open(os.path.join(dati_dir, 'istanze.json')))
    M = materiali(pbr); P = prototipi(M, pbr)
    labels = etichette(); G, L, K = bottle_materials(M, labels)
    col = coll(); rnd = random.Random(11)
    for key in ('calice', 'portacandela', 'piatto', 'candela', 'vasetto', 'fiore', 'tovagliolo', 'coltello', 'forchetta'):
        for e in ist.get(key, []):
            mw = matrix_from(e)
            if key == 'fiore':   # il rametto nasce dal vasetto (la sfera del fiore era 14 cm sopra la base)
                mw = mw @ Matrix.Translation((0, -0.07, 0)) @ Matrix.Rotation(rnd.uniform(-0.25, 0.25), 4, 'Z')
            parts = P[key]
            for me, mat in parts:
                if not me.materials: me.materials.append(mat)
            flip = Matrix.Diagonal((1, -1, 1, 1)) if key in ('coltello', 'forchetta') else Matrix.Identity(4)   # rebbi e punta verso il centro del tavolo
            for me, mat in parts:
                ob = bpy.data.objects.new(key, me); ob.matrix_world = C @ mw @ CI @ flip; col.objects.link(ob)
    # caraffe in vetrina: bottiglia in vetro chiaro senza etichetta
    B = P['_bottiglia']
    for e in ist.get('caraffa', []):
        ob = bpy.data.objects.new('caraffa', B['glass'].copy()); ob.data.materials.clear(); ob.data.materials.append(M['vetro'])
        ob.matrix_world = C @ matrix_from(e) @ CI; col.objects.link(ob)
    # bottiglie di vino: varianti di vetro, etichetta e capsula condivise
    variants = {}
    for gi in range(len(G)):
        g = B['glass'].copy(); g.materials.clear(); g.materials.append(G[gi]); variants[('g', gi)] = g
    for li in range(len(L)):
        l = B['lab'].copy(); l.materials.clear(); l.materials.append(L[li]); variants[('l', li)] = l
    for ki in range(len(K)):
        c = B['caps'].copy(); c.materials.clear(); c.materials.append(K[ki]); variants[('k', ki)] = c
    vino = B['vino']; vino.materials.clear(); vino.materials.append(M['vino'])
    for e in ist.get('bottiglia', []):
        c = e.get('c', (0.1, 0.2, 0.1)); lum = sum(c) / 3
        gi = 3 if lum > 0.45 else (2 if c[0] > c[1] * 1.3 else (0 if c[1] > 0.2 else 1))
        mw = C @ matrix_from(e) @ CI
        for part in (variants[('g', gi)], variants[('l', rnd.randrange(len(L)))], variants[('k', rnd.randrange(len(K)))]) + ((vino,) if gi < 3 else ()):
            ob = bpy.data.objects.new('bottiglia', part); ob.matrix_world = mw; col.objects.link(ob)
    print('oggetti veri:', {k: len(v) for k, v in ist.items()}, flush=True)


def tende(dati_dir, M):
    """tende a mezza altezza (brise-bise) in lino alle vetrine del piano terra, su bacchetta in ottone"""
    D = json.load(open(os.path.join(dati_dir, 'vista3d_pro_dati.json')))
    col = coll()
    for x1, y1, x2, y2, zb, zt, kind in D['floors']['PT']['glass']:
        if kind != 'win': continue
        L = math.hypot(x2 - x1, y2 - y1); dx, dy = (x2 - x1) / L, (y2 - y1) / L
        nx, ny = -dy, dx
        if nx > 0: nx, ny = -nx, -ny          # verso l'interno (la facciata e' a est)
        o = 0.09; h0, h1 = zb + 0.02, zb + 1.0
        n = max(8, int(L / 0.012)); bm = bmesh.new(); rows = []
        for j in range(2):
            row = []
            for i in range(n + 1):
                t = i / n; w = math.sin(t * L / 0.11 * math.tau) * 0.018
                px, py = x1 + dx * L * t + nx * (o + w), y1 + dy * L * t + ny * (o + w)
                row.append(bm.verts.new((px, -py, h0 if j == 0 else h1)))
            rows.append(row)
        for i in range(n): bm.faces.new((rows[0][i], rows[0][i + 1], rows[1][i + 1], rows[1][i]))
        me = bpy.data.meshes.new('tenda'); bm.to_mesh(me); bm.free()
        for p in me.polygons: p.use_smooth = True
        me.materials.append(M['tenda']); ob = bpy.data.objects.new('tenda', me); col.objects.link(ob)
        rod = bpy.data.meshes.new('bacchetta'); bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.006, radius2=0.006, depth=L)
        bm.to_mesh(rod); bm.free(); rod.materials.append(M['ottone'])
        rb = bpy.data.objects.new('bacchetta', rod); col.objects.link(rb)
        mx, my = (x1 + x2) / 2 + nx * o, (y1 + y2) / 2 + ny * o
        rb.location = (mx, -my, h1 + 0.01); rb.rotation_euler = (math.pi / 2, 0, math.atan2(-dy, dx) + math.pi / 2)
