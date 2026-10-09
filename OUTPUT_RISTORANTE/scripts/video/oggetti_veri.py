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


def a_terra(me):
    """sposta la mesh in modo che il punto piu' basso tocchi z = 0 (appoggio esatto, niente oggetti sospesi)"""
    z = min(v.co.z for v in me.vertices)
    for v in me.vertices: v.co.z -= z
    return me


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


def ombra_trasparente(m, tinta=(0.92, 0.92, 0.9, 1)):
    """vetro e liquidi: i raggi d'ombra attraversano il materiale (senza caustiche il vetro farebbe un'ombra nera piena)"""
    nt = m.node_tree; out = nt.nodes['Material Output']
    src = out.inputs['Surface'].links[0].from_socket
    lp = nt.nodes.new('ShaderNodeLightPath'); tr = nt.nodes.new('ShaderNodeBsdfTransparent'); tr.inputs['Color'].default_value = tinta
    mx = nt.nodes.new('ShaderNodeMixShader')
    nt.links.new(lp.outputs['Is Shadow Ray'], mx.inputs[0]); nt.links.new(src, mx.inputs[1]); nt.links.new(tr.outputs[0], mx.inputs[2])
    nt.links.new(mx.outputs[0], out.inputs['Surface'])


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
    M['ghisa'], _ = mat_principled('ghisa_vera', **{'Base Color': (0.035, 0.033, 0.03, 1), 'Metallic': 0.7, 'Roughness': 0.55})
    M['smalto_verde'], _ = mat_principled('smalto_verde', **{'Base Color': (0.05, 0.11, 0.075, 1), 'Roughness': 0.25, 'Coat Weight': 0.8, 'Coat Roughness': 0.1})
    M['smalto_bianco'], _ = mat_principled('smalto_bianco', **{'Base Color': (0.9, 0.88, 0.84, 1), 'Roughness': 0.2,
                                                              'Emission Color': (1.0, 0.85, 0.65, 1), 'Emission Strength': 0.6})
    M['globo'], _ = mat_principled('globo_lampadina', **{'Base Color': (1, 1, 1, 1), 'Roughness': 0.35, 'Transmission Weight': 1.0,
                                                         'Emission Color': (1.0, 0.8, 0.55, 1), 'Emission Strength': 18})
    M['ottone'], _ = mat_principled('ottone_vero', **{'Base Color': (0.8, 0.6, 0.32, 1), 'Metallic': 1.0, 'Roughness': 0.25})
    ombra_trasparente(M['vetro']); ombra_trasparente(M['acqua']); ombra_trasparente(M['votivo'], (0.95, 0.8, 0.6, 1))
    ombra_trasparente(M['vino'], (0.45, 0.05, 0.07, 1))
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
    P['calice'] = [(a_terra(evaluated(lathe('calice', prof, 64), [('SOLIDIFY', dict(thickness=0.0012, offset=-1))])), M['vetro'])]
    # bicchiere / portacandela
    prof = [(0.0001, 0.0), (0.031, 0.0), (0.033, 0.004), (0.033, 0.075)]
    P['portacandela'] = [(a_terra(evaluated(lathe('bicchiere', prof, 48), [('SOLIDIFY', dict(thickness=0.002, offset=-1))])), M['votivo'])]
    # piatto piano: fondo, tesa, bordo arrotondato
    prof = [(0.0001, 0.004), (0.07, 0.004), (0.075, 0.0), (0.082, 0.001), (0.095, 0.007), (0.12, 0.012), (0.133, 0.016), (0.137, 0.018)]
    P['piatto'] = [(a_terra(evaluated(lathe('piatto', prof, 96), [('SOLIDIFY', dict(thickness=0.004, offset=1)), ('SUBSURF', dict(levels=1, render_levels=1))])), M['porcellana'])]
    # candela con stoppino e fiamma
    wax = lathe('cera', [(0.0001, 0.0), (0.0185, 0.0), (0.0185, 0.052), (0.016, 0.055), (0.004, 0.053), (0.0001, 0.054)], 40)
    flame = lathe('fiamma', [(0.0001, 0.06), (0.004, 0.066), (0.0045, 0.072), (0.002, 0.082), (0.0001, 0.088)], 16)
    P['candela'] = [(wax, M['cera']), (flame, M['fiamma'])]
    # vasetto in vetro con acqua e rametto
    vprof = [(0.0001, 0.0), (0.026, 0.0), (0.03, 0.03), (0.022, 0.08), (0.011, 0.11), (0.013, 0.125)]
    vas = a_terra(evaluated(lathe('vasetto', vprof, 48), [('SOLIDIFY', dict(thickness=0.0025, offset=-1))]))
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
    # tovagliolo in lino piegato in tre: sottile, angoli morbidi, pieghe e leggero rigonfiamento
    bm = bmesh.new(); bmesh.ops.create_grid(bm, x_segments=24, y_segments=40, size=0.5)
    for v in bm.verts:
        x, y = v.co.x * 0.105, v.co.y * 0.18
        z = 0.0035 * math.exp(-((x / 0.04) ** 2)) + 0.0012 * math.sin(y * 55 + x * 20) + 0.004 * (abs(y) > 0.082) * (abs(y) - 0.082) / 0.008
        v.co = Vector((x, y, min(z, 0.006) - 0.005))
    me = bpy.data.meshes.new('tovagliolo'); bm.to_mesh(me); bm.free()
    P['tovagliolo'] = [(evaluated(me, [('SOLIDIFY', dict(thickness=0.003, offset=0)), ('SUBSURF', dict(levels=1, render_levels=1))]), M['lino'])]
    # posate in acciaio: sezioni ellittiche lungo l'asse (manico pieno e arrotondato, lama sottile, rebbi curvi)
    def loft(name, sections, n=12, close=True):
        """sections: [(y, larghezza, spessore, dx, dz)]; sezione a superellisse"""
        bm = bmesh.new(); rings = []
        for y, w, t, dx, dz in sections:
            ring = []
            for k in range(n):
                a = k / n * math.tau; c, s_ = math.cos(a), math.sin(a)
                px = dx + w / 2 * math.copysign(abs(c) ** 0.6, c); pz = dz + t / 2 * math.copysign(abs(s_) ** 0.8, s_)
                ring.append(bm.verts.new((px, y, pz)))
            rings.append(ring)
        for r0, r1 in zip(rings[:-1], rings[1:]):
            for k in range(n): bm.faces.new((r0[k], r0[(k + 1) % n], r1[(k + 1) % n], r1[k]))
        if close: bm.faces.new(rings[0][::-1]); bm.faces.new(rings[-1])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        for pl in me.polygons: pl.use_smooth = True
        return me
    def arc(y):   # curvatura longitudinale: manico che si alza in fondo, punta leggermente rialzata
        return 0.004 * max(0, -y - 0.03) ** 2 / 0.005 + 0.0025 * max(0, y - 0.03) ** 2 / 0.005
    # posate come quelle vere: un unico pezzo tranciato da lamiera (sagoma in pianta), spessore variabile, poi curvato
    def sagoma(name, contorno, spess, piega, passo=0.003):
        """contorno: punti (x, y) in senso antiorario; spess(x, y) -> spessore; piega(x, y) -> sollevamento z"""
        bm = bmesh.new()
        vs = [bm.verts.new((x, y, 0)) for x, y in contorno]
        f = bm.faces.new(vs)
        ext = bmesh.ops.extrude_face_region(bm, geom=[f])
        top = [e for e in ext['geom'] if isinstance(e, bmesh.types.BMVert)]
        for v in top: v.co.z = 1.0
        ys = [p[1] for p in contorno]; xs = [p[0] for p in contorno]
        y = min(ys) + passo
        while y < max(ys):
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(0, y, 0), plane_no=(0, 1, 0)); y += passo
        x = min(xs) + 0.0015
        while x < max(xs):
            bmesh.ops.bisect_plane(bm, geom=bm.verts[:] + bm.edges[:] + bm.faces[:], plane_co=(x, 0, 0), plane_no=(1, 0, 0)); x += 0.0015
        for v in bm.verts:
            v.co.z = v.co.z * spess(v.co.x, v.co.y)
        bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=0.00012)
        bmesh.ops.dissolve_degenerate(bm, dist=0.00005, edges=bm.edges)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        me = bpy.data.meshes.new(name); bm.to_mesh(me); bm.free()
        me = evaluated(me, [('BEVEL', dict(width=0.00035, segments=2, limit_method='ANGLE', angle_limit=math.radians(50)))])
        for v in me.vertices:
            v.co.z += piega(v.co.x, v.co.y)
        for pl in me.polygons: pl.use_smooth = True
        try: me.set_sharp_from_angle(angle=math.radians(48))
        except Exception: pass
        return me

    def lato(prof):   # profilo destro [(y, mezza larghezza)] -> contorno simmetrico chiuso
        return [(w, y) for y, w in prof] + [(-w, y) for y, w in reversed(prof)]

    def mezza(prof, y):
        for (y0, w0), (y1, w1) in zip(prof[:-1], prof[1:]):
            if y0 <= y <= y1: return w0 + (w1 - w0) * (y - y0) / max(1e-9, y1 - y0)
        return prof[-1][1]

    # forchetta 19 cm: manico a spatola arrotondato, collo 7 mm, paletta 25 mm, 4 rebbi da 4.5 mm (fessure 2 mm, 40 mm)
    mf = [(-0.098, 0.0)] + [(-0.098 + 0.009 * (1 - math.cos(a * math.pi / 2)), 0.0115 * math.sin(a * math.pi / 2)) for a in (0.25, 0.5, 0.75, 1.0)][0:4]
    mf += [(-0.07, 0.0118), (-0.045, 0.0102), (-0.02, 0.0072), (0.0, 0.0042), (0.012, 0.0036), (0.024, 0.0062), (0.036, 0.0108), (0.046, 0.0124)]
    ylo, yhi = 0.048, 0.090
    W, G = 0.0047, 0.0021; xs0 = -(4 * W + 3 * G) / 2
    destro = [(w, y) for y, w in mf]
    rebbi = []   # dalla destra alla sinistra, sopra la paletta
    for j in reversed(range(4)):
        a, b = xs0 + j * (W + G), xs0 + j * (W + G) + W
        tip = yhi - 0.0012 * abs(j - 1.5)
        rebbi += ([(b, ylo)] if j == 3 else []) + [(b, tip - 0.003), (b - W * 0.2, tip - 0.0006), ((a + b) / 2, tip), (a + W * 0.2, tip - 0.0006), (a, tip - 0.003)]
        if j > 0: rebbi += [(a, ylo + 0.0012), (a - G / 2, ylo - 0.0003), (a - G, ylo + 0.0012)]
    rebbi[0] = (xs0 + 4 * W + 3 * G, ylo); rebbi = [(0.0124, ylo - 0.0005)] + rebbi[1:]
    sinistro = [(-w, y) for y, w in reversed(mf)]
    cont = destro[1:] + rebbi + [(-0.0124, ylo - 0.0005)] + sinistro[:-1]
    cont = [(0.0, -0.098)] + cont

    def sp_f(x, y):
        if y < 0.0:   # manico: 3 mm al centro, bordo arrotondato
            hw = mezza(mf, y) or 0.001
            return 0.0018 + 0.0012 * math.sqrt(max(0, 1 - (x / hw) ** 2)) * (1 - 0.3 * max(0, (y + 0.06) / 0.06))
        return 0.0021 - 0.0005 * min(1, max(0, (y - 0.04) / 0.05))

    def piega_f(x, y):
        z = 0.004 * max(0, -y - 0.03) ** 2 / 0.005 + 0.0022 * max(0, y - 0.025) ** 2 / 0.004
        if y > 0.02: z += 0.0016 * (x / 0.0125) ** 2 * min(1, (y - 0.02) / 0.02)   # paletta leggermente concava
        return z
    P['forchetta'] = [(sagoma('forchetta', cont, sp_f, piega_f), M['acciaio'])]

    # coltello da tavola 21 cm: manico pieno ovale 5 mm, ghiera stretta, lama piatta 2 mm che si assottiglia verso il filo, punta tonda
    hk = [(-0.108, 0.0), (-0.1065, 0.0055), (-0.103, 0.0085), (-0.097, 0.0097), (-0.06, 0.0095), (-0.02, 0.0078), (-0.004, 0.0062), (0.002, 0.0052)]
    destra = [(w, y) for y, w in hk]   # lato destro (+x) = dorso, dritto
    dorso = [(0.0052, 0.01), (0.0058, 0.03), (0.0060, 0.06), (0.0056, 0.085), (0.0045, 0.098), (0.0028, 0.105), (0.0008, 0.1085)]
    filo = [(-0.0016, 0.1088), (-0.0042, 0.1065), (-0.0068, 0.101), (-0.0092, 0.09), (-0.0108, 0.07), (-0.0112, 0.045), (-0.0104, 0.02), (-0.0078, 0.008), (-0.0052, 0.002)]
    sinistra = [(-w, y) for y, w in reversed(hk)]
    contk = [(0.0, -0.108)] + destra[1:] + dorso + filo + sinistra[1:-1]

    def sp_k(x, y):
        if y < 0.0:
            hw = mezza(hk, y) or 0.001
            return 0.0024 + 0.0026 * math.sqrt(max(0, 1 - (x / hw) ** 2))
        if y < 0.008: return 0.0035 - 0.0015 * y / 0.008
        u = min(1, max(0, (0.0058 - x) / 0.017))   # dal dorso (2 mm) al filo (0.5 mm)
        return 0.002 - 0.0015 * u ** 1.5

    def piega_k(x, y):
        return 0.0045 * max(0, -y - 0.03) ** 2 / 0.005 + 0.001 * max(0, y - 0.05) ** 2 / 0.003
    P['coltello'] = [(sagoma('coltello', contk, sp_k, piega_k), M['acciaio'])]
    # basamento del tavolo in ghisa tornita
    P['base'] = [(lathe('base_tavolo', [(0.0001, 0.0), (0.215, 0.0), (0.222, 0.004), (0.22, 0.012), (0.2, 0.018), (0.12, 0.03), (0.07, 0.045),
                                         (0.05, 0.07), (0.042, 0.1), (0.036, 0.12), (0.034, 0.62), (0.04, 0.66), (0.06, 0.69), (0.12, 0.708),
                                         (0.12, 0.723), (0.0001, 0.723)], 64), M['ghisa'])]
    # lampada a sospensione: cupola smaltata verde fuori e bianca dentro, bordo arrotolato, cappuccio in ottone, lampadina a globo
    prof = [(0.025, 0.2), (0.04, 0.19), (0.1, 0.12), (0.16, 0.03), (0.175, 0.0)]
    out = evaluated(lathe('paralume_est', prof, 96), [('SOLIDIFY', dict(thickness=0.0012, offset=1))])
    inn = lathe('paralume_int', [(r - 0.0015, z) for r, z in prof], 96)
    rim = lathe('paralume_bordo', [(0.175 + 0.003 * math.cos(a), 0.0 + 0.003 * math.sin(a)) for a in [k / 12 * math.tau for k in range(13)]], 96)
    cap = lathe('paralume_cappuccio', [(0.0001, 0.245), (0.016, 0.245), (0.018, 0.235), (0.03, 0.2), (0.03, 0.185), (0.0001, 0.185)], 48)
    bulb = lathe('globo', [(0.045 * math.sin(a), 0.06 + 0.045 * math.cos(a)) for a in [k / 24 * math.pi for k in range(25)]] + [(0.012, 0.11), (0.012, 0.13)], 48)
    P['paralume'] = [(out, M['smalto_verde']), (inn, M['smalto_bianco']), (rim, M['smalto_verde']), (cap, M['ottone']), (bulb, M['globo'])]
    # bottiglia bordolese: vetro 3 mm, vino, etichetta, capsula
    bprof = [(0.0001, 0.012), (0.012, 0.004), (0.03, 0.0), (0.036, 0.004), (0.037, 0.02), (0.037, 0.2), (0.033, 0.225),
             (0.022, 0.245), (0.0145, 0.262), (0.0135, 0.3), (0.015, 0.302), (0.015, 0.31), (0.0125, 0.312)]
    glass = a_terra(evaluated(lathe('bottiglia', bprof, 64), [('SOLIDIFY', dict(thickness=0.003, offset=-1))]))
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
        ombra_trasparente(m, (*[c * 0.7 for c in col], 1)); G.append(m)
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
    for key in ('calice', 'portacandela', 'piatto', 'candela', 'vasetto', 'fiore', 'tovagliolo', 'coltello', 'forchetta', 'base', 'paralume'):
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
                if mat is M.get('globo'): ob.visible_shadow = False   # la luce puntiforme e' dentro il globo
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
    altre = forme_bar(M, G)
    for e in ist.get('bottiglia', []):
        c = e.get('c', (0.1, 0.2, 0.1)); lum = sum(c) / 3
        gi = 3 if lum > 0.45 else (2 if c[0] > c[1] * 1.3 else (0 if c[1] > 0.2 else 1))
        mw = C @ matrix_from(e) @ CI
        in_piedi = abs(mw.to_3x3() @ Vector((0, 0, 1)) @ Vector((0, 0, 1))) > 0.9
        if in_piedi and rnd.random() < 0.7:   # bottigliera: amari, vermouth, gin, grappe in vetri e forme diverse
            forma = altre[rnd.randrange(len(altre))]
            for part in forma + [variants[('l', rnd.randrange(len(L)))]]:
                ob = bpy.data.objects.new('bottiglia_bar', part); ob.matrix_world = mw @ Matrix.Diagonal((1, 1, 0.85 + rnd.random() * 0.3, 1)); col.objects.link(ob)
            continue
        for part in (variants[('g', gi)], variants[('l', rnd.randrange(len(L)))], variants[('k', rnd.randrange(len(K)))]) + ((vino,) if gi < 3 else ()):
            ob = bpy.data.objects.new('bottiglia', part); ob.matrix_world = mw; col.objects.link(ob)
    print('oggetti veri:', {k: len(v) for k, v in ist.items()}, flush=True)


