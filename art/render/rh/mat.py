"""Physically based material library for the HUE RoboHub render set."""
import os
import bpy

_cache = {}


def _bsdf(m):
    return m.node_tree.nodes["Principled BSDF"]


def _new(name):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    return m


def sock(node, identifier):
    for s in node.inputs:
        if s.identifier == identifier:
            return s
    raise KeyError(identifier)


def _roughness_breakup(m, base, amount=0.08, scale=6.0, detail=6.0, scratches=False):
    """Noise-driven roughness variation so highlights never look CG-perfect."""
    nt = m.node_tree
    b = _bsdf(m)
    noise = nt.nodes.new("ShaderNodeTexNoise")
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = detail
    noise.inputs["Roughness"].default_value = 0.6
    rng = nt.nodes.new("ShaderNodeMapRange")
    rng.inputs["To Min"].default_value = max(0.0, base - amount)
    rng.inputs["To Max"].default_value = base + amount
    nt.links.new(noise.outputs["Fac"], rng.inputs["Value"])
    out = rng.outputs["Result"]
    if scratches:
        wave = nt.nodes.new("ShaderNodeTexWave")
        wave.wave_type = "BANDS"
        wave.inputs["Scale"].default_value = 120
        wave.inputs["Distortion"].default_value = 18
        wave.inputs["Detail"].default_value = 4
        ramp = nt.nodes.new("ShaderNodeValToRGB")
        ramp.color_ramp.elements[0].position = 0.86
        ramp.color_ramp.elements[1].position = 1.0
        nt.links.new(wave.outputs["Fac"], ramp.inputs["Fac"])
        mx = nt.nodes.new("ShaderNodeMath")
        mx.operation = "ADD"
        mul = nt.nodes.new("ShaderNodeMath")
        mul.operation = "MULTIPLY"
        mul.inputs[1].default_value = 0.12
        nt.links.new(ramp.outputs["Color"], mul.inputs[0])
        nt.links.new(out, mx.inputs[0])
        nt.links.new(mul.outputs[0], mx.inputs[1])
        out = mx.outputs[0]
    nt.links.new(out, b.inputs["Roughness"])


def principled(name, color, metallic=0.0, roughness=0.5, coat=0.0, coat_rough=0.05, sheen=0.0, breakup=0.0, scratches=False, spec=0.5, aniso=0.0):
    key = (name,)
    if key in _cache:
        return _cache[key]
    m = _new(name)
    b = _bsdf(m)
    b.inputs["Base Color"].default_value = (*color, 1)
    b.inputs["Metallic"].default_value = metallic
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Coat Weight"].default_value = coat
    b.inputs["Coat Roughness"].default_value = coat_rough
    b.inputs["Sheen Weight"].default_value = sheen
    b.inputs["Specular IOR Level"].default_value = spec
    b.inputs["Anisotropic"].default_value = aniso
    if breakup:
        _roughness_breakup(m, roughness, breakup, scratches=scratches)
    _cache[key] = m
    return m


