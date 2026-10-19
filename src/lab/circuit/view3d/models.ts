/**
 * 3D models of every part, built from geometry in millimetres at real-world sizes (a 5 mm LED, a
 * 68.6 × 53.3 mm Uno, 2.54 mm pin pitch). Each model is a group whose origin is the part's pin 0, laid
 * out like the 2D canvas (canvas x → +X, canvas y → +Z, up is +Y). `update` makes a model follow the
 * simulation: LED light, servo horn, motor shaft, button travel, meter displays.
 */
import * as THREE from "three";
import type { PartInstance } from "../model";
import { BB_ROWS, LED_COLORS, bbCols, breadboardPins, propsOf } from "../parts";

/** Canvas units → millimetres (10 units = 0.1 inch = 2.54 mm). */
export const U = 0.254;
export type Live = Record<string, unknown>;
export type Reading = Record<string, number> | undefined;
export type Model = {
  group: THREE.Group;
  /** Height (mm) at which wires plug into this part's pins, relative to the part's base. */
  pinTop: number;
  /** Height of the part's top surface when other parts plug into it (breadboards, boards). */
  hostTop?: number;
  update?: (r: Reading, live: Live, dt: number) => void;
  /** Named points (part-local mm) where the 2D view draws live overlays (LED glow, display text). */
  anchors?: Record<string, [number, number, number]>;
  /** Meshes that respond to a click while the simulation runs. */
  hits?: { mesh: THREE.Object3D; action: "press" | "toggle" }[];
  dispose?: () => void;
};

/* ─── Materials ────────────────────────────────────────────────────────── */

const cache = new Map<string, THREE.Material>();
function mat(key: string, make: () => THREE.Material) {
  let m = cache.get(key);
  if (!m) cache.set(key, (m = make()));
  return m;
}
const std = (color: string, roughness = 0.55, metalness = 0) => mat(`s${color}${roughness}${metalness}`, () => new THREE.MeshStandardMaterial({ color, roughness, metalness }));
export const M = {
  tin: () => std("#cfd5dc", 0.28, 1),
  gold: () => std("#d8b04a", 0.25, 1),
  steel: () => std("#a9b0b8", 0.35, 1),
  black: () => std("#141414", 0.6),
  blackGloss: () => std("#0d0d0d", 0.25),
  white: () => std("#f3f2ee", 0.6),
  plasticBlue: () => std("#2257b8", 0.45),
};

/* ─── Geometry helpers ─────────────────────────────────────────────────── */

