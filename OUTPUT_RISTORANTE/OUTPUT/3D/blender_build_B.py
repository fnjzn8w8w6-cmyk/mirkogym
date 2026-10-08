# Script Blender (>= 3.6/4.x). Esecuzione:  blender --python blender_build_B.py
import bpy, math, os
from mathutils import Vector
here = os.path.dirname(os.path.abspath(__file__))
bpy.ops.wm.read_factory_settings(use_empty=True)
obj = os.path.join(here, 'modello_B.obj')
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
pts = [(25.4, -10.7, 1.6), (23.5, -9.0, 1.6), (22.4, -7.0, 1.6), (21.3, -5.9, 1.6), (21.5, -3.5, 1.6), (23.0, -1.5, 1.6), (24.5, -3.0, 1.6), (22.5, -7.5, 1.6), (24.5, -11.5, 1.6), (23.0, -12.4, 0.2), (21.1, -12.4, -0.8), (21.1, -10.0, -1.5), (21.5, -9.3, -1.5), (23.8, -9.3, -1.5), (25.3, -8.0, -1.5), (25.2, -6.8, -1.5), (24.0, -5.0, -1.5), (22.0, -5.0, -1.5), (21.5, -3.4, -1.5), (21.4, -2.6, -1.5)]
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
