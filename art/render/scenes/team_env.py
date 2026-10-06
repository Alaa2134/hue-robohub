"""09 — Team environment: the RoboHub lab at work — stations, robot arms, banners, RH-01 on its display stand."""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, geo, lab, machines as MC, mat, robot

q = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "preview"
core.reset()
core.render_settings(q, (2560, 1440), exposure=-0.1)
core.world((0.0008, 0.0012, 0.0025))
M = mat.library()
mark = json.load(open(os.path.join(core.ROOT, "textures", "mark.json")))

geo.plane("Floor", 40, 40, M["concrete"], (0, 6, 0))
wall = mat.principled("Wall", (0.012, 0.014, 0.018), roughness=0.6, breakup=0.15)
geo.plane("BackWall", 30, 7, wall, (0, 12, 3.5), (90, 0, 0))
geo.plane("SideWall", 30, 7, wall, (-6.5, 6, 3.5), (90, 0, 90))
geo.plane("Ceiling", 30, 30, wall, (0, 6, 4.3), (180, 0, 0))
geo.plane("VideoWall", 6.0, 2.2, mat.screen("WallScreen", os.path.join(core.TEX, "dashboard.png"), 1.5), (-1.0, 11.95, 2.2), (90, 0, 0))
for x in (-5, 0.5, 5):
    geo.box(f"Column{x}", (0.5, 0.5, 4.3), M["mech"], (x, 11.6, 2.15), bev=0.01)
    geo.box(f"ColumnStrip{x}", (0.02, 0.02, 3.6), M["led_strip"], (x + 0.26, 11.34, 2.1), bev=0)

# RH-01 on a display stand (background centrepiece)
geo.cylinder("Stand", 0.5, 0.12, mat.principled("StandM", (0.012, 0.013, 0.016), roughness=0.3, coat=0.6), (1.6, 8.6, 0.06), seg=96, bev=0.004)
geo.torus("StandGlow", 0.5, 0.004, M["glow_blue"], (1.6, 8.6, 0.12), seg=96, seg2=8)
robot.build_humanoid(M, mark, (1.6, 8.6, 1.72), (0, 0, math.radians(-12)))

screens = [("cad_arm.png", "code.png"), ("ros_map.png", "dashboard.png"), ("pcb_layout.png", "cad_arm.png"), ("code.png", "ros_map.png")]
stations = [(-3.2, 2.6, 12), (-0.6, 3.4, 4), (2.4, 2.9, -10), (-3.8, 5.6, 6), (-1.2, 6.4, 0), (3.6, 5.8, -8), (-2.6, 8.4, 0), (4.2, 8.8, -6)]
for i, (x, y, rz) in enumerate(stations):
    lab.desk(f"Desk{i}", M, (x, y, 0), math.radians(rz), screens=screens[i % len(screens)], seed=i + 11)
    if i in (0, 1, 2, 3, 4, 5, 7):
        lab.person_seated(f"Student{i}", M, (x + (0.25 if i % 2 else -0.2), y - 0.62, 0), math.radians(rz + 180), lean=12 + (i % 3) * 5, seed=i + 5)
lab.person_standing("Lead", M, (0.9, 4.6, 0), math.radians(160))
lab.person_standing("Lead2", M, (-2.1, 4.4, 0), math.radians(205))
lab.robot_arm("Arm0", M, (1.1, 6.2, 0.77), math.radians(30), 0.9, (40, -30, 70, 20))
geo.box("Bench0", (1.2, 0.8, 0.77), M["mech"], (1.1, 6.2, 0.385), bev=0.01)
MC.sumo("BenchSumo", M, (1.45, 6.0, 0.77), 25)
for k, (t, x) in enumerate((("banner_build.png", -4.6), ("banner_learn.png", -3.6), ("banner_compete.png", -2.6))):
    lab.banner(f"Banner{k}", (x, 10.6, 2.85), t, 0.85, 2.25, 0, M)
lab.ceiling_lights(M, (-4.5, -1.5, 1.5, 4.5), (2.5, 5.0, 7.5, 10.0), z=4.1)

core.spot_light((1.6, 7.6, 4.2), (1.6, 8.6, 1.2), 900, 22, 0.6, (0.6, 0.72, 1.0), name="StandSpot")
core.spot_light((-2.5, 3.5, 4.2), (-2.0, 4.4, 0.7), 900, 30, 0.7, (0.7, 0.8, 1.0), name="BeamA")
core.spot_light((2.5, 4.0, 4.2), (2.4, 3.6, 0.7), 800, 30, 0.7, (0.6, 0.75, 1.0), name="BeamB")
core.area_light((0, -1.0, 3.0), (0, 5, 0.8), 120, (6, 0.2), (0.7, 0.8, 1.0), spread=70, name="Fill")
core.area_light((4.5, 9.5, 2.0), (1.6, 8.6, 1.4), 120, (0.08, 2.0), (0.25, 0.5, 1.0), spread=35, name="RobotRim")
core.haze_box((0, 6.0, 2.2), (14, 12, 4.4), density=0.0035, color=(0.55, 0.68, 0.95), anisotropy=0.6)

cam = core.camera((-5.2, -1.4, 2.6), (0.6, 6.2, 0.9), lens=26, fstop=4.0)
cam.data.dof.focus_distance = 7.0
core.compositor(bloom=0.22, bloom_threshold=2.2, dispersion=0.008)
core.depth_pass("team_env", 1.0, 16.0)
print(core.render("team_env", q))
