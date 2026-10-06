"""Faceted armoured humanoid ("RH-01") — layered shell plates over a dark mechanical core."""
import math
import random
import bmesh
import bpy
from mathutils import Matrix, Vector

from . import geo


def patch(name, center, radii, u_range, v_range, res=(6, 4), thickness=0.006, mat=None, shape=None, bev=0.0016, parent=None, jitter=0.0, seed=0, inward=True):
    """Faceted shell patch on an ellipsoid.

    u = azimuth (0 = front/-Y, +π/2 = robot's left/+X), v = elevation. `shape(u, v)` returns a radial
    multiplier for sculpting ridges/overhangs. Low resolution + flat shading = designed facets.
    """
    rnd = random.Random(seed)
    a, b, c = radii
    nu, nv = res
    verts, faces = [], []
    for j in range(nv + 1):
        v = v_range[0] + (v_range[1] - v_range[0]) * j / nv
        for i in range(nu + 1):
            u = u_range[0] + (u_range[1] - u_range[0]) * i / nu
            k = shape(u, v) if shape else 1.0
            if jitter and 0 < i < nu and 0 < j < nv:
                k *= 1 + rnd.uniform(-jitter, jitter)
            verts.append((a * k * math.cos(v) * math.sin(u), -b * k * math.cos(v) * math.cos(u), c * k * math.sin(v)))
    for j in range(nv):
        for i in range(nu):
            p = j * (nu + 1) + i
            faces.append((p, p + 1, p + nu + 2, p + nu + 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    me.validate()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    if mat:
        me.materials.append(mat)
    for p in me.polygons:
        p.use_smooth = False
    if thickness:
        s = ob.modifiers.new("Solidify", "SOLIDIFY")
        s.thickness = thickness
        s.offset = -1 if inward else 1
        s.use_even_offset = True
    if bev:
        geo.bevel(ob, bev, 2, 25)
    ob.location = center
    if parent:
        ob.parent = parent
    return ob


def ring_strip(name, center, radii, u_range, v, height, mat, res=24, parent=None, scale=1.0):
    """Thin band following an ellipsoid at elevation v (glow seams, visor)."""
    a, b, c = (r * scale for r in radii)
    verts, faces = [], []
    for i in range(res + 1):
        u = u_range[0] + (u_range[1] - u_range[0]) * i / res
        for dz in (-height / 2, height / 2):
            vv = v + dz / c
            verts.append((a * math.cos(vv) * math.sin(u), -b * math.cos(vv) * math.cos(u), c * math.sin(vv)))
    for i in range(res):
        p = i * 2
        faces.append((p, p + 2, p + 3, p + 1))
    me = bpy.data.meshes.new(name)
    me.from_pydata(verts, [], faces)
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    me.materials.append(mat)
    ob.location = center
    if parent:
        ob.parent = parent
    return ob


def mirror_pts(pts):
    out = list(pts)
    for x, y, z in pts:
        if abs(x) > 1e-6:
            out.append((-x, y, z))
    return out


def build_head(M, parent, emblem_mat=None):
    """Angular helmet from hand-placed facets: crest cap, brow, V face mask, cheeks, rear guard, visor slit."""
    head = geo.empty("Head", (0, 0, 0), parent=parent)
    core = geo.sphere("HeadCore", 1.0, M["mech"], (0, 0.01, -0.01), seg=20, rings=10, scale=(0.078, 0.1, 0.1), parent=head)
    # Crown cap — long, swept back, crest along the centre line.
    cap = [
        (0, -0.142, 0.03), (0.05, -0.126, 0.028), (0.086, -0.09, 0.024), (0.098, -0.045, 0.026),
        (0, -0.094, 0.104), (0.052, -0.084, 0.094),
        (0, -0.012, 0.138), (0.068, -0.004, 0.112),
        (0, 0.082, 0.124), (0.06, 0.078, 0.098),
        (0, 0.158, 0.064), (0.042, 0.142, 0.052),
        (0.104, 0.03, 0.004), (0.101, -0.035, 0.018), (0.088, 0.11, -0.008), (0, 0.12, 0.0), (0, -0.04, 0.02), (0.07, 0.0, 0.0),
    ]
    geo.hull("Crown", mirror_pts(cap), M["armor"], parent=head, bev=0.0016)
    geo.hull("Crest", mirror_pts([(0.011, -0.118, 0.07), (0.011, -0.07, 0.122), (0.011, 0.0, 0.15), (0.011, 0.09, 0.136), (0.011, 0.17, 0.07),
                                  (0.004, -0.124, 0.074), (0.004, -0.072, 0.136), (0.004, 0.0, 0.168), (0.004, 0.095, 0.152), (0.004, 0.178, 0.074)]),
             M["armor_satin"], parent=head, bev=0.0008)
    # Layered rear plates (scale armour) to break the crown silhouette
    for k, (dz, dy) in enumerate(((0.0, 0.0), (-0.026, 0.012))):
        pts = [(0.0, 0.12 + dy, 0.105 + dz), (0.07, 0.1 + dy, 0.088 + dz), (0.092, 0.118 + dy, 0.036 + dz), (0.0, 0.168 + dy, 0.05 + dz),
               (0.06, 0.07 + dy, 0.09 + dz), (0.0, 0.08 + dy, 0.11 + dz), (0.08, 0.09 + dy, 0.04 + dz)]
        geo.hull(f"RearScale{k}", mirror_pts(pts), M["armor"], parent=head, bev=0.0012)
    # Side blades sweeping back from the brow
    for sx in (1, -1):
        blade = [(0.088, -0.09, 0.03), (0.104, -0.03, 0.06), (0.1, 0.07, 0.07), (0.092, 0.12, 0.05), (0.094, -0.05, 0.03), (0.094, 0.08, 0.04)]
        geo.hull(f"SideBlade{sx}", blade if sx > 0 else [(-x, y, z) for x, y, z in blade], M["armor_satin"], parent=head, bev=0.0012)
    # Face mask (V-shaped, pointed chin, central ridge)
    mask = [
        (0, -0.13, 0.012), (0.046, -0.115, 0.01), (0.078, -0.085, 0.006),
        (0, -0.148, -0.046), (0.05, -0.112, -0.038), (0.073, -0.074, -0.03),
        (0, -0.126, -0.114), (0.03, -0.1, -0.104),
        (0, -0.03, -0.07), (0.058, -0.03, -0.005), (0.04, -0.03, -0.09),
    ]
    geo.hull("FaceMask", mirror_pts(mask), M["armor"], parent=head, bev=0.0016)
    # Vents on the mask
    for i in range(3):
        z = -0.052 - i * 0.014
        for sx in (1, -1):
            geo.box(f"Vent{i}{sx}", (0.022 - i * 0.004, 0.004, 0.0035), M["mech"], (sx * 0.03, -0.112 + i * 0.006, z), (0, 0, sx * -28), bev=0, parent=head)
    # Cheeks (separate plates, mirrored)
    cheek = [(0.081, -0.081, 0.004), (0.098, -0.032, 0.012), (0.104, 0.042, 0.004), (0.092, 0.074, -0.05), (0.07, -0.016, -0.094),
             (0.076, -0.07, -0.04), (0.064, -0.058, -0.02), (0.07, 0.028, -0.03), (0.07, 0.05, 0.0)]
    geo.hull("CheekL", cheek, M["armor_satin"], parent=head, bev=0.0014)
    geo.hull("CheekR", [(-x, y, z) for x, y, z in cheek], M["armor_satin"], parent=head, bev=0.0014)
    # Rear guard
    geo.hull("RearGuard", mirror_pts([(0, 0.136, 0.022), (0.058, 0.114, 0.014), (0.082, 0.064, -0.024), (0.052, 0.104, -0.074),
                                      (0, 0.126, -0.066), (0, 0.06, 0.0), (0.04, 0.05, -0.044)]), M["armor"], parent=head, bev=0.0014)
    # Visor slit: glossy black recess + thin glowing line under the brow edge
    visor_pts = [(-0.096, -0.058, 0.009), (-0.08, -0.089, 0.015), (-0.046, -0.12, 0.02), (0.0, -0.134, 0.022),
                 (0.046, -0.12, 0.02), (0.08, -0.089, 0.015), (0.096, -0.058, 0.009)]
    geo.cable("VisorGlow", visor_pts, 0.0034, M["glow_cyan"], parent=head)
    # Sensor pods behind the cheeks
    for sx in (1, -1):
        geo.cylinder(f"Pod{sx}", 0.026, 0.02, M["gunmetal"], (sx * 0.1, 0.07, -0.012), (0, 90, 0), seg=32, bev=0.0015, parent=head)
        geo.torus(f"PodRing{sx}", 0.019, 0.0018, M["glow_blue"], (sx * 0.111, 0.07, -0.012), (0, 90, 0), parent=head)
    # Crest glow seam
    geo.cable("CrestGlow", [(0.0, -0.126, 0.074), (0.0, -0.074, 0.138), (0.0, 0.0, 0.17), (0.0, 0.096, 0.154), (0.0, 0.18, 0.075)], 0.0013, M["glow_blue"], parent=head)
    return head


def mirror_x(pts):
    return [(-x, y, z) for x, y, z in pts]


def build_neck(M, parent):
    """Short articulated neck: stacked actuator rings, chrome spine, hoses into the collar."""
    neck = geo.empty("Neck", (0, 0, 0), parent=parent)
    for i in range(5):
        z = -0.092 - i * 0.02
        geo.cylinder(f"NeckRing{i}", 0.047 + 0.003 * (i % 2), 0.011, M["gunmetal"] if i % 2 else M["mech"], (0, 0.012, z), seg=28, bev=0.0015, parent=neck)
    geo.cylinder("NeckCore", 0.03, 0.13, M["chrome"], (0, 0.012, -0.13), seg=24, bev=0.001, parent=neck)
    hoses = [
        ((0.042, -0.03, -0.085), (0.062, -0.05, -0.15), (0.085, -0.04, -0.205), "cable"),
        ((-0.042, -0.03, -0.085), (-0.062, -0.05, -0.15), (-0.085, -0.04, -0.205), "cable"),
        ((0.03, 0.05, -0.08), (0.055, 0.07, -0.15), (0.075, 0.06, -0.2), "cable_blue"),
        ((-0.03, 0.05, -0.08), (-0.055, 0.07, -0.15), (-0.075, 0.06, -0.2), "cable"),
    ]
    for i, (a, b, c, m) in enumerate(hoses):
        geo.cable(f"NeckHose{i}", [a, b, c], 0.0058, M[m], parent=neck)
    for sx in (1, -1):
        geo.cylinder(f"Piston{sx}", 0.0065, 0.09, M["chrome"], (sx * 0.05, -0.012, -0.135), (0, sx * 20, 0), seg=16, bev=0.0004, parent=neck)
        geo.cylinder(f"PistonBody{sx}", 0.011, 0.05, M["mech"], (sx * 0.064, -0.012, -0.172), (0, sx * 20, 0), seg=16, bev=0.0008, parent=neck)
    return neck


def build_torso(M, parent):
    """V-shaped armoured chest: pectorals, trapezius collars, segmented abdomen, back plate."""
    torso = geo.empty("Torso", (0, 0, 0), parent=parent)
    # Dark structural core visible in every seam
    core = [(0.0, -0.11, -0.2), (0.16, -0.07, -0.23), (0.17, 0.08, -0.23), (0.0, 0.12, -0.19), (0.15, -0.08, -0.48), (0.13, 0.08, -0.5),
            (0.1, -0.08, -0.72), (0.1, 0.06, -0.72), (0.0, -0.1, -0.72), (0.0, 0.08, -0.72), (0.0, -0.12, -0.45)]
    geo.hull("TorsoCore", mirror_pts(core), M["mech"], parent=torso, bev=0.002)
    # Pectoral plates
    pec = [(0.013, -0.123, -0.235), (0.013, -0.142, -0.44), (0.168, -0.092, -0.255), (0.154, -0.104, -0.455), (0.086, -0.166, -0.355),
           (0.05, -0.155, -0.27), (0.12, -0.14, -0.43), (0.02, -0.06, -0.26), (0.15, -0.035, -0.29), (0.13, -0.045, -0.44), (0.02, -0.07, -0.44)]
    geo.hull("PecL", pec, M["armor"], parent=torso, bev=0.0022)
    geo.hull("PecR", mirror_x(pec), M["armor"], parent=torso, bev=0.0022)
    # Trapezius / collar plates: broad, flat shoulder line
    trap = [(0.046, -0.06, -0.168), (0.05, 0.068, -0.158), (0.205, -0.078, -0.215), (0.212, 0.07, -0.205),
            (0.05, -0.05, -0.215), (0.19, -0.065, -0.262), (0.19, 0.056, -0.25), (0.06, 0.06, -0.21)]
    geo.hull("TrapL", trap, M["armor_satin"], parent=torso, bev=0.002)
    geo.hull("TrapR", mirror_x(trap), M["armor_satin"], parent=torso, bev=0.002)
    # Abdomen segments, narrowing toward the waist
    for k in range(4):
        z0 = -0.462 - k * 0.068
        w = 0.135 - k * 0.008
        seg = [(0, -0.132 + k * 0.004, z0), (w, -0.1, z0 + 0.004), (w * 0.94, -0.1, z0 - 0.056), (0, -0.128 + k * 0.004, z0 - 0.058),
               (w * 0.9, -0.03, z0), (0, -0.05, z0), (w * 0.86, -0.03, z0 - 0.056), (0, -0.05, z0 - 0.056)]
        geo.hull(f"Abs{k}", mirror_pts(seg), M["armor_satin"] if k % 2 else M["armor"], parent=torso, bev=0.0018)
    # Side plates (lats)
    lat = [(0.17, -0.06, -0.3), (0.185, 0.06, -0.3), (0.15, -0.06, -0.52), (0.155, 0.06, -0.54), (0.14, 0.0, -0.3), (0.13, 0.0, -0.52)]
    geo.hull("LatL", lat, M["armor_satin"], parent=torso, bev=0.0016)
    geo.hull("LatR", mirror_x(lat), M["armor_satin"], parent=torso, bev=0.0016)
    # Back plate
    back = [(0.0, 0.13, -0.2), (0.17, 0.095, -0.23), (0.165, 0.11, -0.5), (0.0, 0.135, -0.52), (0.0, 0.06, -0.25), (0.14, 0.06, -0.48)]
    geo.hull("Back", mirror_pts(back), M["armor"], parent=torso, bev=0.002)
    # Sternum glow seam + core light
    geo.cable("SternumGlow", [(0, -0.128, -0.25), (0, -0.142, -0.33), (0, -0.142, -0.43)], 0.0018, M["glow_blue"], parent=torso)
    geo.cylinder("ChestCore", 0.017, 0.01, M["glow_cyan"], (0, -0.147, -0.29), (90, 0, 0), seg=32, bev=0, parent=torso)
    geo.torus("ChestCoreRing", 0.024, 0.0035, M["chrome"], (0, -0.149, -0.29), (90, 0, 0), parent=torso)
    # Pec glow under-edges
    for sx in (1, -1):
        geo.cable(f"PecGlow{sx}", [(sx * 0.03, -0.142, -0.452), (sx * 0.09, -0.135, -0.462), (sx * 0.15, -0.106, -0.462)], 0.0012, M["glow_blue"], parent=torso)
    return torso


def build_shoulder(M, parent, side=1):
    """Layered pauldron (three overlapping faceted plates) over a ball actuator, plus upper arm."""
    sh = geo.empty(f"Shoulder{side}", (0, 0, 0), parent=parent)
    s = side
    geo.sphere(f"ShoulderBall{side}", 0.058, M["gunmetal"], (s * 0.218, 0.0, -0.272), seg=32, rings=16, parent=sh)
    plates = [
        [(0.14, -0.09, -0.19), (0.15, 0.085, -0.185), (0.262, -0.105, -0.208), (0.272, 0.095, -0.2), (0.302, -0.1, -0.29), (0.312, 0.088, -0.285),
         (0.2, -0.075, -0.262), (0.2, 0.065, -0.258), (0.235, 0.0, -0.17)],
        [(0.252, -0.108, -0.272), (0.262, 0.095, -0.266), (0.322, -0.104, -0.33), (0.33, 0.092, -0.326), (0.31, -0.085, -0.388), (0.316, 0.078, -0.384),
         (0.248, -0.075, -0.33), (0.252, 0.068, -0.326)],
        [(0.278, -0.09, -0.36), (0.286, 0.08, -0.356), (0.322, -0.085, -0.405), (0.328, 0.075, -0.4), (0.3, -0.066, -0.448), (0.305, 0.058, -0.444),
         (0.27, -0.06, -0.4), (0.272, 0.054, -0.398)],
    ]
    for k, pts in enumerate(plates):
        pts = pts if s > 0 else mirror_x(pts)
        geo.hull(f"Pauldron{side}_{k}", pts, M["armor"] if k != 1 else M["armor_satin"], parent=sh, bev=0.002)
    # Glow line along the top pauldron's lower edge
    edge = [(0.262, -0.106, -0.218), (0.3, -0.101, -0.292), (0.31, 0.0, -0.292), (0.31, 0.087, -0.288)]
    geo.cable(f"PauldronGlow{side}", edge if s > 0 else mirror_x(edge), 0.0013, M["glow_blue"], parent=sh)
    # Upper arm: dark actuator + armour shell
    geo.cylinder(f"UpperArm{side}", 0.048, 0.3, M["mech"], (s * 0.232, 0.0, -0.45), (0, s * 6, 0), seg=16, bev=0.003, r2=0.042, parent=sh)
    bicep = [(0.19, -0.06, -0.36), (0.27, -0.06, -0.37), (0.27, 0.05, -0.37), (0.2, 0.06, -0.36), (0.205, -0.055, -0.56), (0.262, -0.05, -0.56),
             (0.262, 0.045, -0.56), (0.21, 0.05, -0.56), (0.235, -0.072, -0.46)]
    geo.hull(f"Bicep{side}", bicep if s > 0 else mirror_x(bicep), M["armor_satin"], parent=sh, bev=0.0018)
    return sh


def build_emblem(M, mark_paths, scale=0.0004, depth=0.0025, glow=False):
    """Extruded RH mark (from the brand geometry) — chrome body with glowing axis."""
    import re

    body = geo.svg_path_polys(mark_paths["body"])
    axis = geo.svg_path_polys(mark_paths["axis"])
    root = geo.empty("Emblem")
    W = mark_paths.get("width", 118)
    for i, poly in enumerate(body):
        pts = [((x - W / 2) * scale, (50 - y) * scale) for x, y in poly]
        # inner counters are drawn as separate rectangles in our geometry; render them as dark inlays
        is_counter = len(poly) == 4 and i == 1
        ob = geo.extrude_polygon(f"EmblemBody{i}", pts, depth, M["mech"] if is_counter else (M["glow_blue"] if glow else M["chrome"]), bev=0.0003)
        ob.parent = root
        if is_counter:
            ob.location.z += depth * 0.6
    for poly in axis:
        pts = [((x - W / 2) * scale, (50 - y) * scale) for x, y in poly]
        ob = geo.extrude_polygon("EmblemAxis", pts, depth * 1.1, M["glow_blue"], bev=0)
        ob.parent = root
    return root


def bolt(name, M, loc, normal=(0, -1, 0), r=0.0045, parent=None):
    from mathutils import Vector
    ob = geo.cylinder(name, r, 0.003, M["chrome"], loc, seg=12, bev=0.0008, parent=parent)
    ob.rotation_euler = Vector(normal).to_track_quat("Z", "Y").to_euler()
    return ob


def build_details(M, root):
    """Secondary plates, fasteners and cabling — the detail density that sells scale."""
    # Fasteners on pauldrons and pecs
    for s in (1, -1):
        for (x, y, z) in ((0.27, -0.1, -0.235), (0.29, -0.098, -0.27), (0.24, -0.085, -0.205)):
            bolt(f"BoltP{s}{x}", M, (s * x, y - 0.006, z), (s * 0.3, -1, 0.2), parent=root)
        for (x, y, z) in ((0.14, -0.112, -0.43), (0.155, -0.098, -0.27)):
            bolt(f"BoltC{s}{x}", M, (s * x, y - 0.004, z), (s * 0.2, -1, 0), parent=root)
    # Secondary chest plates (layering)
    for s in (1, -1):
        pts = [(0.05, -0.168, -0.31), (0.12, -0.152, -0.32), (0.11, -0.156, -0.39), (0.05, -0.17, -0.385), (0.06, -0.15, -0.32), (0.1, -0.145, -0.38)]
        geo.hull(f"PecInlay{s}", pts if s > 0 else mirror_x(pts), M["armor_satin"], parent=root, bev=0.0012)
    # Clavicle cables
    for s in (1, -1):
        geo.cable(f"Clav{s}", [(s * 0.06, -0.06, -0.185), (s * 0.13, -0.085, -0.205), (s * 0.19, -0.07, -0.23)], 0.0045, M["cable"], parent=root)
        geo.cable(f"ClavB{s}", [(s * 0.05, 0.05, -0.18), (s * 0.12, 0.08, -0.2), (s * 0.2, 0.06, -0.22)], 0.0045, M["cable_blue"] if s > 0 else M["cable"], parent=root)
    # Back actuator spine
    for i in range(5):
        geo.box(f"Spine{i}", (0.05, 0.02, 0.03), M["gunmetal"], (0, 0.14, -0.24 - i * 0.055), bev=0.003, parent=root)


def build_humanoid(M, mark_paths, location=(0, 0, 0), rotation=(0, 0, 0)):
    root = geo.empty("RH01", location, rotation)
    head = build_head(M, root)
    head.scale = (1.12, 1.12, 1.12)
    head.location = (0, -0.006, -0.022)
    head.rotation_euler = (math.radians(9), 0, math.radians(-14))
    build_neck(M, root)
    build_torso(M, root)
    for side in (1, -1):
        build_shoulder(M, root, side)
    build_details(M, root)
    # Glowing RH emblem on the helmet side (reference) and a chrome one on the chest plate
    em = build_emblem(M, mark_paths, scale=0.00028, glow=True)
    em.parent = head
    em.location = (0.1035, 0.0, 0.058)
    em.rotation_euler = (math.radians(90), math.radians(-8), math.radians(90))
    em2 = build_emblem(M, mark_paths, scale=0.00042)
    em2.parent = root
    em2.location = (0.088, -0.158, -0.33)
    em2.rotation_euler = (math.radians(80), 0, math.radians(18))
    return root
