"""04 — Mechanical & CAD: an exploded gearbox floating above the bench, explode guides in amber, CAD on screen."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, geo, lab, mat
from mathutils import Euler, Vector  # noqa: E402 (needs bpy loaded first)

q = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "preview"
core.reset()
core.render_settings(q, (1920, 1080), exposure=-0.05)
core.world((0.0008, 0.001, 0.0016))
M = mat.library()
AMBER = (1.0, 0.62, 0.22)

# Bench + cutting mat with grid
steel = mat.principled("BenchSteel", (0.02, 0.021, 0.024), metallic=0.9, roughness=0.55, breakup=0.15, scratches=True)
geo.box("Bench", (2.4, 1.2, 0.04), steel, (0, 0.25, -0.02), bev=0.003)
mat_m = mat.principled("CutMat", (0.006, 0.012, 0.014), roughness=0.75, breakup=0.1)
nt = mat_m.node_tree
b = nt.nodes["Principled BSDF"]
coord = nt.nodes.new("ShaderNodeTexCoord")
mp = nt.nodes.new("ShaderNodeMapping")
mp.inputs["Scale"].default_value = (50, 50, 50)
nt.links.new(coord.outputs["Object"], mp.inputs["Vector"])
brick = nt.nodes.new("ShaderNodeTexBrick")
brick.offset = 0.0
for k, v in (("Color1", (0.012, 0.03, 0.03, 1)), ("Color2", (0.012, 0.03, 0.03, 1)), ("Mortar", (0.03, 0.06, 0.07, 1))):
    brick.inputs[k].default_value = v
brick.inputs["Mortar Size"].default_value = 0.015
brick.inputs["Brick Width"].default_value = 1.0
brick.inputs["Row Height"].default_value = 1.0
nt.links.new(mp.outputs["Vector"], brick.inputs["Vector"])
nt.links.new(brick.outputs["Color"], b.inputs["Base Color"])
geo.box("Mat", (0.9, 0.6, 0.002), mat_m, (0.05, 0.12, 0.001), bev=0.0005)

# ─── Exploded gearbox along a tilted axis ───────────────────────────────────
axis_rot = Euler((math.radians(0), math.radians(72), math.radians(28)))
O = Vector((0.06, 0.12, 0.21))
D = Vector((0, 0, 1))
D.rotate(axis_rot)


def at(t):
    return tuple(O + D * t)


rot = tuple(math.degrees(a) for a in axis_rot)
brass = mat.principled("Brass", (0.85, 0.6, 0.28), metallic=1.0, roughness=0.22, breakup=0.05)
steel_g = mat.principled("GearSteel", (0.6, 0.62, 0.65), metallic=1.0, roughness=0.28, breakup=0.08, aniso=0.4)
pla = mat.principled("PLA", (0.02, 0.1, 0.55), roughness=0.4, coat=0.15)
housing = mat.principled("Housing", (0.16, 0.17, 0.19), metallic=1.0, roughness=0.32, breakup=0.06, aniso=0.6)

parts = []
# housing: round machined motor flange with boss, bore and four counterbored holes
hroot = geo.empty("HousingRoot", at(-0.16), rot)
holes4 = [(0.033 * math.cos(a), 0.033 * math.sin(a)) for a in (math.pi / 4, 3 * math.pi / 4, 5 * math.pi / 4, 7 * math.pi / 4)]
geo.extrude_polygon("Flange", geo.circle_pts(0.046, 96), 0.008, housing, (0, 0, 0), (0, 0, 0), 0.0012,
                    holes=[list(reversed(geo.circle_pts(0.012, 48)))] + [list(reversed(geo.circle_pts(0.0028, 20, x, y))) for x, y in holes4], parent=hroot)
geo.extrude_polygon("Boss", geo.circle_pts(0.024, 96), 0.022, housing, (0, 0, 0.015), (0, 0, 0), 0.0015,
                    holes=[list(reversed(geo.circle_pts(0.0145, 64)))], parent=hroot)
for k, (x, y) in enumerate(holes4):
    geo.torus(f"CBore{k}", 0.0042, 0.0006, M["mech"], (x, y, 0.0041), seg=24, seg2=6, parent=hroot)
geo.torus("FlangeChamfer", 0.046, 0.0009, M["chrome"], (0, 0, 0.0041), seg=96, seg2=6, parent=hroot)
# bearing
br = geo.empty("Bearing", at(-0.095), rot)
geo.torus("BearingOuter", 0.0135, 0.0025, M["chrome"], (0, 0, 0), seg=64, seg2=16, parent=br)
geo.cylinder("BearingRace", 0.0145, 0.007, M["chrome"], (0, 0, 0), seg=64, bev=0.0006, parent=br)
geo.cylinder("BearingSeal", 0.0118, 0.0072, M["black_plastic"], (0, 0, 0), seg=64, bev=0.0004, parent=br)
geo.cylinder("BearingInner", 0.0075, 0.0074, M["chrome"], (0, 0, 0), seg=48, bev=0.0004, parent=br)
# big gear
geo.spur_gear("GearBig", 48, 0.0016, 0.009, brass, bore=0.004, loc=at(-0.04), rot=rot, lightening=6)
# spacer
geo.cylinder("Spacer", 0.007, 0.012, M["aluminium"], at(0.0), rot, seg=48, bev=0.0006)
# pinion
geo.spur_gear("Pinion", 14, 0.0016, 0.014, steel_g, bore=0.003, loc=at(0.035), rot=rot)
# shaft passes through everything
geo.cylinder("Shaft", 0.004, 0.33, M["chrome"], at(-0.02), rot, seg=32, bev=0.0005)
# printed cover cap (PLA, visible layer lines) with four bolts
nt2 = pla.node_tree
b2 = nt2.nodes["Principled BSDF"]
c2 = nt2.nodes.new("ShaderNodeTexCoord")
wv = nt2.nodes.new("ShaderNodeTexWave")
wv.wave_type = "BANDS"
wv.bands_direction = "Z"
wv.inputs["Scale"].default_value = 900
nt2.links.new(c2.outputs["Object"], wv.inputs["Vector"])
bp = nt2.nodes.new("ShaderNodeBump")
bp.inputs["Strength"].default_value = 0.25
nt2.links.new(wv.outputs["Fac"], bp.inputs["Height"])
nt2.links.new(bp.outputs["Normal"], b2.inputs["Normal"])
croot = geo.empty("CoverRoot", at(0.1), rot)
geo.extrude_polygon("Cover", geo.circle_pts(0.046, 96), 0.006, pla, (0, 0, 0), (0, 0, 0), 0.0015,
                    holes=[list(reversed(geo.circle_pts(0.006, 32)))] + [list(reversed(geo.circle_pts(0.0028, 20, x, y))) for x, y in holes4], parent=croot)
geo.extrude_polygon("CoverDome", geo.circle_pts(0.03, 96), 0.012, pla, (0, 0, 0.009), (0, 0, 0), 0.003, holes=[list(reversed(geo.circle_pts(0.006, 32)))], parent=croot)
for k in range(8):
    a = 2 * math.pi * k / 8
    geo.box(f"Fin{k}", (0.016, 0.0025, 0.01), pla, (0.038 * math.cos(a), 0.038 * math.sin(a), 0.008), (0, 0, math.degrees(a)), bev=0.0006, parent=croot)
for k, (x, y) in enumerate(holes4):
    bt = geo.empty(f"Bolt{k}", at(0.15), rot)
    geo.cylinder(f"BoltHead{k}", 0.0029, 0.003, M["mech"], (x, y, 0.0), seg=32, bev=0.0004, parent=bt)
    geo.cylinder(f"BoltHex{k}", 0.0014, 0.0032, M["black_plastic"], (x, y, 0.0002), seg=6, bev=0, parent=bt)
    geo.cylinder(f"BoltShank{k}", 0.0015, 0.03, M["chrome"], (x, y, -0.016), seg=16, bev=0.0002, parent=bt)
# explode guides (dashed amber)
glow = mat.emission("Guide", AMBER, 7.0)
for i in range(26):
    t0 = -0.2 + i * 0.016
    geo.wire(f"Guide{i}", [at(t0), at(t0 + 0.008)], 0.0008, glow)
for k, (x, y) in enumerate((holes4[0], holes4[2])):
    off = Vector((x, y, 0))
    off.rotate(axis_rot)
    for i in range(14):
        t0 = 0.11 + i * 0.0035 * 0 + i * 0.003
        a = Vector(at(0.1)) + off + D * (i * 0.0035)
        geo.wire(f"BoltGuide{k}{i}", [tuple(a), tuple(a + D * 0.0018)], 0.0005, glow)

# ─── Bench props ─────────────────────────────────────────────────────────────
# calipers
cal = geo.empty("Calipers", (-0.2, -0.02, 0.003), (0, 0, 18))
geo.box("CalBeam", (0.2, 0.016, 0.004), M["chrome"], (0, 0, 0.002), bev=0.0006, parent=cal)
geo.box("CalBody", (0.06, 0.03, 0.012), M["black_plastic"], (0.02, 0.0, 0.006), bev=0.002, parent=cal)
geo.box("CalLcd", (0.03, 0.012, 0.001), mat.emission("CalLcdM", (0.55, 0.8, 0.7), 1.2), (0.02, 0.003, 0.0125), bev=0, parent=cal)
geo.box("CalJaw", (0.008, 0.05, 0.003), M["chrome"], (-0.095, -0.03, 0.0015), bev=0.0005, parent=cal)
# hex keys
for k in range(3):
    hk = geo.empty(f"Hex{k}", (0.3 + k * 0.02, -0.06 + k * 0.012, 0.002), (0, 0, -30 + k * 6))
    geo.cylinder(f"HexL{k}", 0.0015 + k * 0.0004, 0.07 + k * 0.012, M["mech"], (0, 0, 0), (0, 90, 0), seg=6, bev=0.0002, parent=hk)
    geo.cylinder(f"HexS{k}", 0.0015 + k * 0.0004, 0.018, M["mech"], (0.035 + k * 0.006, 0.009, 0), (90, 0, 0), seg=6, bev=0.0002, parent=hk)
# printed bracket + screws scattered
br2 = geo.extrude_polygon("Bracket", [(0, 0), (0.05, 0), (0.05, 0.008), (0.008, 0.008), (0.008, 0.04), (0, 0.04)], 0.02, pla, (0.28, 0.2, 0.01), (90, 0, 25), 0.0012)
for k in range(5):
    r = geo.jitter(k)
    geo.cylinder(f"Screw{k}", 0.0014, 0.012, M["chrome"], (-0.05 + r.uniform(-0.05, 0.05), -0.12 + r.uniform(-0.02, 0.03), 0.0016), (0, 90, r.uniform(0, 180)), seg=12, bev=0.0002)
geo.spur_gear("GearSpare", 24, 0.0016, 0.006, steel_g, bore=0.003, loc=(-0.06, 0.28, 0.003), rot=(0, 0, 10))

# CAD monitor + wall
lab.monitor("CAD", M, (0.5, 0.95, 0.0), math.radians(-18), 0.7, 0.4, "cad_arm.png", 2.0)
geo.box("Desk", (2.4, 0.5, 0.02), M["mech"], (0.4, 1.05, 0.0), bev=0.003)
wall = mat.principled("Wall", (0.012, 0.014, 0.018), roughness=0.6, breakup=0.15)
geo.plane("BackWall", 8, 4, wall, (0, 2.4, 1.5), (90, 0, 0))

# ─── Light ──────────────────────────────────────────────────────────────────
tgt = at(0.0)
core.area_light((0.5, 0.25, 0.4), tgt, 10, (0.05, 0.5), AMBER, spread=35, name="AmberRim")
core.area_light((-0.45, 0.45, 0.5), tgt, 7, (0.05, 0.6), (0.3, 0.55, 1.0), spread=40, name="BlueRim")
core.area_light((-0.35, -0.55, 0.6), tgt, 1.4, (0.6, 0.6), (0.86, 0.9, 1.0), spread=70, name="Key")
core.area_light((0.1, 0.55, 0.32), tgt, 6, (0.5, 0.04), (0.9, 0.75, 0.55), spread=30, name="BackEdge")
core.area_light((0.05, 0.1, 0.9), tgt, 1.6, (0.8, 0.4), (0.8, 0.85, 1.0), spread=60, name="Top")
core.haze_box((0, 1.4, 0.8), (4, 1.6, 1.6), density=0.006, color=(0.65, 0.68, 0.8), anisotropy=0.5)

cam = core.camera((-0.3, -0.42, 0.3), (0.06, 0.12, 0.2), lens=54, fstop=3.5, shift=(-0.12, 0.03))
cam.data.dof.focus_distance = (Vector((-0.3, -0.42, 0.3)) - Vector(at(-0.04))).length
core.compositor(bloom=0.18, bloom_threshold=2.2, dispersion=0.008)
core.depth_pass("track_mechanical", 0.3, 2.5)
print(core.render("track_mechanical", q))
