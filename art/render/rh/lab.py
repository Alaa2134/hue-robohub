"""Robotics lab environment kit: furniture, displays, people silhouettes, banners, lighting fixtures."""
import math
import os
import random
import bpy
from . import core, geo, mat

TEX = core.TEX


def tex(name):
    return os.path.join(TEX, name)


def monitor(name, M, loc, rot_z=0, w=0.62, h=0.36, screen_tex="cad_arm.png", strength=2.4, parent=None):
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    geo.box(f"{name}Bezel", (w + 0.02, 0.025, h + 0.02), M["black_plastic"], (0, 0, h / 2 + 0.12), bev=0.004, parent=root)
    scr = mat.screen(f"Screen_{screen_tex}", tex(screen_tex), strength)
    geo.plane(f"{name}Screen", w, h, scr, (0, -0.0131, h / 2 + 0.12), (90, 0, 0), parent=root)
    geo.box(f"{name}Neck", (0.04, 0.03, 0.12), M["gunmetal"], (0, 0.03, 0.06), bev=0.004, parent=root)
    geo.box(f"{name}Foot", (0.22, 0.16, 0.012), M["gunmetal"], (0, 0.02, 0.006), bev=0.003, parent=root)
    return root


def desk(name, M, loc, rot_z=0, w=1.6, d=0.75, screens=("cad_arm.png", "code.png"), clutter=True, seed=0, parent=None):
    rnd = random.Random(seed)
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    geo.box(f"{name}Top", (w, d, 0.03), M["mech"], (0, 0, 0.74), bev=0.004, parent=root)
    for sx in (-1, 1):
        geo.box(f"{name}Leg{sx}", (0.05, d * 0.9, 0.05), M["gunmetal"], (sx * (w / 2 - 0.08), 0, 0.03), bev=0.004, parent=root)
        geo.box(f"{name}Post{sx}", (0.05, 0.05, 0.7), M["gunmetal"], (sx * (w / 2 - 0.08), 0, 0.38), bev=0.004, parent=root)
    n = len(screens)
    for i, s in enumerate(screens):
        x = (i - (n - 1) / 2) * 0.66
        monitor(f"{name}Mon{i}", M, (x, d * 0.22, 0.755), math.radians((i - (n - 1) / 2) * -12), screen_tex=s, parent=root)
    geo.box(f"{name}Keys", (0.44, 0.14, 0.018), M["black_plastic"], (0, -d * 0.18, 0.765), bev=0.003, parent=root)
    if clutter:
        # parts bins, a small robot chassis, a soldering lamp
        for k in range(rnd.randint(1, 3)):
            geo.box(f"{name}Bin{k}", (0.18, 0.12, 0.08), M["black_plastic"], (rnd.uniform(-w / 2 + 0.2, w / 2 - 0.2), d * 0.3, 0.795), (0, 0, rnd.uniform(-20, 20)), bev=0.006, parent=root)
        lamp_x = rnd.choice([-1, 1]) * (w / 2 - 0.18)
        geo.cylinder(f"{name}LampBase", 0.06, 0.02, M["gunmetal"], (lamp_x, d * 0.28, 0.765), parent=root)
        geo.cylinder(f"{name}LampArm", 0.008, 0.42, M["chrome"], (lamp_x, d * 0.2, 0.96), (25, 0, 0), seg=12, parent=root)
        geo.cylinder(f"{name}LampHead", 0.07, 0.03, M["glow_white"], (lamp_x, d * 0.08, 1.15), (25, 0, 0), seg=24, parent=root)
    return root


def chair(name, M, loc, rot_z=0, parent=None):
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    geo.box(f"{name}Seat", (0.48, 0.46, 0.07), M["black_plastic"], (0, 0, 0.48), bev=0.02, parent=root)
    geo.box(f"{name}Back", (0.44, 0.06, 0.52), M["black_plastic"], (0, 0.24, 0.82), (-8, 0, 0), bev=0.025, parent=root)
    geo.cylinder(f"{name}Gas", 0.025, 0.36, M["chrome"], (0, 0, 0.26), seg=16, parent=root)
    for k in range(5):
        a = k * 2 * math.pi / 5
        geo.box(f"{name}Foot{k}", (0.03, 0.3, 0.03), M["gunmetal"], (math.sin(a) * 0.15, math.cos(a) * 0.15, 0.06), (0, 0, -math.degrees(a)), bev=0.008, parent=root)
    return root


