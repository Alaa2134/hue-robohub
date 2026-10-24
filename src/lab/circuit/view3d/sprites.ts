/**
 * Realistic pictures of parts for the 2D canvas, rendered from the 3D models. The view is an oblique
 * projection: the bench plane stays exactly where the 2D layout puts it (so every leg still lands on
 * its grid point), and height rises up the screen, like looking at a real bench from slightly in front.
 * Lighting comes from the top left with a soft shadow on the bench; the background is transparent.
 * Pictures are made one per animation frame, cached per look (type, rotation, colour, knob position…).
 */
import * as THREE from "three";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";
import type { PartInstance } from "../model";
import { propsOf } from "../parts";
import { U, buildModel } from "./models";

/** How far up the screen one millimetre of height goes. */
export const RISE = 0.62;
const PX_PER_MM = 9;
const MAX_PX = 2400;

export type Sprite = { url: string; x: number; y: number; w: number; h: number; anchors: Record<string, [number, number]> };

/**
 * Where a 3D point (part-local mm, before rotation) lands in canvas units, after rotation and rise.
 * Height is measured from `level`: the surface pins sit on (a board's header tops, a breadboard's
 * top), so sockets and holes stay exactly on their grid points.
 */
export function project(p: PartInstance, x: number, y: number, z: number, level = 0): [number, number] {
  const r = (-p.rot * Math.PI) / 180;
  const wx = x * Math.cos(r) + z * Math.sin(r);
  const wz = -x * Math.sin(r) + z * Math.cos(r);
  return [wx / U, (wz - RISE * (y - level)) / U];
}

/** What changes a part's picture (everything else is drawn on top). */
export function lookKey(p: PartInstance, live: Record<string, unknown> = {}, r?: Record<string, number>): string {
  const pr = propsOf(p);
  const base = `${p.type}|${p.rot}`;
  switch (p.type) {
    case "resistor":
      return `${base}|${pr.r}`;
    case "led":
      return `${base}|${pr.color}`;
    case "capacitor":
      return `${base}|${pr.polar ? 1 : 0}`;
    case "battery-aa":
      return `${base}|${pr.cells}`;
    case "pushbutton":
      return `${base}|${live.pressed ? 1 : 0}`;
    case "slide-switch":
      return `${base}|${(live.on ?? pr.on) ? 1 : 0}`;
    case "potentiometer":
      return `${base}|${Math.round(Number(live.pos ?? pr.pos ?? 0.5) * 20)}`;
    case "servo":
      return `${base}|${r && r.angle >= 0 ? Math.round(r.angle / 6) * 6 : 90}`;
    default:
      return base;
  }
}

/* ─── Renderer (one, shared) ───────────────────────────────────────────── */

let ctx: { renderer: THREE.WebGLRenderer; scene: THREE.Scene; camera: THREE.OrthographicCamera; sun: THREE.DirectionalLight; catcher: THREE.Mesh; holder: THREE.Group } | null | undefined;
function init() {
  if (ctx !== undefined) return ctx;
  try {
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(1);
    renderer.toneMapping = THREE.ACESFilmicToneMapping;
    renderer.toneMappingExposure = 1.0;
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    renderer.shadowMap.enabled = true;
    renderer.shadowMap.type = THREE.PCFSoftShadowMap;
    renderer.setClearColor(0x000000, 0);
    const scene = new THREE.Scene();
    const pmrem = new THREE.PMREMGenerator(renderer);
    scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    scene.environmentIntensity = 0.55;
    scene.add(new THREE.HemisphereLight("#eef3ff", "#3a4660", 0.45));
    const sun = new THREE.DirectionalLight("#fff8ee", 1.8);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0005;
    sun.shadow.normalBias = 0.3;
    sun.shadow.radius = 5;
    scene.add(sun, sun.target);
    const catcher = new THREE.Mesh(new THREE.PlaneGeometry(2000, 2000), new THREE.ShadowMaterial({ opacity: 0.38 }));
    catcher.rotation.x = -Math.PI / 2;
    catcher.receiveShadow = true;
    scene.add(catcher);
    const holder = new THREE.Group();
    // Oblique projection: z' = z − RISE·(y − level), set per part in render().
    holder.matrixAutoUpdate = false;
    scene.add(holder);
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0.1, 4000);
    camera.up.set(0, 0, -1);
    ctx = { renderer, scene, camera, sun, catcher, holder };
  } catch {
    ctx = null;
  }
  return ctx;
}

