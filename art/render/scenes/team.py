"""Competition team showcase renders — one per team, motorsport-style key art.

Usage: python scenes/team.py -- <preview|final> <line_follower|sumo|sprint|autonomous|innovation>
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, geo, machines as MC, mat

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["preview", "sumo"]
q, team = args[0], args[1]
core.reset()
core.render_settings(q, (1920, 1080), exposure=-0.15)
core.world((0.0005, 0.0007, 0.0014))
M = mat.library()
accent = MC.TEAM[team]

# Arena floor: glossy black epoxy with fine scratches
epoxy = mat.principled("Epoxy", (0.006, 0.007, 0.009), roughness=0.14, coat=1.0, coat_rough=0.06, breakup=0.05)
geo.plane("Floor", 12, 12, epoxy, (0, 2, 0))
white = mat.principled("TrackWhite", (0.55, 0.57, 0.6), roughness=0.5)

S = {"line_follower": 0.55, "sumo": 0.75, "sprint": 1.0, "autonomous": 1.25, "innovation": 1.75}[team]

if team == "line_follower":
    # Curving white line on black track
    geo.cable("Line", [(-0.6, 0.5, 0.0005), (-0.15, 0.25, 0.0005), (0.0, -0.05, 0.0005), (0.08, -0.4, 0.0005), (0.3, -0.7, 0.0005)], 0.0095, white)
    MC.line_follower("Robot", M, (0.0, 0.0, 0.0), -12)
elif team == "sumo":
    ring = mat.principled("Dohyo", (0.01, 0.01, 0.012), roughness=0.55, breakup=0.1)
    geo.cylinder("Dohyo", 0.77 / 2, 0.025, ring, (0, 0.1, -0.0125), seg=128, bev=0.002)
    geo.torus("DohyoEdge", 0.385 - 0.012, 0.0125, white, (0, 0.1, 0.0001), seg=128, seg2=8)
    for sx in (-1, 1):
        geo.box(f"Shikiri{sx}", (0.1, 0.01, 0.0005), mat.principled("Shikiri", (0.45, 0.3, 0.12), roughness=0.5), (sx * 0.08, 0.1, 0.0003), bev=0)
    MC.sumo("Robot", M, (0.02, -0.05, 0.0), -20)
    MC.sumo("Opponent", M, (0.05, 0.36, 0.0), 170)
elif team == "sprint":
    for x in (-0.16, 0.16):
        geo.box(f"Lane{x}", (0.012, 6, 0.0006), white, (x, 1.5, 0.0003), bev=0)
    for k in range(6):
        geo.box(f"Grid{k}", (0.32, 0.012, 0.0006), white, (0, 0.6 + k * 0.5, 0.0003), bev=0)
    MC.sprint("Robot", M, (0.0, 0.0, 0.0), -16)
elif team == "autonomous":
    tape = mat.principled("FloorTape", (0.9, 0.75, 0.1), roughness=0.5)
    for k in range(-3, 4):
        geo.box(f"GridX{k}", (4, 0.02, 0.0005), mat.principled("GridLine", (0.04, 0.06, 0.09), roughness=0.5), (0, k * 0.5 + 0.5, 0.0003), bev=0)
        geo.box(f"GridY{k}", (0.02, 4, 0.0005), mat.principled("GridLine", (0.04, 0.06, 0.09), roughness=0.5), (k * 0.5, 0.5, 0.0003), bev=0)
    geo.box("Target", (0.3, 0.3, 0.0005), tape, (0.45, 0.9, 0.0004), bev=0)
    MC.autonomous("Robot", M, (0.0, 0.0, 0.0), -24)
    # LiDAR scan rays (faint laser lines through the haze)
    ray = mat.emission("LaserRay", (0.2, 1.0, 0.55), 1.2)
    cx, cy = 0.04 * math.sin(math.radians(24)), 0.04 * math.cos(math.radians(24))
    for i in range(36):
        a = 2 * math.pi * i / 36
        L = 1.4
        ob = geo.cylinder(f"Ray{i}", 0.0006, L, ray, (cx + math.cos(a) * L / 2, cy + math.sin(a) * L / 2, 0.29), seg=6, bev=0)
        ob.rotation_euler = (math.pi / 2, 0, a + math.pi / 2)
elif team == "innovation":
    plinth = mat.principled("Plinth", (0.012, 0.013, 0.016), roughness=0.3, coat=0.6)
    geo.cylinder("Plinth", 0.42, 0.05, plinth, (0, 0.05, 0.025), seg=96, bev=0.004)
    geo.torus("PlinthGlow", 0.42, 0.0025, MC.accent_mat("innovation", 10), (0, 0.05, 0.05), seg=128, seg2=8)
    MC.innovation("Robot", M, (0.0, 0.05, 0.05), -28)

# ─── Lighting: team-colour rim, cool key, blue counter-rim, haze ─────────────
t = (0, 0, (0.11 if team == "innovation" else 0.06) * S)
core.area_light((1.25 * S, 0.45 * S, 0.42 * S), t, 14 * S, (0.06 * S, 1.0 * S), accent, spread=40, name="TeamRim")
core.area_light((-1.1 * S, 0.55 * S, 0.45 * S), t, 10 * S, (0.05 * S, 1.0 * S), (0.2, 0.45, 1.0), spread=40, name="BlueRim")
core.area_light((0.2 * S, 1.4 * S, 0.9 * S), t, 4 * S, (0.6 * S, 0.05 * S), accent, spread=35, name="TopRim")
core.area_light((-0.5 * S, -0.8 * S, 0.75 * S), t, 5.5 * S, (0.7 * S, 0.7 * S), (0.86, 0.9, 1.0), spread=70, name="Key")
for k, z in enumerate((0.55, 0.95)):
    geo.box(f"LightWall{k}", (3.2 * S, 0.02 * S, 0.012 * S), mat.emission(f"LightWallM{k}", accent if k == 0 else (0.25, 0.5, 1.0), 6), (0, 3.6 * S, z * S), bev=0)
# bokeh practicals in the background
for k in range(9):
    x = (-1.8 + k * 0.45) * S
    geo.sphere(f"Bokeh{k}", 0.015 * S, mat.emission(f"BokehM{k%3}", accent if k % 3 == 0 else (0.25, 0.5, 1.0), 12), (x, (3.2 + (k % 2) * 0.6) * S, (0.35 + (k % 3) * 0.12) * S))
core.haze_box((0, 1.5 * S, 0.8 * S), (6 * S, 5 * S, 1.6 * S), density=0.012 / S, color=(0.6, 0.7, 0.95), anisotropy=0.6)

cam = core.camera((-0.7 * S, -1.05 * S, 0.26 * S), (0.0, 0.02 * S, (0.1 if team == "innovation" else 0.055) * S), lens=70, fstop=2.8)
cam.data.dof.focus_distance = (0.7 ** 2 + 1.07 ** 2) ** 0.5 * S
core.compositor(bloom=0.25, bloom_threshold=2.0, dispersion=0.01)
print(core.render(f"team_{team}", q))