def person_seated(name, M, loc, rot_z=0, lean=12, print_tex=True, hair=None, parent=None, seed=0):
    """Seated student from behind (black RoboHub hoodie). Built for backlit silhouettes, not close-ups."""
    rnd = random.Random(seed)
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    hood = mat.fabric("Hoodie", (0.012, 0.013, 0.016), 1.0, tex("hoodie_print.png") if print_tex else None)
    body = geo.empty(f"{name}Body", (0, 0, 0.52), (-lean, 0, 0), parent=root)
    torso = geo.hull(
        f"{name}Torso",
        [(-0.2, 0.0, 0.5), (0.2, 0.0, 0.5), (-0.16, 0.08, 0.52), (0.16, 0.08, 0.52), (-0.17, -0.1, 0.48), (0.17, -0.1, 0.48),
         (-0.16, 0.1, 0.0), (0.16, 0.1, 0.0), (-0.16, -0.1, 0.0), (0.16, -0.1, 0.0), (-0.21, 0.0, 0.3), (0.21, 0.0, 0.3),
         (0, 0.13, 0.25), (0, -0.12, 0.3)],
        hood, bev=0, parent=body,
    )
    geo.subsurf(torso, 3)
    geo.smooth(torso, 180)
    # UV for the back print: project from behind (+Y side faces the camera when rotated)
    me = torso.data
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (0.5 - v.x / 0.5, (v.z - 0.02) / 0.62)
    hood_ob = geo.sphere(f"{name}Hood", 0.12, hood, (0, 0.07, 0.5), seg=24, rings=12, scale=(1.25, 0.8, 0.55), parent=body)
    head_mat = mat.principled("Hair", (0.012, 0.009, 0.007), roughness=0.55, sheen=0.6) if hair is None else hair
    head = geo.sphere(f"{name}Head", 0.098, head_mat, (0, -0.02, 0.69), seg=32, rings=16, scale=(0.92, 1.0, 1.08), parent=body)
    for sx in (-1, 1):
        arm = geo.cable(f"{name}Arm{sx}", [(sx * 0.2, 0.0, 0.46), (sx * 0.24, -0.08, 0.25), (sx * 0.18, -0.36, 0.22)], 0.055, hood, parent=body)
        arm.data.bevel_resolution = 6
    chair(f"{name}Chair", M, (0, 0.05, 0), parent=root)
    return root


def person_standing(name, M, loc, rot_z=0, parent=None, print_tex=True):
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    hood = mat.fabric("Hoodie", (0.012, 0.013, 0.016), 1.0, tex("hoodie_print.png") if print_tex else None)
    torso = geo.hull(
        f"{name}Torso",
        [(-0.22, 0.0, 1.45), (0.22, 0.0, 1.45), (-0.17, 0.09, 1.48), (0.17, 0.09, 1.48), (-0.18, -0.1, 1.42), (0.18, -0.1, 1.42),
         (-0.17, 0.1, 0.86), (0.17, 0.1, 0.86), (-0.17, -0.1, 0.86), (0.17, -0.1, 0.86), (-0.23, 0.0, 1.2), (0.23, 0.0, 1.2), (0, 0.14, 1.2)],
        hood, bev=0, parent=root,
    )
    geo.subsurf(torso, 3)
    geo.smooth(torso, 180)
    me = torso.data
    uv = me.uv_layers.new(name="UVMap")
    for poly in me.polygons:
        for li in poly.loop_indices:
            v = me.vertices[me.loops[li].vertex_index].co
            uv.data[li].uv = (0.5 - v.x / 0.5, (v.z - 0.9) / 0.62)
    geo.sphere(f"{name}Hood", 0.13, hood, (0, 0.08, 1.46), seg=24, rings=12, scale=(1.25, 0.8, 0.55), parent=root)
    geo.sphere(f"{name}Head", 0.1, mat.principled("Hair", (0.012, 0.009, 0.007), roughness=0.55, sheen=0.6), (0, -0.01, 1.66), seg=32, rings=16, scale=(0.92, 1.0, 1.08), parent=root)
    for sx in (-1, 1):
        geo.cable(f"{name}Arm{sx}", [(sx * 0.22, 0.0, 1.42), (sx * 0.26, 0.0, 1.15), (sx * 0.24, -0.06, 0.92)], 0.058, hood, parent=root)
        geo.cable(f"{name}Leg{sx}", [(sx * 0.09, 0.0, 0.88), (sx * 0.1, 0.0, 0.45), (sx * 0.1, 0.02, 0.05)], 0.075, M["black_plastic"], parent=root)
    return root


