"""Brand — 3D chrome RH mark with glowing axis on a black mirror floor (social avatar, film end card, brand page).

Usage: python scenes/logo3d.py -- <preview|final> [wide|square]
"""
import json
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, geo, mat

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["preview", "wide"]
q, fmt = args[0], (args[1] if len(args) > 1 else "wide")
core.reset()
core.render_settings(q, (1920, 1080) if fmt == "wide" else (1440, 1440), exposure=-0.2)
core.world((0.0004, 0.0006, 0.0012))
M = mat.library()
mark = json.load(open(os.path.join(core.ROOT, "textures", "mark.json")))

S = 0.01  # 1 unit = 1 cm → mark is 1.18 m wide
W = mark["width"]
polys = geo.svg_path_polys(mark["body"])
to3 = lambda poly: [((x - W / 2) * S, (50 - y) * S) for x, y in poly]
chrome = mat.principled("LogoChrome", (0.32, 0.34, 0.38), metallic=1.0, roughness=0.16, breakup=0.05, aniso=0.35)
edge = mat.principled("LogoEdge", (0.55, 0.58, 0.62), metallic=1.0, roughness=0.25)
root = geo.empty("Logo", (0, 0, 0.5 + 0.0), (90, 0, 0))
# R: outer with counter as a true hole
geo.extrude_polygon("LogoR", to3(polys[0]), 0.16, chrome, (0, 0, 0), (0, 0, 0), 0.012, holes=[list(reversed(to3(polys[1])))], parent=root)
for i, poly in enumerate(polys[2:]):
    geo.extrude_polygon(f"LogoStem{i}", to3(poly), 0.16, chrome, (0, 0, 0), (0, 0, 0), 0.012, parent=root)
axis = geo.svg_path_polys(mark["axis"])[0]
glow = mat.emission("Axis", (0.17, 0.43, 1.0), 9)
geo.extrude_polygon("LogoAxis", to3(axis), 0.12, glow, (0, 0, 0), (0, 0, 0), 0.0, parent=root)

floor = mat.principled("Mirror", (0.004, 0.005, 0.007), roughness=0.08, coat=1.0, coat_rough=0.03, breakup=0.04)
geo.plane("Floor", 30, 30, floor, (0, 0, 0))
geo.plane("Back", 30, 10, mat.principled("Back", (0.004, 0.005, 0.008), roughness=0.7), (0, 6, 5), (90, 0, 0))

tgt = (0, 0, 0.5)
core.area_light((0, -2.5, 3.2), tgt, 45, (4.0, 0.08), (0.8, 0.86, 1.0), spread=50, name="TopStrip")
core.area_light((-2.6, 0.8, 0.8), tgt, 60, (0.08, 2.4), (0.25, 0.5, 1.0), spread=40, name="RimL")
core.area_light((2.6, 0.8, 0.8), tgt, 60, (0.08, 2.4), (0.35, 0.7, 1.0), spread=40, name="RimR")
core.area_light((0, -3, 0.25), tgt, 10, (4.0, 0.05), (0.7, 0.8, 1.0), spread=60, name="FloorStrip")
core.area_light((0, 1.8, 1.2), tgt, 18, (3.0, 0.06), (0.3, 0.55, 1.0), spread=40, name="Back")
core.haze_box((0, 2.5, 1.5), (12, 6, 3), density=0.004, color=(0.5, 0.65, 1.0), anisotropy=0.6)

if fmt == "wide":
    cam = core.camera((0.0, -6.2, 0.7), (0.0, 0.0, 0.5), lens=55, fstop=5.6)
else:
    cam = core.camera((0.0, -5.0, 0.62), (0.0, 0.0, 0.5), lens=55, fstop=5.6)
cam.data.dof.focus_distance = 6.0 if fmt == "wide" else 4.85
core.compositor(bloom=0.22, bloom_threshold=2.0, dispersion=0.01)
print(core.render(f"logo3d_{fmt}", q))
