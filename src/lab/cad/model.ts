/**
 * A 3D Studio design, as saved in a project: solids and holes in millimetres, Z up (like a printer
 * bed). Shapes are kept as parameters (a 20 mm cube stays a 20 mm cube), so the design stays editable
 * and is rebuilt exactly by the geometry kernel (Manifold) for display, booleans and export.
 */

export type Vec3 = [number, number, number];

export type ShapeKind = "box" | "cylinder" | "cone" | "sphere" | "torus" | "wedge" | "tube" | "text" | "mesh" | "group";
export type GroupOp = "union" | "subtract" | "intersect";

export type CadObject = {
  id: string;
  name: string;
  kind: ShapeKind;
  /** Shape parameters (mm), by kind: see SHAPES. */
  params: Record<string, number | string>;
  position: Vec3;
  /** Degrees, applied about X, then Y, then Z (world axes). */
  rotation: Vec3;
  scale: Vec3;
  color: string;
  /** Holes cut the solids they're grouped with; on their own they're shown but never exported. */
  hole?: boolean;
  hidden?: boolean;
  locked?: boolean;
  /** Groups: the operation and the members, whose transforms are relative to the group. */
  op?: GroupOp;
  children?: CadObject[];
  /** Imported meshes: vertex positions and triangle indices, base64 (Float32 / Uint32, little-endian). */
  mesh?: { v: string; i: string };
};

export type Printer = { id: string; name: string; bed: Vec3 };
/** Build volumes from the manufacturers' specifications (mm). */
export const PRINTERS: Printer[] = [
  { id: "neptune3plus", name: "Elegoo Neptune 3 Plus", bed: [320, 320, 400] },
  { id: "neptune4pro", name: "Elegoo Neptune 4 Pro", bed: [225, 225, 265] },
  { id: "ender3v2", name: "Creality Ender-3 V2", bed: [220, 220, 250] },
  { id: "prusamk4", name: "Prusa MK4", bed: [250, 210, 220] },
  { id: "bambua1", name: "Bambu Lab A1", bed: [256, 256, 256] },
];

export type CadSettings = { printer: string; snap: number; angleSnap: number };
export const DEFAULT_CAD_SETTINGS: CadSettings = { printer: "neptune3plus", snap: 1, angleSnap: 15 };

export type CadDoc = { v: 1; type: "cad"; objects: CadObject[]; settings?: Partial<CadSettings> };

export const emptyCad = (): CadDoc => ({ v: 1, type: "cad", objects: [] });
export const cadSettings = (d: CadDoc): CadSettings => ({ ...DEFAULT_CAD_SETTINGS, ...d.settings });
export const printerOf = (d: CadDoc) => PRINTERS.find((p) => p.id === cadSettings(d).printer) ?? PRINTERS[0];

type L = { en: string; ar: string };
export type ParamDef = { key: string; label: L; min?: number; max?: number; step?: number; text?: boolean };
const mm = (key: string, en: string, ar: string, min = 0.1, max = 1000): ParamDef => ({ key, label: { en, ar }, min, max, step: 0.5 });

