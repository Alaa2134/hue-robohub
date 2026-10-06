"""IDEA — blueprint: the rover and an arm drawn as glowing wireframes over a drafting grid with dimension lines."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import bpy
from rh import core, geo, machines as MC, mat

q = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "preview"
core.reset()
core.render_settings(q, (1920, 1080), exposure=-0.3)
core.world((0.0015, 0.004, 0.012))
M = mat.library()
LINE = (0.35, 0.75, 1.0)

MC.rover6("Rover", M, (0.15, 0.0, 0.0), -25, "glow_blue")
MC.manipulator_arm("Arm", M, (-0.42, 0.25, 0.0), 30, (20, -25, 65, 30), None, 1.4)
wire_m = mat.emission("Wire", LINE, 2.2)
ghost = mat.principled("Ghost", (0.01, 0.03, 0.08), roughness=0.4)
for ob in list(bpy.data.objects):
    if ob.type in ("MESH", "CURVE") and ob.name not in ("Floor",):
        if ob.type == "CURVE":
            ob.data.materials.clear()
            ob.data.materials.append(wire_m)
            continue
        ob.data.materials.clear()
        ob.data.materials.append(ghost)
        ob.data.materials.append(wire_m)
        w = ob.modifiers.new("Wire", "WIREFRAME")
        w.thickness = 0.0009
        w.use_replace = False
        w.material_offset = 1
        w.use_even_offset = True

grid_m = mat.emission("Grid", (0.15, 0.4, 0.9), 0.35)
grid_m2 = mat.emission("Grid2", (0.2, 0.5, 1.0), 0.9)
geo.plane("Floor", 30, 30, mat.principled("Paper", (0.004, 0.012, 0.035), roughness=0.9), (0, 2, 0))
for k in range(-40, 41):
    major = k % 5 == 0
    geo.box(f"GX{k}", (6, 0.0015 if not major else 0.003, 0.0002), grid_m2 if major else grid_m, (0, k * 0.05 + 1, 0.0002), bev=0)
    geo.box(f"GY{k}", (0.0015 if not major else 0.003, 6, 0.0002), grid_m2 if major else grid_m, (k * 0.05, 1, 0.0002), bev=0)
# dimension lines with ticks
dim = mat.emission("Dim", (1.0, 0.75, 0.35), 2.5)
for a, b in (((-0.05, -0.24, 0.002), (0.38, -0.08, 0.002)), ((0.42, -0.06, 0.002), (0.42, -0.06, 0.34))):
    geo.wire(f"Dim{a}", [a, b], 0.0012, dim)
    for p in (a, b):
        geo.wire(f"Tick{p}", [(p[0] - 0.012, p[1], p[2]), (p[0] + 0.012, p[1], p[2])], 0.0012, dim)
for i in range(3):
    geo.torus(f"Circle{i}", 0.08 + i * 0.05, 0.0008, grid_m2, (0.15, 0.0, 0.001), seg=96, seg2=4)

cam = core.camera((-0.7, -1.05, 0.55), (0.0, 0.1, 0.12), lens=40, fstop=5.6, shift=(-0.08, 0.0))
cam.data.dof.focus_distance = 1.3
core.area_light((0, -1, 1.5), (0, 0, 0), 20, (2, 2), (0.6, 0.75, 1.0), spread=90, name="Fill")
core.compositor(bloom=0.3, bloom_threshold=1.2, dispersion=0.01)
print(core.render("idea", q))
