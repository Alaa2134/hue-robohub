"""Contact-sheet renders for look-development (multiple angles, neutral light)."""
import math
import os
import bpy
from . import core


def contact_sheet(name, target=(0, 0, 0), dist=1.0, height=0.0, lens=50, size=420, angles=(0, 35, 90, 150), elev=(0, 5, 0, 20)):
    sc = bpy.context.scene
    sc.render.resolution_x = sc.render.resolution_y = size
    sc.render.resolution_percentage = 100
    paths = []
    for i, (a, e) in enumerate(zip(angles, elev)):
        rad = math.radians(a)
        er = math.radians(e)
        loc = (target[0] - math.sin(rad) * dist * math.cos(er), target[1] - math.cos(rad) * dist * math.cos(er), target[2] + height + math.sin(er) * dist)
        cam = core.camera(loc, target, lens=lens, fstop=None, name=f"Review{i}")
        sc.camera = cam
        p = os.path.join(core.OUT, f"_review_{name}_{i}.png")
        sc.render.filepath = p
        bpy.ops.render.render(write_still=True)
        paths.append(p)
    return paths
