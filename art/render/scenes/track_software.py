"""05 — Robotics Software / ROS: autonomous rover inside its own LiDAR point cloud, occupancy grid and planned path."""
import math
import os
import random
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, geo, lab, machines as MC, mat

q = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "preview"
core.reset()
core.render_settings(q, (1920, 1080), exposure=-0.1)
core.world((0.0004, 0.0007, 0.0012))
M = mat.library()
MINT = (0.24, 1.0, 0.78)
rnd = random.Random(7)

floor = mat.principled("Floor", (0.006, 0.008, 0.009), roughness=0.3, coat=0.6, coat_rough=0.12, breakup=0.08)
geo.plane("Floor", 30, 30, floor, (0, 3, 0))
# occupancy grid (faint cell lines) + occupied cells near walls
cell = mat.emission("Cell", (0.1, 0.45, 0.35), 0.35)
for k in range(-12, 13):
    geo.box(f"OX{k}", (6, 0.004, 0.0004), cell, (0.2, k * 0.2 + 1.2, 0.0003), bev=0)
    geo.box(f"OY{k}", (0.004, 5, 0.0004), cell, (k * 0.2 + 0.2, 1.2, 0.0003), bev=0)
occ = mat.emission("Occupied", (0.15, 0.7, 0.55), 0.9)

# ─── Scanned environment as a point cloud ───────────────────────────────────
walls = [((-1.3, -0.8), (-1.3, 3.8)), ((1.6, -0.6), (1.6, 1.6)), ((1.6, 1.6), (3.4, 1.6)), ((-1.3, 3.8), (0.6, 3.8)), ((0.6, 3.8), (0.6, 5.5))]
boxes = [((0.75, 1.15), 0.35, 0.5), ((-0.75, 2.2), 0.3, 0.75), ((1.05, 2.9), 0.5, 0.4)]
pts = []
for (x0, y0), (x1, y1) in walls:
    L = math.hypot(x1 - x0, y1 - y0)
    for _ in range(int(L * 1500)):
        t = rnd.random()
        z = abs(rnd.gauss(0, 0.55)) if rnd.random() < 0.8 else rnd.random() * 1.6
        if z > 1.7:
            continue
        j = rnd.gauss(0, 0.006)
        pts.append((x0 + (x1 - x0) * t + j, y0 + (y1 - y0) * t + j, z))
    # occupied cells along the wall
    for i in range(int(L / 0.2)):
        t = (i + 0.5) / max(1, int(L / 0.2))
        geo.box(f"Occ{x0}{y0}{i}", (0.19, 0.19, 0.0006), occ, (round((x0 + (x1 - x0) * t) / 0.2) * 0.2 + 0.2 - 0.2, round((y0 + (y1 - y0) * t) / 0.2) * 0.2 + 0.2 - 0.2, 0.0005), bev=0)
for (cx, cy), w, h in boxes:
    for _ in range(int(w * h * 4200)):
        face = rnd.randrange(5)
        u, v = rnd.random() - 0.5, rnd.random()
        if face == 0:
            p = (cx + u * w, cy - w / 2, v * h)
        elif face == 1:
            p = (cx + u * w, cy + w / 2, v * h)
        elif face == 2:
            p = (cx - w / 2, cy + u * w, v * h)
        elif face == 3:
            p = (cx + w / 2, cy + u * w, v * h)
        else:
            p = (cx + u * w, cy + (rnd.random() - 0.5) * w, h)
        pts.append((p[0] + rnd.gauss(0, 0.004), p[1] + rnd.gauss(0, 0.004), p[2]))
    geo.box(f"OccBox{cx}", (w, w, 0.0006), occ, (cx, cy, 0.0005), bev=0)
cloud_m = mat.emission("Cloud", MINT, 2.4)
geo.point_cloud("Cloud", pts, 0.003, cloud_m)
# horizontal scan ring at LiDAR height (brighter)
ring = []
for i in range(2400):
    a = 2 * math.pi * i / 2400
    # cast to the nearest wall in a crude room model
    dx, dy = math.cos(a), math.sin(a)
    best = 9.0
    for (x0, y0), (x1, y1) in walls:
        ex, ey = x1 - x0, y1 - y0
        den = dx * ey - dy * ex
        if abs(den) < 1e-9:
            continue
        t = ((x0) * ey - (y0) * ex) / den
        u = ((x0) * dy - (y0) * dx) / den
        if t > 0.05 and 0 <= u <= 1:
            best = min(best, t)
    if best < 8.5:
        ring.append((dx * best, dy * best, 0.27 + rnd.gauss(0, 0.003)))
geo.point_cloud("ScanRing", ring, 0.0055, mat.emission("Ring", (0.5, 1.0, 0.85), 7))

# Robot (scan origin at the world origin)
MC.autonomous("Robot", M, (0.0, 0.0, 0.0), 0)

# Planned path + goal pose
path_m = mat.emission("Plan", (0.3, 1.0, 0.6), 2.4)
geo.cable("Plan", [(0.05, 0.25, 0.003), (0.2, 0.8, 0.003), (0.1, 1.6, 0.003), (-0.2, 2.6, 0.003), (0.05, 3.3, 0.003)], 0.0028, path_m)
goal = geo.empty("Goal", (0.05, 3.3, 0.003), (0, 0, 90))
geo.torus("GoalRing", 0.12, 0.004, path_m, (0, 0, 0), seg=64, seg2=6, parent=goal)
geo.box("GoalArrow", (0.2, 0.012, 0.002), path_m, (0.1, 0, 0), bev=0, parent=goal)

# RViz / terminal screens in the dark background
lab.monitor("RViz", M, (-0.6, 5.0, 0.6), math.radians(8), 1.3, 0.75, "ros_map.png", 1.6)
lab.monitor("Term", M, (1.0, 5.2, 0.6), math.radians(-10), 1.0, 0.58, "code.png", 1.3)
geo.box("Stand", (3.2, 0.5, 0.6), M["mech"], (0.2, 5.3, 0.3), bev=0.01)

tgt = (0.0, 0.0, 0.12)
core.area_light((0.9, 0.3, 0.6), tgt, 9, (0.05, 0.8), MINT, spread=35, name="MintRim")
core.area_light((-0.9, 0.5, 0.6), tgt, 8, (0.05, 0.8), (0.25, 0.5, 1.0), spread=35, name="BlueRim")
core.area_light((-0.4, -0.9, 0.9), tgt, 2.5, (0.8, 0.8), (0.8, 0.88, 1.0), spread=70, name="Key")
core.haze_box((0.2, 3.2, 1.2), (6, 5, 2.4), density=0.004, color=(0.55, 0.85, 0.8), anisotropy=0.55)

cam = core.camera((-0.7, -1.0, 0.36), (0.15, 0.6, 0.2), lens=32, fstop=2.4, shift=(-0.1, 0.0))
cam.data.dof.focus_distance = 1.15
core.compositor(bloom=0.25, bloom_threshold=1.6, dispersion=0.01)
core.depth_pass("track_software", 0.3, 7.0)
print(core.render("track_software", q))
