"""07 — Bootcamp signature: RH-T1 trainer robot assembled week by week (stage 1–7, same camera for seamless crossfades).

Usage: python scenes/bootcamp.py -- <preview|final> <stage 1..7>
Each stage seats the previous weeks' parts and floats the current week's parts just above their mounts.
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, electronics as E, geo, machines as MC, mat

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["preview", "7"]
q, stage = args[0], int(args[1])
core.reset()
core.render_settings(q, (1920, 1080), exposure=-0.1)
core.world((0.0006, 0.0008, 0.0014))
M = mat.library()
FLOAT = 0.028


def lift(week):
    """Parts installed this week hover above their mounts; earlier weeks are seated; future weeks absent."""
    return FLOAT if (week == stage and stage < 7) else 0.0


def show(week):
    return week <= stage


final = stage >= 7
root = geo.empty("RHT1", (0, 0, 0), (0, 0, 0))

# Build stand (bench work happens with the wheels off the ground)
if not final:
    stand_m = mat.principled("Stand", (0.03, 0.032, 0.036), roughness=0.5, metallic=0.6)
    geo.box("Stand", (0.07, 0.05, 0.03), stand_m, (0, 0.0, 0.015), bev=0.002)
    geo.box("StandPad", (0.072, 0.052, 0.003), M["rubber"], (0, 0.0, 0.0315), bev=0.0008)

# ─── Week 1: chassis plate, battery holder + switch, breadboard ─────────────
plate_pts = []
for cx, cy, a0 in ((0.07, 0.055, 0), (-0.07, 0.055, 90), (-0.07, -0.055, 180), (0.07, -0.055, 270)):
    for k in range(9):
        a = math.radians(a0 + k * 90 / 8)
        plate_pts.append((cx + 0.012 * math.cos(a), cy + 0.012 * math.sin(a)))
plate_holes = [list(reversed(geo.circle_pts(0.0018, 16, x, y))) for x, y in ((-0.06, -0.045), (0.06, -0.045), (-0.06, 0.045), (0.06, 0.045), (0, 0.02), (-0.03, 0.0), (0.03, 0.0))]
plate_m = mat.principled("Plate", (0.02, 0.07, 0.3), metallic=1.0, roughness=0.32, breakup=0.06)
z_plate = 0.035 if final else 0.0345
geo.extrude_polygon("Plate", plate_pts, 0.003, plate_m, (0, 0, z_plate), (0, 0, 0), 0.0008, holes=plate_holes, parent=root)
if show(1):
    l = lift(1)
    bh = geo.empty("BatHolder", (0, 0.03, z_plate + 0.0015 + l), parent=root)
    geo.box("BatBox", (0.078, 0.042, 0.02), M["black_plastic"], (0, 0, 0.01), bev=0.0015, parent=bh)
    for sx in (-1, 1):
        geo.cylinder(f"Cell{sx}", 0.0092, 0.066, mat.principled("Cell", (0.05, 0.25, 0.75), roughness=0.3, coat=0.6), (0, sx * 0.0102, 0.0125), (0, 90, 0), seg=32, bev=0.0008, parent=bh)
    geo.box("Switch", (0.012, 0.008, 0.006), M["black_plastic"], (0.05, 0.0, 0.003), bev=0.0008, parent=bh)
    geo.box("SwitchLever", (0.003, 0.002, 0.006), M["chrome"], (0.05, 0.0, 0.008), (0, 0, 0), bev=0.0003, parent=bh)
    bb = geo.empty("BBMini", (0.0, -0.02, z_plate + 0.0015 + l), parent=root)
    geo.box("BBMiniBody", (0.047, 0.035, 0.0085), M["white_plastic"], (0, 0, 0.00425), bev=0.0008, parent=bb)
    for i in range(17):
        for j in range(5):
            geo.box(f"BBH{i}{j}", (0.0012, 0.0012, 0.0004), M["chip"], (-0.02 + i * 0.00254, -0.012 + j * 0.00254 + (0.008 if j > 1 else 0), 0.0086), bev=0, parent=bb)

# ─── Week 2: controller + IR array + ultrasonic ─────────────────────────────
if show(2):
    l = lift(2)
    E.devboard("Nano", M, "esp32", (0.0, -0.002, z_plate + 0.024 + l), 90, root)
    E.ir_array("IR", M, 6, (0.0, -0.085, z_plate - 0.012 + l), (0, 0, 0), final, root)
    E.ultrasonic("US", M, (0.0, -0.07, z_plate + 0.028 + l), (90, 0, 0), root)
    geo.box("USBracket", (0.04, 0.003, 0.025), M["black_plastic"], (0, -0.062, z_plate + 0.014 + l), bev=0.0006, parent=root)

# ─── Week 3: drivetrain — gearmotors, wheels, caster, driver ────────────────
if show(3):
    l = lift(3)
    for sx in (-1, 1):
        MC.gearmotor(f"Mot{sx}", M, 0.0065, 0.03, (sx * 0.045, 0.0, z_plate - 0.009 + l), (0, 0, 90), root)
        MC.wheel(f"W{sx}", M, 0.033, 0.016, (sx * (0.077 + l * 0.8), 0.0, 0.033 + (0.0 if final else 0.004)), 90, "anodized_blue", 6, True, M["glow_cyan"] if final else None, root)
    geo.sphere("Caster", 0.008, M["chrome"], (0, 0.058, 0.008 + l * 0.5), parent=root)
    geo.cylinder("CasterMount", 0.01, 0.022, M["black_plastic"], (0, 0.058, 0.023 + l * 0.5), seg=24, bev=0.001, parent=root)
    E.devboard("Driver", M, "driver", (0.03, 0.045, z_plate + 0.0035 + l), 0, root)

# ─── Week 4: ESP32 wireless module + status LEDs ────────────────────────────
if show(4):
    l = lift(4)
    E.esp32_module("ESP", M, (-0.033, 0.045, z_plate + 0.004 + l), 0, root)
    geo.cylinder("Antenna", 0.0016, 0.05, M["black_plastic"], (-0.05, 0.06, z_plate + 0.03 + l), (0, -12, 0), seg=10, bev=0.0002, parent=root)
    for k in range(3):
        led = M["glow_cyan"] if (final or stage >= 4) else M["chip"]
        geo.cylinder(f"LED{k}", 0.0015, 0.003, led, (-0.05 + k * 0.006, -0.045, z_plate + 0.003 + l), seg=12, bev=0.0002, parent=root)

# ─── Week 5: printed shell + bumper + sensor mounts ─────────────────────────
if show(5):
    l = lift(5) * 1.6
    shell_m = mat.panel_lines(mat.principled("ShellPLA", (0.07, 0.075, 0.085), roughness=0.36, coat=0.45, breakup=0.05), 14.0, 0.02)
    shell = [(-0.075, -0.06, z_plate + 0.032), (0.075, -0.06, z_plate + 0.032), (-0.075, 0.07, z_plate + 0.032), (0.075, 0.07, z_plate + 0.032),
             (-0.06, -0.045, z_plate + 0.058), (0.06, -0.045, z_plate + 0.058), (-0.06, 0.058, z_plate + 0.062), (0.06, 0.058, z_plate + 0.062)]
    geo.hull("Shell", [(x, y, z + l) for x, y, z in shell], shell_m, parent=root, bev=0.004)
    geo.box("ShellStripe", (0.012, 0.13, 0.002), mat.principled("Stripe", (0.02, 0.1, 0.5), roughness=0.35), (0, 0.006, z_plate + 0.0605 + l), bev=0.0006, parent=root)
    geo.hull("Bumper", [(-0.07, -0.098, 0.012 + l), (0.07, -0.098, 0.012 + l), (-0.07, -0.088, 0.03 + l), (0.07, -0.088, 0.03 + l),
                        (-0.065, -0.082, 0.012 + l), (0.065, -0.082, 0.012 + l), (-0.065, -0.078, 0.028 + l), (0.065, -0.078, 0.028 + l)], M["black_plastic"], parent=root, bev=0.0015)
    geo.box("Badge", (0.024, 0.024, 0.001), M["glow_blue"] if stage >= 6 else M["chip"], (0.0, 0.03, z_plate + 0.0625 + l), bev=0, parent=root)

# ─── Week 6: harness + LiPo + underglow ─────────────────────────────────────
if show(6):
    l = lift(6)
    E.lipo("Lipo", M, (0.0, 0.03, z_plate - 0.013 + l), 90, (0.06, 0.03, 0.01), root)
    geo.cable("HarnessA", [(-0.035, 0.045, z_plate + 0.01 + l), (-0.05, 0.02, z_plate + 0.03 + l), (-0.02, -0.005, z_plate + 0.028 + l)], 0.0011, M["cable_red"], parent=root)
    geo.cable("HarnessB", [(0.03, 0.045, z_plate + 0.01 + l), (0.05, 0.015, z_plate + 0.03 + l), (0.02, -0.005, z_plate + 0.028 + l)], 0.0011, M["cable_blue"], parent=root)
    MC.underglow("Under", M, (0.12, 0.13, 0.001), (0, 0, 0.02), (0.15, 0.45, 1.0), 6, root)

# ─── Set ────────────────────────────────────────────────────────────────────
if final:
    # Challenge course: black board with white line, gold rim light, trophy bokeh
    board = mat.principled("Course", (0.004, 0.004, 0.006), roughness=0.55, coat=0.3)
    geo.plane("Course", 6, 6, board, (0, 1, 0))
    white = mat.principled("Line", (0.62, 0.64, 0.68), roughness=0.5)
    geo.cable("CourseLine", [(-0.02, 0.6, 0.0006), (0.0, 0.2, 0.0006), (0.0, -0.3, 0.0006), (0.12, -0.7, 0.0006)], 0.009, white)
    gold = mat.principled("TrophyGold", (1.0, 0.72, 0.3), metallic=1.0, roughness=0.15)
    geo.revolve("Trophy", [(0.05, 0), (0.05, 0.02), (0.02, 0.03), (0.015, 0.09), (0.03, 0.11), (0.06, 0.16), (0.075, 0.24), (0.07, 0.25)], gold, (0.55, 1.3, 0.0), seg=64)
else:
    esd = mat.principled("ESDMat", (0.007, 0.009, 0.012), roughness=0.88, breakup=0.12)
    geo.plane("Mat", 3, 3, esd, (0, 0.5, 0))
    # tools at the edge of the frame
    E.breadboard("BBSpare", M, (-0.26, 0.2, 0.0), 20)
    MC.gearmotor("SpareMotor", M, 0.0065, 0.03, (0.2, 0.12, 0.007), (0, 0, 30))
    E.ir_array("SpareIR", M, 6, (0.24, -0.05, 0.0), (0, 0, -20), False)
wall = mat.principled("Wall", (0.01, 0.012, 0.016), roughness=0.6)
geo.plane("BackWall", 8, 3, wall, (0, 1.8, 1.0), (90, 0, 0))
for k, x in enumerate((-0.6, -0.2, 0.25, 0.7)):
    geo.sphere(f"Bokeh{k}", 0.012, mat.emission(f"BokehM{k}", (1.0, 0.7, 0.3) if final and k % 2 else (0.3, 0.55, 1.0), 10), (x, 1.6, 0.25 + 0.1 * (k % 2)))

tgt = (0, 0, 0.05)
core.area_light((-0.35, 0.3, 0.3), tgt, 2.8, (0.04, 0.4), (0.25, 0.5, 1.0), spread=40, name="RimL")
core.area_light((0.35, 0.25, 0.28), tgt, 2.6 if not final else 3.6, (0.04, 0.4), (1.0, 0.68, 0.28) if final else (0.25, 0.8, 1.0), spread=40, name="RimR")
core.area_light((0.0, -0.1, 0.6), tgt, 0.45, (0.4, 0.4), (0.85, 0.9, 1.0), spread=60, name="Top")
core.area_light((-0.3, -0.4, 0.25), tgt, 0.35, (0.4, 0.3), (0.8, 0.86, 1.0), spread=70, name="Key")
core.haze_box((0, 1.0, 0.5), (3, 1.4, 1.0), density=0.01, color=(0.6, 0.7, 0.95), anisotropy=0.5)

cam = core.camera((-0.34, -0.5, 0.27), (0.0, 0.0, 0.045), lens=50, fstop=4.0, shift=(-0.07, 0.0))
cam.data.dof.focus_distance = 0.6
core.compositor(bloom=0.2, bloom_threshold=2.0, dispersion=0.008)
print(core.render(f"bootcamp_{stage}", q))
