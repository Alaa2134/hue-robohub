"""12 — Trophy: RoboHub Challenge cup on a black stone plinth, RH emblem, light shaft from above."""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, geo, mat, robot

q = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "preview"
core.reset()
core.render_settings(q, (1920, 1080), exposure=-0.15)
core.world((0.0004, 0.0005, 0.001))
M = mat.library()
mark = json.load(open(os.path.join(core.ROOT, "textures", "mark.json")))

gold = mat.principled("TrophyGold", (1.0, 0.64, 0.2), metallic=1.0, roughness=0.16, breakup=0.05)
chrome = M["chrome"]
stone = mat.principled("Stone", (0.012, 0.012, 0.014), roughness=0.22, coat=0.8, coat_rough=0.05, breakup=0.15)

# plinth
geo.box("Plinth", (0.34, 0.34, 0.5), stone, (0, 0, 0.25), bev=0.006)
geo.box("PlinthCap", (0.36, 0.36, 0.02), M["mech"], (0, 0, 0.51), bev=0.003)
geo.torus("BaseGlow", 0.13, 0.0022, mat.emission("BaseGlowM", (0.2, 0.45, 1.0), 12), (0, 0, 0.522), seg=96, seg2=8)
# cup (revolve), stem and base
z0 = 0.52
geo.revolve("CupBase", [(0.11, z0), (0.11, z0 + 0.025), (0.09, z0 + 0.035), (0.085, z0 + 0.05), (0.06, z0 + 0.06)], M["mech"], seg=96)
geo.revolve("Stem", [(0.03, z0 + 0.06), (0.022, z0 + 0.09), (0.018, z0 + 0.14), (0.026, z0 + 0.17), (0.04, z0 + 0.185)], gold, seg=96)
cup = [(0.04, z0 + 0.185), (0.07, z0 + 0.2), (0.1, z0 + 0.25), (0.118, z0 + 0.31), (0.124, z0 + 0.37), (0.122, z0 + 0.4), (0.128, z0 + 0.405), (0.128, z0 + 0.412), (0.116, z0 + 0.41), (0.11, z0 + 0.37), (0.104, z0 + 0.31), (0.088, z0 + 0.25), (0.06, z0 + 0.205)]
geo.revolve("Cup", cup, gold, seg=128, cap=False)
for sx in (-1, 1):
    h = geo.torus(f"Handle{sx}", 0.06, 0.008, gold, (sx * 0.125, 0, z0 + 0.31), (90, 0, 0), seg=64, seg2=16)
geo.torus("Rim", 0.126, 0.004, chrome, (0, 0, z0 + 0.41), seg=128, seg2=12)
# emblem on the plinth face
em = robot.build_emblem(M, mark, scale=0.0012, depth=0.004, glow=False)
em.location = (0, -0.172, 0.34)
em.rotation_euler = (math.radians(90), 0, 0)
# engraved plate text bar
geo.box("Plate", (0.2, 0.004, 0.035), gold, (0, -0.172, 0.17), bev=0.001)

floor = mat.principled("Floor", (0.004, 0.004, 0.006), roughness=0.25, coat=0.7)
geo.plane("Floor", 20, 20, floor, (0, 2, 0))
for k in range(10):
    geo.sphere(f"Bokeh{k}", 0.02, mat.emission(f"Bk{k%2}", (1.0, 0.7, 0.3) if k % 3 else (0.3, 0.55, 1.0), 8), ((-1.8 + k * 0.4), 3.2 + (k % 2) * 0.5, 0.6 + (k % 3) * 0.25))

tgt = (0, 0, z0 + 0.25)
core.spot_light((0.0, 0.25, 2.6), (0, 0, 0.6), 900, 18, 0.5, (1.0, 0.86, 0.66), radius=0.05, name="TopSpot")
core.beam_volume((0.0, 0.25, 2.6), (0, 0, 0.5), 18, 0.012, (1.0, 0.9, 0.75), name="TopBeam")
core.area_light((0.9, 0.5, 0.9), tgt, 14, (0.06, 1.0), (1.0, 0.72, 0.35), spread=35, name="GoldRim")
core.area_light((-0.9, 0.6, 0.9), tgt, 20, (0.06, 1.0), (0.25, 0.5, 1.0), spread=35, name="BlueRim")
core.area_light((-0.5, -1.0, 0.8), tgt, 4, (0.8, 0.8), (0.9, 0.92, 1.0), spread=70, name="Key")
core.haze_box((0, 1.6, 1.4), (6, 4, 2.8), density=0.004, color=(0.7, 0.72, 0.85), anisotropy=0.6)

cam = core.camera((-0.75, -1.95, 0.7), (0.0, 0.0, 0.62), lens=58, fstop=2.8, shift=(-0.14, 0.0))
cam.data.dof.focus_distance = 2.08
core.compositor(bloom=0.3, bloom_threshold=1.6, dispersion=0.01)
core.depth_pass("trophy", 0.5, 5.0)
print(core.render("trophy", q))