const box = (w: number, h: number, d: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
};
const roundedBox = (w: number, h: number, d: number, r: number, m: THREE.Material, x = 0, y = 0, z = 0) => {
  const s = new THREE.Shape();
  const hw = w / 2;
  const hd = d / 2;
  s.moveTo(-hw + r, -hd);
  s.lineTo(hw - r, -hd);
  s.quadraticCurveTo(hw, -hd, hw, -hd + r);
  s.lineTo(hw, hd - r);
  s.quadraticCurveTo(hw, hd, hw - r, hd);
  s.lineTo(-hw + r, hd);
  s.quadraticCurveTo(-hw, hd, -hw, hd - r);
  s.lineTo(-hw, -hd + r);
  s.quadraticCurveTo(-hw, -hd, -hw + r, -hd);
  const g = new THREE.ExtrudeGeometry(s, { depth: h, bevelEnabled: true, bevelSize: Math.min(0.4, r / 2), bevelThickness: Math.min(0.4, h / 4), bevelSegments: 2, curveSegments: 6 });
  g.rotateX(-Math.PI / 2);
  const mesh = new THREE.Mesh(g, m);
  mesh.position.set(x, y, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
};
const cyl = (r: number, h: number, m: THREE.Material, x = 0, y = 0, z = 0, seg = 24) => {
  const mesh = new THREE.Mesh(new THREE.CylinderGeometry(r, r, h, seg), m);
  mesh.position.set(x, y + h / 2, z);
  mesh.castShadow = mesh.receiveShadow = true;
  return mesh;
};
/** A wire leg through the given points (a bent component lead). */
function lead(points: [number, number, number][], r = 0.26, m = M.tin()) {
  const curve = new THREE.CurvePath<THREE.Vector3>();
  for (let i = 0; i < points.length - 1; i++) curve.add(new THREE.LineCurve3(new THREE.Vector3(...points[i]), new THREE.Vector3(...points[i + 1])));
  const mesh = new THREE.Mesh(new THREE.TubeGeometry(curve as unknown as THREE.Curve<THREE.Vector3>, Math.max(2, points.length * 4), r, 8, false), m);
  mesh.castShadow = true;
  return mesh;
}
const P = (u: number) => u * U;

/** Text and markings drawn on a canvas, used as a texture (silkscreen, labels, displays). */
function canvasTexture(w: number, h: number, draw: (c: CanvasRenderingContext2D) => void) {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  draw(ctx);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return { texture: t, canvas: c, ctx };
}

/** Female header strip (black, square holes) with `n` sockets along +X from x0. */
function femaleHeader(n: number, x0: number, z: number, y: number) {
  const g = new THREE.Group();
  g.add(box(n * 2.54, 8.5, 2.54, M.black(), x0 + ((n - 1) * 2.54) / 2, y, z));
  for (let i = 0; i < n; i++) g.add(box(1.0, 0.05, 1.0, std("#050505", 0.9), x0 + i * 2.54, y + 8.5, z));
  return g;
}
/** Male pin strip pointing down (Nano, HC-SR04). */
function malePins(n: number, x0: number, z: number, top: number, len: number) {
  const g = new THREE.Group();
  g.add(box(n * 2.54, 2.5, 2.4, M.black(), x0 + ((n - 1) * 2.54) / 2, top - 2.5, z));
  for (let i = 0; i < n; i++) g.add(box(0.64, len, 0.64, M.gold(), x0 + i * 2.54, top - len, z));
  return g;
}

/* ─── Boards ───────────────────────────────────────────────────────────── */

const UNO_W = P(280);
const UNO_D = P(210);
const STANDOFF = 3;
const PCB = 1.6;

function uno(): Model {
  const g = new THREE.Group();
  const top = STANDOFF + PCB;
  const silk = canvasTexture(1400, 1050, (c) => {
    const k = 1400 / UNO_W;
    c.fillStyle = "#00797f";
    c.fillRect(0, 0, 1400, 1050);
    c.strokeStyle = "rgba(255,255,255,.18)";
    c.lineWidth = 3;
    for (let i = 0; i < 40; i++) {
      c.beginPath();
      c.moveTo(Math.random() * 1400, Math.random() * 1050);
      c.lineTo(Math.random() * 1400, Math.random() * 1050);
      c.stroke();
    }
    c.fillStyle = "#ffffff";
    c.textAlign = "center";
    c.font = "bold 150px sans-serif";
    c.fillText("UNO", 0.25 * 1400, 0.52 * 1050);
    c.font = "bold 46px sans-serif";
    c.fillText("ARDUINO", 0.25 * 1400, 0.6 * 1050);
    c.font = "26px monospace";
    const label = (s: string, ux: number, uy: number, down: boolean) => {
      c.save();
      c.translate(ux * U * k, uy * U * k);
      c.rotate(-Math.PI / 2);
      c.textAlign = down ? "left" : "right";
      c.fillText(s, 0, 9);
      c.restore();
    };
    ["SCL", "SDA", "AREF", "GND", "13", "12", "~11", "~10", "~9", "8"].forEach((s, i) => label(s, 100 + i * 10, 22, false));
    ["7", "~6", "~5", "4", "~3", "2", "TX 1", "RX 0"].forEach((s, i) => label(s, 200 + i * 10, 22, false));
    ["IOREF", "RESET", "3.3V", "5V", "GND", "GND", "VIN"].forEach((s, i) => label(s, 100 + i * 10, 188, true));
    ["A0", "A1", "A2", "A3", "A4", "A5"].forEach((s, i) => label(s, 180 + i * 10, 188, true));
    c.textAlign = "left";
    c.font = "bold 30px sans-serif";
    c.fillText("DIGITAL (PWM~)", 0.52 * 1400, 0.16 * 1050);
    c.fillText("POWER        ANALOG IN", 0.37 * 1400, 0.83 * 1050);
    c.fillText("L", 0.43 * 1400, 0.19 * 1050);
    c.fillText("TX  RX", 0.43 * 1400, 0.26 * 1050);
    c.fillText("ON", 0.88 * 1400, 0.44 * 1050);
  });
  const pcbMat = new THREE.MeshStandardMaterial({ map: silk.texture, roughness: 0.55, metalness: 0.05 });
  const shape = new THREE.Shape();
  shape.moveTo(0, 0);
  shape.lineTo(UNO_W - 2, 0);
  shape.lineTo(UNO_W, 2);
  shape.lineTo(UNO_W, 9);
  shape.lineTo(UNO_W - 1.5, 10.5);
  shape.lineTo(UNO_W - 1.5, 40);
  shape.lineTo(UNO_W, 41.5);
  shape.lineTo(UNO_W, UNO_D - 1.5);
  shape.lineTo(UNO_W - 2, UNO_D);
  shape.lineTo(0, UNO_D);
  shape.lineTo(0, 0);
  const pcbGeo = new THREE.ExtrudeGeometry(shape, { depth: PCB, bevelEnabled: false });
  pcbGeo.rotateX(Math.PI / 2);
  // ExtrudeGeometry UVs are in shape units: normalise to 0..1 for the silkscreen.
  const uv = pcbGeo.attributes.uv as THREE.BufferAttribute;
  for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) / UNO_W, 1 - uv.getY(i) / UNO_D);
  const pcb = new THREE.Mesh(pcbGeo, [pcbMat, std("#0b4f52", 0.6)]);
  pcb.position.y = top;
  pcb.castShadow = pcb.receiveShadow = true;
  g.add(pcb);
  // Mounting holes and standoffs.
  for (const [x, z] of [[P(14), P(10)], [P(266), P(20)], [P(15), P(198)], [P(266), P(158)]]) g.add(cyl(1.6, STANDOFF, std("#d4d7dc", 0.4, 0.6), x, 0, z));
  // Headers (pin centres from the 2D layout).
  g.add(femaleHeader(10, P(100), P(10), top));
  g.add(femaleHeader(8, P(200), P(10), top));
  g.add(femaleHeader(8, P(90), P(200), top));
  g.add(femaleHeader(6, P(180), P(200), top));
  // USB-B socket and DC barrel jack hanging over the left edge.
  const usb = box(16, 11, 12, M.steel(), P(20) - 4.5, top, P(53));
  g.add(usb);
  g.add(box(9, 0.2, 7, std("#2a2a2a", 0.8), P(20) - 10, top + 11, P(53)));
  g.add(box(14, 11, 9, M.blackGloss(), P(18) - 4, top, P(168)));
  g.add(cyl(3.2, 0.3, std("#222", 0.5), P(18) - 4, top + 11, P(168)));
  // ATmega328P (DIP-28) with its legs.
  const chipX = P(195);
  const chipZ = P(138);
  g.add(box(35, 3.6, 7.6, M.blackGloss(), chipX, top + 0.8, chipZ));
  const chipTop = canvasTexture(512, 112, (c) => {
    c.fillStyle = "#121212";
    c.fillRect(0, 0, 512, 112);
    c.fillStyle = "#9aa1a9";
    c.font = "bold 34px monospace";
    c.fillText("ATMEGA328P-PU", 70, 50);
    c.font = "24px monospace";
    c.fillText("AU 2026", 70, 88);
    c.beginPath();
    c.arc(26, 56, 10, 0, Math.PI * 2);
    c.fillStyle = "#050505";
    c.fill();
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(34.6, 7.4), new THREE.MeshStandardMaterial({ map: chipTop.texture, roughness: 0.35 }));
  label.rotation.x = -Math.PI / 2;
  label.position.set(chipX, top + 4.41, chipZ);
  g.add(label);
  for (let i = 0; i < 14; i++)
    for (const s of [-1, 1]) g.add(box(0.5, 2.4, 0.9, M.tin(), chipX - 16.5 + i * 2.54, top, chipZ + s * 4.2));
  // Crystal, capacitors, voltage regulator, reset button.
  g.add(roundedBox(10, 3.5, 4.2, 2, M.tin(), P(160), top, P(95)));
  for (const [x, z] of [[P(56), P(186)], [P(72), P(186)]]) {
    g.add(cyl(3.1, 7, std("#1c1c1c", 0.4), x, top, z));
    g.add(cyl(3.1, 0.2, M.steel(), x, top + 7, z));
  }
  g.add(box(6.5, 2.3, 6.5, M.black(), P(48), top, P(140)));
  g.add(box(6, 3, 6, std("#cfcfcf", 0.4, 0.5), P(262), top, P(46)));
  g.add(cyl(1.8, 1, std("#3a3a3a", 0.6), P(262), top + 3, P(46)));
  g.add(box(5, 1.2, 4, M.blackGloss(), P(120), top, P(64))); // USB-serial chip
  // Status LEDs (SMD): L on pin 13, TX, ON.
  const smd = (color: string, x: number, z: number) => {
    const m = new THREE.MeshStandardMaterial({ color: "#3a2a12", emissive: color, emissiveIntensity: 0, roughness: 0.3 });
    const mesh = box(1.6, 0.6, 0.9, m, x, top, z);
    g.add(mesh);
    return m;
  };
  const ledL = smd("#ffa21a", P(132), P(38));
  const ledTX = smd("#ffd23a", P(132), P(50));
  const ledON = smd("#3cff6a", P(242), P(90));
  return {
    group: g,
    pinTop: top + 8.5,
    hostTop: top + 8.5,
    anchors: { L: [P(132), top + 0.6, P(38)], TX: [P(132), top + 0.6, P(50)], ON: [P(242), top + 0.6, P(90)] },
    update(r) {
      ledON.emissiveIntensity = r ? 2.2 : 0;
      ledL.emissiveIntensity = r ? 3 * Math.min(1, (r.vD13 ?? 0) / 5) : 0;
      ledTX.emissiveIntensity = r?.tx ? 2.5 : 0;
    },
    dispose: () => silk.texture.dispose(),
  };
}

