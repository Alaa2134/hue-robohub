import math, os, sys
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, mat, machines as MC, geo, review
which = sys.argv[sys.argv.index("--") + 1]
core.reset()
core.render_settings("preview", (420, 420), samples=16)
core.world((0.05, 0.055, 0.06))
M = mat.library()
fn = getattr(MC, which)
fn("R", M)
geo.plane("Floor", 4, 4, M["concrete"], (0, 0, 0))
core.area_light((-1, -1, 1.2), (0, 0, 0.05), 40, (1, 1), name="K")
core.area_light((1, 0, 0.6), (0, 0, 0.05), 25, (1, 1), name="F")
core.area_light((0, 1, 0.8), (0, 0, 0.05), 30, (1, 1), (0.4, 0.6, 1.0), name="B")
size = {"line_follower": 0.35, "sumo": 0.45, "sprint": 0.6, "autonomous": 0.8, "innovation": 0.8, "rover6": 0.8}[which]
paths = review.contact_sheet(which, (0, 0, size * 0.12), dist=size * 1.6, lens=50, angles=(20, 70, 160, 250), elev=(25, 15, 20, 35))
print("REVIEW", ",".join(paths))
