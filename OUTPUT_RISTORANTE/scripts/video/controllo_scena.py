"""Controllo automatico della scena 3D di presentazione (Blender, dopo la costruzione completa di render_blender.py).
Cerca, su TUTTO il modello e non su singole inquadrature:
  1. compenetrazioni: sedie (ingombro reale: seduta + schienale) contro muri, tavoli, basamenti, mobili, banconi,
     altre sedie, scala e parapetti; oggetti d'arredo contro i muri;
  2. oggetti sospesi: oggetti che non poggiano su nulla (raggio verso il basso dal punto piu' basso);
  3. coperti fuori posto: piatti, posate, bicchieri non appoggiati sul piano del tavolo o fuori dal bordo;
  4. superfici sovrapposte (sfarfallio / triangoli neri): facce orizzontali di oggetti diversi alla stessa quota.
Scrive controllo_scena.json e stampa il riepilogo. Chiamato da render_blender.py con CONTROLLO=<file di uscita>."""
import bpy, bmesh, json, math, os
from mathutils import Vector, Matrix
from mathutils.bvhtree import BVHTree

WALL = {'boiserie', 'intonacoPT', 'intonaco', 'mattoni', 'metro', 'facciata', 'cemento'}
SOLID = {'noce', 'noceTavolo', 'marmo', 'inox', 'laccato', 'ceramica', 'cannettato', 'doghe', 'scaffale', 'ferro', 'ghisa', 'gradino',
         'scalaCorpo', 'tavolo_servizio', 'bronzo', 'laccaVerde', 'ghisa_vera'}
TABLEWARE = {'piatto', 'calice', 'coltello', 'forchetta', 'tovagliolo', 'portacandela', 'candela', 'vasetto'}


def base(n):
    return n.split('.')[0]


def world_tris(ob):
    me = ob.data; mw = ob.matrix_world
    verts = [mw @ v.co for v in me.vertices]
    me.calc_loop_triangles()
    return verts, [tuple(t.vertices) for t in me.loop_triangles]


def bvh_of(objs):
    V, T = [], []
    for ob in objs:
        v, t = world_tris(ob); off = len(V); V += v; T += [(a + off, b + off, c + off) for a, b, c in t]
    return BVHTree.FromPolygons(V, T, all_triangles=True) if T else None


def box_bvh(corners):
    faces = [(0, 1, 2, 3), (4, 7, 6, 5), (0, 4, 5, 1), (1, 5, 6, 2), (2, 6, 7, 3), (3, 7, 4, 0)]
    return BVHTree.FromPolygons(corners, faces)


