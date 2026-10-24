/**
 * 3D models of modules, displays, sensors and logic chips, at real sizes (mm), in the same layout as
 * the other models: origin at pin 0, canvas x → +X, canvas y → +Z, up is +Y. Nothing here runs at
 * import time (models.ts and this file import each other).
 */
import * as THREE from "three";
import type { PartInstance } from "../model";
import { propsOf } from "../parts";
import { GATES } from "../../sim/modules";
import { SEG_COLORS, SEG_SHAPES } from "../render-modules";
import { M, P, box, canvasTexture, cyl, lead, roundedBox, std, type Model } from "./models";

/** Straight pins down into the breadboard at the given pin positions (canvas units). */
function pins(at: [number, number][], len = 7, top = 1) {
  const g = new THREE.Group();
  for (const [x, z] of at) g.add(box(0.64, len + top, 0.64, M.tin(), P(x), -len, P(z)));
  return g;
}
/** A male header row (black plastic strip + gold pins) along X at z, plugged into the breadboard. */
function header(xs: number[], z: number, lift = 2.5) {
  const g = new THREE.Group();
  const x0 = Math.min(...xs);
  const x1 = Math.max(...xs);
  g.add(box(P(x1 - x0) + 2.54, 2.5, 2.54, M.black(), P((x0 + x1) / 2), lift, P(z)));
  for (const x of xs) g.add(box(0.64, 9 + lift, 0.64, M.gold(), P(x), -8, P(z)));
  return g;
}
/** A flat label/texture on top of a box. */
function topTexture(w: number, d: number, y: number, x: number, z: number, px: number, draw: (c: CanvasRenderingContext2D, W: number, H: number) => void) {
  const W = Math.round(px);
  const H = Math.round((px * d) / w);
  const t = canvasTexture(W, H, (c) => draw(c, W, H));
  const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d), new THREE.MeshStandardMaterial({ map: t.texture, roughness: 0.5, transparent: true }));
  m.rotation.x = -Math.PI / 2;
  m.position.set(x, y + 0.02, z);
  return { mesh: m, texture: t.texture };
}
function pcb(w: number, d: number, x: number, z: number, color = "#1f5fae", y = 2.5) {
  return box(w, 1.6, d, std(color, 0.6), x, y, z);
}
function smdLed(x: number, y: number, z: number, color: string) {
  return box(1.6, 0.6, 0.8, std(color, 0.3), x, y, z);
}
function trimPot(x: number, y: number, z: number) {
  const g = new THREE.Group();
  g.add(box(6.5, 4.5, 6.5, std("#2b5ec4", 0.45), x, y, z));
  g.add(cyl(2, 0.6, M.tin(), x, y + 4.5, z, 20));
  g.add(box(2.6, 0.2, 0.5, std("#555", 0.5), x, y + 5.1, z));
  return g;
}

function seg7(p: PartInstance): Model {
  const g = new THREE.Group();
  const pr = propsOf(p);
  const col = SEG_COLORS[String(pr.color)] ?? SEG_COLORS.red;
  const cx = P(20);
  const cz = P(30);
  g.add(pins([0, 10, 20, 30, 40].flatMap((x) => [[x, 0], [x, 60]] as [number, number][]), 3));
  g.add(box(12.6, 8, 19, std("#1d1d1f", 0.5), cx, 0, cz));
  // The face: segments printed in their "off" colour (lit ones are drawn live on top).
  const face = topTexture(12.6, 19, 8, cx, cz, 252, (c, W, H) => {
    c.fillStyle = "#121214";
    c.fillRect(0, 0, W, H);
    c.save();
    c.translate(W * 0.2, H * 0.12);
    c.scale((W * 0.6) / 30, (H * 0.73) / 52);
    c.transform(1, 0, Math.tan((-8 * Math.PI) / 180), 1, 0, 0);
    c.fillStyle = col.off;
    for (const d of Object.values(SEG_SHAPES)) c.fill(new Path2D(d));
    c.restore();
  });
  g.add(face.mesh);
  // Digit box on the face, as three corners (top-left, top-right, bottom-left) for the live overlay.
  const x0 = cx - 12.6 / 2 + 12.6 * 0.2;
  const z0 = cz - 19 / 2 + 19 * 0.12;
  return { group: g, pinTop: 0, anchors: { digit: [x0, 8, z0], digitX: [x0 + 12.6 * 0.6, 8, z0], digitY: [x0, 8, z0 + 19 * 0.73] }, dispose: () => face.texture.dispose() };
}