def banner(name, loc, texture, w=0.9, h=2.4, rot_z=0, M=None):
    m = mat.principled(f"Banner_{texture}", (1, 1, 1), roughness=0.8, sheen=0.3)
    nt = m.node_tree
    t = nt.nodes.new("ShaderNodeTexImage")
    t.image = mat.image_tex(tex(texture))
    b = nt.nodes["Principled BSDF"]
    nt.links.new(t.outputs["Color"], b.inputs["Base Color"])
    nt.links.new(t.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = 0.25
    ob = geo.plane(name, w, h, m, loc, (90, 0, rot_z))
    # gentle cloth ripple
    geo.subsurf(ob, 4)
    d = ob.modifiers.new("Ripple", "DISPLACE")
    tx = bpy.data.textures.new(f"{name}Wave", "WOOD")
    tx.wood_type = "BANDNOISE"
    tx.noise_scale = 0.4
    d.texture = tx
    d.strength = 0.012
    if M:
        geo.cylinder(f"{name}Rod", 0.012, w + 0.08, M["gunmetal"], (loc[0], loc[1], loc[2] + h / 2 + 0.02), (0, 90, rot_z), seg=12)
    return ob


def ceiling_lights(M, x_range, y_positions, z=3.8, length=2.4, width=0.08):
    for i, y in enumerate(y_positions):
        for j, x in enumerate(x_range):
            geo.box(f"CeilLight{i}_{j}", (length, width, 0.04), M["panel_light"], (x, y, z), bev=0)
            geo.box(f"CeilHousing{i}_{j}", (length + 0.04, width + 0.04, 0.05), M["gunmetal"], (x, y, z + 0.035), bev=0.004)


def robot_arm(name, M, loc, rot_z=0, scale=1.0, pose=(20, -35, 60, 30), parent=None):
    """Compact 6-axis-style arm for benches (silhouette-level detail)."""
    s = scale
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    root.scale = (s, s, s)
    geo.cylinder(f"{name}Base", 0.12, 0.08, M["gunmetal"], (0, 0, 0.04), parent=root)
    j1 = geo.empty(f"{name}J1", (0, 0, 0.08), (0, 0, pose[0]), parent=root)
    geo.cylinder(f"{name}Turret", 0.09, 0.14, M["white_plastic"], (0, 0, 0.07), parent=j1)
    j2 = geo.empty(f"{name}J2", (0, 0, 0.16), (pose[1], 0, 0), parent=j1)
    geo.cylinder(f"{name}J2Hub", 0.07, 0.16, M["mech"], (0, 0, 0), (0, 90, 0), parent=j2)
    geo.box(f"{name}Upper", (0.1, 0.09, 0.42), M["white_plastic"], (0, 0, 0.21), bev=0.02, parent=j2)
    j3 = geo.empty(f"{name}J3", (0, 0, 0.42), (pose[2], 0, 0), parent=j2)
    geo.cylinder(f"{name}J3Hub", 0.055, 0.13, M["mech"], (0, 0, 0), (0, 90, 0), parent=j3)
    geo.box(f"{name}Fore", (0.075, 0.07, 0.34), M["white_plastic"], (0, 0, 0.17), bev=0.016, parent=j3)
    j4 = geo.empty(f"{name}J4", (0, 0, 0.34), (pose[3], 0, 0), parent=j3)
    geo.cylinder(f"{name}Wrist", 0.04, 0.09, M["mech"], (0, 0, 0.04), parent=j4)
    geo.torus(f"{name}WristGlow", 0.042, 0.004, M["glow_blue"], (0, 0, 0.02), parent=j4)
    for sx in (-1, 1):
        geo.box(f"{name}Finger{sx}", (0.012, 0.03, 0.07), M["chrome"], (sx * 0.025, 0, 0.12), bev=0.003, parent=j4)
    return root