function render(p: PartInstance, live: Record<string, unknown>, r: Record<string, number> | undefined): Sprite | null {
  const c = init();
  if (!c) return null;
  const model = buildModel(p);
  if (!model) return null;
  model.update?.(r, live, 0);
  const level = model.hostTop ?? 0;
  c.holder.matrix.set(1, 0, 0, 0, 0, 1, 0, 0, 0, -RISE, 1, RISE * level, 0, 0, 0, 1);
  const spin = new THREE.Group();
  spin.rotation.y = (-p.rot * Math.PI) / 180;
  spin.add(model.group);
  c.holder.add(spin);
  c.holder.updateMatrixWorld(true);
  const box = new THREE.Box3().setFromObject(spin);
  // Room for the shadow, which falls toward the bottom right.
  const pad = 2.5;
  const x0 = box.min.x - pad;
  const x1 = box.max.x + pad + 4;
  const z0 = box.min.z - pad;
  const z1 = box.max.z + pad + 4;
  const scale = Math.min(PX_PER_MM, MAX_PX / Math.max(x1 - x0, z1 - z0));
  const w = Math.max(8, Math.round((x1 - x0) * scale));
  const h = Math.max(8, Math.round((z1 - z0) * scale));
  c.renderer.setSize(w, h, false);
  const cam = c.camera;
  cam.left = x0;
  cam.right = x1;
  cam.top = -z0;
  cam.bottom = -z1;
  cam.position.set(0, 1000, 0);
  cam.lookAt(0, 0, 0);
  cam.updateProjectionMatrix();
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const size = Math.max(x1 - x0, z1 - z0);
  c.sun.position.set(cx - size * 0.5, size * 1.5 + 40, cz - size * 0.35);
  c.sun.target.position.set(cx, 0, cz);
  const sc = c.sun.shadow.camera;
  sc.left = sc.bottom = -size;
  sc.right = sc.top = size;
  sc.near = 1;
  sc.far = size * 6 + 200;
  sc.updateProjectionMatrix();
  c.renderer.render(c.scene, cam);
  const url = c.renderer.domElement.toDataURL("image/png");
  c.holder.remove(spin);
  model.group.traverse((o) => (o as THREE.Mesh).geometry?.dispose());
  model.dispose?.();
  const anchors: Record<string, [number, number]> = {};
  for (const [k, v] of Object.entries(model.anchors ?? {})) anchors[k] = project(p, v[0], v[1], v[2], level);
  return { url, x: x0 / U, y: z0 / U, w: (x1 - x0) / U, h: (z1 - z0) / U, anchors };
}

/* ─── Cache and queue ──────────────────────────────────────────────────── */

const cache = new Map<string, Sprite | null>();
const queue: { key: string; p: PartInstance; live: Record<string, unknown>; r?: Record<string, number> }[] = [];
const listeners = new Set<() => void>();
let scheduled = false;

function pump() {
  scheduled = false;
  const t0 = performance.now();
  while (queue.length && performance.now() - t0 < 24) {
    const job = queue.shift()!;
    if (cache.has(job.key)) continue;
    cache.set(job.key, render(job.p, job.live, job.r));
  }
  listeners.forEach((l) => l());
  if (queue.length) schedule();
}
function schedule() {
  if (scheduled) return;
  scheduled = true;
  requestAnimationFrame(pump);
}

/** The picture for this part and look, or undefined while it's being made (null: not available). */
export function getSprite(p: PartInstance, live: Record<string, unknown> = {}, r?: Record<string, number>): Sprite | null | undefined {
  const key = lookKey(p, live, r);
  if (cache.has(key)) return cache.get(key);
  if (!queue.some((j) => j.key === key)) {
    queue.push({ key, p: { ...p, x: 0, y: 0 }, live, r });
    schedule();
  }
  return undefined;
}

export function onSprites(fn: () => void) {
  listeners.add(fn);
  return () => void listeners.delete(fn);
}

export const spritesAvailable = () => init() !== null;