function nano(): Model {
  const g = new THREE.Group();
  const top = 8.5 + 1.6; // sits on its pins
  const pcb = box(P(160), 1.6, P(80), std("#1f4ea3", 0.5), P(80), 8.5, P(40));
  g.add(pcb);
  g.add(malePins(15, P(10), P(10), 8.5, 8.5 + 2.5));
  g.add(malePins(15, P(10), P(70), 8.5, 8.5 + 2.5));
  g.add(box(7.5, 4, 8, M.steel(), P(10) - 4, top, P(40))); // mini USB
  const chip = box(7, 1.2, 7, M.blackGloss(), P(80), top, P(40));
  chip.rotation.y = Math.PI / 4;
  g.add(chip);
  g.add(box(3.5, 1.5, 2.2, std("#d9d9d9", 0.4, 0.4), P(120), top, P(40)));
  const l = new THREE.MeshStandardMaterial({ color: "#3a2a12", emissive: "#ffa21a", emissiveIntensity: 0 });
  g.add(box(1.6, 0.6, 0.9, l, P(28), top, P(32)));
  return {
    group: g,
    pinTop: 0,
    hostTop: top,
    anchors: { L: [P(28), top + 0.6, P(32)] },
    update(r) {
      l.emissiveIntensity = r ? 3 * Math.min(1, (r.vD13 ?? 0) / 5) : 0;
    },
  };
}

/* ─── Breadboards ──────────────────────────────────────────────────────── */

