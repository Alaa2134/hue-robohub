"""Electronics: dev boards, ICs, connectors, passives, sensors, bench instruments. Units: metres."""
import math
import os
import random
import bpy
from . import core, geo, mat


def _silk(name):
    return os.path.join(core.TEX, name)


def board(name, M, w, d, loc=(0, 0, 0), rot=(0, 0, 0), silk=None, t=0.0016, holes=True, parent=None, corner=0.0):
    root = geo.empty(name, loc, rot, parent=parent)
    m = mat.pcb(f"PCB_{silk or 'plain'}", _silk(silk) if silk else None)
    pcb = geo.box(f"{name}PCB", (w, d, t), m, (0, 0, t / 2), bev=min(0.0006, corner or 0.0006), parent=root)
    if silk:
        # project UVs from top so the silkscreen maps across the board
        me = pcb.data
        uv = me.uv_layers[0] if me.uv_layers else me.uv_layers.new()
        for poly in me.polygons:
            for li in poly.loop_indices:
                v = me.vertices[me.loops[li].vertex_index].co
                uv.data[li].uv = (v.x / w + 0.5, v.y / d + 0.5)
    if holes:
        for sx in (-1, 1):
            for sy in (-1, 1):
                geo.cylinder(f"{name}Hole{sx}{sy}", 0.0016, t * 1.02, M["chip"], (sx * (w / 2 - 0.0032), sy * (d / 2 - 0.0032), t / 2), seg=16, bev=0, parent=root)
                geo.torus(f"{name}Pad{sx}{sy}", 0.0021, 0.0005, M["gold"], (sx * (w / 2 - 0.0032), sy * (d / 2 - 0.0032), t + 0.0001), seg=24, seg2=6, parent=root)
    return root


def qfp(name, M, size=0.007, pins=12, loc=(0, 0, 0), rot_z=0, parent=None, label=True):
    """LQFP package with gull-wing leads on all four sides."""
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    h = 0.0014
    geo.box(f"{name}Body", (size, size, h), M["chip"], (0, 0, h / 2 + 0.0001), bev=0.00025, parent=root)
    geo.cylinder(f"{name}Dot", 0.00035, 0.0001, M["black_plastic"], (-size / 2 + 0.0009, -size / 2 + 0.0009, h + 0.0001), seg=12, bev=0, parent=root)
    pitch = (size - 0.0012) / max(1, pins - 1)
    lead = geo.box(f"{name}LeadProto", (0.00022, 0.0011, 0.00015), M["tin"], (0, 0, 0), bev=0, parent=root)
    lead.hide_render = True
    for side in range(4):
        ang = side * math.pi / 2
        for i in range(pins):
            off = -size / 2 + 0.0006 + i * pitch
            x, y = off, -size / 2 - 0.0005
            rx, ry = x * math.cos(ang) - y * math.sin(ang), x * math.sin(ang) + y * math.cos(ang)
            ob = geo.box(f"{name}L{side}_{i}", (0.00022, 0.0011, 0.00016), M["tin"], (rx, ry, 0.00045), (0, 0, math.degrees(ang)), bev=0, parent=root)
            ob.rotation_euler.x = math.radians(-14) if True else 0
    return root


def smd(name, M, w=0.002, d=0.0012, h=0.0006, loc=(0, 0, 0), rot_z=0, body="chip", parent=None):
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    geo.box(f"{name}B", (w * 0.6, d, h), M[body], (0, 0, h / 2), bev=0.0001, parent=root)
    for sx in (-1, 1):
        geo.box(f"{name}T{sx}", (w * 0.2, d, h * 1.02), M["tin"], (sx * w * 0.4, 0, h / 2), bev=0.0001, parent=root)
    return root


def scatter_passives(prefix, M, area, count, seed, parent, z=0.0016):
    rnd = random.Random(seed)
    for i in range(count):
        x = rnd.uniform(-area[0] / 2, area[0] / 2)
        y = rnd.uniform(-area[1] / 2, area[1] / 2)
        kind = rnd.random()
        if kind < 0.6:
            smd(f"{prefix}R{i}", M, 0.0016, 0.0008, 0.0005, (x, y, z), rnd.choice([0, 90]), "chip" if rnd.random() < 0.5 else "white_plastic", parent)
        else:
            smd(f"{prefix}C{i}", M, 0.002, 0.0012, 0.0009, (x, y, z), rnd.choice([0, 90]), "wood", parent)


