import json, math, os, sys, subprocess
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, mat, robot, geo, review

core.reset()
core.render_settings("preview", (420, 420), samples=16)
core.world((0.05, 0.055, 0.06))
M = mat.library()
mark = json.load(open(os.path.join(core.ROOT, "textures", "mark.json")))
robot.build_humanoid(M, mark)
core.area_light((-1.5, -1.5, 1.5), (0, 0, -0.1), 120, (1.5, 1.5), name="K")
core.area_light((1.5, -0.5, 0.5), (0, 0, -0.1), 60, (1.5, 1.5), name="F")
core.area_light((0, 1.5, 1.0), (0, 0, -0.1), 80, (1.5, 1.5), (0.4, 0.6, 1.0), name="B")
target = tuple(float(x) for x in (sys.argv[sys.argv.index("--") + 1].split(",") if "--" in sys.argv else (0, 0, -0.15)))
dist = float(sys.argv[sys.argv.index("--") + 2]) if "--" in sys.argv and len(sys.argv) > sys.argv.index("--") + 2 else 1.3
paths = review.contact_sheet("robot", target, dist=dist, lens=50)
print("REVIEW", ",".join(paths))
