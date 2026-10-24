/**
 * The geometry kernel: every shape, group and boolean is built by Manifold (WebAssembly), which only
 * produces closed, printable solids. What the viewport draws, what the stats measure and what the
 * exports write all come from the same solids, so the screen never shows something the file won't be.
 */
import * as THREE from "three";
import { toCreasedNormals } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import type { Manifold, ManifoldToplevel } from "manifold-3d";
import type { Font } from "opentype.js";
import { unpackMesh, type CadObject, type Vec3 } from "./model";

export type Kernel = { wasm: ManifoldToplevel; font: Font | null };

let loading: Promise<Kernel> | null = null;
let loader: (() => Promise<Kernel>) | null = null;
/** Tests (Node) supply their own loader; the browser fetches the kernel from /lab/cad. */
export function setKernelLoader(fn: () => Promise<Kernel>) {
  loader = fn;
  loading = null;
}
export function loadKernel(base = ""): Promise<Kernel> {
  loading ??= (loader ?? (() => browserKernel(base)))();
  loading.catch(() => (loading = null));
  return loading;
}

async function browserKernel(base: string): Promise<Kernel> {
  const dir = `${base}/lab/cad/`;
  const m = (await (await fetch(`${dir}manifold.json`, { cache: "no-cache" })).json()) as { files: { js: string; wasm: string; font: string } };
  const mod = (await import(/* webpackIgnore: true */ /* turbopackIgnore: true */ `${dir}${m.files.js}`)) as { default: (o: object) => Promise<ManifoldToplevel> };
  const wasm = await mod.default({ locateFile: () => `${dir}${m.files.wasm}` });
  wasm.setup();
  let font: Font | null = null;
  try {
    const { parse } = await import("opentype.js");
    font = parse(await (await fetch(`${dir}${m.files.font}`)).arrayBuffer());
  } catch {
    // Text is the only thing that needs the font; every other shape still works.
  }
  return { wasm, font };
}

/* ── Transforms ─────────────────────────────────────────────────────── */

const D = Math.PI / 180;
/** Rotation about X, then Y, then Z (world axes) = three.js Euler order "ZYX". */
export function matrixOf(o: Pick<CadObject, "position" | "rotation" | "scale">): THREE.Matrix4 {
  const q = new THREE.Quaternion().setFromEuler(new THREE.Euler(o.rotation[0] * D, o.rotation[1] * D, o.rotation[2] * D, "ZYX"));
  return new THREE.Matrix4().compose(new THREE.Vector3(...o.position), q, new THREE.Vector3(...o.scale));
}
/** Back from a matrix (e.g. after ungrouping). Shear from non-uniform scale under rotation is lost. */
export function fromMatrix(m: THREE.Matrix4): { position: Vec3; rotation: Vec3; scale: Vec3 } {
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  m.decompose(p, q, s);
  const e = new THREE.Euler().setFromQuaternion(q, "ZYX");
  const r = (x: number) => Math.round((x / D) * 1e4) / 1e4;
  const n = (x: number) => Math.round(x * 1e6) / 1e6;
  return { position: [n(p.x), n(p.y), n(p.z)], rotation: [r(e.x), r(e.y), r(e.z)], scale: [n(s.x), n(s.y), n(s.z)] };
}
type Mat4 = Parameters<Manifold["transform"]>[0];
const asMat = (m: THREE.Matrix4) => m.elements.slice() as unknown as Mat4;

/* ── Solids ─────────────────────────────────────────────────────────── */

const num = (o: CadObject, k: string, d: number) => {
  const v = Number(o.params[k]);
  return Number.isFinite(v) ? v : d;
};

/**
 * Manifold objects live in WebAssembly memory and must be freed. A scope tracks every temporary and
 * frees all but the result.
 */
class Scope {
  private all: Manifold[] = [];
  t<T extends Manifold>(m: T): T {
    this.all.push(m);
    return m;
  }
  done(keep: Manifold | null) {
    for (const m of this.all) if (m !== keep) m.delete();
    this.all = [];
    return keep;
  }
}

/** Why a shape couldn't be built (shown to the user instead of failing silently). */
export class ShapeError extends Error {}