const BB_H = 8.5;
function breadboard(type: string): Model {
  const cols = bbCols(type);
  const mini = type === "breadboard-mini";
  const w = P(20 + cols * 10);
  const z0 = mini ? P(30) : 0;
  const d = mini ? P(150) : P(210);
  const pins = breadboardPins(cols).filter((p) => !mini || (p.y > 30 && p.y < 180));
  const ppm = 12;
  const tex = canvasTexture(Math.round(w * ppm), Math.round(d * ppm), (c) => {
    c.fillStyle = "#f1efe9";
    c.fillRect(0, 0, c.canvas.width, c.canvas.height);
    const X = (u: number) => u * U * ppm;
    const Y = (u: number) => (u * U - z0) * ppm;
    // Centre channel.
    c.fillStyle = "#d8d4c9";
    c.fillRect(0, Y(100) - 4, c.canvas.width, Y(110) - Y(100) + 8);
    if (!mini)
      for (const [y, color] of [[3, "#d63b3b"], [27, "#2f6fd6"], [183, "#2f6fd6"], [207, "#d63b3b"]] as const) {
        c.fillStyle = color;
        c.fillRect(X(12), Y(y) - 2, c.canvas.width - X(16), 4);
      }
    for (const p of pins) {
      const s = 1.15 * ppm;
      c.fillStyle = "#3b3e43";
      c.fillRect(X(p.x) - s / 2, Y(p.y) - s / 2, s, s);
      c.fillStyle = "#16181b";
      c.fillRect(X(p.x) - s / 2 + 2, Y(p.y) - s / 2 + 2, s - 4, s - 4);
    }
    c.fillStyle = "#8a877e";
    c.font = `${Math.round(1.5 * ppm)}px sans-serif`;
    c.textAlign = "center";
    for (let i = 1; i <= cols; i++) if (i === 1 || i % 5 === 0) for (const y of [42, 172]) c.fillText(String(i), X(10 + i * 10), Y(y) + 6);
    for (const r of BB_ROWS) c.fillText(r, X(7), Y({ a: 50, b: 60, c: 70, d: 80, e: 90, f: 120, g: 130, h: 140, i: 150, j: 160 }[r]) + 6);
  });
  const topMat = new THREE.MeshStandardMaterial({ map: tex.texture, roughness: 0.75 });
  const side = std("#e6e3db", 0.7);
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(w, BB_H, d), [side, side, topMat, side, side, side]);
  mesh.position.set(w / 2, BB_H / 2, z0 + d / 2);
  mesh.castShadow = mesh.receiveShadow = true;
  const g = new THREE.Group();
  g.add(mesh);
  return { group: g, pinTop: BB_H, hostTop: BB_H, dispose: () => tex.texture.dispose() };
}

/* ─── Passive components ───────────────────────────────────────────────── */

const BANDS = ["#1a1a1a", "#7a4a1d", "#d92b2b", "#ef7d1a", "#f2d21b", "#2e9a43", "#2257c9", "#7d3fb5", "#8a8a8a", "#f4f4f4"];
function bandColors(r: number): string[] {
  if (!(r > 0)) return [BANDS[0], BANDS[0], BANDS[0], "#c9a227"];
  let exp = Math.floor(Math.log10(r)) - 1;
  let sig = Math.round(r / 10 ** exp);
  if (sig >= 100) (sig = Math.round(sig / 10)), exp++;
  return [BANDS[Math.floor(sig / 10)], BANDS[sig % 10], exp >= 0 ? BANDS[exp] ?? BANDS[9] : exp === -1 ? "#c9a227" : "#c0c0c0", "#c9a227"];
}

function resistor(p: PartInstance): Model {
  const g = new THREE.Group();
  const L = P(40);
  const h = 1.6;
  const body = new THREE.Group();
  const profile = [
    [0, -3.2],
    [0.9, -3.2],
    [1.25, -2.8],
    [1.25, -1.9],
    [1.05, -1.5],
    [1.05, 1.5],
    [1.25, 1.9],
    [1.25, 2.8],
    [0.9, 3.2],
    [0, 3.2],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const shell = new THREE.Mesh(new THREE.LatheGeometry(profile, 28), std("#e3c99a", 0.6));
  shell.castShadow = true;
  body.add(shell);
  bandColors(Number(propsOf(p).r)).forEach((c, i) => {
    const band = new THREE.Mesh(new THREE.CylinderGeometry(1.08 + (i === 0 ? 0.2 : 0), 1.08 + (i === 0 ? 0.2 : 0), 0.55, 28, 1, true), std(c, 0.5));
    band.position.y = [-2.3, -1.0, 0.1, 2.2][i];
    body.add(band);
  });
  body.rotation.z = Math.PI / 2;
  body.position.set(L / 2, h, 0);
  g.add(body);
  g.add(lead([[0, -1, 0], [0, h, 0], [L / 2 - 3.2, h, 0]]));
  g.add(lead([[L, -1, 0], [L, h, 0], [L / 2 + 3.2, h, 0]]));
  return { group: g, pinTop: 0 };
}

function led(p: PartInstance): Model {
  const g = new THREE.Group();
  const c = LED_COLORS[String(propsOf(p).color)] ?? LED_COLORS.red;
  const cx = P(5);
  const lift = 5;
  g.add(lead([[0, -1, 0], [0, lift, 0]]));
  g.add(lead([[P(10), -1, 0], [P(10), 2.5, 0], [P(10) - 0.6, 3.4, 0], [P(10) - 0.6, lift, 0]]));
  const lens = new THREE.MeshPhysicalMaterial({ color: c.fill, emissive: c.glow, emissiveIntensity: 0, roughness: 0.12, transmission: 0.55, thickness: 2, ior: 1.5, clearcoat: 1, clearcoatRoughness: 0.1, transparent: true, opacity: 0.92 });
  const flange = cyl(2.9, 1, lens, cx, lift, 0, 32);
  const body = cyl(2.5, 4.4, lens, cx, lift + 1, 0, 32);
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), lens);
  dome.position.set(cx, lift + 5.4, 0);
  dome.castShadow = true;
  // The die and anvil inside the lens.
  g.add(cyl(0.5, 2.6, M.steel(), cx - 0.6, lift, 0, 8), cyl(0.7, 2.2, M.steel(), cx + 0.6, lift, 0, 8));
  g.add(flange, body, dome);
  const light = new THREE.PointLight(c.glow, 0, 40, 2);
  light.position.set(cx, lift + 4, 0);
  g.add(light);
  return {
    group: g,
    pinTop: 0,
    anchors: { glow: [cx, lift + 5, 0] },
    update(r) {
      const on = Math.min(1, (r?.i ?? 0) / 0.015);
      lens.emissiveIntensity = on * 14;
      light.intensity = on * 120;
    },
  };
}