def header(name, M, n, loc=(0, 0, 0), rot_z=0, rows=1, pitch=0.00254, parent=None, female=False):
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    L = n * pitch
    geo.box(f"{name}Strip", (L, pitch * rows, 0.0025 if not female else 0.0085), M["black_plastic"], (L / 2 - pitch / 2, (rows - 1) * pitch / 2, 0.00125 if not female else 0.00425), bev=0.0002, parent=root)
    if not female:
        pin = geo.box(f"{name}Pin", (0.00064, 0.00064, 0.0085), M["gold"], (0, 0, 0.0055), bev=0.0001, parent=root)
        arr = geo.array(pin, n, (pitch, 0, 0))
        if rows > 1:
            a2 = pin.modifiers.new("Array2", "ARRAY")
            a2.count = rows
            a2.use_relative_offset = False
            a2.use_constant_offset = True
            a2.constant_offset_displace = (0, pitch, 0)
    else:
        hole = geo.box(f"{name}Hole", (0.0011, 0.0011, 0.0002), M["chip"], (0, 0, 0.0086), bev=0, parent=root)
        geo.array(hole, n, (pitch, 0, 0))
    return root


def esp32_module(name, M, loc=(0, 0, 0), rot_z=0, parent=None):
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    geo.box(f"{name}Sub", (0.018, 0.0255, 0.0008), M["chip"], (0, 0, 0.0004), bev=0.0002, parent=root)
    can = geo.box(f"{name}Can", (0.0158, 0.0175, 0.0024), M["tin"], (0, -0.0035, 0.002), bev=0.0003, parent=root)
    geo.box(f"{name}Label", (0.012, 0.011, 0.00005), mat.principled("CanLabel", (0.3, 0.32, 0.35), metallic=1, roughness=0.5), (0, -0.003, 0.00322), bev=0, parent=root)
    # antenna meander (gold trace)
    pts = []
    for i in range(7):
        x = -0.006 + i * 0.002
        pts += [(x, 0.0075, 0.00082), (x, 0.0115, 0.00082)] if i % 2 == 0 else [(x, 0.0115, 0.00082), (x, 0.0075, 0.00082)]
    geo.cable(f"{name}Ant", pts, 0.00018, M["gold"], parent=root)
    return root


def usb_c(name, M, loc=(0, 0, 0), rot_z=0, parent=None):
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    geo.box(f"{name}Shell", (0.009, 0.0075, 0.0032), M["chrome"], (0, 0, 0.0016), bev=0.0012, parent=root)
    geo.box(f"{name}Port", (0.0066, 0.001, 0.0018), M["chip"], (0, -0.0037, 0.0016), bev=0.0007, parent=root)
    return root


def electrolytic(name, M, r=0.003, h=0.008, loc=(0, 0, 0), parent=None):
    root = geo.empty(name, loc, parent=parent)
    sleeve = mat.principled("CapSleeve", (0.01, 0.03, 0.12), roughness=0.35, coat=0.5)
    geo.cylinder(f"{name}Body", r, h, sleeve, (0, 0, h / 2), seg=32, bev=0.0005, parent=root)
    geo.cylinder(f"{name}Top", r * 0.9, 0.0002, M["aluminium"], (0, 0, h + 0.0001), seg=32, bev=0, parent=root)
    geo.box(f"{name}Vent", (r * 1.2, 0.0003, 0.0001), M["mech"], (0, 0, h + 0.0002), bev=0, parent=root)
    return root


def terminal(name, M, n=2, loc=(0, 0, 0), rot_z=0, parent=None):
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    blue = mat.principled("TerminalBlue", (0.02, 0.15, 0.55), roughness=0.4)
    geo.box(f"{name}Body", (0.005 * n, 0.0075, 0.01), blue, (0.0025 * (n - 1), 0, 0.005), bev=0.0004, parent=root)
    for i in range(n):
        geo.cylinder(f"{name}Screw{i}", 0.0014, 0.001, M["chrome"], (i * 0.005, -0.0015, 0.0102), seg=16, bev=0.0002, parent=root)
        geo.box(f"{name}Slot{i}", (0.0022, 0.0004, 0.0003), M["mech"], (i * 0.005, -0.0015, 0.0108), bev=0, parent=root)
    return root