/** The object's solid in its own coordinates (no position / rotation / scale). */
export function solidOf(k: Kernel, o: CadObject): Manifold | null {
  const { Manifold: M, CrossSection: CS } = k.wasm;
  const s = new Scope();
  try {
    let r: Manifold | null = null;
    switch (o.kind) {
      case "box": {
        const w = num(o, "w", 20);
        const d = num(o, "d", 20);
        const h = num(o, "h", 20);
        const rad = Math.min(num(o, "r", 0), w / 2 - 0.01, d / 2 - 0.01, h / 2 - 0.01);
        if (rad > 0.05) {
          // Rounded box: the hull of 8 corner spheres.
          const ball = s.t(M.sphere(rad, 32));
          const pts: Manifold[] = [];
          for (const x of [-1, 1]) for (const y of [-1, 1]) for (const z of [-1, 1]) pts.push(s.t(ball.translate([x * (w / 2 - rad), y * (d / 2 - rad), z * (h / 2 - rad) + h / 2])));
          r = M.hull(pts);
        } else r = M.cube([w, d, h], true).translate([0, 0, h / 2]);
        break;
      }
      case "cylinder":
        r = M.cylinder(num(o, "h", 20), num(o, "dia", 20) / 2, num(o, "dia", 20) / 2, Math.round(num(o, "seg", 64)));
        break;
      case "cone":
        r = M.cylinder(num(o, "h", 20), num(o, "dia", 20) / 2, Math.max(0, num(o, "top", 0) / 2), Math.round(num(o, "seg", 64)));
        break;
      case "sphere": {
        const rad = num(o, "dia", 20) / 2;
        r = M.sphere(rad, Math.round(num(o, "seg", 64))).translate([0, 0, rad]);
        break;
      }
      case "torus": {
        const tube = num(o, "tube", 6) / 2;
        const major = Math.max(tube + 0.01, num(o, "dia", 30) / 2 - tube);
        const circle = CS.circle(tube, Math.round(num(o, "seg", 64) / 2)).translate([major, 0]);
        r = M.revolve(circle, Math.round(num(o, "seg", 64))).translate([0, 0, tube]);
        circle.delete();
        break;
      }
      case "wedge": {
        const w = num(o, "w", 20);
        const d = num(o, "d", 20);
        const h = num(o, "h", 20);
        // Right-triangle profile in Y-Z, extruded along X.
        const tri = new CS([
          [0, 0],
          [d, 0],
          [0, h],
        ]);
        r = M.extrude(tri, w).rotate([90, 0, 90]).translate([-w / 2, -d / 2, 0]);
        tri.delete();
        break;
      }
      case "tube": {
        const rOut = num(o, "dia", 20) / 2;
        const rIn = Math.max(0.05, rOut - num(o, "wall", 2));
        if (rIn >= rOut) throw new ShapeError("wall");
        const seg = Math.round(num(o, "seg", 64));
        const outer = s.t(M.cylinder(num(o, "h", 20), rOut, rOut, seg));
        const inner = s.t(M.cylinder(num(o, "h", 20) + 2, rIn, rIn, seg).translate([0, 0, -1]));
        r = outer.subtract(inner);
        break;
      }
      case "text":
        r = textSolid(k, String(o.params.text ?? ""), num(o, "size", 10), num(o, "depth", 3));
        break;
      case "mesh": {
        if (!o.mesh) return null;
        const { v, i } = unpackMesh(o.mesh);
        const mesh = new k.wasm.Mesh({ numProp: 3, vertProperties: v, triVerts: i });
        mesh.merge();
        try {
          r = M.ofMesh(mesh);
        } catch {
          return s.done(null);
        }
        break;
      }
      case "group":
        r = groupSolid(k, o, s);
        break;
    }
    if (r) s.t(r);
    if (r && r.status() !== "NoError") return s.done(null);
    return s.done(r);
  } catch (e) {
    s.done(null);
    if (e instanceof ShapeError) return null;
    throw e;
  }
}

/** A child placed in its parent's coordinates. */
export function placed(k: Kernel, o: CadObject): Manifold | null {
  const m = solidOf(k, o);
  if (!m) return null;
  const r = m.transform(asMat(matrixOf(o)));
  m.delete();
  return r;
}