function rgbLed(p: PartInstance): Model {
  const g = new THREE.Group();
  const cx = P(15);
  const lift = 5;
  [0, 10, 20, 30].forEach((x, i) => g.add(lead([[P(x), -1, 0], [P(x), lift + (i === 1 ? 0.6 : 0), 0]])));
  const lens = new THREE.MeshPhysicalMaterial({ color: "#f4f6fa", emissive: "#000000", emissiveIntensity: 1, roughness: 0.35, transmission: 0.3, thickness: 2, clearcoat: 1 });
  g.add(cyl(2.9, 1, lens, cx, lift, 0, 32), cyl(2.5, 4.4, lens, cx, lift + 1, 0, 32));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(2.5, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2), lens);
  dome.position.set(cx, lift + 5.4, 0);
  g.add(dome);
  const light = new THREE.PointLight("#ffffff", 0, 40, 2);
  light.position.set(cx, lift + 4, 0);
  g.add(light);
  void p;
  return {
    group: g,
    pinTop: 0,
    anchors: { glow: [cx, lift + 5, 0] },
    update(r) {
      const k = (x?: number) => Math.min(1, (x ?? 0) / 0.015);
      const col = new THREE.Color(k(r?.iR), k(r?.iG), k(r?.iB));
      lens.emissive.copy(col).multiplyScalar(12);
      light.color.copy(col);
      light.intensity = Math.max(k(r?.iR), k(r?.iG), k(r?.iB)) * 120;
    },
  };
}

function pushbutton(): Model {
  const g = new THREE.Group();
  const cx = P(10);
  const cz = P(15);
  g.add(box(6, 3.4, 6, M.black(), cx, 0, cz));
  g.add(box(6.2, 0.4, 6.2, std("#bfc3c9", 0.35, 0.9), cx, 3.4, cz));
  const cap = cyl(1.75, 1.8, std("#c62f2f", 0.45), cx, 3.8, cz);
  g.add(cap);
  for (const [x, z] of [[0, 0], [P(20), 0], [0, P(30)], [P(20), P(30)]]) g.add(lead([[x, -1, z], [x, 0.4, z], [x + (x ? -0.9 : 0.9), 0.4, z]], 0.3));
  return {
    group: g,
    pinTop: 0,
    hits: [{ mesh: cap, action: "press" }],
    update(_r, live) {
      cap.position.y = 3.8 + 0.9 - (live.pressed ? 0.6 : 0);
    },
  };
}

function slideSwitch(p: PartInstance): Model {
  const g = new THREE.Group();
  const cx = P(10);
  [0, 10, 20].forEach((x) => g.add(lead([[P(x), -1, 0], [P(x), 1, 0]])));
  g.add(box(8.6, 3.6, 3.6, std("#2b313a", 0.5), cx, 1, 0));
  g.add(box(8.6, 0.3, 3.8, M.steel(), cx, 4.6, 0));
  const knob = box(2, 3, 1.8, M.black(), cx, 4.8, 0);
  g.add(knob);
  return {
    group: g,
    pinTop: 0,
    hits: [{ mesh: knob, action: "toggle" }],
    update(_r, live) {
      knob.position.x = cx + ((live.on ?? propsOf(p).on) ? 1.6 : -1.6);
    },
  };
}

function pot(p: PartInstance): Model {
  const g = new THREE.Group();
  const cx = P(10);
  const cz = -6;
  [0, 10, 20].forEach((x) => g.add(lead([[P(x), -1, 0], [P(x), 2, 0], [P(x), 2, -2]])));
  g.add(box(9.8, 4.5, 10, std("#2f5bb5", 0.45), cx, 1.5, cz));
  g.add(cyl(3.2, 1.2, M.steel(), cx, 6, cz));
  const knob = new THREE.Group();
  knob.add(cyl(3, 9, std("#d9dce2", 0.35), 0, 0, 0, 30));
  knob.add(box(0.9, 0.3, 4.2, std("#222", 0.5), 0, 9, -1));
  knob.position.set(cx, 7.2, cz);
  g.add(knob);
  return {
    group: g,
    pinTop: 0,
    update(_r, live) {
      const pos = Number(live.pos ?? propsOf(p).pos ?? 0.5);
      knob.rotation.y = -(-135 + 270 * Math.max(0, Math.min(1, pos))) * (Math.PI / 180);
    },
  };
}

function capacitor(p: PartInstance): Model {
  const g = new THREE.Group();
  const cx = P(5);
  if (propsOf(p).polar) {
    g.add(lead([[0, -1, 0], [0, 1.5, 0]]), lead([[P(10), -1, 0], [P(10), 1.5, 0]]));
    g.add(cyl(3.15, 10.5, std("#1d2b4d", 0.4), cx, 1.5, 0, 32));
    const stripe = cyl(3.18, 10.5, std("#b8c1d6", 0.4), cx, 1.5, 0, 32);
    (stripe.geometry as THREE.CylinderGeometry).dispose();
    stripe.geometry = new THREE.CylinderGeometry(3.18, 3.18, 10.5, 32, 1, true, Math.PI * 0.35, Math.PI * 0.4);
    g.add(stripe);
    g.add(cyl(3.0, 0.2, M.steel(), cx, 12, 0, 32));
  } else {
    g.add(lead([[0, -1, 0], [0, 2.5, 0], [cx - 1.5, 3.5, 0]]), lead([[P(10), -1, 0], [P(10), 2.5, 0], [cx + 1.5, 3.5, 0]]));
    const disc = new THREE.Mesh(new THREE.SphereGeometry(2.6, 24, 16), std("#d9922e", 0.5));
    disc.scale.set(1, 1, 0.45);
    disc.position.set(cx, 5.5, 0);
    disc.castShadow = true;
    g.add(disc);
  }
  return { group: g, pinTop: 0, anchors: { label: [cx, 14, 0] } };
}