function relay(): Model {
  const g = new THREE.Group();
  // Header (VCC, GND, IN) in a column at x = 0; screw terminals at x = 180 (5 mm pitch).
  for (const z of [0, 10, 20]) g.add(box(0.64, 11.5, 0.64, M.gold(), 0, -8, P(z)));
  g.add(box(2.54, 2.5, P(20) + 2.54, M.black(), 0, 2.5, P(10)));
  g.add(pcb(52, 26.5, P(90), P(10)));
  const rel = roundedBox(19, 15.5, 15.5, 0.8, std("#2463b8", 0.45), P(78), 4.1, P(5));
  g.add(rel);
  const label = topTexture(19, 15.5, 4.1 + 15.5 + 0.35, P(78), P(5), 380, (c, W, H) => {
    c.fillStyle = "#2463b8";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#e9f0ff";
    c.textAlign = "center";
    c.font = `bold ${H * 0.13}px sans-serif`;
    c.fillText("SONGLE", W / 2, H * 0.24);
    c.font = `bold ${H * 0.11}px sans-serif`;
    c.fillText("SRD-05VDC-SL-C", W / 2, H * 0.46);
    c.font = `${H * 0.085}px sans-serif`;
    c.fillText("10A 250VAC  10A 30VDC", W / 2, H * 0.68);
    c.fillText("10A 125VAC  10A 28VDC", W / 2, H * 0.84);
  });
  g.add(label.mesh);
  const term = new THREE.Group();
  term.add(box(8, 10, 15.2, std("#1d64d0", 0.5), 0, 0, 0));
  for (const dz of [-5.08, 0, 5.08]) {
    term.add(cyl(1.6, 0.6, M.steel(), 0, 10, dz, 16));
    term.add(box(2.4, 0.3, 0.5, std("#555", 0.5), 0, 10.6, dz));
  }
  term.position.set(P(180), 4.1, 0);
  g.add(term);
  for (const z of [-20, 0, 20]) g.add(box(0.8, 9, 0.8, M.tin(), P(180), -6, P(z)));
  g.add(box(4, 3, 5, std("#111", 0.5), P(40), 4.1, P(20)), smdLed(P(20), 4.1, P(30), "#ff3b3b"));
  return { group: g, pinTop: 4.5, anchors: { led: [P(20), 4.8, P(30)] }, dispose: () => label.texture.dispose() };
}

function joystick(p: PartInstance, live: Record<string, unknown>): Model {
  const g = new THREE.Group();
  const pr = propsOf(p);
  g.add(header([0, 10, 20, 30, 40], 0));
  g.add(pcb(34, 26.5, P(20), P(-60), "#141414"));
  g.add(box(16, 10, 16, std("#2a2a2a", 0.5), P(20), 4.1, P(-75)));
  const x = Number(live.x ?? pr.x ?? 0.5);
  const y = Number(live.y ?? pr.y ?? 0.5);
  const stick = new THREE.Group();
  stick.add(cyl(1.6, 9, M.steel(), 0, 0, 0, 16));
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(11, 12, 6, 32), std("#202020", 0.7));
  cap.position.y = 9;
  stick.add(cap);
  stick.position.set(P(20), 14, P(-75));
  // Up on the canvas (−Z) is +Y on the stick.
  stick.rotation.z = -(x - 0.5) * 0.8;
  stick.rotation.x = -(y - 0.5) * 0.8;
  g.add(stick);
  return { group: g, pinTop: 4.5 };
}

function pir(): Model {
  const g = new THREE.Group();
  g.add(header([0, 10, 20], 0));
  g.add(pcb(32.5, 24.3, P(10), P(-50), "#1f7a3a"));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(11.5, 40, 20, 0, Math.PI * 2, 0, Math.PI / 2), std("#f3f2ee", 0.85));
  dome.position.set(P(10), 4.1, P(-50));
  dome.castShadow = true;
  g.add(dome);
  for (const dx of [-11, 11]) g.add(trimPot(P(10) + dx, 4.1, P(-50) + 9.5));
  return { group: g, pinTop: 4.5, anchors: { label: [P(10), 20, P(-50)] } };
}