def forme_bar(M, G):
    """bottiglie da liquore: renana alta, fiaschetta tonda, collo corto, con liquidi ambrati e chiari"""
    liq = []
    for col in [(0.8, 0.45, 0.1), (0.95, 0.9, 0.75), (0.35, 0.08, 0.04), (0.6, 0.65, 0.3)]:
        m, Pn = mat_principled('liquore', **{'Base Color': (*col, 1), 'Transmission Weight': 1.0, 'Roughness': 0.0, 'IOR': 1.36}); liq.append(m)
    shapes = [
        [(0.0001, 0.008), (0.03, 0.0), (0.033, 0.01), (0.033, 0.19), (0.026, 0.23), (0.013, 0.27), (0.012, 0.34), (0.014, 0.345)],
        [(0.0001, 0.008), (0.045, 0.0), (0.05, 0.03), (0.05, 0.14), (0.04, 0.17), (0.016, 0.19), (0.015, 0.23), (0.018, 0.235)],
        [(0.0001, 0.008), (0.038, 0.0), (0.04, 0.01), (0.04, 0.2), (0.037, 0.215), (0.02, 0.225), (0.019, 0.25), (0.022, 0.255)],
    ]
    out = []
    for i, prof in enumerate(shapes):
        g = a_terra(evaluated(lathe(f'bar{i}', prof, 56), [('SOLIDIFY', dict(thickness=0.003, offset=-1))]))
        gm = [G[3], G[2], G[0]][i]; g.materials.append(gm)
        top = prof[-3][1] - 0.01
        l = lathe(f'bar_liq{i}', [(0.0001, 0.012), (prof[2][0] - 0.004, 0.006), (prof[2][0] - 0.004, top * 0.85), (0.0001, top * 0.85)], 40)
        l.materials.append(liq[i % len(liq)])
        tappo = lathe(f'tappo{i}', [(0.0001, prof[-1][1] + 0.025), (prof[-1][0] + 0.002, prof[-1][1] + 0.025), (prof[-1][0] + 0.002, prof[-1][1] - 0.005)], 24)
        tappo.materials.append(M['ottone'] if i != 1 else M['ghisa'])
        out.append([g, l, tappo])
    return out