function diode(): Model {
  const g = new THREE.Group();
  const L = P(40);
  const body = new THREE.Group();
  body.add(cyl(1.35, 5.2, std("#141414", 0.35), 0, -2.6, 0));
  body.add(cyl(1.37, 0.7, std("#cfd3d8", 0.4), 0, 1.6, 0));
  body.rotation.z = -Math.PI / 2;
  body.position.set(L / 2, 1.6, 0);
  g.add(body);
  g.add(lead([[0, -1, 0], [0, 1.6, 0], [L / 2 - 2.6, 1.6, 0]]), lead([[L, -1, 0], [L, 1.6, 0], [L / 2 + 2.6, 1.6, 0]]));
  return { group: g, pinTop: 0 };
}

function to92(label: string): Model {
  const g = new THREE.Group();
  const cx = P(10);
  [0, 10, 20].forEach((x) => g.add(lead([[P(x), -1, 0], [P(x), 3, 0], [cx + (P(x) - cx) * 0.5, 5, 0]], 0.22)));
  const geo = new THREE.CylinderGeometry(2.4, 2.4, 4.8, 32, 1, false, -Math.PI / 2, Math.PI);
  const body = new THREE.Mesh(geo, std("#151515", 0.5));
  body.position.set(cx, 7.4, 0.3);
  body.castShadow = true;
  g.add(body);
  g.add(box(4.8, 4.8, 0.1, std("#1a1a1a", 0.6), cx, 5, 0.3));
  const t = canvasTexture(128, 128, (c) => {
    c.fillStyle = "#1a1a1a";
    c.fillRect(0, 0, 128, 128);
    c.fillStyle = "#a8adb3";
    c.font = "bold 22px monospace";
    c.textAlign = "center";
    c.fillText(label, 64, 60);
  });
  const face = new THREE.Mesh(new THREE.PlaneGeometry(4.6, 4.6), new THREE.MeshStandardMaterial({ map: t.texture, roughness: 0.6 }));
  face.position.set(cx, 7.4, 0.36);
  g.add(face);
  return { group: g, pinTop: 0, dispose: () => t.texture.dispose() };
}

function mosfet(): Model {
  const g = new THREE.Group();
  const cx = P(10);
  [0, 10, 20].forEach((x) => g.add(lead([[P(x), -1, 0], [P(x), 4, 0]], 0.35)));
  g.add(box(10, 9, 4.5, std("#151515", 0.45), cx, 4, 0));
  g.add(box(10, 6.5, 1.3, M.tin(), cx, 13, -1.6));
  const hole = cyl(1.8, 1.4, std("#0a0a0a", 0.9), cx, 15.5, -1.6);
  hole.rotation.x = Math.PI / 2;
  hole.position.set(cx, 16, -1.6);
  g.add(hole);
  return { group: g, pinTop: 0 };
}

function buzzer(): Model {
  const g = new THREE.Group();
  const cx = P(10);
  g.add(lead([[0, -1, 0], [0, 1, 0]]), lead([[P(20), -1, 0], [P(20), 1, 0]]));
  g.add(cyl(6, 7.5, std("#151515", 0.35), cx, 1, 0, 40));
  g.add(cyl(1.1, 0.1, std("#030303", 0.9), cx, 8.5, 0));
  const ring = new THREE.Mesh(new THREE.TorusGeometry(4, 0.3, 8, 40), std("#202020", 0.3));
  ring.rotation.x = Math.PI / 2;
  ring.position.set(cx, 8.5, 0);
  g.add(ring);
  return { group: g, pinTop: 0, anchors: { top: [cx, 9, 0] } };
}

function servo(): Model {
  const g = new THREE.Group();
  // Connector at the pins, cable to the servo body behind it.
  g.add(box(P(30), 2.6, 2.5, M.black(), P(10), 0, 0));
  const colors = ["#6b3e1e", "#d23c2c", "#f08a1c"];
  colors.forEach((c, i) => g.add(lead([[P(i * 10), 2.4, 0], [P(i * 10), 3.5, -5], [P(10) + (i - 1) * 0.9, 4, -14]], 0.45, std(c, 0.5))));
  const bodyZ = -24;
  const bodyMat = new THREE.MeshPhysicalMaterial({ color: "#2a6fd6", roughness: 0.3, transmission: 0.25, thickness: 3, clearcoat: 0.6 });
  g.add(box(23, 22.5, 12.2, bodyMat, P(10) + 2, 0, bodyZ));
  g.add(box(32.5, 2.5, 12.2, bodyMat, P(10) + 2, 15.5, bodyZ));
  g.add(cyl(5.8, 4, bodyMat, P(10) + 7.5, 22.5, bodyZ, 30));
  const horn = new THREE.Group();
  horn.add(cyl(3.5, 2, M.white(), 0, 0, 0, 30));
  horn.add(roundedBox(3.4, 1.4, 15, 1.6, M.white(), 0, 1, -6));
  horn.position.set(P(10) + 7.5, 27, bodyZ);
  g.add(horn);
  return {
    group: g,
    pinTop: 2.6,
    anchors: { label: [P(10) + 2, 30, bodyZ] },
    update(r) {
      const a = r && r.angle >= 0 ? r.angle : 90;
      horn.rotation.y = ((a - 90) * Math.PI) / 180;
    },
  };
}

