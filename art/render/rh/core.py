"""Scene setup, render settings, cameras, lights, world and compositing."""
import math
import os
import bpy
from mathutils import Vector

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, "out")
TEX = os.path.join(ROOT, "textures", "out")
BRAND = os.path.join(os.path.dirname(os.path.dirname(ROOT)), "public", "brand")


def reset():
    bpy.ops.wm.read_factory_settings(use_empty=True)
    sc = bpy.context.scene
    sc.unit_settings.system = "METRIC"
    return sc


def render_settings(quality="preview", res=(1920, 1080), samples=None, exposure=0.0, look="AgX - Medium High Contrast"):
    sc = bpy.context.scene
    sc.render.engine = "CYCLES"
    c = sc.cycles
    c.device = "CPU"
    c.use_adaptive_sampling = True
    c.adaptive_threshold = 0.025 if quality == "final" else 0.06
    c.samples = samples or (96 if quality == "final" else 24)
    c.use_denoising = True
    c.denoiser = "OPENIMAGEDENOISE"
    c.denoising_input_passes = "RGB_ALBEDO_NORMAL"
    c.denoising_prefilter = "ACCURATE"
    c.max_bounces = 8
    c.diffuse_bounces = 3
    c.glossy_bounces = 4
    c.transmission_bounces = 6
    c.volume_bounces = 0
    c.transparent_max_bounces = 8
    c.sample_clamp_indirect = 6.0
    c.blur_glossy = 0.6
    c.caustics_reflective = False
    c.caustics_refractive = False
    c.volume_step_rate = 4.0 if quality == "final" else 8.0
    c.use_light_tree = True
    sc.render.resolution_x, sc.render.resolution_y = res
    sc.render.resolution_percentage = 100 if quality == "final" else 33
    sc.render.film_transparent = False
    sc.render.image_settings.file_format = "PNG"
    sc.render.image_settings.color_depth = "16" if quality == "final" else "8"
    sc.render.image_settings.compression = 30
    sc.view_settings.view_transform = "AgX"
    try:
        sc.view_settings.look = look
    except TypeError:
        sc.view_settings.look = "None"
    sc.view_settings.exposure = exposure
    sc.render.use_persistent_data = True
    return sc


def world(color=(0.0015, 0.002, 0.0035), strength=1.0, haze=0.0, haze_color=(0.55, 0.65, 0.85), anisotropy=0.35):
    sc = bpy.context.scene
    w = bpy.data.worlds.new("World")
    sc.world = w
    w.use_nodes = True
    nt = w.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputWorld")
    bg = nt.nodes.new("ShaderNodeBackground")
    bg.inputs["Color"].default_value = (*color, 1)
    bg.inputs["Strength"].default_value = strength
    nt.links.new(bg.outputs[0], out.inputs["Surface"])
    if haze > 0:
        vol = nt.nodes.new("ShaderNodeVolumePrincipled")
        vol.inputs["Color"].default_value = (*haze_color, 1)
        vol.inputs["Density"].default_value = haze
        vol.inputs["Anisotropy"].default_value = anisotropy
        nt.links.new(vol.outputs[0], out.inputs["Volume"])
    return w


def haze_box(center=(0, 0, 2), size=(20, 20, 6), density=0.02, color=(0.6, 0.7, 0.9), anisotropy=0.4, noise=True):
    """Bounded volumetric haze — cheaper than a world volume and allows breakup with noise."""
    import bmesh
    me = bpy.data.meshes.new("Haze")
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Haze", me)
    bpy.context.collection.objects.link(ob)
    ob.location = center
    ob.scale = size
    m = bpy.data.materials.new("HazeMat")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (*color, 1)
    vol.inputs["Anisotropy"].default_value = anisotropy
    if noise:
        tex = nt.nodes.new("ShaderNodeTexNoise")
        tex.inputs["Scale"].default_value = 0.35
        tex.inputs["Detail"].default_value = 3
        rng = nt.nodes.new("ShaderNodeMapRange")
        rng.inputs["From Min"].default_value = 0.3
        rng.inputs["From Max"].default_value = 0.75
        rng.inputs["To Min"].default_value = density * 0.25
        rng.inputs["To Max"].default_value = density * 1.6
        nt.links.new(tex.outputs["Fac"], rng.inputs["Value"])
        nt.links.new(rng.outputs["Result"], vol.inputs["Density"])
    else:
        vol.inputs["Density"].default_value = density
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    ob.data.materials.append(m)
    ob.visible_shadow = False
    return ob


def camera(loc, look_at, lens=50, fstop=2.8, focus=None, sensor=36, ratio=1.0, blades=7, name="Camera", shift=(0, 0)):
    cam = bpy.data.cameras.new(name)
    cam.lens = lens
    cam.sensor_width = sensor
    cam.shift_x, cam.shift_y = shift
    ob = bpy.data.objects.new(name, cam)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    aim(ob, look_at)
    cam.dof.use_dof = fstop is not None
    if fstop:
        cam.dof.aperture_fstop = fstop
        cam.dof.aperture_blades = blades
        cam.dof.aperture_ratio = ratio
        cam.dof.focus_distance = focus if focus else (Vector(look_at) - Vector(loc)).length
    cam.clip_start = 0.01
    cam.clip_end = 400
    bpy.context.scene.camera = ob
    return ob


def aim(ob, target, roll=0.0):
    d = Vector(target) - ob.location
    ob.rotation_euler = d.to_track_quat("-Z", "Y").to_euler()
    if roll:
        ob.rotation_euler.rotate_axis("Z", math.radians(roll))


