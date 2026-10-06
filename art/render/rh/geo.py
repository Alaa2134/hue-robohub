"""Geometry helpers: bevelled primitives, convex-hull armour plates, extrusions, cables, arrays."""
import math
import random
import bmesh
import bpy
from mathutils import Matrix, Vector


def _obj(name, me, mat=None, coll=None):
    ob = bpy.data.objects.new(name, me)
    (coll or bpy.context.collection).objects.link(ob)
    if mat is not None:
        ob.data.materials.append(mat)
    return ob


def smooth(ob, angle=35):
    me = ob.data
    for p in me.polygons:
        p.use_smooth = True
    try:
        me.set_sharp_from_angle(angle=math.radians(angle))
    except AttributeError:
        pass
    return ob


def flat(ob):
    for p in ob.data.polygons:
        p.use_smooth = False
    return ob


def bevel(ob, width=0.003, segments=3, angle=30, harden=True, profile=0.5):
    m = ob.modifiers.new("Bevel", "BEVEL")
    m.width = width
    m.segments = segments
    m.limit_method = "ANGLE"
    m.angle_limit = math.radians(angle)
    m.profile = profile
    m.harden_normals = harden
    m.use_clamp_overlap = True
    if harden:
        smooth(ob, 180)
    return m


def subsurf(ob, levels=2):
    m = ob.modifiers.new("Subdiv", "SUBSURF")
    m.levels = levels
    m.render_levels = levels
    return m


def place(ob, loc=(0, 0, 0), rot=(0, 0, 0), scale=None, parent=None):
    ob.location = loc
    ob.rotation_euler = [math.radians(a) for a in rot]
    if scale is not None:
        ob.scale = scale if hasattr(scale, "__len__") else (scale, scale, scale)
    if parent is not None:
        ob.parent = parent
    return ob


def box(name, size, mat=None, loc=(0, 0, 0), rot=(0, 0, 0), bev=0.002, seg=3, parent=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0, calc_uvs=True)
    for v in bm.verts:
        v.co = Vector((v.co.x * size[0], v.co.y * size[1], v.co.z * size[2]))
    bm.to_mesh(me)
    bm.free()
    ob = _obj(name, me, mat)
    if bev:
        bevel(ob, min(bev, min(size) * 0.45), seg)
    return place(ob, loc, rot, parent=parent)


def cylinder(name, r, h, mat=None, loc=(0, 0, 0), rot=(0, 0, 0), seg=48, bev=0.001, r2=None, parent=None, axis="Z"):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=seg, radius1=r, radius2=r2 if r2 is not None else r, depth=h, calc_uvs=True)
    if axis == "X":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, "Y"))
    elif axis == "Y":
        bmesh.ops.rotate(bm, verts=bm.verts, cent=(0, 0, 0), matrix=Matrix.Rotation(math.radians(90), 3, "X"))
    bm.to_mesh(me)
    bm.free()
    ob = _obj(name, me, mat)
    if bev:
        bevel(ob, min(bev, r * 0.4, h * 0.4), 3, 40)
    else:
        smooth(ob, 40)
    return place(ob, loc, rot, parent=parent)


def sphere(name, r, mat=None, loc=(0, 0, 0), seg=48, rings=24, scale=None, parent=None):
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=seg, v_segments=rings, radius=r, calc_uvs=True)
    bm.to_mesh(me)
    bm.free()
    ob = _obj(name, me, mat)
    smooth(ob, 180)
    return place(ob, loc, (0, 0, 0), scale=scale, parent=parent)


def torus(name, R, r, mat=None, loc=(0, 0, 0), rot=(0, 0, 0), seg=64, seg2=12, parent=None):
    me = bpy.data.meshes.new(name)
    verts, faces = [], []
    for i in range(seg):
        a = 2 * math.pi * i / seg
        for j in range(seg2):
            b = 2 * math.pi * j / seg2
            verts.append(((R + r * math.cos(b)) * math.cos(a), (R + r * math.cos(b)) * math.sin(a), r * math.sin(b)))
    for i in range(seg):
        for j in range(seg2):
            a, b = i * seg2 + j, ((i + 1) % seg) * seg2 + j
            c, d = ((i + 1) % seg) * seg2 + (j + 1) % seg2, i * seg2 + (j + 1) % seg2
            faces.append((a, b, c, d))
    me.from_pydata(verts, [], faces)
    ob = _obj(name, me, mat)
    smooth(ob, 180)
    return place(ob, loc, rot, parent=parent)