function motor(): Model {
  const g = new THREE.Group();
  const cx = P(10);
  g.add(lead([[0, -1, 0], [0, 4, -3]], 0.4, std("#d23c2c", 0.5)), lead([[P(20), -1, 0], [P(20), 4, -3]], 0.4, std("#222", 0.5)));
  const can = new THREE.Group();
  can.add(cyl(10, 25, M.steel(), 0, -12.5, 0, 40));
  can.add(cyl(10.1, 3, std("#d6d6d6", 0.4, 0.7), 0, 12.5, 0, 40));
  can.add(cyl(1, 8, M.tin(), 0, 15, 0, 12));
  const fan = new THREE.Group();
  for (let i = 0; i < 3; i++) {
    const blade = box(1, 1, 7, std("#e8b45c", 0.5), 0, 0, 3.5);
    const pivot = new THREE.Group();
    pivot.add(blade);
    pivot.rotation.y = (i * 2 * Math.PI) / 3;
    fan.add(pivot);
  }
  fan.position.y = 21;
  can.add(fan);
  can.rotation.x = Math.PI / 2;
  can.position.set(cx, 10, -16);
  g.add(can);
  let angle = 0;
  return {
    group: g,
    pinTop: 0,
    anchors: { label: [cx, 22, -16] },
    update(r, _l, dt) {
      angle += (r?.speed ?? 0) * dt * 40;
      fan.rotation.y = angle;
    },
  };
}

function battery9v(): Model {
  const g = new THREE.Group();
  g.add(lead([[0, 0, 0], [0, 3, -6]], 0.5, std("#d23c2c", 0.5)), lead([[P(20), 0, 0], [P(20), 3, -6]], 0.5, std("#222", 0.5)));
  const body = roundedBox(26.5, 17.5, 48.5, 2, std("#1d1f24", 0.4), P(10), 0, -32);
  g.add(body);
  g.add(roundedBox(26.6, 17.6, 14, 2, std("#c9a227", 0.35, 0.4), P(10), 0, -14));
  const t = canvasTexture(256, 128, (c) => {
    c.fillStyle = "#1d1f24";
    c.fillRect(0, 0, 256, 128);
    c.fillStyle = "#f3f4f6";
    c.font = "bold 72px sans-serif";
    c.textAlign = "center";
    c.fillText("9V", 128, 90);
  });
  const label = new THREE.Mesh(new THREE.PlaneGeometry(24, 12), new THREE.MeshStandardMaterial({ map: t.texture, roughness: 0.4 }));
  label.rotation.x = -Math.PI / 2;
  label.position.set(P(10), 18.1, -38);
  g.add(label);
  return { group: g, pinTop: 0, dispose: () => t.texture.dispose() };
}

function batteryAA(p: PartInstance): Model {
  const g = new THREE.Group();
  const n = Math.max(1, Math.round(Number(propsOf(p).cells ?? 2)));
  const w = n * 15 + 4;
  g.add(lead([[0, 0, 0], [0, 3, -6]], 0.5, std("#d23c2c", 0.5)), lead([[P(40), 0, 0], [P(40), 3, -6]], 0.5, std("#222", 0.5)));
  g.add(box(w, 4, 58, M.black(), P(20), 0, -36));
  for (let i = 0; i < n; i++) {
    const cell = new THREE.Group();
    cell.add(cyl(7, 46, std(i % 2 ? "#c9a227" : "#1d1f24", 0.35, 0.3), 0, -23, 0, 28));
    cell.add(cyl(2.5, 1.5, M.steel(), 0, 23, 0));
    cell.rotation.x = Math.PI / 2 * (i % 2 ? 1 : -1);
    cell.position.set(P(20) - w / 2 + 9.5 + i * 15, 9, -36);
    g.add(cell);
  }
  return { group: g, pinTop: 0 };
}

function display(w: number, h: number, bg: string, fg: string) {
  const t = canvasTexture(w, h, () => {});
  let last = "";
  const draw = (lines: string[]) => {
    const key = lines.join("|");
    if (key === last) return;
    last = key;
    const c = t.ctx;
    c.fillStyle = bg;
    c.fillRect(0, 0, w, h);
    c.fillStyle = fg;
    c.textAlign = "center";
    c.font = `bold ${Math.round(h * 0.42)}px monospace`;
    c.fillText(lines[0] ?? "", w / 2, h * 0.5);
    c.font = `${Math.round(h * 0.22)}px monospace`;
    c.fillText(lines[1] ?? "", w / 2, h * 0.85);
    t.texture.needsUpdate = true;
  };
  return { texture: t.texture, draw };
}

function supply(p: PartInstance): Model {
  const g = new THREE.Group();
  g.add(lead([[0, 0, 0], [0, 4, -8]], 0.6, std("#d23c2c", 0.5)), lead([[P(50), 0, 0], [P(50), 4, -8]], 0.6, std("#222", 0.5)));
  g.add(roundedBox(60, 32, 40, 3, std("#2b2f36", 0.5), P(25), 0, -30));
  const d = display(256, 128, "#0b1a10", "#5cff7a");
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(34, 17), new THREE.MeshStandardMaterial({ map: d.texture, emissive: "#ffffff", emissiveMap: d.texture, emissiveIntensity: 0.6 }));
  screen.position.set(P(25) - 8, 20, -9.9);
  g.add(screen);
  g.add(cyl(4, 3, std("#d63b3b", 0.4), P(25) + 18, 20, -10).rotateX(Math.PI / 2));
  return {
    group: g,
    pinTop: 0,
    anchors: { screen: [P(25) - 8, 20, -9.9] },
    update(r) {
      d.draw([`${Number(propsOf(p).v).toFixed(1)} V`, r ? `${(Math.abs(r.i ?? 0) * 1000).toFixed(0)} mA` : "DC"]);
    },
    dispose: () => d.texture.dispose(),
  };
}