def area_light(loc, target, energy=500, size=(1, 1), color=(1, 1, 1), spread=180, name="Area", visible=False):
    L = bpy.data.lights.new(name, "AREA")
    L.shape = "RECTANGLE"
    L.size, L.size_y = size
    L.energy = energy
    L.color = color
    L.spread = math.radians(spread)
    ob = bpy.data.objects.new(name, L)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    aim(ob, target)
    ob.visible_camera = visible
    ob.visible_glossy = True
    return ob


def spot_light(loc, target, energy=1000, angle=30, blend=0.4, color=(1, 1, 1), radius=0.05, name="Spot"):
    L = bpy.data.lights.new(name, "SPOT")
    L.energy = energy
    L.spot_size = math.radians(angle)
    L.spot_blend = blend
    L.color = color
    L.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, L)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    aim(ob, target)
    return ob


def point_light(loc, energy=50, color=(1, 1, 1), radius=0.05, name="Point"):
    L = bpy.data.lights.new(name, "POINT")
    L.energy = energy
    L.color = color
    L.shadow_soft_size = radius
    ob = bpy.data.objects.new(name, L)
    bpy.context.collection.objects.link(ob)
    ob.location = loc
    return ob


def compositor(bloom=0.6, bloom_threshold=1.2, vignette=0.35, dispersion=0.012, distortion=-0.01):
    """Lens look: bloom on emissives, subtle chromatic dispersion and vignette."""
    sc = bpy.context.scene
    sc.use_nodes = True
    nt = sc.node_tree
    nt.nodes.clear()
    rl = nt.nodes.new("CompositorNodeRLayers")
    comp = nt.nodes.new("CompositorNodeComposite")
    last = rl.outputs["Image"]
    if bloom > 0:
        g = nt.nodes.new("CompositorNodeGlare")
        try:
            g.glare_type = "BLOOM"
        except TypeError:
            g.glare_type = "FOG_GLOW"
        g.quality = "HIGH"
        try:
            g.threshold = bloom_threshold
            g.mix = -1 + bloom
            g.size = 8
        except AttributeError:
            pass
        # Blender 4.5 exposes glare parameters as inputs
        for name, val in (("Threshold", bloom_threshold), ("Strength", bloom), ("Size", 0.6)):
            if name in g.inputs:
                g.inputs[name].default_value = val
        nt.links.new(last, g.inputs["Image"])
        last = g.outputs["Image"]
    if dispersion or distortion:
        ld = nt.nodes.new("CompositorNodeLensdist")
        ld.inputs["Distortion"].default_value = distortion
        ld.inputs["Dispersion"].default_value = dispersion
        if "Fit" in ld.inputs:
            ld.inputs["Fit"].default_value = True
        else:
            ld.use_fit = True
        nt.links.new(last, ld.inputs["Image"])
        last = ld.outputs["Image"]
    # Vignette and film grain are applied in post (art/render/post.mjs) for consistency across the set.
    nt.links.new(last, comp.inputs["Image"])
    return nt


def depth_pass(name, start=0.2, depth=12.0):
    """Also write a normalised depth (mist) map → out/<name>_depth.png, used for 2.5D parallax in films.
    White = near, black = far."""
    sc = bpy.context.scene
    vl = sc.view_layers[0]
    vl.use_pass_mist = True
    sc.world.mist_settings.start = start
    sc.world.mist_settings.depth = depth
    sc.world.mist_settings.falloff = "LINEAR"
    nt = sc.node_tree
    rl = next(n for n in nt.nodes if n.bl_idname == "CompositorNodeRLayers")
    inv = nt.nodes.new("CompositorNodeInvert")
    nt.links.new(rl.outputs["Mist"], inv.inputs["Color"])
    fo = nt.nodes.new("CompositorNodeOutputFile")
    fo.base_path = OUT
    fo.format.file_format = "PNG"
    fo.format.color_mode = "BW"
    fo.format.color_depth = "16"
    fo.file_slots[0].path = f"{name}_depth_"
    nt.links.new(inv.outputs["Color"], fo.inputs[0])
    return fo


def render(name, quality="preview", frame=None):
    sc = bpy.context.scene
    os.makedirs(OUT, exist_ok=True)
    suffix = "" if quality == "final" else "_preview"
    if frame is not None:
        sc.frame_set(frame)
    path = os.path.join(OUT, f"{name}{suffix}.png")
    sc.render.filepath = path
    bpy.ops.render.render(write_still=True)
    return path


def link(ob, coll=None):
    (coll or bpy.context.collection).objects.link(ob)
    return ob


def beam_volume(apex, target, angle_deg, density=0.05, color=(0.7, 0.8, 1.0), name="BeamVol"):
    """Denser haze confined to a spotlight's cone so the beam reads as a shaft of light."""
    import bmesh

    a, b = Vector(apex), Vector(target)
    d = b - a
    L = d.length
    r = math.tan(math.radians(angle_deg) / 2) * L * 1.05
    me = bpy.data.meshes.new(name)
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, cap_tris=False, segments=32, radius1=0.02, radius2=r, depth=L)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.collection.objects.link(ob)
    ob.location = a + d / 2
    ob.rotation_mode = "QUATERNION"
    ob.rotation_quaternion = Vector((0, 0, 1)).rotation_difference(d.normalized())
    m = bpy.data.materials.new(f"{name}M")
    m.use_nodes = True
    nt = m.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Color"].default_value = (*color, 1)
    vol.inputs["Density"].default_value = density
    vol.inputs["Anisotropy"].default_value = 0.6
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    me.materials.append(m)
    ob.visible_shadow = False
    return ob