def hull(name, points, mat=None, loc=(0, 0, 0), rot=(0, 0, 0), bev=0.004, seg=2, parent=None, faceted=True):
    """Convex hull of hand-placed points → faceted armour plate with machined edges."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    vs = [bm.verts.new(p) for p in points]
    res = bmesh.ops.convex_hull(bm, input=vs)
    bmesh.ops.delete(bm, geom=[g for g in res.get("geom_interior", [])], context="VERTS")
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bmesh.ops.dissolve_limit(bm, angle_limit=math.radians(1.0), verts=bm.verts, edges=bm.edges)
    bm.to_mesh(me)
    bm.free()
    ob = _obj(name, me, mat)
    if bev:
        bevel(ob, bev, seg, 20)
    elif not faceted:
        smooth(ob)
    return place(ob, loc, rot, parent=parent)


def extrude_polygon(name, pts2d, depth, mat=None, loc=(0, 0, 0), rot=(0, 0, 0), bev=0.0015, holes=(), parent=None, scale=1.0):
    """Extrude a 2D outline (x, y) along +Z (centered). Holes are separate polygons subtracted."""
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()

    def ring(poly, z):
        return [bm.verts.new((x * scale, y * scale, z)) for x, y in poly]

    # Build via triangulated face fill: create outline edges + hole edges, fill, then extrude.
    edges = []
    for poly in [pts2d, *holes]:
        vs = ring(poly, -depth / 2)
        for i in range(len(vs)):
            edges.append(bm.edges.new((vs[i], vs[(i + 1) % len(vs)])))
    bmesh.ops.triangle_fill(bm, use_beauty=True, use_dissolve=True, edges=edges)
    faces = list(bm.faces)
    ext = bmesh.ops.extrude_face_region(bm, geom=faces)
    verts = [e for e in ext["geom"] if isinstance(e, bmesh.types.BMVert)]
    bmesh.ops.translate(bm, vec=(0, 0, depth), verts=verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    bm.to_mesh(me)
    bm.free()
    ob = _obj(name, me, mat)
    if bev:
        bevel(ob, bev, 2, 30)
    return place(ob, loc, rot, parent=parent)


def svg_path_polys(d):
    """Parse an M/L/Z-only SVG path (our brand geometry) into polygons."""
    import re

    polys, cur = [], []
    for cmd, args in re.findall(r"([MLZ])([^MLZ]*)", d):
        nums = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", args)]
        if cmd == "M":
            if cur:
                polys.append(cur)
            cur = [(nums[0], nums[1])]
        elif cmd == "L":
            for i in range(0, len(nums), 2):
                cur.append((nums[i], nums[i + 1]))
        elif cmd == "Z":
            if cur:
                polys.append(cur)
            cur = []
    if cur:
        polys.append(cur)
    return polys


def cable(name, points, radius=0.004, mat=None, res=12, parent=None, sag=0.0):
    """Bezier cable through points (auto handles); optional sag between endpoints."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 4
    cu.resolution_u = res
    cu.use_fill_caps = True
    sp = cu.splines.new("BEZIER")
    pts = [Vector(p) for p in points]
    if sag and len(pts) == 2:
        mid = (pts[0] + pts[1]) / 2 - Vector((0, 0, sag))
        pts = [pts[0], mid, pts[1]]
    sp.bezier_points.add(len(pts) - 1)
    for bp, p in zip(sp.bezier_points, pts):
        bp.co = p
        bp.handle_left_type = bp.handle_right_type = "AUTO"
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    if mat is not None:
        cu.materials.append(mat)
    if parent is not None:
        ob.parent = parent
    return ob