function irModule(kind: "ir" | "line" | "soil"): Model {
  const g = new THREE.Group();
  const n = kind === "ir" ? 3 : 4;
  const xs = Array.from({ length: n }, (_, i) => i * 10);
  const cx = P((n - 1) * 5);
  g.add(header(xs, 0));
  const len = kind === "soil" ? 20 : kind === "ir" ? 31 : 33;
  g.add(pcb(14.5, len, cx, -len / 2 - 1));
  g.add(trimPot(cx + 2.5, 4.1, -len * 0.55));
  g.add(smdLed(cx - 4, 4.1, -6, "#3bff6a"), smdLed(cx - 4, 4.1, -9, "#ff3b3b"));
  g.add(box(5, 1.5, 4, std("#111", 0.5), cx + 3, 4.1, -8));
  if (kind === "ir") {
    for (const [dx, color] of [[-3, "#cfe0ff"], [3, "#1a1a1a"]] as const) {
      const ledBody = new THREE.Group();
      ledBody.add(cyl(2.5, 5.5, std(color, 0.2), 0, 0, 0, 24));
      ledBody.add(new THREE.Mesh(new THREE.SphereGeometry(2.5, 20, 10, 0, Math.PI * 2, 0, Math.PI / 2), std(color, 0.2)));
      (ledBody.children[1] as THREE.Mesh).position.y = 5.5;
      ledBody.rotation.x = -Math.PI / 2;
      ledBody.position.set(cx + dx, 6.5, -len - 1);
      g.add(ledBody);
    }
  } else if (kind === "line") {
    g.add(box(10.2, 7, 5.8, std("#151515", 0.6), cx, 4.1, -len + 3));
    g.add(cyl(1.6, 0.3, std("#2b4cff", 0.3), cx - 2.5, 11.1, -len + 3, 16), cyl(1.6, 0.3, std("#111", 0.3), cx + 2.5, 11.1, -len + 3, 16));
  } else {
    // The fork probe (separate in reality, shown attached above the module).
    const probe = new THREE.Group();
    probe.add(box(20, 1.6, 60, std("#1f5fae", 0.6), 0, 0, 0));
    for (const dx of [-6, 6]) probe.add(box(3.5, 1.7, 46, std("#d8b04a", 0.3, 0.8), dx, 0, -5));
    probe.position.set(cx, 2.5, -len - 36);
    g.add(probe);
  }
  return { group: g, pinTop: 4.5, anchors: { led: [cx - 4, 4.8, -6], label: [cx, 12, kind === "soil" ? -len - 60 : -len] } };
}

function dht(type: "dht11" | "dht22"): Model {
  const g = new THREE.Group();
  const big = type === "dht22";
  const W = big ? 15.1 : 12;
  const H = big ? 25 : 15.5;
  const D = big ? 7.7 : 5.5;
  g.add(pins([[0, 0], [10, 0], [20, 0], [30, 0]], 6, 3));
  // Standing up like the real part: the grille faces the viewer (−Z is "up" on the canvas).
  const body = new THREE.Group();
  body.add(box(W, H, D, std(big ? "#f1f1ee" : "#2d6fd6", 0.55), 0, 0, 0));
  for (let i = 0; i < (big ? 6 : 4); i++) body.add(box(W * 0.75, 1.2, 0.6, std(big ? "#cfcfc8" : "#1f56b0", 0.6), 0, 3 + i * (H - 6) / (big ? 6 : 4), -D / 2 - 0.2));
  body.position.set(P(15), 3, 0);
  g.add(body);
  return { group: g, pinTop: 2, anchors: { label: [P(15), H + 6, 0] } };
}

function dip14(p: PartInstance): Model {
  const g = new THREE.Group();
  const chip = GATES[p.type];
  for (let i = 0; i < 7; i++) {
    for (const z of [0, 30]) {
      const x = P(i * 10);
      g.add(lead([[x, -3.5, P(z)], [x, 1.2, P(z)], [x, 1.6, P(z) + (z ? -0.8 : 0.8)]], 0.25, M.tin()));
    }
  }
  g.add(roundedBox(19.3, 3.3, 6.35, 0.4, std("#1c1c1e", 0.55), P(30), 0.6, P(15)));
  const top = topTexture(19.3, 6.35, 0.6 + 3.3 + 0.4, P(30), P(15), 400, (c, W, H) => {
    c.fillStyle = "#1c1c1e";
    c.fillRect(0, 0, W, H);
    c.fillStyle = "#0e0e0f";
    c.beginPath();
    c.arc(0, H / 2, H * 0.16, -Math.PI / 2, Math.PI / 2);
    c.fill();
    c.beginPath();
    c.arc(W * 0.06, H * 0.78, H * 0.07, 0, Math.PI * 2);
    c.fill();
    c.fillStyle = "#c9ccd1";
    c.textAlign = "center";
    c.font = `${H * 0.3}px monospace`;
    c.fillText(`SN${p.type.toUpperCase()}N`, W / 2, H * 0.48);
    c.font = `${H * 0.2}px monospace`;
    c.fillText(chip?.label ?? "", W / 2, H * 0.8);
  });
  g.add(top.mesh);
  return { group: g, pinTop: 0, dispose: () => top.texture.dispose() };
}

export function moduleModel(p: PartInstance, live: Record<string, unknown> = {}): Model | null {
  switch (p.type) {
    case "seg7":
      return seg7(p);
    case "relay":
      return relay();
    case "joystick":
      return joystick(p, live);
    case "pir":
      return pir();
    case "ir-obstacle":
      return irModule("ir");
    case "line-sensor":
      return irModule("line");
    case "soil":
      return irModule("soil");
    case "dht11":
    case "dht22":
      return dht(p.type);
    default:
      return GATES[p.type] ? dip14(p) : null;
  }
}
