import json, math, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, mat, robot, geo

q = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "preview"
core.reset()
core.render_settings(q, (1600, 1000))
core.world((0.001, 0.0015, 0.003))
M = mat.library()
mark = json.load(open(os.path.join(core.ROOT, "textures", "mark.json")))
r = robot.build_humanoid(M, mark, (0, 0, 0), (0, 0, math.radians(-62)))
geo.plane("Floor", 20, 20, M["concrete"], (0, 0, -1.0))
# Lighting: two blue rims behind, soft key front-left, cyan kicker
core.area_light((-1.2, 1.4, 0.6), (0, 0, -0.1), 260, (0.4, 1.4), (0.25, 0.5, 1.0), spread=60, name="RimL")
core.area_light((1.3, 1.2, 0.3), (0, 0, -0.1), 220, (0.4, 1.4), (0.2, 0.45, 1.0), spread=60, name="RimR")
core.area_light((-1.6, -1.8, 1.2), (0, 0, -0.1), 45, (1.2, 1.2), (0.85, 0.9, 1.0), name="Key")
core.area_light((0.0, -1.5, -0.8), (0, 0, -0.1), 8, (2, 0.5), (0.3, 0.8, 1.0), name="Fill")
core.camera((-0.42, -0.95, 0.02), (0.0, 0, -0.06), lens=55, fstop=2.8)
core.compositor(bloom=0.25, bloom_threshold=2.0, vignette=0.3)
print(core.render("lookdev_robot", q))
