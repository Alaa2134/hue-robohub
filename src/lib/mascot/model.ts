/**
 * The BuildX HUE mascot, built from three.js primitives: a soft cream body and head (fur is added at
 * runtime, see components/mascot/fur.ts), a smooth face plate with black oval eyes, a small smile and
 * blush, black over-ear headphones with the BuildX X on one cup, short arms with a wrist device, and
 * little feet, eyebrows that show his mood, a small nose and the BuildX X on his chest. Hidden
 * extras for some sections (robotics goggles, a tiny drone companion) and his outfits for the time
 * and the occasion (a nightcap, a scarf, sunglasses, a party hat, a Ramadan lantern, a tea cup, a
 * book). The runtime shows them; the names are in NODES / OUTFITS.
 *
 * scripts/build-mascot.ts exports this (with the clips from ./clips) to public/mascot/buildx-mascot.glb.
 * A hand-made model can replace that file as long as it keeps the node and clip names below.
 *
 * Units: about 1.1 tall, feet on y = 0, facing +z (the camera).
 */
import * as THREE from "three";

export const NODES = {
  root: "Mascot",
  hips: "Hips",
  head: "Head",
  look: "HeadLook",
  eyeL: "EyeL",
  eyeR: "EyeR",
  armL: "ArmL",
  armR: "ArmR",
  legL: "LegL",
  legR: "LegR",
  goggles: "Goggles",
  drone: "Drone",
  browL: "BrowL",
  browR: "BrowR",
  mouth: "Mouth",
  headphones: "Headphones",
} as const;

/** Outfit and hand-prop nodes (hidden in the file; the guide shows them by time and occasion). */
export const OUTFITS = ["Nightcap", "Scarf", "Sunglasses", "PartyHat", "Lantern", "TeaCup", "Book"] as const;
export type Outfit = (typeof OUTFITS)[number];

export const COLORS = {
  fur: "#e4cdab",
  furTip: "#f6e7d1",
  face: "#efc9ad",
  eye: "#0a0a0f",
  mouth: "#3a2219",
  blush: "#f59a9a",
  plastic: "#14151b",
  cushion: "#1d1e25",
  metal: "#9aa1ad",
  brand: "#2f7bff",
};

const std = (name: string, color: string, o: Partial<THREE.MeshPhysicalMaterialParameters> = {}) => new THREE.MeshPhysicalMaterial({ name, color, roughness: 0.6, metalness: 0, ...o });

function mesh(name: string, geometry: THREE.BufferGeometry, material: THREE.Material, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0], scale: [number, number, number] = [1, 1, 1]) {
  const m = new THREE.Mesh(geometry, material);
  m.name = name;
  m.position.set(...pos);
  m.rotation.set(...rot);
  m.scale.set(...scale);
  return m;
}

function group(name: string, pos: [number, number, number] = [0, 0, 0], rot: [number, number, number] = [0, 0, 0]) {
  const g = new THREE.Group();
  g.name = name;
  g.position.set(...pos);
  g.rotation.set(...rot);
  return g;
}

/**
 * Fur mask in the vertex colour (red channel): 1 grows fur, 0 stays bald. The head keeps its face
 * clear so the smooth face plate shows through, like the reference.
 */
function furMask(geometry: THREE.BufferGeometry, bald?: (n: THREE.Vector3, p: THREE.Vector3) => number) {
  const pos = geometry.attributes.position;
  const nor = geometry.attributes.normal;
  const colors = new Float32Array(pos.count * 3);
  const n = new THREE.Vector3();
  const p = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    n.fromBufferAttribute(nor, i);
    p.fromBufferAttribute(pos, i);
    const m = bald ? 1 - bald(n, p) : 1;
    colors[i * 3] = m;
    colors[i * 3 + 1] = m;
    colors[i * 3 + 2] = m;
  }
  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return geometry;
}

const smooth = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)));
  return t * t * (3 - 2 * t);
};

