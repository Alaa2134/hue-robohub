"""01 — Main hero: RH-01 armoured humanoid in the RoboHub lab; students at stations; negative space left."""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, geo, lab, mat, robot

q = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "preview"
core.reset()
core.render_settings(q, (2560, 1440), exposure=-0.2)
core.world((0.0008, 0.0012, 0.0025))
M = mat.library()
mark = json.load(open(os.path.join(core.ROOT, "textures", "mark.json")))

# ─── Room shell ──────────────────────────────────────────────────────────────
geo.plane("Floor", 40, 40, M["concrete"], (0, 6, 0))
wall = mat.principled("Wall", (0.012, 0.014, 0.018), roughness=0.6, breakup=0.15)
geo.plane("BackWall", 30, 7, wall, (0, 14, 3.5), (90, 0, 0))
geo.plane("Ceiling", 30, 30, wall, (0, 6, 4.3), (180, 0, 0))
# Back wall: large glowing display wall + structural columns
geo.plane("VideoWall", 7.5, 2.6, mat.screen("WallScreen", os.path.join(core.TEX, "dashboard.png"), 1.6), (-2.5, 13.9, 2.3), (90, 0, 0))
for x in (-7, -1.2, 4.5, 9):
    geo.box(f"Column{x}", (0.5, 0.5, 4.3), M["mech"], (x, 13.5, 2.15), bev=0.01)
    geo.box(f"ColumnStrip{x}", (0.02, 0.02, 3.6), M["led_strip"], (x + 0.26, 13.24, 2.1), bev=0)

# ─── Robot ───────────────────────────────────────────────────────────────────
R = robot.build_humanoid(M, mark, (0.62, 0.15, 1.6), (0, 0, math.radians(-30)))

# ─── Lab stations (background), students working ───────────────────────────
screens = [("cad_arm.png", "code.png"), ("ros_map.png", "dashboard.png"), ("pcb_layout.png", "cad_arm.png"), ("code.png", "ros_map.png")]
stations = [
    (-3.6, 3.2, 8), (-1.4, 4.4, -6), (1.9, 3.6, -14), (4.3, 5.2, -10), (-4.8, 6.6, 4), (-2.0, 7.4, 0), (1.2, 8.2, 0), (3.8, 8.8, -6), (-0.6, 10.6, 0),
]
for i, (x, y, rz) in enumerate(stations):
    lab.desk(f"Desk{i}", M, (x, y, 0), math.radians(rz), screens=screens[i % len(screens)], seed=i)
    if i in (0, 1, 2, 4, 5, 7):
        lab.person_seated(f"Student{i}", M, (x + (0.25 if i % 2 else -0.2), y - 0.62, 0), math.radians(rz + 180), lean=14 + (i % 3) * 4, seed=i)
# Standing student, right side, mid-ground (reference: branded hoodie seen from behind)
lab.person_standing("StudentStanding", M, (2.05, 1.65, 0), math.radians(200))
# Benches with arms in the background
lab.robot_arm("Arm0", M, (-2.6, 5.4, 0.77), math.radians(30), 0.9, (40, -30, 70, 20))
lab.robot_arm("Arm1", M, (2.9, 6.8, 0.77), math.radians(-60), 1.0, (-20, -50, 85, 10))
for (x, y) in ((-2.6, 5.4), (2.9, 6.8)):
    geo.box(f"Bench{x}", (1.2, 0.8, 0.77), M["mech"], (x, y, 0.385), bev=0.01)

# Banners: BUILD / LEARN / COMPETE (hanging, right background)
for k, (t, x) in enumerate((("banner_build.png", 3.2), ("banner_learn.png", 4.25), ("banner_compete.png", 5.3))):
    lab.banner(f"Banner{k}", (x, 9.6, 2.85), t, 0.85, 2.25, 0, M)

lab.ceiling_lights(M, (-4.5, -1.5, 1.5, 4.5), (2.5, 5.0, 7.5, 10.0, 12.5), z=4.1)

# ─── Lighting ────────────────────────────────────────────────────────────────
# Glossy black armour only reads through its edges: thin strip lights produce line highlights.
target = (0.62, 0.15, 1.42)
core.area_light((0.35, 1.25, 2.3), target, 150, (0.06, 1.8), (0.25, 0.5, 1.0), spread=35, name="RimBack")
core.area_light((1.65, 0.55, 1.55), target, 120, (0.05, 1.5), (0.18, 0.45, 1.0), spread=30, name="RimRight")
core.area_light((-0.2, 0.9, 2.6), (0.62, 0.15, 1.7), 22, (0.04, 0.9), (0.6, 0.75, 1.0), spread=30, name="RimTop")
core.area_light((-1.7, -0.5, 1.15), target, 5, (1.0, 1.4), (0.75, 0.84, 1.0), spread=70, name="Key")
core.area_light((0.0, -0.8, 0.7), target, 3, (1.2, 0.3), (0.25, 0.7, 1.0), name="Bounce")
core.spot_light((-3.0, 6.0, 4.2), (-2.0, 7.0, 0.6), 1100, 24, 0.6, (0.45, 0.62, 1.0), name="BeamA")
core.spot_light((3.5, 7.0, 4.2), (3.8, 8.6, 0.8), 1000, 22, 0.6, (0.4, 0.58, 1.0), name="BeamB")
core.spot_light((0.9, 4.2, 4.2), (0.9, 3.8, 0.0), 600, 28, 0.7, (0.85, 0.9, 1.0), name="BeamC")
core.haze_box((0, 7.5, 2.2), (22, 15, 4.4), density=0.0028, color=(0.55, 0.68, 0.95), anisotropy=0.6)

# ─── Camera ──────────────────────────────────────────────────────────────────
cam = core.camera((-0.42, -1.28, 1.38), (0.62, 0.15, 1.42), lens=46, fstop=1.8, ratio=1.0, shift=(-0.16, 0.03))
cam.data.dof.focus_distance = 1.76

core.compositor(bloom=0.22, bloom_threshold=2.2, vignette=0.38, dispersion=0.01)
print(core.render("hero", q))
