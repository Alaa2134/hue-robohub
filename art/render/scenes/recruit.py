"""08 — Recruitment: RH-01's armoured hand reaching toward the viewer, palm core glowing — "Join the next generation of builders".

Usage: python scenes/recruit.py -- <preview|final> [wide|tall]
"""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, geo, mat

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else ["preview", "wide"]
q, fmt = args[0], (args[1] if len(args) > 1 else "wide")
core.reset()
core.render_settings(q, (1920, 1080) if fmt == "wide" else (1350, 1688), exposure=-0.1)
core.world((0.0004, 0.0006, 0.0012))
M = mat.library()
armor, satin, mech, glow = M["armor"], M["armor_satin"], M["mech"], mat.emission("HandGlow", (0.2, 0.6, 1.0), 9)


def plate(name, w, t, length, taper=0.86, parent=None, back=True):
    """Phalanx armour: tapered faceted plate along +Z with a chamfered back ridge."""
    hw, ht = w / 2, t / 2
    tw = hw * taper
    pts = [(-hw, -ht, 0.002), (hw, -ht, 0.002), (-hw, ht * 0.7, 0.002), (hw, ht * 0.7, 0.002), (0, ht, 0.004),
           (-tw, -ht * 0.9, length - 0.002), (tw, -ht * 0.9, length - 0.002), (-tw, ht * 0.6, length - 0.003), (tw, ht * 0.6, length - 0.003), (0, ht * 0.85, length - 0.005)]
    return geo.hull(name, pts, armor if back else satin, parent=parent, bev=0.0012)


def joint(name, w, t, parent):
    j = geo.cylinder(name, t * 0.42, w * 0.86, mech, (0, 0, 0), (0, 90, 0), seg=24, bev=0.0006, parent=parent)
    for sx in (-1, 1):
        geo.torus(f"{name}Ring{sx}", t * 0.38, 0.0007, glow, (sx * w * 0.44, 0, 0), (0, 90, 0), seg=32, seg2=6, parent=parent)
    return j


def finger(name, base, splay, lengths, curls, w, t, parent):
    node = geo.empty(f"{name}Base", base, (0, splay, 0), parent=parent)
    for i, (L, c) in enumerate(zip(lengths, curls)):
        node = geo.empty(f"{name}J{i}", (0, 0, 0) if i == 0 else (0, 0, lengths[i - 1]), (c, 0, 0), parent=node)
        joint(f"{name}K{i}", w * (1 - 0.06 * i), t * (1 - 0.08 * i), node)
        plate(f"{name}P{i}", w * (1 - 0.06 * i), t * (1 - 0.08 * i), L, parent=node)
        if i == len(lengths) - 1:
            geo.box(f"{name}Tip", (w * 0.5, 0.0012, L * 0.35), glow, (0, -t * 0.47, L * 0.55), bev=0, parent=node)
    return node


hand = geo.empty("Hand", (0.0, 0.0, 0.0), (0, 0, 0))
# Palm (palm side faces −Y, toward camera)
pw, ph, pt = 0.088, 0.096, 0.03
geo.hull("Palm", [(-pw / 2, -pt / 2, 0), (pw / 2, -pt / 2, 0), (-pw / 2, pt / 2, 0.004), (pw / 2, pt / 2, 0.004),
                  (-pw / 2 * 0.98, -pt / 2, ph), (pw / 2 * 0.98, -pt / 2, ph), (-pw / 2, pt / 2, ph - 0.006), (pw / 2, pt / 2, ph - 0.006),
                  (0, pt * 0.62, ph * 0.5)], armor, parent=hand, bev=0.002)
geo.hull("PalmPad", [(-0.03, -pt / 2 - 0.002, 0.012), (0.03, -pt / 2 - 0.002, 0.012), (-0.034, -pt / 2 - 0.002, 0.084), (0.034, -pt / 2 - 0.002, 0.084),
                     (-0.03, -pt / 2 + 0.003, 0.012), (0.03, -pt / 2 + 0.003, 0.012), (-0.034, -pt / 2 + 0.003, 0.084), (0.034, -pt / 2 + 0.003, 0.084)], satin, parent=hand, bev=0.0012)
core_root = geo.empty("PalmCore", (0, -pt / 2 - 0.0025, 0.05), (90, 0, 0), parent=hand)
geo.cylinder("CoreDisc", 0.016, 0.003, M["visor"], (0, 0, 0), seg=64, bev=0.0005, parent=core_root)
geo.torus("CoreRing", 0.0165, 0.0016, glow, (0, 0, 0.0016), seg=64, seg2=8, parent=core_root)
geo.cylinder("CoreLight", 0.006, 0.002, mat.emission("CoreHot", (0.55, 0.85, 1.0), 22), (0, 0, 0.0015), seg=32, bev=0, parent=core_root)
for k in range(6):
    a = math.radians(30 + k * 60)
    geo.box(f"CoreTick{k}", (0.0016, 0.006, 0.0008), glow, (0.024 * math.cos(a), 0.024 * math.sin(a), 0.0012), (0, 0, math.degrees(a) + 90), bev=0, parent=core_root)
