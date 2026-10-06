"""10 — Hardware macro: STM32 board at 1:1, QFP pins and passives razor-sharp, everything else melting into bokeh."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, electronics as E, geo, mat

q = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "preview"
core.reset()
core.render_settings(q, (1920, 1080), exposure=-1.6)
core.world((0.0005, 0.0008, 0.0014))
M = mat.library()

esd = mat.principled("ESDMat", (0.008, 0.01, 0.013), roughness=0.85, breakup=0.12)
geo.plane("Mat", 2, 2, esd, (0, 0.3, 0))
E.devboard("STM", M, "stm32", (0.0, 0.0, 0.0), 8, seed=4)
E.devboard("ESP", M, "esp32", (0.075, 0.07, 0.0), -16, seed=2)
E.devboard("DRV", M, "driver", (-0.07, 0.08, 0.0), 22)
for k, (x, y) in enumerate(((0.02, 0.12), (-0.03, 0.16), (0.09, 0.15))):
    geo.sphere(f"Bokeh{k}", 0.004, mat.emission(f"BkM{k}", (0.25, 0.75, 1.0) if k != 1 else (1.0, 0.5, 0.2), 30), (x, y, 0.015))

tgt = (0.0, 0.0, 0.004)
core.area_light((-0.12, 0.12, 0.08), tgt, 0.5, (0.02, 0.2), (0.25, 0.5, 1.0), spread=40, name="RimL")
core.area_light((0.12, 0.08, 0.06), tgt, 0.45, (0.02, 0.2), (0.25, 0.85, 1.0), spread=40, name="RimR")
core.area_light((0.0, -0.08, 0.18), tgt, 0.05, (0.2, 0.12), (0.85, 0.9, 1.0), spread=70, name="Key")
core.area_light((0.2, -0.02, 0.012), tgt, 0.25, (0.01, 0.3), (0.35, 0.7, 1.0), spread=20, name="Raking")

cam = core.camera((-0.035, -0.11, 0.06), (0.004, 0.0, 0.002), lens=90, fstop=6.3, sensor=36, shift=(-0.12, 0.0))
cam.data.dof.focus_distance = 0.124
cam.data.clip_start = 0.002
core.compositor(bloom=0.22, bloom_threshold=1.8, dispersion=0.01)
print(core.render("macro", q))
