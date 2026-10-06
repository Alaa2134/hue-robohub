"""Robots and mechanical parts: wheels, motors, sensors, chassis, and the five competition robots."""
import math
import bpy
from . import electronics as E
from . import geo, mat

TEAM = {
    "line_follower": (0.10, 0.36, 1.0),
    "sumo": (1.0, 0.18, 0.18),
    "sprint": (1.0, 0.45, 0.06),
    "autonomous": (0.12, 0.85, 0.42),
    "innovation": (0.55, 0.33, 1.0),
}


def tire_mat(name="Tire"):
    """Rubber with moulded tread pattern (procedural bump) so tyres catch light like the real thing."""
    m = mat.principled(name, (0.012, 0.012, 0.013), roughness=0.78, breakup=0.08)
    nt = m.node_tree
    b = nt.nodes["Principled BSDF"]
    coord = nt.nodes.new("ShaderNodeTexCoord")
    wave = nt.nodes.new("ShaderNodeTexWave")
    wave.wave_type = "BANDS"
    wave.bands_direction = "Z"
    wave.inputs["Scale"].default_value = 220
    wave.inputs["Distortion"].default_value = 0
    nt.links.new(coord.outputs["Object"], wave.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[1].position = 0.55
    nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.7
    nt.links.new(ramp.outputs["Color"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    return m


def wheel(name, M, r, w, loc=(0, 0, 0), rot_z=0, hub="aluminium", spokes=5, tread=True, accent=None, parent=None):
    """Wheel on the Y axis: tyre with tread grooves, machined spoked hub, hex nut."""
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    tm = tire_mat()
    tire = geo.cylinder(f"{name}Tire", r, w, tm, (0, 0, 0), (90, 0, 0), seg=64, bev=min(r * 0.18, w * 0.3), parent=root)
    if tread and r >= 0.02:
        n = max(18, int(r * 900))
        for i in range(n):
            a = 2 * math.pi * i / n
            lug = geo.box(f"{name}Lug{i}", (r * 0.07, w * 0.82, r * 0.1), tm, (r * 0.99 * math.cos(a), 0, r * 0.99 * math.sin(a)), bev=r * 0.015, parent=root)
            lug.rotation_euler = (0, -a, 0)
    hm = M[hub]
    rim_r = r * 0.68
    for sgn in (-1, 1):
        geo.cylinder(f"{name}Rim{sgn}", rim_r, w * 0.12, hm, (0, sgn * w * 0.45, 0), (90, 0, 0), seg=48, bev=rim_r * 0.05, parent=root)
        geo.cylinder(f"{name}Hubc{sgn}", rim_r * 0.28, w * 0.2, hm, (0, sgn * w * 0.5, 0), (90, 0, 0), seg=6, bev=rim_r * 0.03, parent=root)
        for i in range(spokes):
            a = 2 * math.pi * i / spokes
            sp = geo.box(f"{name}Spoke{sgn}{i}", (rim_r * 0.9, w * 0.08, rim_r * 0.16), hm, (0, sgn * w * 0.5, 0), bev=rim_r * 0.03, parent=root)
            sp.rotation_euler = (0, a, 0)
            sp.location = (math.cos(a) * rim_r * 0.42, sgn * w * 0.52, math.sin(a) * rim_r * 0.42)
        geo.cylinder(f"{name}Recess{sgn}", rim_r * 0.92, w * 0.05, M["mech"], (0, sgn * w * 0.47, 0), (90, 0, 0), seg=48, bev=0, parent=root)
    if accent is not None:
        geo.torus(f"{name}Ring", rim_r * 0.95, max(0.0006, r * 0.02), accent, (0, w * 0.53, 0), (90, 0, 0), seg=64, seg2=8, parent=root)
    return root


def gearmotor(name, M, r=0.006, l=0.024, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    """N20-style micro gearmotor along the Y axis."""
    root = geo.empty(name, loc, rot, parent=parent)
    geo.box(f"{name}Gearbox", (r * 2.0, l * 0.38, r * 1.7), M["gold"], (0, -l * 0.3, 0), bev=0.0006, parent=root)
    geo.cylinder(f"{name}Can", r, l * 0.62, M["aluminium"], (0, l * 0.2, 0), (90, 0, 0), seg=32, bev=0.0006, parent=root)
    geo.cylinder(f"{name}Shaft", r * 0.25, l * 0.4, M["chrome"], (0, -l * 0.6, 0), (90, 0, 0), seg=12, bev=0.0002, parent=root)
    geo.cylinder(f"{name}Encoder", r * 1.05, l * 0.1, M["chip"], (0, l * 0.55, 0), (90, 0, 0), seg=32, bev=0.0004, parent=root)
    return root


def dc_motor(name, M, r=0.0185, l=0.07, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    """37 mm DC gearmotor with encoder along the Y axis."""
    root = geo.empty(name, loc, rot, parent=parent)
    geo.cylinder(f"{name}Can", r, l * 0.55, M["aluminium"], (0, l * 0.18, 0), (90, 0, 0), seg=48, bev=0.001, parent=root)
    geo.cylinder(f"{name}Gear", r * 1.02, l * 0.35, M["gold"], (0, -l * 0.27, 0), (90, 0, 0), seg=48, bev=0.001, parent=root)
    geo.cylinder(f"{name}Enc", r * 0.98, l * 0.12, M["chip"], (0, l * 0.5, 0), (90, 0, 0), seg=48, bev=0.001, parent=root)
    geo.cylinder(f"{name}Shaft", r * 0.16, l * 0.25, M["chrome"], (0, -l * 0.55, 0), (90, 0, 0), seg=16, bev=0.0003, parent=root)
    return root


def lidar(name, M, loc=(0, 0, 0), parent=None, glow="glow_cyan"):
    root = geo.empty(name, loc, parent=parent)
    geo.cylinder(f"{name}Base", 0.036, 0.016, M["mech"], (0, 0, 0.008), seg=48, bev=0.002, parent=root)
    geo.cylinder(f"{name}Turret", 0.034, 0.026, M["black_plastic"], (0, 0, 0.03), seg=48, bev=0.004, parent=root)
    geo.cylinder(f"{name}Window", 0.0342, 0.007, M["visor"], (0, 0, 0.03), seg=48, bev=0, parent=root)
    geo.torus(f"{name}Glow", 0.0345, 0.0009, M[glow], (0, 0, 0.042), seg=64, seg2=6, parent=root)
    return root


def depth_camera(name, M, loc=(0, 0, 0), rot=(0, 0, 0), parent=None):
    root = geo.empty(name, loc, rot, parent=parent)
    geo.box(f"{name}Body", (0.09, 0.025, 0.025), M["aluminium"], (0, 0, 0), bev=0.005, parent=root)
    geo.box(f"{name}Face", (0.082, 0.002, 0.019), M["visor"], (0, -0.0126, 0), bev=0.003, parent=root)
    for i, x in enumerate((-0.03, -0.012, 0.012, 0.03)):
        geo.cylinder(f"{name}Lens{i}", 0.004 if i in (0, 3) else 0.003, 0.002, M["glass"], (x, -0.0136, 0), (90, 0, 0), seg=24, bev=0, parent=root)
    return root


def extrusion(name, M, length, loc, rot=(0, 0, 0), size=0.02, parent=None):
    """2020 aluminium extrusion with T-slot grooves along X."""
    root = geo.empty(name, loc, rot, parent=parent)
    geo.box(f"{name}Bar", (length, size, size), M["aluminium"], (0, 0, 0), bev=0.0012, parent=root)
    for sy, sz, rx in ((0, size / 2, 0), (0, -size / 2, 0), (size / 2, 0, 90), (-size / 2, 0, 90)):
        geo.box(f"{name}Slot{sy}{sz}", (length * 0.999, 0.006, 0.003), M["mech"], (0, sy * 0.99, sz * 0.99), (rx, 0, 0), bev=0, parent=root)
    return root


def underglow(name, M, size, loc, color, strength=8, parent=None):
    m = mat.emission(f"Underglow{name}", color, strength)
    geo.box(name, size, m, loc, bev=0, parent=parent)
    return m


def accent_mat(team, strength=16):
    return mat.emission(f"Accent_{team}", TEAM[team], min(strength, 7.0))


def paint_mat(team, rough=0.3):
    c = TEAM[team]
    return mat.principled(f"Paint_{team}", (c[0] * 0.55, c[1] * 0.55, c[2] * 0.55), metallic=0.6, roughness=rough, coat=1.0, coat_rough=0.04)


# ─── Competition robots (each built at real scale, origin on the floor) ──────


def line_follower(name, M, loc=(0, 0, 0), rot_z=0):
    root = geo.empty(name, loc, (0, 0, rot_z))
    acc = accent_mat("line_follower", 14)
    # T-shaped PCB chassis: rear deck + neck + sensor wing
    E.board(f"{name}Deck", M, 0.09, 0.075, (0, 0.02, 0.018), silk="silk_driver.png", holes=True, parent=root)
    E.board(f"{name}Neck", M, 0.03, 0.09, (0, -0.06, 0.018), holes=False, parent=root)
    E.ir_array(f"{name}Wing", M, 12, (0, -0.11, 0.018), (0, 0, 0), True, root)
    for sx in (-1, 1):
        gearmotor(f"{name}Mot{sx}", M, 0.006, 0.026, (sx * 0.03, 0.035, 0.012), (0, 0, 90), root)
        wheel(f"{name}W{sx}", M, 0.017, 0.012, (sx * 0.058, 0.035, 0.017), 90, "anodized_blue", 5, True, acc, root)
    geo.sphere(f"{name}Caster", 0.005, M["chrome"], (0, -0.09, 0.005), parent=root)
    E.esp32_module(f"{name}MCU", M, (0.0, 0.025, 0.0196), 0, root)
    E.lipo(f"{name}Bat", M, (0, 0.04, 0.0196), 90, (0.04, 0.026, 0.009), root)
    geo.box(f"{name}OLED", (0.025, 0.014, 0.002), M["black_plastic"], (0.025, 0.0, 0.021), bev=0.0005, parent=root)
    geo.plane(f"{name}OLEDScreen", 0.02, 0.01, acc, (0.025, 0.0, 0.0222), parent=root)
    underglow(f"{name}Glow", M, (0.05, 0.14, 0.001), (0, -0.02, 0.012), TEAM["line_follower"], 10, root)
    return root


def sumo(name, M, loc=(0, 0, 0), rot_z=0):
    root = geo.empty(name, loc, (0, 0, rot_z))
    acc = accent_mat("sumo", 18)
    paint = paint_mat("sumo")
    blade_steel = mat.principled("BladeSteel", (0.72, 0.73, 0.75), metallic=1.0, roughness=0.18, breakup=0.12, scratches=True)
    # Armoured body
    body = [(-0.095, -0.06, 0.012), (0.095, -0.06, 0.012), (-0.095, 0.095, 0.012), (0.095, 0.095, 0.012),
            (-0.09, -0.03, 0.055), (0.09, -0.03, 0.055), (-0.09, 0.09, 0.06), (0.09, 0.09, 0.06)]
    geo.hull(f"{name}Body", body, M["armor"], parent=root, bev=0.003)
    geo.hull(f"{name}Top", [(-0.07, -0.02, 0.06), (0.07, -0.02, 0.06), (-0.07, 0.08, 0.064), (0.07, 0.08, 0.064),
                             (-0.065, -0.015, 0.066), (0.065, -0.015, 0.066), (-0.065, 0.075, 0.068), (0.065, 0.075, 0.068)], M["carbon"], parent=root, bev=0.002)
    # Wedge blade
    geo.hull(f"{name}Blade", [(-0.1, -0.108, 0.001), (0.1, -0.108, 0.001), (-0.1, -0.058, 0.04), (0.1, -0.058, 0.04),
                               (-0.1, -0.1, 0.0005), (0.1, -0.1, 0.0005), (-0.1, -0.055, 0.035), (0.1, -0.055, 0.035)], blade_steel, parent=root, bev=0.0008)
    # Side armour panels in team red
    for sx in (-1, 1):
        geo.hull(f"{name}Side{sx}", [(sx * 0.1, -0.05, 0.01), (sx * 0.1, 0.095, 0.01), (sx * 0.1, -0.035, 0.052), (sx * 0.1, 0.09, 0.056),
                                     (sx * 0.093, -0.05, 0.01), (sx * 0.093, 0.095, 0.01), (sx * 0.093, -0.035, 0.052), (sx * 0.093, 0.09, 0.056)], paint, parent=root, bev=0.0015)
        geo.box(f"{name}Strip{sx}", (0.002, 0.11, 0.003), acc, (sx * 0.1015, 0.02, 0.045), bev=0, parent=root)
        for k, y in enumerate((-0.025, 0.06)):
            wheel(f"{name}W{sx}{k}", M, 0.022, 0.02, (sx * 0.085, y, 0.022), 90, "mech", 6, True, None, root)
    # Opponent sensors
    for i, x in enumerate((-0.05, -0.017, 0.017, 0.05)):
        geo.box(f"{name}ToF{i}", (0.012, 0.004, 0.008), M["visor"], (x, -0.061, 0.045), bev=0.001, parent=root)
        geo.cylinder(f"{name}ToFLed{i}", 0.0012, 0.001, acc, (x, -0.0633, 0.045), (90, 0, 0), seg=12, bev=0, parent=root)
    for i in range(6):
        geo.cylinder(f"{name}Bolt{i}", 0.0025, 0.002, M["chrome"], (-0.06 + i * 0.024, -0.072, 0.03), (55, 0, 0), seg=12, bev=0.0004, parent=root)
    geo.box(f"{name}Number", (0.03, 0.03, 0.0005), acc, (0.0, 0.03, 0.0686), bev=0, parent=root)
    return root


def sprint(name, M, loc=(0, 0, 0), rot_z=0):
    """Low, long racer with aero bodywork (F1-inspired)."""
    root = geo.empty(name, loc, (0, 0, rot_z))
    acc = accent_mat("sprint", 16)
    paint = paint_mat("sprint", 0.25)
    shell = [
        (0.0, -0.18, 0.018), (0.012, -0.17, 0.02), (-0.012, -0.17, 0.02), (0.03, -0.08, 0.026), (-0.03, -0.08, 0.026),
        (0.06, 0.0, 0.03), (-0.06, 0.0, 0.03), (0.065, 0.09, 0.028), (-0.065, 0.09, 0.028), (0.03, 0.13, 0.03), (-0.03, 0.13, 0.03),
        (0.0, -0.17, 0.012), (0.03, -0.08, 0.01), (-0.03, -0.08, 0.01), (0.06, 0.1, 0.01), (-0.06, 0.1, 0.01), (0.0, 0.0, 0.052), (0.0, 0.06, 0.06),
    ]
    geo.hull(f"{name}Mono", shell, M["armor"], parent=root, bev=0.002)
    geo.hull(f"{name}Stripe", [(0.006, -0.17, 0.0205), (-0.006, -0.17, 0.0205), (0.01, -0.02, 0.0525), (-0.01, -0.02, 0.0525), (0.01, 0.06, 0.0605), (-0.01, 0.06, 0.0605),
                               (0.006, -0.17, 0.019), (-0.006, -0.17, 0.019), (0.01, 0.06, 0.058), (-0.01, 0.06, 0.058)], paint, parent=root, bev=0.0005)
    # Sidepods
    for sx in (-1, 1):
        geo.hull(f"{name}Pod{sx}", [(sx * 0.045, -0.04, 0.012), (sx * 0.075, -0.02, 0.014), (sx * 0.075, 0.07, 0.014), (sx * 0.05, 0.09, 0.012),
                                    (sx * 0.05, -0.03, 0.03), (sx * 0.072, 0.0, 0.03), (sx * 0.07, 0.07, 0.028)], M["armor_satin"], parent=root, bev=0.0015)
        geo.box(f"{name}PodGlow{sx}", (0.001, 0.08, 0.002), acc, (sx * 0.0752, 0.025, 0.022), bev=0, parent=root)
    # Wings
    geo.box(f"{name}FrontWing", (0.15, 0.022, 0.003), M["carbon"], (0, -0.17, 0.008), (-6, 0, 0), bev=0.0008, parent=root)
    geo.box(f"{name}FrontFlap", (0.15, 0.012, 0.0025), paint, (0, -0.158, 0.014), (-18, 0, 0), bev=0.0006, parent=root)
    for sx in (-1, 1):
        geo.box(f"{name}FEnd{sx}", (0.002, 0.03, 0.016), M["carbon"], (sx * 0.076, -0.168, 0.012), bev=0.0005, parent=root)
        geo.box(f"{name}REnd{sx}", (0.002, 0.04, 0.045), M["carbon"], (sx * 0.06, 0.15, 0.05), bev=0.0006, parent=root)
    geo.box(f"{name}RearWing", (0.12, 0.03, 0.003), M["carbon"], (0, 0.15, 0.07), (8, 0, 0), bev=0.0008, parent=root)
    geo.box(f"{name}RearFlap", (0.12, 0.016, 0.0025), paint, (0, 0.14, 0.078), (25, 0, 0), bev=0.0006, parent=root)
    geo.box(f"{name}WingPylon", (0.004, 0.02, 0.04), M["carbon"], (0, 0.14, 0.05), bev=0.0005, parent=root)
    # Wheels
    for sx in (-1, 1):
        wheel(f"{name}WF{sx}", M, 0.024, 0.022, (sx * 0.072, -0.115, 0.024), 90, "mech", 5, True, acc, root)
        wheel(f"{name}WR{sx}", M, 0.03, 0.032, (sx * 0.08, 0.095, 0.03), 90, "mech", 5, True, acc, root)
    underglow(f"{name}Glow", M, (0.08, 0.26, 0.001), (0, -0.01, 0.006), (0.15, 0.45, 1.0), 9, root)
    geo.cylinder(f"{name}Intake", 0.008, 0.012, M["visor"], (0, 0.03, 0.062), (90, 0, 0), seg=24, bev=0.0005, parent=root)
    return root


def autonomous(name, M, loc=(0, 0, 0), rot_z=0):
    root = geo.empty(name, loc, (0, 0, rot_z))
    acc = accent_mat("autonomous", 14)
    z0 = 0.06
    for sy in (-1, 1):
        extrusion(f"{name}RailX{sy}", M, 0.26, (0, sy * 0.1, z0), parent=root)
    for sx in (-1, 1):
        extrusion(f"{name}RailY{sx}", M, 0.18, (sx * 0.12, 0, z0), (0, 0, 90), parent=root)
    smoked = mat.principled("SmokedAcrylic", (0.02, 0.025, 0.03), roughness=0.05, coat=1.0)
    geo.box(f"{name}Deck", (0.26, 0.22, 0.004), smoked, (0, 0, z0 + 0.012), bev=0.001, parent=root)
    geo.box(f"{name}Deck2", (0.2, 0.18, 0.004), smoked, (0, 0.005, z0 + 0.075), bev=0.001, parent=root)
    for sx in (-1, 1):
        for sy in (-1, 1):
            geo.cylinder(f"{name}Standoff{sx}{sy}", 0.003, 0.062, M["aluminium"], (sx * 0.09, sy * 0.075, z0 + 0.044), seg=6, bev=0.0003, parent=root)
            wheel(f"{name}W{sx}{sy}", M, 0.05, 0.04, (sx * 0.15, sy * 0.085, 0.05), 90, "anodized_blue" if False else "mech", 6, True, acc, root)
            dc_motor(f"{name}M{sx}{sy}", M, 0.0185, 0.07, (sx * 0.095, sy * 0.085, 0.05), (0, 0, 90 * sx), root)
    # Compute (Jetson-like) with heatsink and fan
    geo.box(f"{name}Compute", (0.1, 0.08, 0.02), M["mech"], (0, -0.01, z0 + 0.025), bev=0.002, parent=root)
    E.heatsink(f"{name}HS", M, 0.07, 0.07, 0.018, 12, (0, -0.01, z0 + 0.035), root)
    E.lipo(f"{name}Bat", M, (0, 0.06, z0 + 0.014), 0, (0.1, 0.045, 0.028), root)
    # Sensor mast
    geo.cylinder(f"{name}Mast", 0.006, 0.12, M["aluminium"], (0, 0.04, z0 + 0.14), seg=16, bev=0.0005, parent=root)
    lidar(f"{name}Lidar", M, (0, 0.04, z0 + 0.2), root)
    depth_camera(f"{name}Cam", M, (0, -0.105, z0 + 0.05), (0, 0, 0), root)
    for sx in (-1, 1):
        geo.cylinder(f"{name}Antenna{sx}", 0.0025, 0.09, M["black_plastic"], (sx * 0.08, 0.09, z0 + 0.12), (sx * 8, 0, 0), seg=12, bev=0.0004, parent=root)
        geo.box(f"{name}Lamp{sx}", (0.03, 0.004, 0.008), acc, (sx * 0.06, -0.111, z0 + 0.012), bev=0.001, parent=root)
    geo.cable(f"{name}Harness", [(0, -0.01, z0 + 0.03), (0.03, 0.03, z0 + 0.09), (0.0, 0.04, z0 + 0.1)], 0.003, M["cable"], parent=root)
    return root


def manipulator_arm(name, M, loc=(0, 0, 0), rot_z=0, pose=(25, -30, 70, 25), accent=None, scale=1.0, parent=None):
    """4-DOF arm with machined links and parallel gripper (origin at base)."""
    root = geo.empty(name, loc, (0, 0, rot_z), parent=parent)
    root.scale = (scale, scale, scale)
    geo.cylinder(f"{name}Base", 0.06, 0.03, M["mech"], (0, 0, 0.015), seg=48, bev=0.003, parent=root)
    j1 = geo.empty(f"{name}J1", (0, 0, 0.03), (0, 0, pose[0]), parent=root)
    geo.cylinder(f"{name}Turret", 0.045, 0.05, M["aluminium"], (0, 0, 0.025), seg=48, bev=0.003, parent=j1)
    if accent:
        geo.torus(f"{name}TurretRing", 0.046, 0.0016, accent, (0, 0, 0.05), seg=64, seg2=8, parent=j1)
    j2 = geo.empty(f"{name}J2", (0, 0, 0.065), (pose[1], 0, 0), parent=j1)
    geo.cylinder(f"{name}J2Hub", 0.03, 0.07, M["mech"], (0, 0, 0), (0, 90, 0), seg=32, bev=0.003, parent=j2)
    for sx in (-1, 1):
        geo.box(f"{name}UpperL{sx}", (0.008, 0.035, 0.16), M["aluminium"], (sx * 0.025, 0, 0.08), bev=0.002, parent=j2)
    j3 = geo.empty(f"{name}J3", (0, 0, 0.16), (pose[2], 0, 0), parent=j2)
    geo.cylinder(f"{name}J3Hub", 0.024, 0.06, M["mech"], (0, 0, 0), (0, 90, 0), seg=32, bev=0.002, parent=j3)
    geo.box(f"{name}Fore", (0.03, 0.03, 0.13), M["armor_satin"], (0, 0, 0.065), bev=0.004, parent=j3)
    j4 = geo.empty(f"{name}J4", (0, 0, 0.13), (pose[3], 0, 0), parent=j3)
    geo.cylinder(f"{name}Wrist", 0.018, 0.035, M["aluminium"], (0, 0, 0.0175), seg=32, bev=0.002, parent=j4)
    geo.box(f"{name}Palm", (0.05, 0.022, 0.012), M["mech"], (0, 0, 0.04), bev=0.002, parent=j4)
    for sx in (-1, 1):
        geo.box(f"{name}Jaw{sx}", (0.006, 0.02, 0.035), M["aluminium"], (sx * 0.016, 0, 0.062), bev=0.001, parent=j4)
    return root


def innovation(name, M, loc=(0, 0, 0), rot_z=0):
    root = geo.empty(name, loc, (0, 0, rot_z))
    acc = accent_mat("innovation", 14)
    paint = paint_mat("innovation", 0.3)
    base = [(-0.13, -0.11, 0.03), (0.13, -0.11, 0.03), (-0.13, 0.11, 0.03), (0.13, 0.11, 0.03),
            (-0.12, -0.1, 0.085), (0.12, -0.1, 0.085), (-0.12, 0.1, 0.085), (0.12, 0.1, 0.085)]
    geo.hull(f"{name}Base", base, M["armor"], parent=root, bev=0.004)
    geo.box(f"{name}Band", (0.262, 0.222, 0.008), paint, (0, 0, 0.06), bev=0.002, parent=root)
    geo.box(f"{name}BandGlow", (0.264, 0.224, 0.0015), acc, (0, 0, 0.066), bev=0, parent=root)
    for sx in (-1, 1):
        for sy in (-1, 1):
            wheel(f"{name}W{sx}{sy}", M, 0.035, 0.028, (sx * 0.12, sy * 0.08, 0.035), 90, "mech", 6, True, None, root)
    manipulator_arm(f"{name}Arm", M, (0.0, 0.02, 0.085), 20, (30, -35, 75, 20), acc, 1.0, root)
    depth_camera(f"{name}Cam", M, (0, -0.112, 0.07), (0, 0, 0), root)
    # payload: a small PCB being placed
    E.board(f"{name}Payload", M, 0.04, 0.03, (0.06, -0.12, 0.0), (0, 0, 20), silk="silk_driver.png", parent=root)
    return root


def rover6(name, M, loc=(0, 0, 0), rot_z=0, accent="glow_blue"):
    """Six-wheel rocker-bogie rover (Robotics track): composite body, carbon deck, stereo mast, LiDAR."""
    root = geo.empty(name, loc, (0, 0, rot_z))
    acc = M[accent]
    shell = mat.panel_lines(mat.principled("RoverShell", (0.72, 0.74, 0.77), roughness=0.34, coat=0.5, breakup=0.06), 10.0, 0.02)
    body = [(-0.11, -0.14, 0.105), (0.11, -0.14, 0.105), (-0.11, 0.14, 0.105), (0.11, 0.14, 0.105),
            (-0.1, -0.125, 0.165), (0.1, -0.125, 0.165), (-0.1, 0.125, 0.17), (0.1, 0.125, 0.17), (0, -0.152, 0.13)]
    geo.hull(f"{name}Body", body, shell, parent=root, bev=0.004)
    # dark belly pan + side armour panels
    geo.hull(f"{name}Belly", [(-0.105, -0.13, 0.09), (0.105, -0.13, 0.09), (-0.105, 0.13, 0.09), (0.105, 0.13, 0.09),
                              (-0.11, -0.14, 0.108), (0.11, -0.14, 0.108), (-0.11, 0.14, 0.108), (0.11, 0.14, 0.108)], M["mech"], parent=root, bev=0.002)
    for sx in (-1, 1):
        geo.hull(f"{name}SidePanel{sx}", [(sx * 0.111, -0.11, 0.115), (sx * 0.111, 0.11, 0.115), (sx * 0.111, -0.1, 0.155), (sx * 0.111, 0.1, 0.158),
                                          (sx * 0.104, -0.11, 0.115), (sx * 0.104, 0.11, 0.115), (sx * 0.104, -0.1, 0.155), (sx * 0.104, 0.1, 0.158)], M["armor_satin"], parent=root, bev=0.0012)
        geo.box(f"{name}Status{sx}", (0.0015, 0.07, 0.003), acc, (sx * 0.1122, 0.0, 0.148), bev=0, parent=root)
    geo.box(f"{name}Deck", (0.17, 0.21, 0.005), M["carbon"], (0, 0.0, 0.174), bev=0.001, parent=root)
    for sx in (-1, 1):
        extrusion(f"{name}Rail{sx}", M, 0.2, (sx * 0.075, 0.0, 0.186), (0, 0, 90), 0.012, root)
        # rocker + bogie links
        geo.box(f"{name}Rocker{sx}", (0.012, 0.22, 0.014), M["mech"], (sx * 0.14, -0.02, 0.1), (12, 0, 0), bev=0.002, parent=root)
        geo.box(f"{name}Bogie{sx}", (0.012, 0.16, 0.014), M["mech"], (sx * 0.14, 0.1, 0.07), (-8, 0, 0), bev=0.002, parent=root)
        geo.cylinder(f"{name}Pivot{sx}", 0.013, 0.022, M["aluminium"], (sx * 0.14, 0.03, 0.1), (0, 90, 0), seg=24, bev=0.001, parent=root)
        for k, y in enumerate((-0.13, 0.04, 0.17)):
            wheel(f"{name}W{sx}{k}", M, 0.042, 0.034, (sx * 0.165, y, 0.042), 90, "aluminium", 6, True, None, root)
            gearmotor(f"{name}Hub{sx}{k}", M, 0.009, 0.03, (sx * 0.142, y, 0.042), (0, 0, 90), root)
    # stereo camera mast (pan-tilt) + LiDAR puck
    geo.cylinder(f"{name}Mast", 0.007, 0.11, M["aluminium"], (0, -0.075, 0.235), seg=16, bev=0.0005, parent=root)
    geo.box(f"{name}PanTilt", (0.03, 0.025, 0.02), M["mech"], (0, -0.075, 0.295), bev=0.002, parent=root)
    depth_camera(f"{name}Stereo", M, (0, -0.082, 0.318), (0, 0, 0), root)
    lidar(f"{name}Lidar", M, (0, 0.07, 0.19), root, "glow_blue")
    geo.cylinder(f"{name}Antenna", 0.002, 0.12, M["black_plastic"], (0.06, 0.1, 0.25), (6, -8, 0), seg=10, bev=0.0003, parent=root)
    E.ultrasonic(f"{name}US", M, (0, -0.152, 0.125), (90, 0, 0), root)
    return root