/** Every shape: its parameters and defaults. Sizes are the outer dimensions in mm. */
export const SHAPES: Record<Exclude<ShapeKind, "group" | "mesh">, { name: L; params: ParamDef[]; defaults: Record<string, number | string> }> = {
  box: { name: { en: "Box", ar: "مكعب" }, params: [mm("w", "Width (X)", "العرض (X)"), mm("d", "Depth (Y)", "العمق (Y)"), mm("h", "Height (Z)", "الارتفاع (Z)"), { key: "r", label: { en: "Edge radius", ar: "تدوير الحواف" }, min: 0, max: 100, step: 0.5 }], defaults: { w: 20, d: 20, h: 20, r: 0 } },
  cylinder: { name: { en: "Cylinder", ar: "أسطوانة" }, params: [mm("dia", "Diameter", "القطر"), mm("h", "Height", "الارتفاع"), { key: "seg", label: { en: "Sides", ar: "عدد الأضلاع" }, min: 3, max: 256, step: 1 }], defaults: { dia: 20, h: 20, seg: 64 } },
  cone: { name: { en: "Cone", ar: "مخروط" }, params: [mm("dia", "Base diameter", "قطر القاعدة"), { ...mm("top", "Top diameter", "قطر القمة"), min: 0 }, mm("h", "Height", "الارتفاع"), { key: "seg", label: { en: "Sides", ar: "عدد الأضلاع" }, min: 3, max: 256, step: 1 }], defaults: { dia: 20, top: 0, h: 20, seg: 64 } },
  sphere: { name: { en: "Sphere", ar: "كرة" }, params: [mm("dia", "Diameter", "القطر"), { key: "seg", label: { en: "Smoothness", ar: "النعومة" }, min: 8, max: 256, step: 4 }], defaults: { dia: 20, seg: 64 } },
  torus: { name: { en: "Torus", ar: "حلقة" }, params: [mm("dia", "Outer diameter", "القطر الخارجي"), mm("tube", "Tube diameter", "سُمك الحلقة"), { key: "seg", label: { en: "Smoothness", ar: "النعومة" }, min: 8, max: 256, step: 4 }], defaults: { dia: 30, tube: 6, seg: 64 } },
  wedge: { name: { en: "Wedge", ar: "إسفين" }, params: [mm("w", "Width (X)", "العرض (X)"), mm("d", "Depth (Y)", "العمق (Y)"), mm("h", "Height (Z)", "الارتفاع (Z)")], defaults: { w: 20, d: 20, h: 20 } },
  tube: { name: { en: "Tube", ar: "ماسورة" }, params: [mm("dia", "Outer diameter", "القطر الخارجي"), mm("wall", "Wall", "سُمك الجدار"), mm("h", "Height", "الارتفاع"), { key: "seg", label: { en: "Sides", ar: "عدد الأضلاع" }, min: 3, max: 256, step: 1 }], defaults: { dia: 20, wall: 2, h: 20, seg: 64 } },
  text: { name: { en: "Text", ar: "نص" }, params: [{ key: "text", label: { en: "Text (Latin letters and digits)", ar: "النص (حروف إنجليزي وأرقام)" }, text: true }, mm("size", "Letter height", "ارتفاع الحرف", 1, 300), mm("depth", "Depth", "العمق", 0.2, 200)], defaults: { text: "BuildX", size: 10, depth: 3 } },
};

export const COLORS = ["#3e8bff", "#ff7a45", "#34c759", "#ffd60a", "#bf5af2", "#ff375f", "#64d2ff", "#e5e5ea", "#2c2c2e"];

let seq = 0;
export const cadId = () => `o${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

export function newShape(kind: keyof typeof SHAPES, at: Vec3 = [0, 0, 0], color = COLORS[0]): CadObject {
  return { id: cadId(), name: SHAPES[kind].name.en, kind, params: { ...SHAPES[kind].defaults }, position: at, rotation: [0, 0, 0], scale: [1, 1, 1], color };
}

const vec3 = (v: unknown) => Array.isArray(v) && v.length === 3 && v.every((x) => Number.isFinite(x));
function validObject(o: unknown, depth = 0): boolean {
  if (!o || typeof o !== "object" || depth > 16) return false;
  const x = o as CadObject;
  if (typeof x.id !== "string" || typeof x.kind !== "string" || !vec3(x.position) || !vec3(x.rotation) || !vec3(x.scale) || !x.params || typeof x.params !== "object") return false;
  if (x.kind === "group") return Array.isArray(x.children) && x.children.every((c) => validObject(c, depth + 1));
  if (x.kind === "mesh") return !!x.mesh && typeof x.mesh.v === "string" && typeof x.mesh.i === "string";
  return x.kind in SHAPES;
}

/** Structural check for data from storage or an imported file. */
export function validCad(d: unknown): d is CadDoc {
  if (!d || typeof d !== "object") return false;
  const x = d as CadDoc;
  return x.v === 1 && x.type === "cad" && Array.isArray(x.objects) && x.objects.every((o) => validObject(o));
}

/* ── Packing imported meshes ─────────────────────────────────────────── */

const toB64 = (u: Uint8Array) => {
  let s = "";
  for (let i = 0; i < u.length; i += 0x8000) s += String.fromCharCode(...u.subarray(i, i + 0x8000));
  return btoa(s);
};
const fromB64 = (s: string) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
export const packMesh = (v: Float32Array, i: Uint32Array) => ({ v: toB64(new Uint8Array(v.buffer, v.byteOffset, v.byteLength)), i: toB64(new Uint8Array(i.buffer, i.byteOffset, i.byteLength)) });
export function unpackMesh(m: { v: string; i: string }) {
  const vb = fromB64(m.v);
  const ib = fromB64(m.i);
  return { v: new Float32Array(vb.buffer, vb.byteOffset, vb.byteLength / 4), i: new Uint32Array(ib.buffer, ib.byteOffset, ib.byteLength / 4) };
}
/** Imports above this are refused: the project would get too big to save. */
export const MAX_IMPORT_TRIANGLES = 60_000;
