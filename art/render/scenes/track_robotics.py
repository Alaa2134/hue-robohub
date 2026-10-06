"""03 — Robotics: six-wheel rover on a motion-test floor; planned trajectory glowing ahead; lab beyond."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, geo, lab, machines as MC, mat

q = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "preview"
core.reset()
core.render_settings(q, (1920, 1080), exposure=-0.1)
core.world((0.0006, 0.0009, 0.0018))
M = mat.library()

# Test floor: dark epoxy with taped grid + fiducials
floor = mat.principled("TestFloor", (0.008, 0.009, 0.011), roughness=0.22, coat=0.8, coat_rough=0.1, breakup=0.08)
geo.plane("Floor", 30, 30, floor, (0, 4, 0))
tape = mat.principled("GridTape", (0.06, 0.08, 0.12), roughness=0.6)
for k in range(-6, 7):
    geo.box(f"GX{k}", (8, 0.012, 0.0006), tape, (0, k * 0.5 + 1.5, 0.0003), bev=0)
    geo.box(f"GY{k}", (0.012, 8, 0.0006), tape, (k * 0.5, 1.5, 0.0003), bev=0)

# Planned trajectory: glowing spline with waypoints (the controller's reference path)
path_m = mat.emission("PathGlow", (0.25, 0.55, 1.0), 2.2)
way = [(0.32, 0.42, 0.002), (0.55, 0.62, 0.002), (0.75, 0.75, 0.002), (1.35, 0.95, 0.002), (2.0, 1.35, 0.002), (2.4, 2.1, 0.002)]
geo.cable("Path", way, 0.0022, path_m)
for i, p in enumerate(way[1:]):
    geo.torus(f"WP{i}", 0.045, 0.0018, path_m, (p[0], p[1], 0.003), seg=48, seg2=6)
    geo.cylinder(f"WPdot{i}", 0.008, 0.002, path_m, (p[0], p[1], 0.002), seg=24, bev=0)

# Hero machine
MC.rover6("Rover", M, (0.0, 0.0, 0.0), 0, "glow_blue")

# Background lab (out of focus)
for i, (x, y, rz) in enumerate([(-1.6, 3.4, 6), (0.6, 4.2, -4), (2.8, 3.8, -12), (-0.8, 5.6, 0), (2.0, 6.2, 0)]):
    lab.desk(f"Desk{i}", M, (x, y, 0), math.radians(rz), screens=[("ros_map.png", "code.png"), ("cad_arm.png", "dashboard.png")][i % 2], seed=i + 3)
lab.robot_arm("Arm", M, (-2.4, 2.6, 0.77), math.radians(40), 1.0, (35, -40, 80, 20))
geo.box("Bench", (1.1, 0.7, 0.77), M["mech"], (-2.4, 2.6, 0.385), bev=0.01)
MC.autonomous("Auto", M, (1.6, 2.4, 0.0), 150)
lab.ceiling_lights(M, (-3, 0, 3), (2.0, 4.5, 7.0), z=3.6)
wall = mat.principled("Wall", (0.012, 0.014, 0.018), roughness=0.6, breakup=0.15)
geo.plane("BackWall", 20, 6, wall, (0, 8.5, 3), (90, 0, 0))
geo.plane("VideoWall", 4.5, 1.6, mat.screen("WallScreen", os.path.join(core.TEX, "ros_map.png"), 1.3), (0.5, 8.45, 1.9), (90, 0, 0))

# Lighting: cool key, blue rims, practical beams
tgt = (0.0, 0.0, 0.13)
core.area_light((1.05, 0.2, 0.42), tgt, 12, (0.05, 0.8), (0.25, 0.5, 1.0), spread=35, name="RimR")
core.area_light((-0.9, 0.7, 0.55), tgt, 11, (0.05, 0.9), (0.4, 0.6, 1.0), spread=40, name="RimL")
core.area_light((-0.6, -1.0, 0.9), tgt, 6, (0.8, 0.8), (0.86, 0.9, 1.0), spread=70, name="Key")
core.area_light((0.0, 0.3, 1.4), tgt, 6, (0.9, 0.3), (0.7, 0.8, 1.0), spread=60, name="Top")
core.spot_light((1.5, 4.0, 3.5), (1.4, 3.6, 0.0), 700, 26, 0.7, (0.45, 0.62, 1.0), name="BeamA")
core.spot_light((-1.8, 4.5, 3.5), (-1.6, 4.0, 0.0), 600, 24, 0.7, (0.5, 0.65, 1.0), name="BeamB")
core.haze_box((0, 4.6, 1.6), (10, 7, 3.2), density=0.005, color=(0.55, 0.68, 0.95), anisotropy=0.6)

cam = core.camera((-0.62, -0.92, 0.22), (0.12, 0.15, 0.14), lens=40, fstop=2.2, shift=(-0.14, 0.0))
cam.data.dof.focus_distance = 1.08
core.compositor(bloom=0.2, bloom_threshold=2.0, dispersion=0.008)
core.depth_pass("track_robotics", 0.4, 7.0)
print(core.render("track_robotics", q))