def heatsink(name, M, w=0.02, d=0.02, h=0.012, fins=7, loc=(0, 0, 0), parent=None):
    root = geo.empty(name, loc, parent=parent)
    geo.box(f"{name}Base", (w, d, 0.002), M["aluminium"], (0, 0, 0.001), bev=0.0003, parent=root)
    fin = geo.box(f"{name}Fin", (0.0009, d, h), M["aluminium"], (-w / 2 + 0.0006, 0, h / 2 + 0.002), bev=0.0002, parent=root)
    geo.array(fin, fins, ((w - 0.0012) / (fins - 1), 0, 0))
    return root


def devboard(name, M, kind="esp32", loc=(0, 0, 0), rot_z=0, parent=None, seed=1):
    """Composite development boards with a consistent premium look (matte black, gold, tin)."""
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    if kind == "esp32":
        w, d = 0.0285, 0.0545
        board(f"{name}B", M, w, d, silk="silk_esp32.png", parent=root)
        esp32_module(f"{name}Mod", M, (0, 0.012, 0.0016), 0, root)
        usb_c(f"{name}USB", M, (0, -d / 2 + 0.0034, 0.0016), 0, root)
        header(f"{name}HL", M, 19, (-w / 2 + 0.0013, -d / 2 + 0.004, -0.0001), 90, parent=root)
        header(f"{name}HR", M, 19, (w / 2 - 0.0013, -d / 2 + 0.004, -0.0001), 90, parent=root)
        for k, x in enumerate((-0.007, 0.007)):
            geo.box(f"{name}Btn{k}", (0.004, 0.003, 0.0016), M["chrome"], (x, -0.017, 0.0024), bev=0.0003, parent=root)
            geo.cylinder(f"{name}BtnCap{k}", 0.0009, 0.0006, M["black_plastic"], (x, -0.017, 0.0034), seg=12, bev=0.0001, parent=root)
        scatter_passives(f"{name}P", M, (0.016, 0.014), 14, seed, root)
        geo.box(f"{name}LED", (0.0016, 0.0008, 0.0006), M["glow_blue"], (0.008, -0.009, 0.0019), bev=0, parent=root)
    elif kind == "stm32":
        w, d = 0.07, 0.053
        board(f"{name}B", M, w, d, silk="silk_stm32.png", parent=root)
        qfp(f"{name}MCU", M, 0.0098, 16, (0.004, 0.002, 0.0016), 45, root)
        usb_c(f"{name}USB", M, (-w / 2 + 0.006, 0.012, 0.0016), 90, root)
        header(f"{name}H1", M, 16, (-0.02, d / 2 - 0.0025, 0.0016), 0, rows=2, parent=root, female=True)
        header(f"{name}H2", M, 16, (-0.02, -d / 2 + 0.0035, 0.0016), 0, rows=1, parent=root, female=True)
        electrolytic(f"{name}Cap", M, 0.003, 0.007, (0.026, 0.014, 0.0016), root)
        scatter_passives(f"{name}P", M, (0.03, 0.025), 26, seed + 3, root)
        geo.box(f"{name}LED1", (0.0016, 0.0008, 0.0006), M["glow_cyan"], (0.024, -0.008, 0.0019), bev=0, parent=root)
        heatsink(f"{name}HS", M, 0.012, 0.012, 0.006, 6, (-0.014, -0.006, 0.0016), root)
    elif kind == "uno":
        w, d = 0.0686, 0.0534
        board(f"{name}B", M, w, d, silk="silk_uno.png", parent=root)
        geo.box(f"{name}USBB", (0.012, 0.016, 0.011), M["chrome"], (-w / 2 + 0.005, 0.012, 0.0071), bev=0.0006, parent=root)
        geo.box(f"{name}Jack", (0.014, 0.009, 0.011), M["black_plastic"], (-w / 2 + 0.006, -0.016, 0.0071), bev=0.001, parent=root)
        qfp(f"{name}MCU", M, 0.007, 8, (0.012, -0.005, 0.0016), 0, root)
        header(f"{name}D", M, 18, (-0.018, d / 2 - 0.0025, 0.0016), 0, parent=root, female=True)
        header(f"{name}A", M, 14, (-0.006, -d / 2 + 0.0025, 0.0016), 0, parent=root, female=True)
        electrolytic(f"{name}Cap1", M, 0.0025, 0.006, (-0.012, -0.012, 0.0016), root)
        electrolytic(f"{name}Cap2", M, 0.0025, 0.006, (-0.006, -0.012, 0.0016), root)
        scatter_passives(f"{name}P", M, (0.03, 0.02), 18, seed + 7, root)
    elif kind == "driver":
        w, d = 0.043, 0.043
        board(f"{name}B", M, w, d, silk="silk_driver.png", parent=root)
        heatsink(f"{name}HS", M, 0.023, 0.025, 0.018, 9, (0.004, 0.004, 0.0016), root)
        terminal(f"{name}T1", M, 2, (-w / 2 + 0.006, -d / 2 + 0.006, 0.0016), 0, root)
        terminal(f"{name}T2", M, 3, (w / 2 - 0.016, -d / 2 + 0.006, 0.0016), 0, root)
        header(f"{name}H", M, 6, (-0.008, d / 2 - 0.003, 0.0016), 0, parent=root)
        electrolytic(f"{name}Cap", M, 0.004, 0.01, (-w / 2 + 0.008, d / 2 - 0.01, 0.0016), root)
    return root