# Fingers (index at +X)
specs = [(0.031, 5, (0.052, 0.033, 0.025), (10, 16, 14)), (0.0105, 1, (0.057, 0.036, 0.026), (12, 18, 15)),
         (-0.0105, -3, (0.053, 0.033, 0.025), (15, 20, 16)), (-0.031, -8, (0.043, 0.027, 0.021), (19, 23, 18))]
for i, (x, spl, Ls, cs) in enumerate(specs):
    finger(f"F{i}", (x, -0.002, ph + 0.004), spl, Ls, cs, 0.0185 if i < 3 else 0.016, 0.019, hand)
# Thumb
th = geo.empty("ThumbBase", (pw / 2 - 0.004, -0.008, 0.022), (22, 52, 0), parent=hand)
finger("Th", (0, 0, 0), 0, (0.04, 0.03, 0.024), (12, 18, 14), 0.021, 0.021, th)
# Wrist + forearm
geo.cylinder("Wrist", 0.03, 0.03, mech, (0, 0.002, -0.012), (0, 0, 0), seg=48, bev=0.002, parent=hand)
geo.torus("WristGlow", 0.0305, 0.0012, glow, (0, 0.002, -0.006), seg=64, seg2=8, parent=hand)
geo.hull("Forearm", [(-0.042, -0.024, -0.03), (0.042, -0.024, -0.03), (-0.042, 0.03, -0.03), (0.042, 0.03, -0.03),
                     (-0.05, -0.03, -0.27), (0.05, -0.03, -0.27), (-0.05, 0.04, -0.27), (0.05, 0.04, -0.27), (0, 0.052, -0.15)], armor, parent=hand, bev=0.003)
geo.box("ForearmStrip", (0.002, 0.004, 0.18), glow, (0.0505, 0.0, -0.15), bev=0, parent=hand)
geo.box("ForearmStripL", (0.002, 0.004, 0.18), glow, (-0.0505, 0.0, -0.15), bev=0, parent=hand)

hand.rotation_euler = (math.radians(-30), math.radians(12), math.radians(-18))
hand.location = (0.0, 0.0, 0.0)

geo.plane("Back", 6, 4, mat.principled("Back", (0.004, 0.005, 0.008), roughness=0.8), (0, 1.6, 0), (90, 0, 0))
tgt = (0, -0.01, 0.07)
core.area_light((-0.45, 0.35, 0.3), tgt, 9, (0.04, 0.6), (0.25, 0.5, 1.0), spread=35, name="RimL")
core.area_light((0.45, 0.4, 0.25), tgt, 9, (0.04, 0.6), (0.25, 0.75, 1.0), spread=35, name="RimR")
core.area_light((0.1, 0.25, 0.5), tgt, 1.6, (0.5, 0.04), (0.6, 0.75, 1.0), spread=40, name="Top")
core.area_light((-0.4, -0.5, 0.0), tgt, 0.9, (0.5, 0.5), (0.75, 0.82, 1.0), spread=70, name="Key")
core.point_light((0, -0.08, 0.06), 0.25, (0.3, 0.65, 1.0), 0.01, "CoreSpill")
core.haze_box((0, 0.9, 0.0), (3, 1.2, 1.6), density=0.02, color=(0.5, 0.65, 1.0), anisotropy=0.6)
for k in range(8):
    geo.sphere(f"Dust{k}", 0.0016, mat.emission(f"DustM{k%2}", (0.5, 0.75, 1.0), 6), (-0.25 + k * 0.07, 0.3 + (k % 3) * 0.12, -0.05 + (k % 4) * 0.06))

if fmt == "wide":
    cam = core.camera((-0.05, -0.5, 0.02), (0.0, 0.0, 0.085), lens=50, fstop=2.4, shift=(-0.17, 0.0))
    cam.data.dof.focus_distance = 0.46
else:
    cam = core.camera((-0.03, -0.5, -0.03), (0.0, 0.0, 0.05), lens=50, fstop=2.4, shift=(0.0, -0.05))
    cam.data.dof.focus_distance = 0.5
cam.data.clip_start = 0.01
core.compositor(bloom=0.3, bloom_threshold=1.6, dispersion=0.012)
if fmt == "wide":
    core.depth_pass("recruit", 0.2, 2.0)
print(core.render("recruit" if fmt == "wide" else "recruit_tall", q))