export function buildMascot(): THREE.Group {
  const fur = std("Fur", COLORS.fur, { roughness: 0.95, sheen: 1, sheenColor: new THREE.Color(COLORS.furTip), sheenRoughness: 0.55 });
  const face = std("Face", COLORS.face, { roughness: 0.5, sheen: 0.4, sheenColor: new THREE.Color("#ffe9dc"), sheenRoughness: 0.4 });
  const eye = std("Eye", COLORS.eye, { roughness: 0.08, clearcoat: 1, clearcoatRoughness: 0.05 });
  const shine = new THREE.MeshBasicMaterial({ name: "EyeShine", color: "#ffffff" });
  const mouth = std("Mouth", COLORS.mouth, { roughness: 0.6 });
  const blush = std("Blush", COLORS.blush, { roughness: 0.9, transparent: true, opacity: 0.55, depthWrite: false });
  const plastic = std("Plastic", COLORS.plastic, { roughness: 0.38, clearcoat: 0.6, clearcoatRoughness: 0.3 });
  const cushion = std("Cushion", COLORS.cushion, { roughness: 0.92 });
  const metal = std("Metal", COLORS.metal, { metalness: 0.85, roughness: 0.28 });
  const brand = std("Brand", COLORS.brand, { roughness: 0.3, emissive: new THREE.Color(COLORS.brand), emissiveIntensity: 0.45 });
  const screen = std("Screen", "#7fc4ff", { roughness: 0.2, emissive: new THREE.Color("#4aa8ff"), emissiveIntensity: 0.9 });
  const lens = std("Lens", "#59b6ff", { roughness: 0.05, metalness: 0.3, transparent: true, opacity: 0.72, emissive: new THREE.Color("#1b6dff"), emissiveIntensity: 0.25 });
  const white = std("DroneShell", "#f4f6fb", { roughness: 0.35, clearcoat: 0.8 });

  const root = group(NODES.root);
  const hips = group(NODES.hips);
  root.add(hips);

  // ── Body: a soft pear-shaped blob (lathe), fur all over ──
  const profile = new THREE.SplineCurve(
    [
      [0.0, 0.035],
      [0.2, 0.04],
      [0.31, 0.075],
      [0.375, 0.15],
      [0.398, 0.26],
      [0.39, 0.37],
      [0.37, 0.47],
      [0.345, 0.56],
      [0.3, 0.64],
      [0.18, 0.7],
      [0.0, 0.72],
    ].map(([x, y]) => new THREE.Vector2(x, y)),
  ).getPoints(40);
  profile[0].x = 0;
  profile[profile.length - 1].x = 0;
  const body = new THREE.LatheGeometry(profile, 56);
  body.computeVertexNormals();
  // The chest stays bald where the BuildX badge sits, so the fur doesn't grow through it.
  hips.add(mesh("BodyFur", furMask(body, (n, p) => (1 - smooth(0.075, 0.1, Math.hypot(p.x, p.y - 0.42))) * smooth(0.3, 0.6, n.z)), fur));
  // BuildX badge on the chest: a blue disc with a white X.
  const badge = group("ChestBadge", [0, 0.42, 0.376], [-0.08, 0, 0]);
  hips.add(badge);
  badge.add(mesh("BadgeDisc", new THREE.CylinderGeometry(0.068, 0.068, 0.014, 40), brand, [0, 0, 0], [Math.PI / 2, 0, 0]));
  badge.add(mesh("BadgeRing", new THREE.TorusGeometry(0.068, 0.007, 10, 40), metal));
  const xBar = new THREE.BoxGeometry(0.014, 0.085, 0.008);
  const xWhite = new THREE.MeshBasicMaterial({ name: "BadgeX", color: "#ffffff" });
  badge.add(mesh("BadgeXA", xBar, xWhite, [0, 0, 0.009], [0, 0, 0.72]));
  badge.add(mesh("BadgeXB", xBar, xWhite, [0, 0, 0.009], [0, 0, -0.72]));

  // ── Head (turns as one piece: fur, face, headphones) ──
  const head = group(NODES.head, [0, 0.7, 0]);
  hips.add(head);
  const look = group(NODES.look, [0, 0.08, 0]);
  head.add(look);

  const faceDir = new THREE.Vector3(0, 0.12, 1).normalize();
  const headGeo = new THREE.SphereGeometry(0.37, 64, 48);
  headGeo.scale(1, 0.93, 0.95);
  furMask(headGeo, (n) => smooth(0.66, 0.8, n.dot(faceDir)));
  look.add(mesh("HeadFur", headGeo, fur));

  const faceGeo = new THREE.SphereGeometry(0.26, 48, 32);
  const FACE = { c: [0, 0.05, 0.27], r: [0.26, 0.26 * 0.84, 0.26 * 0.42] } as const;
  look.add(mesh("FacePlate", faceGeo, face, [...FACE.c], [0, 0, 0], [FACE.r[0] / 0.26, FACE.r[1] / 0.26, FACE.r[2] / 0.26]));
  /** z of the face plate's surface at (x, y), plus `lift`: features sit on the plate, not inside it. */
  const onFace = (x: number, y: number, lift = 0) => FACE.c[2] + FACE.r[2] * Math.sqrt(Math.max(0, 1 - (x / FACE.r[0]) ** 2 - ((y - FACE.c[1]) / FACE.r[1]) ** 2)) + lift;

  // Eyes (glossy black ovals with a catchlight).
  const eyeGeo = new THREE.SphereGeometry(0.04, 32, 24);
  const shineGeo = new THREE.SphereGeometry(0.0105, 12, 8);
  for (const [name, x] of [
    [NODES.eyeL, -0.09],
    [NODES.eyeR, 0.09],
  ] as const) {
    const e = mesh(name, eyeGeo, eye, [x, 0.09, onFace(x, 0.09, -0.006)], [0, x * 1.4, 0], [0.8, 1.2, 0.5]);
    e.add(mesh(`${name}Shine`, shineGeo, shine, [0.013, 0.016, 0.034], [0, 0, 0], [1.2, 0.85, 1]));
    look.add(e);
  }

  // Small smile.
  const smile = new THREE.QuadraticBezierCurve3(new THREE.Vector3(-0.036, 0.012, onFace(-0.036, 0.012, 0.002)), new THREE.Vector3(0, -0.024, onFace(0, -0.006, 0.004)), new THREE.Vector3(0.036, 0.012, onFace(0.036, 0.012, 0.002)));
  // The mouth's pivot sits at its middle, so the runtime can open it (talking) or turn it down (sad).
  const mouthGeo = new THREE.TubeGeometry(smile, 24, 0.0068, 8, false);
  mouthGeo.computeBoundingBox();
  const mouthAt = mouthGeo.boundingBox!.getCenter(new THREE.Vector3());
  mouthGeo.translate(-mouthAt.x, -mouthAt.y, -mouthAt.z);
  look.add(mesh(NODES.mouth, mouthGeo, mouth, [mouthAt.x, mouthAt.y, mouthAt.z]));

  // Eyebrows: short soft strokes; the runtime tilts and lifts them for his mood.
  const browGeo = new THREE.CapsuleGeometry(0.0085, 0.046, 4, 10);
  browGeo.rotateZ(Math.PI / 2);
  for (const [name, x] of [
    [NODES.browL, -0.092],
    [NODES.browR, 0.092],
  ] as const)
    look.add(mesh(name, browGeo, mouth, [x, 0.158, onFace(x, 0.158, 0.003)], [-0.25, x * 1.6, 0]));

  // A small nose.
  look.add(mesh("Nose", new THREE.SphereGeometry(0.014, 16, 12), std("Nose", "#d98f7a", { roughness: 0.45 }), [0, 0.048, onFace(0, 0.048, 0.006)], [0, 0, 0], [1.35, 0.9, 0.8]));

  // Blush.
  const blushGeo = new THREE.SphereGeometry(0.042, 24, 16);
  look.add(mesh("BlushL", blushGeo, blush, [-0.158, 0.012, onFace(0.158, 0.012, -0.004)], [0, -0.42, 0], [1, 0.62, 0.22]));
  look.add(mesh("BlushR", blushGeo, blush, [0.158, 0.012, onFace(0.158, 0.012, -0.004)], [0, 0.42, 0], [1, 0.62, 0.22]));

  // ── Headphones ──
  const phones = group(NODES.headphones);
  look.add(phones);
  const band = new THREE.TorusGeometry(0.39, 0.03, 16, 64, Math.PI);
  phones.add(mesh("Band", band, plastic, [0, 0.045, 0]));
  phones.add(mesh("BandPad", new THREE.TorusGeometry(0.372, 0.022, 12, 48, Math.PI * 0.6), cushion, [0, 0.045, 0], [0, 0, Math.PI * 0.2]));
  for (const side of [-1, 1]) {
    const cup = group(side < 0 ? "CupL" : "CupR", [side * 0.382, 0.05, 0.0]);
    phones.add(cup);
    cup.add(mesh("Cup", new THREE.CylinderGeometry(0.13, 0.125, 0.09, 40), plastic, [side * 0.02, 0, 0], [0, 0, Math.PI / 2]));
    cup.add(mesh("Cap", new THREE.CylinderGeometry(0.1, 0.108, 0.02, 40), plastic, [side * 0.072, 0, 0], [0, 0, Math.PI / 2]));
    cup.add(mesh("Cushion", new THREE.TorusGeometry(0.1, 0.036, 16, 40), cushion, [side * -0.03, 0, 0], [0, Math.PI / 2, 0]));
    // A thin BuildX-blue ring around each cap.
    cup.add(mesh("CapRing", new THREE.TorusGeometry(0.104, 0.006, 8, 48), brand, [side * 0.083, 0, 0], [0, Math.PI / 2, 0]));
    cup.add(mesh("Slider", new THREE.CylinderGeometry(0.012, 0.012, 0.11, 12), metal, [side * 0.01, 0.12, 0]));
    if (side > 0) {
      // BuildX X on the right cup.
      const bar = new THREE.BoxGeometry(0.008, 0.11, 0.022);
      cup.add(mesh("LogoA", bar, brand, [0.084, 0, 0], [0.72, 0, 0]));
      cup.add(mesh("LogoB", bar, brand, [0.084, 0, 0], [-0.72, 0, 0]));
    }
  }

  // ── Robotics goggles (pushed up on the forehead, hidden unless a scene shows them) ──
  const goggles = group(NODES.goggles);
  goggles.visible = false;
  look.add(goggles);
  goggles.add(mesh("Strap", new THREE.TorusGeometry(0.372, 0.016, 10, 64), plastic, [0, 0.18, 0], [Math.PI / 2 - 0.25, 0, 0]));
  for (const side of [-1, 1]) {
    goggles.add(mesh("Rim", new THREE.TorusGeometry(0.056, 0.016, 12, 32), metal, [side * 0.075, 0.25, 0.27], [-0.62, 0, 0]));
    goggles.add(mesh("Lens", new THREE.CylinderGeometry(0.052, 0.052, 0.02, 32), lens, [side * 0.075, 0.25, 0.27], [Math.PI / 2 - 0.62, 0, 0]));
  }

  // ── Arms (pivot at the shoulder, hanging down) ──
  for (const [name, side] of [
    [NODES.armL, -1],
    [NODES.armR, 1],
  ] as const) {
    const arm = group(name, [side * 0.33, 0.47, 0.06], [0, 0, side * 0.18]);
    hips.add(arm);
    const armGeo = new THREE.CapsuleGeometry(0.074, 0.15, 8, 24);
    armGeo.translate(0, -0.125, 0);
    // The right wrist stays bald under the device so the fur doesn't grow through the band.
    arm.add(mesh(`${name}Fur`, furMask(armGeo, side > 0 ? (_, p) => 1 - smooth(0.03, 0.045, Math.abs(p.y + 0.175)) : undefined), fur));
    if (side > 0) {
      // Wrist device.
      // Wrist device: a dark band with a small glowing screen framed in BuildX blue.
      arm.add(mesh("Wristband", new THREE.CylinderGeometry(0.082, 0.082, 0.056, 32), plastic, [0, -0.175, 0]));
      arm.add(mesh("WristBezel", new THREE.CylinderGeometry(0.036, 0.036, 0.014, 32), brand, [0, -0.175, 0.083], [Math.PI / 2, 0, 0], [1.2, 1, 0.85]));
      arm.add(mesh("WristScreen", new THREE.CylinderGeometry(0.03, 0.03, 0.006, 32), screen, [0, -0.175, 0.091], [Math.PI / 2, 0, 0], [1.2, 1, 0.85]));
    }
  }

  // ── Feet ──
  for (const [name, side] of [
    [NODES.legL, -1],
    [NODES.legR, 1],
  ] as const) {
    const leg = group(name, [side * 0.15, 0.13, 0.03]);
    root.add(leg);
    const footGeo = new THREE.SphereGeometry(0.1, 32, 20);
    footGeo.scale(1, 0.62, 1.3);
    footGeo.translate(0, -0.075, 0.035);
    leg.add(mesh(`${name}Fur`, furMask(footGeo), fur));
  }

  // ── Drone companion (hidden unless a scene shows it) ──
  const drone = group(NODES.drone, [0.55, 0.98, 0.15]);
  drone.visible = false;
  root.add(drone);
  drone.add(mesh("DroneBody", new THREE.SphereGeometry(0.055, 24, 16), white, [0, 0, 0], [0, 0, 0], [1, 0.7, 1]));
  drone.add(mesh("DroneRing", new THREE.TorusGeometry(0.085, 0.009, 8, 32), plastic, [0, 0, 0], [Math.PI / 2, 0, 0]));
  drone.add(mesh("DroneEye", new THREE.SphereGeometry(0.016, 12, 8), screen, [0, 0, 0.048]));
  for (const [x, z] of [
    [0.085, 0],
    [-0.085, 0],
    [0, 0.085],
    [0, -0.085],
  ])
    drone.add(mesh("Rotor", new THREE.CylinderGeometry(0.03, 0.03, 0.004, 16), metal, [x, 0.022, z]));

  // ── Outfits (all hidden; the guide picks them by time and occasion) ──
  const fabric = (n: string, c: string) => std(n, c, { roughness: 0.9, sheen: 0.6, sheenColor: new THREE.Color("#ffffff"), sheenRoughness: 0.8 });
  const capBlue = fabric("CapBlue", "#2f6bf0");
  const capWhite = fabric("CapWhite", "#f4f6fb");
  const gold = std("Gold", "#d9a531", { metalness: 0.9, roughness: 0.3 });
  const glow = std("LanternGlow", "#ffd36a", { emissive: new THREE.Color("#ffb02e"), emissiveIntensity: 1.4, roughness: 0.4, transparent: true, opacity: 0.92 });
  const hide = (g: THREE.Object3D) => ((g.visible = false), g);

  // Nightcap (replaces the headphones at night): a floppy cone with a pompom.
  const night = hide(group("Nightcap", [0, 0.27, -0.01], [0, 0, -0.12]));
  look.add(night);
  night.add(mesh("NightcapBrim", new THREE.TorusGeometry(0.315, 0.05, 14, 48), capWhite, [0, 0, 0], [Math.PI / 2, 0, 0]));
  const coneGeo = new THREE.ConeGeometry(0.31, 0.5, 40, 6, true);
  coneGeo.translate(0, 0.25, 0);
  const pos = coneGeo.attributes.position;
  for (let i = 0; i < pos.count; i++) {
    // Droop the tip to one side.
    const y = pos.getY(i);
    pos.setX(i, pos.getX(i) + 0.42 * (y / 0.5) ** 2);
    pos.setY(i, y * (1 - 0.28 * (y / 0.5) ** 2));
  }
  coneGeo.computeVertexNormals();
  night.add(mesh("NightcapCone", coneGeo, capBlue));
  night.add(mesh("NightcapPom", new THREE.SphereGeometry(0.06, 20, 14), capWhite, [0.42, 0.36, 0]));

  // Winter scarf: BuildX blue with a white stripe, one end hanging in front.
  // It sits outside the fur (body radius + fur length), or the shells would swallow it.
  const scarf = hide(group("Scarf", [0, 0.6, 0]));
  hips.add(scarf);
  scarf.add(mesh("ScarfWrap", new THREE.TorusGeometry(0.335, 0.075, 16, 56), capBlue, [0, 0, 0], [Math.PI / 2, 0, 0]));
  scarf.add(mesh("ScarfStripe", new THREE.TorusGeometry(0.398, 0.02, 8, 56), capWhite, [0, 0, 0], [Math.PI / 2, 0, 0]));
  scarf.add(mesh("ScarfEnd", new THREE.BoxGeometry(0.12, 0.26, 0.045), capBlue, [-0.14, -0.15, 0.39], [-0.18, 0, 0.16]));
  scarf.add(mesh("ScarfFringe", new THREE.BoxGeometry(0.12, 0.035, 0.047), capWhite, [-0.12, -0.27, 0.41], [-0.18, 0, 0.16]));

  // Sunglasses (Fridays).
  const shades = hide(group("Sunglasses"));
  look.add(shades);
  // Not too glossy: a flat mirror would reflect the studio light and read as white.
  const shadeLens = std("ShadeLens", "#0d111a", { roughness: 0.42, specularIntensity: 0.4 });
  for (const x of [-0.09, 0.09]) {
    shades.add(mesh("ShadeLens", new THREE.CylinderGeometry(0.064, 0.058, 0.016, 32), shadeLens, [x, 0.095, onFace(x, 0.095, 0.03)], [Math.PI / 2, x * 1.2, 0], [1.15, 1, 0.92]));
    shades.add(mesh("ShadeRim", new THREE.TorusGeometry(0.064, 0.008, 8, 32), plastic, [x, 0.095, onFace(x, 0.095, 0.038)], [0, x * 1.2, 0], [1.15, 0.92, 1]));
    shades.add(mesh("ShadeArm", new THREE.BoxGeometry(0.2, 0.012, 0.012), plastic, [x * 2.3, 0.1, onFace(x, 0.1, -0.06)], [0, -x * 7.5, 0]));
  }
  shades.add(mesh("ShadeBridge", new THREE.BoxGeometry(0.06, 0.012, 0.012), plastic, [0, 0.11, onFace(0, 0.11, 0.034)]));

  // Party hat (Eid and celebrations): a striped cone with a pompom, worn at an angle.
  const party = hide(group("PartyHat", [-0.16, 0.4, 0.06], [0.1, 0, 0.42]));
  look.add(party);
  party.add(mesh("PartyCone", new THREE.ConeGeometry(0.1, 0.26, 32), std("PartyPink", "#ff5fa2", { roughness: 0.5 }), [0, 0.13, 0]));
  for (const y of [0.06, 0.13]) party.add(mesh("PartyStripe", new THREE.TorusGeometry(0.1 - y * 0.38, 0.011, 8, 32), std("PartyYellow", "#ffd84a", { roughness: 0.5 }), [0, y, 0], [Math.PI / 2, 0, 0]));
  party.add(mesh("PartyPom", new THREE.SphereGeometry(0.035, 16, 12), std("PartyYellow", "#ffd84a", { roughness: 0.6 }), [0, 0.27, 0]));

  // Hand props hang from the hands (the end of each arm).
  const armL = hips.getObjectByName(NODES.armL)!;
  const armR = hips.getObjectByName(NODES.armR)!;

  // Ramadan lantern (fanoos) in the left hand, glowing.
  const lantern = hide(group("Lantern", [0, -0.32, 0.07]));
  lantern.scale.setScalar(1.4);
  armL.add(lantern);
  lantern.add(mesh("LanternHandle", new THREE.TorusGeometry(0.026, 0.006, 8, 20, Math.PI), gold, [0, 0.03, 0]));
  lantern.add(mesh("LanternCap", new THREE.ConeGeometry(0.06, 0.05, 6), gold, [0, 0.005, 0]));
  lantern.add(mesh("LanternGlass", new THREE.CylinderGeometry(0.05, 0.04, 0.1, 6), glow, [0, -0.07, 0]));
  lantern.add(mesh("LanternFrame", new THREE.CylinderGeometry(0.053, 0.043, 0.1, 6, 1, true), std("GoldFrame", "#d9a531", { metalness: 0.9, roughness: 0.3, wireframe: true }), [0, -0.07, 0]));
  lantern.add(mesh("LanternBase", new THREE.CylinderGeometry(0.03, 0.045, 0.025, 6), gold, [0, -0.13, 0]));

  // Morning tea cup in the right hand.
  const cup = hide(group("TeaCup", [0, -0.28, 0.09]));
  cup.scale.setScalar(1.6);
  armR.add(cup);
  cup.add(mesh("CupBody", new THREE.CylinderGeometry(0.042, 0.034, 0.07, 28), capWhite));
  cup.add(mesh("CupBand", new THREE.CylinderGeometry(0.0425, 0.04, 0.016, 28), brand, [0, 0.008, 0]));
  cup.add(mesh("CupTea", new THREE.CylinderGeometry(0.037, 0.037, 0.004, 24), std("Tea", "#8a4b1e", { roughness: 0.2 }), [0, 0.03, 0]));
  cup.add(mesh("CupHandle", new THREE.TorusGeometry(0.02, 0.006, 8, 16), capWhite, [0.046, 0, 0], [0, 0, Math.PI / 2]));

  // A book in the left hand (reading), BuildX blue with the X on the cover.
  const book = hide(group("Book", [0.06, -0.27, 0.08], [-0.5, 0, 0]));
  armL.add(book);
  book.add(mesh("BookCover", new THREE.BoxGeometry(0.15, 0.2, 0.03), capBlue));
  book.add(mesh("BookPages", new THREE.BoxGeometry(0.14, 0.19, 0.031), capWhite, [0.004, 0, 0]));
  book.add(mesh("BookXA", new THREE.BoxGeometry(0.012, 0.08, 0.004), xWhite, [0, 0.02, -0.017], [0, 0, 0.7]));
  book.add(mesh("BookXB", new THREE.BoxGeometry(0.012, 0.08, 0.004), xWhite, [0, 0.02, -0.017], [0, 0, -0.7]));

  return root;
}