function groupSolid(k: Kernel, g: CadObject, s: Scope): Manifold | null {
  const { Manifold: M } = k.wasm;
  const kids = (g.children ?? []).filter((c) => !c.hidden);
  const solids = kids.filter((c) => !c.hole).map((c) => placed(k, c)).filter((m): m is Manifold => !!m).map((m) => s.t(m));
  const holes = kids.filter((c) => c.hole).map((c) => placed(k, c)).filter((m): m is Manifold => !!m).map((m) => s.t(m));
  if (!solids.length) return null;
  const op = g.op ?? "union";
  let body: Manifold;
  if (op === "intersect") body = solids.reduce((a, b) => s.t(a.intersect(b)));
  else if (op === "subtract") {
    // The first solid minus everything after it.
    const [first, ...rest] = solids;
    body = rest.length ? s.t(first.subtract(s.t(M.union(rest)))) : first;
  } else body = solids.length > 1 ? s.t(M.union(solids)) : solids[0];
  return holes.length ? body.subtract(s.t(M.union(holes))) : body.translate([0, 0, 0]);
}

/* ── Text ───────────────────────────────────────────────────────────── */

function textSolid(k: Kernel, text: string, size: number, depth: number): Manifold | null {
  if (!k.font || !text.trim()) return null;
  const path = k.font.getPath(text, 0, 0, size);
  const polys: [number, number][][] = [];
  let cur: [number, number][] = [];
  let x = 0;
  let y = 0;
  const STEPS = 8;
  // Font paths are y-down; flip to the bed's y-up.
  const push = (px: number, py: number) => cur.push([px, -py]);
  for (const c of path.commands) {
    if (c.type === "M") {
      if (cur.length > 2) polys.push(cur);
      cur = [];
      push(c.x, c.y);
      [x, y] = [c.x, c.y];
    } else if (c.type === "L") {
      push(c.x, c.y);
      [x, y] = [c.x, c.y];
    } else if (c.type === "Q") {
      for (let i = 1; i <= STEPS; i++) {
        const t = i / STEPS;
        const a = (1 - t) ** 2;
        const b = 2 * (1 - t) * t;
        push(a * x + b * c.x1 + t * t * c.x, a * y + b * c.y1 + t * t * c.y);
      }
      [x, y] = [c.x, c.y];
    } else if (c.type === "C") {
      for (let i = 1; i <= STEPS; i++) {
        const t = i / STEPS;
        const a = (1 - t) ** 3;
        const b = 3 * (1 - t) ** 2 * t;
        const cc = 3 * (1 - t) * t * t;
        const d = t ** 3;
        push(a * x + b * c.x1 + cc * c.x2 + d * c.x, a * y + b * c.y1 + cc * c.y2 + d * c.y);
      }
      [x, y] = [c.x, c.y];
    } else if (c.type === "Z") {
      if (cur.length > 2) polys.push(cur);
      cur = [];
    }
  }
  if (cur.length > 2) polys.push(cur);
  if (!polys.length) return null;
  const cs = new k.wasm.CrossSection(polys, "NonZero");
  const b = cs.bounds();
  // Centre the text on the origin, resting on the bed.
  const m = k.wasm.Manifold.extrude(cs, depth).translate([-(b.min[0] + b.max[0]) / 2, -(b.min[1] + b.max[1]) / 2, 0]);
  cs.delete();
  return m;
}

/* ── To three.js ────────────────────────────────────────────────────── */

export function toGeometry(m: Manifold): THREE.BufferGeometry {
  const mesh = m.getMesh();
  const g = new THREE.BufferGeometry();
  const pos = new Float32Array((mesh.triVerts.length) * 3);
  for (let t = 0; t < mesh.triVerts.length; t++) {
    const v = mesh.triVerts[t] * mesh.numProp;
    pos[t * 3] = mesh.vertProperties[v];
    pos[t * 3 + 1] = mesh.vertProperties[v + 1];
    pos[t * 3 + 2] = mesh.vertProperties[v + 2];
  }
  g.setAttribute("position", new THREE.BufferAttribute(pos, 3));
  // Smooth across gentle curves, sharp at real edges.
  const out = toCreasedNormals(g, Math.PI / 6);
  g.dispose();
  out.computeBoundingBox();
  return out;
}

/** Triangles of an imported file, merged into an indexed mesh. */
export function indexedFrom(g: THREE.BufferGeometry): { v: Float32Array; i: Uint32Array } {
  const src = g.getAttribute("position");
  const map = new Map<string, number>();
  const verts: number[] = [];
  const idx = new Uint32Array(src.count);
  for (let i = 0; i < src.count; i++) {
    const x = src.getX(i);
    const y = src.getY(i);
    const z = src.getZ(i);
    const key = `${Math.round(x * 1e4)},${Math.round(y * 1e4)},${Math.round(z * 1e4)}`;
    let n = map.get(key);
    if (n === undefined) {
      n = verts.length / 3;
      verts.push(x, y, z);
      map.set(key, n);
    }
    idx[i] = n;
  }
  return { v: new Float32Array(verts), i: idx };
}