function ldr(): Model {
  const g = new THREE.Group();
  const cx = P(5);
  g.add(lead([[0, -1, 0], [0, 4, 0]]), lead([[P(10), -1, 0], [P(10), 4, 0]]));
  const t = canvasTexture(128, 128, (c) => {
    c.fillStyle = "#f1e6c4";
    c.beginPath();
    c.arc(64, 64, 64, 0, Math.PI * 2);
    c.fill();
    c.strokeStyle = "#c0392b";
    c.lineWidth = 7;
    c.beginPath();
    for (let i = 0; i < 6; i++) {
      const y = 22 + i * 17;
      c.moveTo(24, y);
      c.lineTo(104, y);
    }
    c.stroke();
  });
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(2.6, 2.6, 2, 32), [std("#cdbf97", 0.5), new THREE.MeshStandardMaterial({ map: t.texture, roughness: 0.3 }), std("#cdbf97", 0.5)]);
  disc.rotation.x = Math.PI / 2;
  disc.position.set(cx, 6.6, 0);
  disc.castShadow = true;
  g.add(disc);
  return { group: g, pinTop: 0, anchors: { label: [cx, 11, 0] }, dispose: () => t.texture.dispose() };
}

function thermistor(): Model {
  const g = new THREE.Group();
  const cx = P(5);
  g.add(lead([[0, -1, 0], [0, 3, 0], [cx, 5, 0]]), lead([[P(10), -1, 0], [P(10), 3, 0], [cx, 5, 0]]));
  const bead = new THREE.Mesh(new THREE.SphereGeometry(1.8, 20, 14), std("#2b2b2b", 0.3));
  bead.scale.set(1, 1.25, 0.8);
  bead.position.set(cx, 6.2, 0);
  g.add(bead);
  return { group: g, pinTop: 0, anchors: { label: [cx, 10, 0] } };
}

function sonar(): Model {
  const g = new THREE.Group();
  const cx = P(15);
  // Upright like the real module: pins in the breadboard, the two transducers facing away (-Z).
  for (let i = 0; i < 4; i++) g.add(box(0.64, 9, 0.64, M.gold(), P(i * 10), -1, 0));
  g.add(box(P(30) + 2.5, 2.5, 2.5, M.black(), cx, 2, 0));
  g.add(box(45, 20, 1.6, std("#1f5fae", 0.5), cx, 6, -1.2));
  for (const dx of [-13, 13]) {
    const can = new THREE.Group();
    can.add(cyl(8, 12, M.steel(), 0, 0, 0, 40));
    can.add(cyl(6.6, 0.2, std("#2e3238", 0.85), 0, 12, 0, 40));
    can.rotation.x = -Math.PI / 2;
    can.position.set(cx + dx, 16, -2);
    g.add(can);
  }
  const xtal = roundedBox(10, 3.5, 4, 2, M.tin(), 0, 0, 0);
  xtal.rotation.x = -Math.PI / 2;
  xtal.position.set(cx, 23, -2);
  g.add(xtal);
  return { group: g, pinTop: 4.5, anchors: { label: [cx, 28, -2] } };
}

function meter(kind: "V" | "A"): Model {
  const g = new THREE.Group();
  g.add(lead([[0, 0, 0], [0, 4, -8]], 0.6, std("#d63b3b", 0.5)), lead([[P(30), 0, 0], [P(30), 4, -8]], 0.6, std("#1b1b1b", 0.5)));
  g.add(roundedBox(40, 14, 70, 5, std("#f2c230", 0.5), P(15), 0, -45));
  g.add(roundedBox(36, 15, 66, 4, std("#2a2a2a", 0.5), P(15), 0, -45));
  const d = display(256, 128, "#c5d4b5", "#1d2a12");
  const screen = new THREE.Mesh(new THREE.PlaneGeometry(28, 14), new THREE.MeshStandardMaterial({ map: d.texture, roughness: 0.4 }));
  screen.rotation.x = -Math.PI / 2;
  screen.position.set(P(15), 15.2, -65);
  g.add(screen);
  const dial = cyl(9, 2, std("#3a3a3a", 0.4), P(15), 15, -42);
  g.add(dial);
  return {
    group: g,
    pinTop: 0,
    anchors: { screen: [P(15), 15.2, -65] },
    update(r) {
      const v = kind === "V" ? r?.v : r?.i;
      d.draw([v === undefined ? "----" : kind === "V" ? v.toFixed(2) : (v * 1000).toFixed(1), kind === "V" ? "V DC" : "mA DC"]);
    },
    dispose: () => d.texture.dispose(),
  };
}

export function buildModel(p: PartInstance): Model | null {
  switch (p.type) {
    case "arduino-uno":
      return uno();
    case "arduino-nano":
      return nano();
    case "breadboard":
    case "breadboard-half":
    case "breadboard-mini":
      return breadboard(p.type);
    case "resistor":
      return resistor(p);
    case "led":
      return led(p);
    case "rgb-led":
      return rgbLed(p);
    case "pushbutton":
      return pushbutton();
    case "slide-switch":
      return slideSwitch(p);
    case "potentiometer":
      return pot(p);
    case "capacitor":
      return capacitor(p);
    case "diode":
      return diode();
    case "npn":
      return to92("2N2222");
    case "pnp":
      return to92("2N3906");
    case "nmos":
      return mosfet();
    case "buzzer":
      return buzzer();
    case "servo":
      return servo();
    case "dc-motor":
      return motor();
    case "battery-9v":
      return battery9v();
    case "battery-aa":
      return batteryAA(p);
    case "power-supply":
      return supply(p);
    case "ldr":
      return ldr();
    case "thermistor":
      return thermistor();
    case "hc-sr04":
      return sonar();
    case "voltmeter":
      return meter("V");
    case "ammeter":
      return meter("A");
    default:
      return null;
  }
}