def plane(name, w, h, mat=None, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    me = bpy.data.meshes.new(name)
    me.from_pydata([(-w / 2, -h / 2, 0), (w / 2, -h / 2, 0), (w / 2, h / 2, 0), (-w / 2, h / 2, 0)], [], [(0, 1, 2, 3)])
    me.uv_layers.new(name="UVMap")
    uv = me.uv_layers[0].data
    for i, c in enumerate([(0, 0), (1, 0), (1, 1), (0, 1)]):
        uv[i].uv = c
    ob = _obj(name, me, mat)
    return place(ob, loc, rot, parent=parent)


def empty(name, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    ob = bpy.data.objects.new(name, None)
    bpy.context.collection.objects.link(ob)
    return place(ob, loc, rot, parent=parent)


def array(ob, count, offset, relative=False):
    m = ob.modifiers.new("Array", "ARRAY")
    m.count = count
    m.use_relative_offset = relative
    m.use_constant_offset = not relative
    if relative:
        m.relative_offset_displace = offset
    else:
        m.constant_offset_displace = offset
    return m


def jitter(seed=None):
    r = random.Random(seed)
    return r


def revolve(name, profile, mat=None, loc=(0, 0, 0), rot=(0, 0, 0), seg=96, parent=None, cap=True):
    """Lathe a (radius, z) profile around Z — cups, plinths, knobs. Profile runs bottom → top."""
    me = bpy.data.meshes.new(name)
    verts, faces = [], []
    n = len(profile)
    for i in range(seg):
        a = 2 * math.pi * i / seg
        ca, sa = math.cos(a), math.sin(a)
        for r, z in profile:
            verts.append((r * ca, r * sa, z))
    for i in range(seg):
        j = (i + 1) % seg
        for k in range(n - 1):
            faces.append((i * n + k, j * n + k, j * n + k + 1, i * n + k + 1))
    if cap:
        if profile[0][0] > 1e-6:
            verts.append((0, 0, profile[0][1]))
            c = len(verts) - 1
            for i in range(seg):
                faces.append((c, ((i + 1) % seg) * n, i * n))
        if profile[-1][0] > 1e-6:
            verts.append((0, 0, profile[-1][1]))
            c = len(verts) - 1
            for i in range(seg):
                faces.append((c, i * n + n - 1, ((i + 1) % seg) * n + n - 1))
    me.from_pydata(verts, [], faces)
    me.validate()
    ob = _obj(name, me, mat)
    smooth(ob, 40)
    return place(ob, loc, rot, parent=parent)


def gear_outline(teeth, module, addendum=1.0, dedendum=1.25, tip=0.32, root=0.42, pts_per_tooth=10):
    """Simplified involute-ish spur gear outline (trapezoidal teeth with rounded flanks)."""
    rp = module * teeth / 2
    ra, rf = rp + addendum * module, rp - dedendum * module
    out = []
    for i in range(teeth):
        base = 2 * math.pi * i / teeth
        pitch = 2 * math.pi / teeth
        # root → flank up → tip → flank down
        spans = [
            (0.0, rf), (root / 2 * pitch, rf),
            ((0.5 - tip / 2) * pitch * 0.92, ra * 0.985), ((0.5 - tip / 2) * pitch, ra),
            ((0.5 + tip / 2) * pitch, ra), ((0.5 + tip / 2) * pitch * 1.04, ra * 0.985),
            ((1 - root / 2) * pitch, rf),
        ]
        for da, r in spans:
            a = base + da
            out.append((r * math.cos(a), r * math.sin(a)))
    return out


def circle_pts(r, n=48, cx=0.0, cy=0.0):
    return [(cx + r * math.cos(2 * math.pi * i / n), cy + r * math.sin(2 * math.pi * i / n)) for i in range(n)]


def spur_gear(name, teeth, module, thickness, mat=None, bore=None, loc=(0, 0, 0), rot=(0, 0, 0), parent=None, lightening=0):
    """Spur gear solid (Z axis) with bore and optional lightening holes."""
    holes = []
    if bore:
        holes.append(list(reversed(circle_pts(bore, 32))))
    rp = module * teeth / 2
    if lightening:
        rr = rp * 0.55
        hr = rp * 0.18
        for k in range(lightening):
            a = 2 * math.pi * k / lightening
            holes.append(list(reversed(circle_pts(hr, 24, rr * math.cos(a), rr * math.sin(a)))))
    return extrude_polygon(name, gear_outline(teeth, module), thickness, mat, loc, rot, bev=min(0.0006, module * 0.15), holes=holes, parent=parent)


def point_cloud(name, points, radius=0.002, mat=None, parent=None):
    """Render-native point cloud (Geometry Nodes: Mesh to Points) — one object for thousands of points."""
    me = bpy.data.meshes.new(name)
    me.from_pydata([tuple(p) for p in points], [], [])
    ob = _obj(name, me)
    ng = bpy.data.node_groups.new(f"{name}GN", "GeometryNodeTree")
    ng.interface.new_socket(name="Geometry", in_out="INPUT", socket_type="NodeSocketGeometry")
    ng.interface.new_socket(name="Geometry", in_out="OUTPUT", socket_type="NodeSocketGeometry")
    gi = ng.nodes.new("NodeGroupInput")
    go = ng.nodes.new("NodeGroupOutput")
    mp = ng.nodes.new("GeometryNodeMeshToPoints")
    mp.inputs["Radius"].default_value = radius
    sm = ng.nodes.new("GeometryNodeSetMaterial")
    if mat is not None:
        sm.inputs["Material"].default_value = mat
    ng.links.new(gi.outputs[0], mp.inputs["Mesh"])
    ng.links.new(mp.outputs["Points"], sm.inputs["Geometry"])
    ng.links.new(sm.outputs["Geometry"], go.inputs[0])
    mod = ob.modifiers.new("Points", "NODES")
    mod.node_group = ng
    if parent is not None:
        ob.parent = parent
    return ob


def wire(name, points, radius=0.0006, mat=None, parent=None):
    """Straight polyline tube (dimension lines, laser rays, explode guides)."""
    cu = bpy.data.curves.new(name, "CURVE")
    cu.dimensions = "3D"
    cu.bevel_depth = radius
    cu.bevel_resolution = 2
    sp = cu.splines.new("POLY")
    sp.points.add(len(points) - 1)
    for p, c in zip(sp.points, points):
        p.co = (*c, 1)
    ob = bpy.data.objects.new(name, cu)
    bpy.context.collection.objects.link(ob)
    if mat is not None:
        cu.materials.append(mat)
    if parent is not None:
        ob.parent = parent
    return ob