def ultrasonic(name, M, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    root = geo.empty(name, loc, rot, parent=parent)
    board(f"{name}B", M, 0.045, 0.02, silk=None, holes=False, parent=root)
    mesh = mat.principled("TransducerMesh", (0.55, 0.56, 0.58), metallic=1, roughness=0.45)
    for sx in (-1, 1):
        geo.cylinder(f"{name}Can{sx}", 0.008, 0.012, M["aluminium"], (sx * 0.013, 0, 0.0076), seg=40, bev=0.0006, parent=root)
        geo.cylinder(f"{name}Mesh{sx}", 0.0068, 0.0006, mesh, (sx * 0.013, 0, 0.0136), seg=40, bev=0, parent=root)
    return root


def ir_array(name, M, n=8, loc=(0, 0, 0), rot=(0, 0, 0), glow=True, parent=None):
    root = geo.empty(name, loc, rot, parent=parent)
    L = n * 0.008 + 0.006
    board(f"{name}B", M, L, 0.014, silk=None, holes=False, parent=root)
    for i in range(n):
        x = -L / 2 + 0.007 + i * 0.008
        geo.box(f"{name}S{i}", (0.004, 0.006, 0.0025), M["black_plastic"], (x, 0, 0.0028), bev=0.0003, parent=root)
        geo.cylinder(f"{name}E{i}", 0.0008, 0.0004, M["glow_cyan"] if glow else M["chip"], (x - 0.001, 0, 0.0042), seg=12, bev=0, parent=root)
        geo.cylinder(f"{name}D{i}", 0.0008, 0.0004, M["visor"], (x + 0.001, 0, 0.0042), seg=12, bev=0, parent=root)
    return root


def breadboard(name, M, loc=(0, 0, 0), rot_z=0, parent=None):
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    white = mat.principled("Breadboard", (0.78, 0.79, 0.8), roughness=0.5)
    geo.box(f"{name}Body", (0.165, 0.055, 0.0085), white, (0, 0, 0.00425), bev=0.0008, parent=root)
    hole = geo.box(f"{name}Hole", (0.0011, 0.0011, 0.0002), M["chip"], (-0.079, -0.02, 0.0085), bev=0, parent=root)
    a = geo.array(hole, 63, (0.00254, 0, 0))
    a2 = hole.modifiers.new("Rows", "ARRAY")
    a2.count = 5
    a2.use_relative_offset = False
    a2.use_constant_offset = True
    a2.constant_offset_displace = (0, 0.00254, 0)
    hole2 = geo.box(f"{name}Hole2", (0.0011, 0.0011, 0.0002), M["chip"], (-0.079, 0.0098, 0.0085), bev=0, parent=root)
    geo.array(hole2, 63, (0.00254, 0, 0))
    a3 = hole2.modifiers.new("Rows", "ARRAY")
    a3.count = 5
    a3.use_relative_offset = False
    a3.use_constant_offset = True
    a3.constant_offset_displace = (0, 0.00254, 0)
    for sy, c in ((-0.025, "cable_red"), (0.025, "cable_blue")):
        geo.box(f"{name}Rail{sy}", (0.15, 0.0005, 0.00005), M[c], (0, sy, 0.0086), bev=0, parent=root)
    return root


def jumper(name, M, a, b, color="cable", lift=0.03, parent=None):
    mid = ((a[0] + b[0]) / 2, (a[1] + b[1]) / 2, max(a[2], b[2]) + lift)
    c = geo.cable(name, [a, (a[0], a[1], a[2] + lift * 0.6), mid, (b[0], b[1], b[2] + lift * 0.6), b], 0.0007, M[color], parent=parent)
    for k, p in enumerate((a, b)):
        geo.box(f"{name}Dupont{k}", (0.0026, 0.0026, 0.014), M["black_plastic"], (p[0], p[1], p[2] + 0.007), bev=0.0003, parent=parent)
    return c


def oscilloscope(name, M, loc=(0, 0, 0), rot_z=0, parent=None):
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    body = mat.principled("ScopeBody", (0.05, 0.055, 0.06), roughness=0.5, breakup=0.08)
    geo.box(f"{name}Body", (0.36, 0.14, 0.18), body, (0, 0.07, 0.09), bev=0.008, parent=root)
    geo.box(f"{name}Bezel", (0.34, 0.01, 0.16), M["black_plastic"], (0, -0.001, 0.09), bev=0.004, parent=root)
    geo.plane(f"{name}Screen", 0.21, 0.13, mat.screen("ScopeScreen", os.path.join(core.TEX, "scope.png"), 2.6), (-0.055, -0.0065, 0.092), (90, 0, 0), parent=root)
    for i in range(3):
        for j in range(3):
            geo.cylinder(f"{name}Knob{i}{j}", 0.0085, 0.012, M["gunmetal"], (0.085 + i * 0.03, -0.012, 0.135 - j * 0.035), (90, 0, 0), seg=24, bev=0.001, parent=root)
    for k, col in enumerate(("glow_cyan", "glow_blue")):
        geo.cylinder(f"{name}BNC{k}", 0.006, 0.014, M["chrome"], (0.09 + k * 0.035, -0.012, 0.03), (90, 0, 0), seg=20, bev=0.0008, parent=root)
    return root


def soldering_station(name, M, loc=(0, 0, 0), rot_z=0, parent=None, smoke=True):
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    geo.box(f"{name}Unit", (0.12, 0.15, 0.09), M["mech"], (0, 0, 0.045), bev=0.006, parent=root)
    geo.plane(f"{name}Display", 0.06, 0.026, mat.emission("SolderDisplay", (1.0, 0.35, 0.08), 6), (0, -0.0752, 0.06), (90, 0, 0), parent=root)
    geo.cylinder(f"{name}Knob", 0.012, 0.012, M["gunmetal"], (0.03, -0.08, 0.03), (90, 0, 0), seg=24, bev=0.001, parent=root)
    # iron in its coil stand
    stand = geo.empty(f"{name}Stand", (0.16, 0.0, 0.0), (0, 0, -30), parent=root)
    geo.cylinder(f"{name}StandBase", 0.04, 0.012, M["mech"], (0, 0, 0.006), seg=32, bev=0.002, parent=stand)
    for k in range(10):
        geo.torus(f"{name}Coil{k}", 0.013, 0.0012, M["chrome"], (0, 0.02 + k * 0.006, 0.05 + k * 0.004), (90 - 20, 0, 0), seg=24, seg2=6, parent=stand)
    iron = geo.empty(f"{name}Iron", (0, 0.04, 0.07), (-70, 0, 0), parent=stand)
    geo.cylinder(f"{name}Grip", 0.009, 0.1, M["black_plastic"], (0, 0, 0.0), seg=24, bev=0.002, parent=iron)
    geo.cylinder(f"{name}Sleeve", 0.004, 0.05, M["chrome"], (0, 0, -0.075), seg=20, bev=0.0005, parent=iron)
    geo.cylinder(f"{name}Tip", 0.0016, 0.022, M["copper"], (0, 0, -0.11), seg=16, bev=0.0003, r2=0.0004, parent=iron)
    geo.cable(f"{name}Lead", [(0, 0, 0.05), (0.02, 0.05, 0.03), (-0.1, 0.05, -0.05), (-0.16, -0.02, 0.02)], 0.003, M["cable"], parent=iron)
    if smoke:
        # rising flux smoke: noise-driven volume in a thin column
        import bmesh
        me = bpy.data.meshes.new(f"{name}Smoke")
        bm = bmesh.new()
        bmesh.ops.create_cube(bm, size=1.0)
        bm.to_mesh(me)
        bm.free()
        ob = bpy.data.objects.new(f"{name}Smoke", me)
        bpy.context.collection.objects.link(ob)
        ob.parent = root
        ob.location = (0.16 + 0.02, -0.03, 0.18)
        ob.scale = (0.05, 0.05, 0.16)
        sm = bpy.data.materials.new("Smoke")
        sm.use_nodes = True
        nt = sm.node_tree
        nt.nodes.clear()
        out = nt.nodes.new("ShaderNodeOutputMaterial")
        vol = nt.nodes.new("ShaderNodeVolumePrincipled")
        vol.inputs["Color"].default_value = (0.7, 0.8, 0.95, 1)
        noise = nt.nodes.new("ShaderNodeTexNoise")
        noise.inputs["Scale"].default_value = 4.0
        noise.inputs["Detail"].default_value = 8
        noise.inputs["Distortion"].default_value = 1.4
        coord = nt.nodes.new("ShaderNodeTexCoord")
        mapping = nt.nodes.new("ShaderNodeMapping")
        mapping.inputs["Scale"].default_value = (2.0, 2.0, 0.6)
        nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
        nt.links.new(mapping.outputs["Vector"], noise.inputs["Vector"])
        rng = nt.nodes.new("ShaderNodeMapRange")
        rng.inputs["From Min"].default_value = 0.55
        rng.inputs["From Max"].default_value = 0.8
        rng.inputs["To Max"].default_value = 6.0
        nt.links.new(noise.outputs["Fac"], rng.inputs["Value"])
        # fade toward the top and edges using object Z gradient
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(coord.outputs["Object"], sep.inputs["Vector"])
        fade = nt.nodes.new("ShaderNodeMapRange")
        fade.inputs["From Min"].default_value = 1.0
        fade.inputs["From Max"].default_value = -1.0
        nt.links.new(sep.outputs["Z"], fade.inputs["Value"])
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        nt.links.new(rng.outputs["Result"], mul.inputs[0])
        nt.links.new(fade.outputs["Result"], mul.inputs[1])
        nt.links.new(mul.outputs[0], vol.inputs["Density"])
        nt.links.new(vol.outputs[0], out.inputs["Volume"])
        ob.data.materials.append(sm)
    return root


def lipo(name, M, loc=(0, 0, 0), rot_z=0, size=(0.07, 0.035, 0.022), parent=None):
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    wrap = mat.principled("LipoWrap", (0.015, 0.05, 0.18), roughness=0.3, coat=0.6)
    geo.box(f"{name}Pack", size, wrap, (0, 0, size[2] / 2), bev=0.004, parent=root)
    geo.box(f"{name}Label", (size[0] * 0.6, size[1] * 0.02, size[2] * 0.6), M["glow_white"] if False else mat.principled("LipoLabel", (0.7, 0.72, 0.75), roughness=0.4), (0, -size[1] / 2 - 0.0002, size[2] / 2), bev=0, parent=root)
    geo.cable(f"{name}Red", [(size[0] / 2, 0.006, size[2] * 0.6), (size[0] / 2 + 0.02, 0.008, size[2] * 0.7), (size[0] / 2 + 0.04, 0.0, size[2] * 0.4)], 0.0015, M["cable_red"], parent=root)
    geo.cable(f"{name}Blk", [(size[0] / 2, -0.004, size[2] * 0.6), (size[0] / 2 + 0.02, -0.006, size[2] * 0.7), (size[0] / 2 + 0.04, -0.008, size[2] * 0.4)], 0.0015, M["cable"], parent=root)
    xt = mat.principled("XT60", (0.75, 0.62, 0.05), roughness=0.4)
    geo.box(f"{name}XT60", (0.016, 0.008, 0.016), xt, (size[0] / 2 + 0.048, -0.004, size[2] * 0.4), bev=0.001, parent=root)
    return root