def panel_lines(m, scale=7.0, width=0.035, depth=0.6, darken=0.35):
    """Machined panel seams: Voronoi cell edges → grooves (bump), darker and rougher in the seam."""
    nt = m.node_tree
    b = _bsdf(m)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    vor = nt.nodes.new("ShaderNodeTexVoronoi")
    vor.feature = "DISTANCE_TO_EDGE"
    vor.inputs["Scale"].default_value = scale
    vor.inputs["Randomness"].default_value = 0.85
    nt.links.new(coord.outputs["Object"], vor.inputs["Vector"])
    ramp = nt.nodes.new("ShaderNodeMapRange")
    ramp.inputs["From Min"].default_value = 0.0
    ramp.inputs["From Max"].default_value = width
    ramp.inputs["To Min"].default_value = 0.0
    ramp.inputs["To Max"].default_value = 1.0
    nt.links.new(vor.outputs["Distance"], ramp.inputs["Value"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = depth
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(ramp.outputs["Result"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    if b.inputs["Coat Weight"].default_value > 0:
        nt.links.new(bump.outputs["Normal"], b.inputs["Coat Normal"])
    # darken seams
    base = tuple(b.inputs["Base Color"].default_value)
    mix = nt.nodes.new("ShaderNodeMix")
    mix.data_type = "RGBA"
    sock(mix, "A_Color").default_value = (base[0] * darken, base[1] * darken, base[2] * darken, 1)
    sock(mix, "B_Color").default_value = base
    nt.links.new(ramp.outputs["Result"], sock(mix, "Factor_Float"))
    nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    return m


def emission(name, color, strength=20.0):
    key = (name,)
    if key in _cache:
        return _cache[key]
    m = _new(name)
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    em = nt.nodes.new("ShaderNodeEmission")
    em.inputs["Color"].default_value = (*color, 1)
    em.inputs["Strength"].default_value = strength
    nt.links.new(em.outputs[0], out.inputs["Surface"])
    _cache[key] = m
    return m


def image_tex(path, colorspace="sRGB"):
    img = bpy.data.images.load(path, check_existing=True)
    img.colorspace_settings.name = colorspace
    return img


def screen(name, image_path, strength=2.2, gloss=0.06):
    """Emissive display with a glass coat so reflections sit on top of the UI."""
    key = (name, image_path)
    if key in _cache:
        return _cache[key]
    m = _new(name)
    nt = m.node_tree
    b = _bsdf(m)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image_tex(image_path)
    tex.interpolation = "Cubic"
    b.inputs["Base Color"].default_value = (0.0, 0.0, 0.0, 1)
    b.inputs["Roughness"].default_value = gloss
    b.inputs["Coat Weight"].default_value = 1.0
    b.inputs["Coat Roughness"].default_value = 0.02
    nt.links.new(tex.outputs["Color"], b.inputs["Emission Color"])
    b.inputs["Emission Strength"].default_value = strength
    _cache[key] = m
    return m


def decal(name, image_path, color=None, emission_strength=0.0, roughness=0.4, metallic=0.0):
    """Alpha-masked print/label material (logos on armour, hoodie prints, silkscreen)."""
    key = (name, image_path)
    if key in _cache:
        return _cache[key]
    m = _new(name)
    nt = m.node_tree
    b = _bsdf(m)
    tex = nt.nodes.new("ShaderNodeTexImage")
    tex.image = image_tex(image_path)
    tex.interpolation = "Cubic"
    if color is None:
        nt.links.new(tex.outputs["Color"], b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = (*color, 1)
    nt.links.new(tex.outputs["Alpha"], b.inputs["Alpha"])
    b.inputs["Roughness"].default_value = roughness
    b.inputs["Metallic"].default_value = metallic
    if emission_strength:
        b.inputs["Emission Color"].default_value = (*(color or (1, 1, 1)), 1)
        b.inputs["Emission Strength"].default_value = emission_strength
    _cache[key] = m
    return m


def concrete(name="Concrete", tint=(0.035, 0.038, 0.042), rough=(0.18, 0.55)):
    """Polished concrete: tonal mottling plus roughness variation for broken reflections."""
    if name in _cache:
        return _cache[name]
    m = _new(name)
    nt = m.node_tree
    b = _bsdf(m)
    n1 = nt.nodes.new("ShaderNodeTexNoise")
    n1.inputs["Scale"].default_value = 1.6
    n1.inputs["Detail"].default_value = 10
    n1.inputs["Roughness"].default_value = 0.62
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (tint[0] * 0.6, tint[1] * 0.6, tint[2] * 0.6, 1)
    ramp.color_ramp.elements[1].color = (tint[0] * 1.5, tint[1] * 1.5, tint[2] * 1.5, 1)
    nt.links.new(n1.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], b.inputs["Base Color"])
    n2 = nt.nodes.new("ShaderNodeTexNoise")
    n2.inputs["Scale"].default_value = 0.6
    n2.inputs["Detail"].default_value = 4
    rr = nt.nodes.new("ShaderNodeMapRange")
    rr.inputs["From Min"].default_value = 0.35
    rr.inputs["From Max"].default_value = 0.7
    rr.inputs["To Min"].default_value = rough[0]
    rr.inputs["To Max"].default_value = rough[1]
    nt.links.new(n2.outputs["Fac"], rr.inputs["Value"])
    nt.links.new(rr.outputs["Result"], b.inputs["Roughness"])
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.04
    n3 = nt.nodes.new("ShaderNodeTexNoise")
    n3.inputs["Scale"].default_value = 60
    nt.links.new(n3.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    _cache[name] = m
    return m


def carbon(name="Carbon"):
    """Carbon-fibre weave: woven checker modulating colour and anisotropic highlights, under clear coat."""
    if name in _cache:
        return _cache[name]
    m = _new(name)
    nt = m.node_tree
    b = _bsdf(m)
    coord = nt.nodes.new("ShaderNodeTexCoord")
    mapping = nt.nodes.new("ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (120, 120, 120)
    nt.links.new(coord.outputs["Object"], mapping.inputs["Vector"])
    chk = nt.nodes.new("ShaderNodeTexChecker")
    chk.inputs["Color1"].default_value = (0.010, 0.011, 0.013, 1)
    chk.inputs["Color2"].default_value = (0.035, 0.037, 0.042, 1)
    nt.links.new(mapping.outputs["Vector"], chk.inputs["Vector"])
    nt.links.new(chk.outputs["Color"], b.inputs["Base Color"])
    b.inputs["Metallic"].default_value = 0.3
    b.inputs["Roughness"].default_value = 0.3
    b.inputs["Anisotropic"].default_value = 0.7
    b.inputs["Coat Weight"].default_value = 1.0
    b.inputs["Coat Roughness"].default_value = 0.03
    _cache[name] = m
    return m


def fabric(name="Fabric", color=(0.012, 0.013, 0.016), sheen=1.0, print_path=None):
    """Cotton fleece: rough base with sheen for soft rim highlights; optional printed graphic."""
    key = (name, print_path)
    if key in _cache:
        return _cache[key]
    m = _new(name)
    nt = m.node_tree
    b = _bsdf(m)
    b.inputs["Roughness"].default_value = 0.85
    b.inputs["Sheen Weight"].default_value = sheen
    b.inputs["Sheen Roughness"].default_value = 0.35
    b.inputs["Sheen Tint"].default_value = (0.6, 0.7, 0.9, 1)
    base = (*color, 1)
    if print_path:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image_tex(print_path)
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        sock(mix, "A_Color").default_value = base
        nt.links.new(tex.outputs["Color"], sock(mix, "B_Color"))
        nt.links.new(tex.outputs["Alpha"], sock(mix, "Factor_Float"))
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
    else:
        b.inputs["Base Color"].default_value = base
    bump = nt.nodes.new("ShaderNodeBump")
    bump.inputs["Strength"].default_value = 0.15
    n = nt.nodes.new("ShaderNodeTexNoise")
    n.inputs["Scale"].default_value = 400
    nt.links.new(n.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    _cache[key] = m
    return m


def pcb(name="PCB", silk_path=None, mask=(0.008, 0.010, 0.012)):
    """Matte-black solder mask with optional silkscreen/copper texture (RGBA: white silk, alpha mask)."""
    key = (name, silk_path)
    if key in _cache:
        return _cache[key]
    m = _new(name)
    nt = m.node_tree
    b = _bsdf(m)
    b.inputs["Roughness"].default_value = 0.42
    b.inputs["Coat Weight"].default_value = 0.4
    b.inputs["Coat Roughness"].default_value = 0.25
    if silk_path:
        tex = nt.nodes.new("ShaderNodeTexImage")
        tex.image = image_tex(silk_path)
        tex.interpolation = "Cubic"
        mix = nt.nodes.new("ShaderNodeMix")
        mix.data_type = "RGBA"
        sock(mix, "A_Color").default_value = (*mask, 1)
        nt.links.new(tex.outputs["Color"], sock(mix, "B_Color"))
        nt.links.new(tex.outputs["Alpha"], sock(mix, "Factor_Float"))
        nt.links.new(mix.outputs[2], b.inputs["Base Color"])
        bump = nt.nodes.new("ShaderNodeBump")
        bump.inputs["Strength"].default_value = 0.3
        bump.inputs["Distance"].default_value = 0.0003
        nt.links.new(tex.outputs["Alpha"], bump.inputs["Height"])
        nt.links.new(bump.outputs["Normal"], b.inputs["Normal"])
    else:
        b.inputs["Base Color"].default_value = (*mask, 1)
    _cache[key] = m
    return m


# ─── Palette ──────────────────────────────────────────────────────────────────

BLUE = (0.10, 0.36, 1.0)
CYAN = (0.18, 0.86, 1.0)
WHITE_HOT = (0.85, 0.92, 1.0)


def library():
    """Named materials shared by all scenes."""
    return {
        "armor": panel_lines(principled("Armor", (0.012, 0.013, 0.016), metallic=0.85, roughness=0.22, coat=0.6, coat_rough=0.06, breakup=0.07, scratches=True), 9.0, 0.03),
        "armor_satin": panel_lines(principled("ArmorSatin", (0.02, 0.022, 0.026), metallic=0.8, roughness=0.38, coat=0.25, breakup=0.08), 12.0, 0.03),
        "gunmetal": principled("Gunmetal", (0.11, 0.115, 0.125), metallic=1.0, roughness=0.32, breakup=0.08),
        "mech": principled("MechDark", (0.035, 0.037, 0.04), metallic=0.9, roughness=0.42, breakup=0.1),
        "chrome": principled("Chrome", (0.93, 0.94, 0.96), metallic=1.0, roughness=0.06, breakup=0.03),
        "aluminium": principled("Aluminium", (0.78, 0.79, 0.81), metallic=1.0, roughness=0.26, breakup=0.06, aniso=0.5),
        "anodized_blue": principled("AnodizedBlue", (0.04, 0.12, 0.45), metallic=1.0, roughness=0.3, breakup=0.05),
        "black_plastic": principled("BlackPlastic", (0.014, 0.015, 0.017), roughness=0.45, breakup=0.08),
        "white_plastic": principled("WhitePlastic", (0.78, 0.8, 0.83), roughness=0.38, coat=0.3),
        "rubber": principled("Rubber", (0.012, 0.012, 0.013), roughness=0.78, breakup=0.06),
        "gold": principled("Gold", (1.0, 0.77, 0.34), metallic=1.0, roughness=0.18),
        "copper": principled("Copper", (0.95, 0.64, 0.54), metallic=1.0, roughness=0.25),
        "tin": principled("Tin", (0.82, 0.83, 0.85), metallic=1.0, roughness=0.2),
        "chip": principled("ChipBody", (0.02, 0.021, 0.024), roughness=0.55),
        "glass": principled("Glass", (1, 1, 1), roughness=0.02, spec=0.5),
        "visor": principled("Visor", (0.0, 0.0, 0.0), metallic=0.0, roughness=0.03, coat=1.0, coat_rough=0.01),
        "cable": principled("Cable", (0.015, 0.016, 0.018), roughness=0.55, sheen=0.3),
        "cable_blue": principled("CableBlue", (0.02, 0.12, 0.6), roughness=0.5),
        "cable_red": principled("CableRed", (0.5, 0.03, 0.02), roughness=0.5),
        "carbon": carbon(),
        "concrete": concrete(),
        "glow_blue": emission("GlowBlue", BLUE, 14),
        "glow_cyan": emission("GlowCyan", CYAN, 16),
        "glow_white": emission("GlowWhite", WHITE_HOT, 18),
        "led_strip": emission("LedStrip", (0.55, 0.75, 1.0), 12),
        "panel_light": emission("PanelLight", (0.9, 0.94, 1.0), 1.4),
        "fabric": fabric(),
        "wood": principled("WoodDark", (0.05, 0.035, 0.025), roughness=0.55, breakup=0.1),
    }
