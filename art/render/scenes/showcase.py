"""11 — Project showcase: three machines on plinths in a studio — product-reveal lighting, mirror floor, open sky for type."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, geo, machines as MC, mat

q = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "preview"
core.reset()
core.render_settings(q, (1920, 1080), exposure=-0.1)
core.world((0.0005, 0.0007, 0.0013))
M = mat.library()

floor = mat.principled("Studio", (0.005, 0.006, 0.008), roughness=0.14, coat=1.0, coat_rough=0.05, breakup=0.05)
geo.plane("Floor", 30, 30, floor, (0, 4, 0))
geo.plane("Cyc", 30, 10, mat.principled("Cyc", (0.006, 0.008, 0.012), roughness=0.75), (0, 5, 5), (90, 0, 0))
plinth = mat.principled("Plinth", (0.012, 0.013, 0.016), roughness=0.3, coat=0.6)
spots = []
for i, (x, y, r, h, kind, rot) in enumerate([(-0.75, 0.55, 0.32, 0.06, "rover", 30), (0.0, 0.85, 0.36, 0.14, "innovation", -10), (0.78, 0.5, 0.32, 0.06, "auto", -35)]):
    geo.cylinder(f"Plinth{i}", r, h, plinth, (x, y, h / 2), seg=96, bev=0.004)
    geo.torus(f"PlinthGlow{i}", r, 0.0022, mat.emission(f"PG{i}", (0.25, 0.55, 1.0) if i != 1 else (0.6, 0.42, 1.0), 9), (x, y, h), seg=128, seg2=8)
    if kind == "rover":
        MC.rover6(f"R{i}", M, (x, y, h), rot, "glow_blue")
    elif kind == "innovation":
        MC.innovation(f"R{i}", M, (x, y, h), rot)
    else:
        MC.autonomous(f"R{i}", M, (x, y, h), rot)
    spots.append(((x, y - 0.3, 2.6), (x, y, h + 0.1)))
for i, (a, b) in enumerate(spots):
    core.spot_light(a, b, 650 if i != 1 else 900, 22, 0.6, (0.88, 0.92, 1.0), radius=0.05, name=f"Spot{i}")
    core.beam_volume(a, b, 22, 0.01, (0.8, 0.85, 1.0), name=f"SpotVol{i}")
core.area_light((0, -2.0, 1.4), (0, 0.6, 0.2), 30, (4.0, 0.08), (0.75, 0.82, 1.0), spread=50, name="FrontStrip")
core.area_light((-2.2, 1.6, 0.8), (0, 0.6, 0.2), 60, (0.1, 2.0), (0.25, 0.5, 1.0), spread=35, name="RimL")
core.area_light((2.2, 1.6, 0.8), (0, 0.6, 0.2), 60, (0.1, 2.0), (0.35, 0.7, 1.0), spread=35, name="RimR")
core.haze_box((0, 2.0, 1.6), (8, 5, 3.2), density=0.004, color=(0.6, 0.7, 0.95), anisotropy=0.6)

cam = core.camera((0.0, -1.85, 0.52), (0.0, 0.6, 0.3), lens=36, fstop=4.0, shift=(0.0, -0.1))
cam.data.dof.focus_distance = 2.5
core.compositor(bloom=0.22, bloom_threshold=2.0, dispersion=0.008)
core.depth_pass("showcase", 0.5, 7.0)
print(core.render("showcase", q))