def run(dati_dir, out_path, C, CI):
    sc = bpy.context.scene; dg = bpy.context.evaluated_depsgraph_get()
    ist = json.load(open(os.path.join(dati_dir, 'istanze.json')))
    meshes = [o for o in bpy.data.objects if o.type == 'MESH' and o.data.polygons]
    by_mat = {}
    for o in meshes:
        n = base(o.active_material.name) if o.active_material else 'nessuno'
        by_mat.setdefault(n, []).append(o)
    report = {'sedie': [], 'sospesi': [], 'coperti': [], 'sovrapposte': [], 'arredi_nei_muri': []}
    walls = bvh_of([o for n, l in by_mat.items() if n in WALL for o in l])
    # ---- 1. sedie: due volumi (seduta+gambe, schienale) per ciascuna sedia, nella posizione reale
    others = {}
    for n, l in by_mat.items():
        if n in SOLID: others[n] = bvh_of(l)
    tops = [o for o in meshes if o.active_material and base(o.active_material.name) == 'noceTavolo']
    others['piano tavolo'] = bvh_of(tops)
    bases = [o for o in bpy.data.objects if o.name.startswith('base')]
    others['basamento tavolo'] = bvh_of(bases)
    chair_boxes = []
    for i, e in enumerate(ist.get('sedia', [])):
        m = e['m']; M3 = Matrix(((m[0], m[4], m[8], m[12]), (m[1], m[5], m[9], m[13]), (m[2], m[6], m[10], m[14]), (0, 0, 0, 1)))
        mw = C @ M3 @ CI
        def corners(x0, x1, y0, y1, z0, z1):   # coordinate locali Blender della sedia: avanti = -y? (three +z -> Blender -y)
            return [mw @ Vector(p) for p in [(x0, y0, z0), (x1, y0, z0), (x1, y1, z0), (x0, y1, z0), (x0, y0, z1), (x1, y0, z1), (x1, y1, z1), (x0, y1, z1)]]
        # three locale: avanti +z (-> Blender -y), schienale a -0.245 (-> +0.245)
        seat = corners(-0.205, 0.205, -0.21, 0.225, 0.0, 0.47)
        back = corners(-0.16, 0.16, 0.10, 0.23, 0.47, 0.9)
        chair_boxes.append((i, box_bvh(seat), box_bvh(back), mw.translation.copy()))
    for i, bs, bb, pos in chair_boxes:
        hit = []
        for nome, b in [('muro', walls)] + list(others.items()):
            if b is None: continue
            if b.overlap(bs) or b.overlap(bb): hit.append(nome)
        for j, bs2, bb2, pos2 in chair_boxes:
            if j <= i or (pos - pos2).length > 1.0: continue
            if bs.overlap(bs2) or bb.overlap(bb2) or bs.overlap(bb2) or bb.overlap(bs2): hit.append(f'sedia {j}')
        if hit: report['sedie'].append(dict(sedia=i, pos=[round(pos.x, 2), round(-pos.y, 2), round(pos.z, 2)], contro=sorted(set(hit))))
    # ---- 2. oggetti sospesi (escluse le cose appese: lampade, quadri, applique, tende, vetrine a muro, travi)
    appesi = ('paralume', 'tenda', 'bacchetta', 'globo', 'trave', 'smalto', 'ottone')
    for o in meshes:
        n = base(o.active_material.name) if o.active_material else ''
        parti = ('etichetta', 'capsula', 'tappo', 'liq', 'vino', 'fiamma', 'foglie', 'stelo', 'leaves', 'pebbles', 'stem', 'acqua', 'paralume', 'globo')
        if any(o.data.name.startswith(q) or q in o.data.name for q in parti): continue
        if n in WALL or any(a in o.name or a in n for a in appesi) or n in ('soffitto', 'intonaco', 'spina', 'cotto', 'gres', 'cucina', 'zerbino', 'vetro', 'davanzale'):
            continue
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        zmin = min(v.z for v in bb); cx = sum(v.x for v in bb) / 8; cy = sum(v.y for v in bb) / 8
        size = max(max(v.x for v in bb) - min(v.x for v in bb), max(v.y for v in bb) - min(v.y for v in bb))
        if size > 3: continue            # elementi grandi (muri uniti, pavimenti)
        org = Vector((cx, cy, zmin + 0.004)); gap = 0.3
        for _ in range(8):   # il primo oggetto sotto, escluso l'oggetto stesso
            hitp = sc.ray_cast(dg, org, Vector((0, 0, -1)), distance=0.3)
            if not hitp[0]: break
            if hitp[4] is not None and hitp[4].name == o.name: org = hitp[1] - Vector((0, 0, 0.0003)); continue
            gap = zmin - hitp[1].z; break
        if gap > 0.012: report['sospesi'].append(dict(oggetto=o.name, materiale=n, pos=[round(cx, 2), round(-cy, 2), round(zmin, 3)], vuoto_cm=round(gap * 100, 1)))
    # ---- 3. coperti: ogni oggetto da tavola deve poggiare su un piano (tavolo, credenza, mensola, davanzale)
    for o in bpy.data.objects:
        if o.type != 'MESH' or base(o.name) not in TABLEWARE: continue
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]; zmin = min(v.z for v in bb)
        cx = sum(v.x for v in bb) / 8; cy = sum(v.y for v in bb) / 8
        h = sc.ray_cast(dg, Vector((cx, cy, zmin + 0.002)), Vector((0, 0, -1)), distance=0.05)
        if not h[0] or zmin - h[1].z > 0.008:
            report['coperti'].append(dict(oggetto=o.name, pos=[round(cx, 2), round(-cy, 2), round(zmin, 3)], appoggio=(h[4].name if h[0] else None)))
    # ---- 4. superfici orizzontali sovrapposte tra oggetti diversi
    planes = {}
    for o in meshes:
        if o.name.startswith(tuple(TABLEWARE)) or 'bottiglia' in o.name: continue
        me = o.data; mw = o.matrix_world
        for p in me.polygons:
            nw = (mw.to_3x3() @ p.normal).normalized()
            if abs(nw.z) < 0.999 or p.area < 1e-3: continue
            c = mw @ p.center; key = (round(c.z, 4), nw.z > 0)
            planes.setdefault(key, []).append((o.name, base(o.active_material.name) if o.active_material else '', c, math.sqrt(p.area)))
    seen = set()
    for key, L in planes.items():
        if len(L) < 2: continue
        for a in range(len(L)):
            for b in range(a + 1, len(L)):
                if L[a][0] == L[b][0]: continue
                if (L[a][2] - L[b][2]).xy.length < (L[a][3] + L[b][3]) / 2:
                    k = tuple(sorted((L[a][0], L[b][0])))
                    if k in seen: continue
                    seen.add(k); report['sovrapposte'].append(dict(oggetti=list(k), materiali=[L[a][1], L[b][1]], z=key[0], pos=[round(L[a][2].x, 2), round(-L[a][2].y, 2)]))
    # ---- 5. arredi e oggetti dentro i muri (bottiglie, piante, mobili, banconi)
    for o in meshes:
        n = base(o.active_material.name) if o.active_material else ''
        if n in WALL or n in ('soffitto', 'spina', 'cotto', 'gres', 'cucina', 'zerbino', 'davanzale', 'intonaco'): continue
        if o.name.startswith(('tenda', 'bacchetta')): continue
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        if max(v.x for v in bb) - min(v.x for v in bb) > 3: continue
        v, t = world_tris(o)
        if not t or len(t) > 20000: continue
        b = BVHTree.FromPolygons(v, t, all_triangles=True)
        ov = walls.overlap(b)
        if len(ov) > 6:
            report['arredi_nei_muri'].append(dict(oggetto=o.name, materiale=n, pos=[round(sum(x.x for x in bb) / 8, 2), round(-sum(x.y for x in bb) / 8, 2)], contatti=len(ov)))
    # ---- 6. oggetti appesi in alto (lampade, cavi, rosoni, globi): devono toccare qualcosa sopra di se'
    report['appesi_staccati'] = []
    for o in meshes:
        n = base(o.active_material.name) if o.active_material else ''
        if n in WALL or n in ('soffitto', 'intonaco', 'vetro', 'cemento'): continue
        bb = [o.matrix_world @ Vector(c) for c in o.bound_box]
        zmin = min(v.z for v in bb); zmax = max(v.z for v in bb)
        if max(max(v.x for v in bb) - min(v.x for v in bb), max(v.y for v in bb) - min(v.y for v in bb)) > 1.5: continue
        cx = sum(v.x for v in bb) / 8; cy = sum(v.y for v in bb) / 8
        alto = zmin > 1.4 if zmin > -0.3 else (-3.10 + 1.4 < zmin < -0.45)   # sopra 1.40 m dal pavimento del proprio piano
        if not alto: continue
        org = Vector((cx, cy, zmax - 0.001)); gap = None
        for _ in range(8):
            h = sc.ray_cast(dg, org, Vector((0, 0, 1)), distance=1.5)
            if not h[0]: break
            if h[4] is not None and h[4].name == o.name: org = h[1] + Vector((0, 0, 0.0003)); continue
            gap = h[1].z - zmax; break
        # appoggiato sopra a qualcosa? (mensole, mobili alti) allora non e' appeso
        h2 = sc.ray_cast(dg, Vector((cx, cy, zmin + 0.002)), Vector((0, 0, -1)), distance=0.02)
        if h2[0] and h2[4] is not None and h2[4].name != o.name: continue
        if gap is None or gap > 0.01:
            report['appesi_staccati'].append(dict(oggetto=o.name, materiale=n, pos=[round(cx, 2), round(-cy, 2), round(zmin, 2), round(zmax, 2)], vuoto_sopra_cm=None if gap is None else round(gap * 100, 1)))
    # ---- 7. facce coincidenti con normali opposte (pareti/pannelli "a foglio" doppio): nel render diventano macchie nere
    report['facce_doppie'] = []
    cell = {}
    for o in meshes:
        if len(o.data.polygons) > 50000: continue
        mw = o.matrix_world; m3 = mw.to_3x3()
        for p in o.data.polygons:
            if p.area < 0.01: continue
            c = mw @ p.center; nw = (m3 @ p.normal).normalized()
            k = (round(c.x / 0.005), round(c.y / 0.005), round(c.z / 0.005))
            cell.setdefault(k, []).append((o.name, nw, p.area))
    seen = set()
    for k, L in cell.items():
        for a in range(len(L)):
            for b in range(a + 1, len(L)):
                if L[a][1].dot(L[b][1]) < -0.99 and abs(L[a][2] - L[b][2]) < 0.2 * max(L[a][2], L[b][2]):
                    kk = tuple(sorted((L[a][0], L[b][0])))
                    if kk in seen: continue
                    seen.add(kk); report['facce_doppie'].append(dict(oggetti=list(kk), pos=[round(k[0] * 0.005, 2), round(-k[1] * 0.005, 2), round(k[2] * 0.005, 2)]))
    dbg = []
    for o in bpy.data.objects:
        if o.name.startswith(('bottiglia_bar', 'piatto')) and len(dbg) < 12:
            lz = min(v.co.z for v in o.data.vertices); wz = min((o.matrix_world @ v.co).z for v in o.data.vertices)
            dbg.append((o.name, o.data.name, round(lz, 4), round(wz, 4), round(o.matrix_world.translation.z, 4)))
    report['debug'] = dbg
    json.dump(report, open(out_path, 'w'), indent=1, ensure_ascii=False)
    print('CONTROLLO', {k: len(v) for k, v in report.items()}, flush=True)