def piante(dati_dir, pbr_models):
    """piante vere (Poly Haven, CC0) al posto di quelle semplificate: vasetti sui davanzali e grandi vasi all'ingresso"""
    ist = json.load(open(os.path.join(dati_dir, 'istanze.json')))
    def carica(nome):
        before = set(bpy.data.objects)
        bpy.ops.import_scene.gltf(filepath=os.path.join(pbr_models, nome, nome + '.gltf'))
        obs = [o for o in bpy.data.objects if o not in before]
        for o in obs:
            for c in o.users_collection: c.objects.unlink(o)
        return obs
    def altezza(obs):
        zs = [ (o.matrix_world @ Vector(v)).z for o in obs if o.type == 'MESH' for v in o.bound_box]
        return max(zs) - min(zs), min(zs)
    proto = {n: carica(n) for n in ('potted_plant_01', 'potted_plant_02', 'potted_plant_04')}
    col = coll(); rnd = random.Random(5)
    def metti(nome, mw, h_target):
        obs = proto[nome]; h, z0 = altezza(obs); s_ = h_target / max(h, 1e-3)
        for o in obs:
            if o.type != 'MESH': continue
            ob = bpy.data.objects.new(o.name + '_c', o.data)
            ob.matrix_world = mw @ Matrix.Rotation(rnd.random() * math.tau, 4, 'Z') @ Matrix.Scale(s_, 4) @ Matrix.Translation((0, 0, -z0)) @ o.matrix_world
            col.objects.link(ob)
    for i, e in enumerate(ist.get('vasino', [])):
        metti(['potted_plant_04', 'potted_plant_02'][i % 2], C @ matrix_from(e) @ CI, 0.26)
    for e in ist.get('vaso_grande', []):
        metti('potted_plant_01', C @ matrix_from(e) @ CI, 1.25)


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
        n = max(8, int(L / 0.008)); bm = bmesh.new(); rows = []
        rnd = random.Random(int(L * 1000)); ph1, ph2 = rnd.random() * 6, rnd.random() * 6
        hs = [h0, h0 + 0.035, h0 + 0.045, (h0 + h1) / 2, h1 - 0.03, h1]          # orlo cucito in basso, arricciatura in alto
        for j, hz in enumerate(hs):
            row = []
            gather = 1.0 if j < len(hs) - 2 else 1.25
            for i in range(n + 1):
                t = i / n
                w = (0.016 * math.sin(t * L / 0.11 * math.tau + ph1) + 0.006 * math.sin(t * L / 0.043 * math.tau + ph2)) * gather
                w *= 1.0 - 0.25 * (j == len(hs) - 1)
                px, py = x1 + dx * L * t + nx * (o + w), y1 + dy * L * t + ny * (o + w)
                row.append(bm.verts.new((px, -py, hz - 0.004 * math.sin(t * 9 + ph2) * (j == 0))))
            rows.append(row)
        for j in range(len(rows) - 1):
            for i in range(n): bm.faces.new((rows[j][i], rows[j][i + 1], rows[j + 1][i + 1], rows[j + 1][i]))
        me = bpy.data.meshes.new('tenda'); bm.to_mesh(me); bm.free()
        for p in me.polygons: p.use_smooth = True
        me.materials.append(M['tenda']); ob = bpy.data.objects.new('tenda', me); col.objects.link(ob)
        rod = bpy.data.meshes.new('bacchetta'); bm = bmesh.new()
        bmesh.ops.create_cone(bm, cap_ends=True, segments=12, radius1=0.006, radius2=0.006, depth=L)
        bm.to_mesh(rod); bm.free(); rod.materials.append(M['ottone'])
        rb = bpy.data.objects.new('bacchetta', rod); col.objects.link(rb)
        mx, my = (x1 + x2) / 2 + nx * o, (y1 + y2) / 2 + ny * o
        rb.location = (mx, -my, h1 + 0.01); rb.rotation_euler = (math.pi / 2, 0, math.atan2(-dy, dx) + math.pi / 2)