/* ── Whole design ───────────────────────────────────────────────────── */

/** The printable solids: visible, non-hole top-level objects, each placed in the world. */
export function printables(k: Kernel, objects: CadObject[]): { obj: CadObject; solid: Manifold }[] {
  const out: { obj: CadObject; solid: Manifold }[] = [];
  for (const o of objects) {
    if (o.hidden || o.hole) continue;
    const m = placed(k, o);
    if (m) out.push({ obj: o, solid: m });
  }
  return out;
}

export type Stats = { volume: number; triangles: number; min: Vec3; max: Vec3; count: number; failed: string[] };
export function statsOf(k: Kernel, objects: CadObject[]): Stats {
  const list = printables(k, objects);
  const failed = objects.filter((o) => !o.hidden && !o.hole && !list.some((p) => p.obj === o)).map((o) => o.id);
  let volume = 0;
  let triangles = 0;
  const min: Vec3 = [Infinity, Infinity, Infinity];
  const max: Vec3 = [-Infinity, -Infinity, -Infinity];
  for (const { solid } of list) {
    volume += solid.volume();
    triangles += solid.numTri();
    const b = solid.boundingBox();
    for (let i = 0; i < 3; i++) {
      min[i] = Math.min(min[i], b.min[i]);
      max[i] = Math.max(max[i], b.max[i]);
    }
    solid.delete();
  }
  return { volume, triangles, min, max, count: list.length, failed };
}

/** Everything that would be printed, merged into one solid (overlaps fused). */
export function mergedSolid(k: Kernel, objects: CadObject[]): Manifold | null {
  const list = printables(k, objects).map((p) => p.solid);
  if (!list.length) return null;
  const m = list.length > 1 ? k.wasm.Manifold.union(list) : list[0];
  for (const x of list) if (x !== m) x.delete();
  return m;
}

/** Binary STL (millimetres), the format every slicer reads. */
export function toStl(m: Manifold): Uint8Array {
  const mesh = m.getMesh();
  const tris = mesh.triVerts.length / 3;
  const buf = new ArrayBuffer(84 + tris * 50);
  const dv = new DataView(buf);
  const head = "BuildX Lab 3D Studio - binary STL, millimetres";
  for (let i = 0; i < head.length; i++) dv.setUint8(i, head.charCodeAt(i));
  dv.setUint32(80, tris, true);
  const p = (t: number, c: number) => {
    const v = mesh.triVerts[t * 3 + c] * mesh.numProp;
    return new THREE.Vector3(mesh.vertProperties[v], mesh.vertProperties[v + 1], mesh.vertProperties[v + 2]);
  };
  for (let t = 0; t < tris; t++) {
    const a = p(t, 0);
    const b = p(t, 1);
    const c = p(t, 2);
    const n = new THREE.Vector3().subVectors(b, a).cross(new THREE.Vector3().subVectors(c, a)).normalize();
    let o = 84 + t * 50;
    for (const v of [n, a, b, c]) {
      dv.setFloat32(o, v.x, true);
      dv.setFloat32(o + 4, v.y, true);
      dv.setFloat32(o + 8, v.z, true);
      o += 12;
    }
    dv.setUint16(o, 0, true);
  }
  return new Uint8Array(buf);
}

/** Wavefront OBJ, one object per solid. */
export function toObj(k: Kernel, objects: CadObject[]): string {
  const lines = ["# BuildX Lab 3D Studio - units: millimetres"];
  let base = 1;
  for (const { obj, solid } of printables(k, objects)) {
    const mesh = solid.getMesh();
    lines.push(`o ${obj.name.replace(/\s+/g, "_") || obj.id}`);
    for (let i = 0; i < mesh.vertProperties.length; i += mesh.numProp) lines.push(`v ${mesh.vertProperties[i]} ${mesh.vertProperties[i + 1]} ${mesh.vertProperties[i + 2]}`);
    for (let t = 0; t < mesh.triVerts.length; t += 3) lines.push(`f ${mesh.triVerts[t] + base} ${mesh.triVerts[t + 1] + base} ${mesh.triVerts[t + 2] + base}`);
    base += mesh.vertProperties.length / mesh.numProp;
    solid.delete();
  }
  return lines.join("\n") + "\n";
}
