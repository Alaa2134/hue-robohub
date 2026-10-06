"""02 — Embedded Systems: macro workbench (ESP32, STM32, Arduino-style board, driver, sensors, scope, iron)."""
import math
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from rh import core, electronics as E, geo, lab, mat

q = sys.argv[sys.argv.index("--") + 1] if "--" in sys.argv else "preview"
core.reset()
core.render_settings(q, (1920, 1080), exposure=-0.1)
core.world((0.0006, 0.0009, 0.0018))
M = mat.library()

# ESD mat with printed grid
esd = mat.principled("ESDMat", (0.018, 0.024, 0.032), roughness=0.62, breakup=0.12)
nt = esd.node_tree
b = nt.nodes["Principled BSDF"]
coord = nt.nodes.new("ShaderNodeTexCoord")
mapping = nt.nodes.new("ShaderNodeMapping")
mapping.inputs["Scale"].default_value = (40, 40, 40)
nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
brick = nt.nodes.new("ShaderNodeTexBrick")
brick.offset = 0.0
brick.inputs["Color1"].default_value = (0.018, 0.024, 0.032, 1)
brick.inputs["Color2"].default_value = (0.018, 0.024, 0.032, 1)
brick.inputs["Mortar"].default_value = (0.05, 0.065, 0.085, 1)
brick.inputs["Mortar Size"].default_value = 0.012
brick.inputs["Brick Width"].default_value = 1.0
brick.inputs["Row Height"].default_value = 1.0
nt.links.new(mapping.outputs["Vector"], brick.inputs["Vector"])
nt.links.new(brick.outputs["Color"], b.inputs["Base Color"])
geo.plane("Mat", 2.0, 1.4, esd, (0, 0.3, 0))

# ─── Hero board: ESP32 devkit (focus) ───────────────────────────────────────
esp = E.devboard("ESP", M, "esp32", (0.0, 0.0, 0.0), 12)
# Jumper wires seated on real header pins (x = ±12.95 mm, pitch 2.54 mm), routed back to the breadboard
pins = [(-0.01295, 3, "cable_blue"), (-0.01295, 5, "cable"), (0.01295, 2, "cable_red"), (0.01295, 6, "cable"), (0.01295, 9, "cable_blue")]
for k, (px, n, c) in enumerate(pins):
    import math as _m
    rz = _m.radians(12)
    lx, ly = px, -0.02325 + n * 0.00254
    x, y = lx * _m.cos(rz) - ly * _m.sin(rz), lx * _m.sin(rz) + ly * _m.cos(rz)
    E.jumper(f"J{k}", M, (x, y, 0.0099), (0.07 + k * 0.01, 0.195 + (k % 2) * 0.0025, 0.0085), c, lift=0.045 + k * 0.006)
E.breadboard("BB", M, (0.12, 0.2, 0.0), -8)

# ─── Supporting cast ────────────────────────────────────────────────────────
E.devboard("STM", M, "stm32", (0.075, 0.085, 0.0), -24, seed=4)
E.devboard("UNO", M, "uno", (-0.03, 0.26, 0.0), 12, seed=9)
E.devboard("DRV", M, "driver", (-0.06, 0.06, 0.0), 22)
E.ultrasonic("US", M, (0.085, -0.02, 0.0), (0, 0, -28))
E.ir_array("IR", M, 8, (-0.075, -0.04, 0.0), (0, 0, 18))
E.lipo("Lipo", M, (-0.16, 0.16, 0.0), -10)
# Motor for the driver (cable lead)
geo.cylinder("Motor", 0.0125, 0.032, M["aluminium"], (-0.11, 0.02, 0.0125), (0, 90, 40), seg=32, bev=0.001)
geo.cylinder("MotorGear", 0.012, 0.012, M["gold"], (-0.094, 0.034, 0.0125), (0, 90, 40), seg=32, bev=0.001)
geo.cable("MotorLead", [(-0.122, 0.01, 0.012), (-0.13, 0.04, 0.02), (-0.09, 0.07, 0.03), (-0.075, 0.05, 0.012)], 0.0012, M["cable_red"])

# Soldering iron resting with smoke, right background
E.soldering_station("Solder", M, (0.16, 0.3, 0.0), -35)
E.oscilloscope("Scope", M, (0.0, 0.46, 0.0), 6)
lab.monitor("Mon", M, (0.32, 0.75, 0.0), math.radians(-14), 0.62, 0.36, "pcb_layout.png", 2.4)

# ─── Lighting ───────────────────────────────────────────────────────────────
tgt = (0.0, 0.0, 0.005)
core.area_light((-0.25, 0.4, 0.28), tgt, 1.4, (0.03, 0.5), (0.25, 0.5, 1.0), spread=40, name="RimL")
core.area_light((0.3, 0.32, 0.22), tgt, 1.1, (0.03, 0.45), (0.2, 0.6, 1.0), spread=40, name="RimR")
core.area_light((-0.1, -0.35, 0.45), tgt, 0.14, (0.5, 0.3), (0.85, 0.9, 1.0), spread=70, name="Key")
core.area_light((0.15, -0.2, 0.06), tgt, 0.03, (0.3, 0.05), (0.3, 0.8, 1.0), name="Kick")
core.area_light((0.18, 0.12, 0.05), tgt, 0.35, (0.02, 0.2), (0.15, 0.85, 1.0), spread=30, name="CyanBack")
core.point_light((0.2, 0.28, 0.05), 0.05, (1.0, 0.55, 0.25), 0.01, "SolderGlow")
core.haze_box((0, 0.5, 0.25), (1.6, 1.0, 0.5), density=0.01, color=(0.6, 0.7, 0.95), anisotropy=0.6)

cam = core.camera((-0.13, -0.2, 0.125), (0.008, 0.035, 0.004), lens=55, fstop=3.2, ratio=1.0)
cam.data.dof.focus_distance = 0.255
core.compositor(bloom=0.2, bloom_threshold=2.0, dispersion=0.008)
print(core.render("track_embedded", q))
