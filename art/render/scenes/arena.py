"""06 — Competition arena: sumo bout in the foreground, line-follower and sprint courses beyond, LED wall + truss beams."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, geo, machines as MC, mat

q = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "preview"
core.reset()
core.render_settings(q, (2560, 1440), exposure=-0.15)
core.world((0.0004, 0.0006, 0.0014))
M = mat.library()

stage = mat.principled("Stage", (0.005, 0.006, 0.008), roughness=0.18, coat=1.0, coat_rough=0.07, breakup=0.06)
geo.plane("Stage", 40, 40, stage, (0, 6, 0))
white = mat.principled("TrackWhite", (0.6, 0.62, 0.66), roughness=0.5)
board = mat.principled("Board", (0.008, 0.008, 0.01), roughness=0.55)

# ─── Sumo (foreground) ──────────────────────────────────────────────────────
ring = mat.principled("Dohyo", (0.01, 0.01, 0.012), roughness=0.55, breakup=0.1)
geo.cylinder("Dohyo", 0.77 / 2, 0.05, ring, (0.25, 0.35, 0.025), seg=128, bev=0.003)
geo.torus("DohyoEdge", 0.385 - 0.012, 0.0125, white, (0.25, 0.35, 0.05), seg=128, seg2=8)
for sx in (-1, 1):
    geo.box(f"Shikiri{sx}", (0.1, 0.01, 0.0005), mat.principled("Shikiri", (0.45, 0.3, 0.12), roughness=0.5), (0.25 + sx * 0.08, 0.35, 0.0503), bev=0)
MC.sumo("SumoA", M, (0.1, 0.33, 0.05), 84)
MC.sumo("SumoB", M, (0.41, 0.37, 0.05), -96)
geo.box("ScoreStand", (0.04, 0.04, 0.9), M["mech"], (1.2, 0.9, 0.45), bev=0.004)

# ─── Line follower course (mid-ground) ──────────────────────────────────────
geo.box("LFBoard", (1.6, 1.0, 0.03), board, (-1.4, 1.9, 0.015), bev=0.004)
lf_pts = [(-2.05, 1.6), (-1.75, 2.25), (-1.3, 2.1), (-1.05, 1.62), (-0.75, 1.75), (-0.72, 2.2)]
geo.cable("LFLine", [(x, y, 0.0312) for x, y in lf_pts], 0.009, white)
MC.line_follower("LF", M, (-1.18, 1.86, 0.03), -150)

# ─── Sprint lanes (background) ──────────────────────────────────────────────
for x in (1.6, 2.0, 2.4):
    geo.box(f"Lane{x}", (0.015, 5.5, 0.0006), white, (x, 4.2, 0.0004), bev=0)
geo.box("StartLine", (0.82, 0.03, 0.0006), white, (2.0, 2.1, 0.0004), bev=0)
MC.sprint("SprintBot", M, (1.8, 2.35, 0.0), 180)

# ─── Arena architecture ─────────────────────────────────────────────────────
geo.plane("LEDWall", 8.0, 2.6, mat.screen("LED", os.path.join(core.TEX, "wide_arena.png"), 1.25), (0.2, 7.6, 2.3), (90, 0, 0))
wall = mat.principled("Wall", (0.008, 0.009, 0.012), roughness=0.6)
geo.plane("BackWall", 30, 8, wall, (0, 7.8, 4), (90, 0, 0))
# barriers with team-colour LED strips
for k, (c, x) in enumerate(zip([(0.18, 0.48, 1.0), (1.0, 0.23, 0.3), (1.0, 0.54, 0.12), (0.18, 0.83, 0.48), (0.6, 0.42, 1.0)], (-3.2, -1.6, 0.0, 1.6, 3.2))):
    geo.box(f"Barrier{k}", (1.5, 0.08, 0.32), M["mech"], (x, 5.6, 0.16), bev=0.006)
    geo.box(f"BarrierLED{k}", (1.46, 0.005, 0.02), mat.emission(f"BLED{k}", c, 8), (x, 5.557, 0.28), bev=0)
# truss + moving-head lights
for x in (-3.0, -1.0, 1.0, 3.0):
    geo.box(f"Truss{x}", (0.25, 0.25, 0.25), M["aluminium"], (x, 3.5, 4.6), bev=0.01)
geo.box("TrussBeam", (8.0, 0.22, 0.22), M["aluminium"], (0, 3.5, 4.6), bev=0.01)
beams = [((-3.0, 3.5, 4.4), (-1.4, 1.9, 0.03), (0.45, 0.62, 1.0), 7000, 11),
         ((-1.0, 3.5, 4.4), (0.25, 0.35, 0.05), (0.85, 0.9, 1.0), 3200, 9),
         ((1.0, 3.5, 4.4), (2.0, 2.4, 0.0), (1.0, 0.62, 0.3), 9000, 10),
         ((3.0, 3.5, 4.4), (3.2, 1.2, 0.0), (0.5, 0.65, 1.0), 12000, 8),
         ((-2.0, 3.5, 4.4), (-2.6, 0.6, 0.0), (0.6, 0.5, 1.0), 12000, 8)]
for i, (a, b, c, e, ang) in enumerate(beams):
    core.spot_light(a, b, e, ang, 0.3, c, radius=0.04, name=f"Beam{i}")
    if i != 1:
        core.beam_volume(a, b, ang, 0.035, (0.75, 0.82, 1.0), name=f"BeamVol{i}")
    geo.cylinder(f"Head{i}", 0.08, 0.16, M["mech"], (a[0], a[1], a[2] + 0.11), seg=24, bev=0.004)
geo.plane("Score2", 2.4, 0.78, mat.screen("ScoreM2", os.path.join(core.TEX, "wide_score.png"), 1.0), (3.9, 6.0, 2.3), (90, 0, -28))
geo.plane("LEDWallR", 3.2, 1.05, mat.screen("LEDR", os.path.join(core.TEX, "wide_arena.png"), 0.9), (5.4, 4.2, 1.6), (90, 0, -62))

# ─── Light on the bout ──────────────────────────────────────────────────────
tgt = (0.26, 0.37, 0.09)
core.area_light((1.0, 0.0, 0.45), tgt, 16, (0.06, 1.0), (1.0, 0.25, 0.3), spread=35, name="RedRim")
core.area_light((-0.6, 0.9, 0.5), tgt, 12, (0.06, 1.0), (0.25, 0.5, 1.0), spread=35, name="BlueRim")
core.area_light((-0.3, -0.7, 0.9), tgt, 5, (0.9, 0.9), (0.85, 0.9, 1.0), spread=70, name="Key")
core.haze_box((0, 4.0, 2.4), (16, 9, 4.8), density=0.008, color=(0.6, 0.7, 0.95), anisotropy=0.7)

cam = core.camera((-0.62, -1.1, 0.5), (0.16, 0.62, 0.2), lens=26, fstop=2.2, shift=(0.0, 0.1))
cam.data.dof.focus_distance = 1.5
core.compositor(bloom=0.28, bloom_threshold=1.8, dispersion=0.01)
core.depth_pass("arena", 0.4, 9.0)
print(core.render("arena", q))
