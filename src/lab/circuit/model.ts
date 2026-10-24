/**
 * A circuit as saved in a project: parts placed on a 0.1-inch grid (10 units = 2.54 mm), wires between
 * pins, and the sketch that runs on the board. Rendering, the netlist and the simulator all read this.
 */
import type { SourceFile } from "../compiler/sketch";

export const GRID = 10;

export type Rot = 0 | 90 | 180 | 270;
export type PartInstance = {
  id: string;
  type: string;
  x: number;
  y: number;
  rot: Rot;
  props: Record<string, string | number | boolean>;
  /** Can't be moved, rotated or deleted on the canvas until unlocked. */
  locked?: boolean;
  /** A note shown above the part (e.g. "status LED"). */
  label?: string;
};
export type PinRef = { part: string; pin: string };
export type Wire = { id: string; a: PinRef; b: PinRef; pts: [number, number][]; color: string; label?: string };
/** Canvas preferences saved with the project. */
export type CanvasSettings = { grid: number; showGrid: boolean; snap: boolean; routing: "ortho" | "free"; background: "dots" | "lines" | "plain" };
export const DEFAULT_SETTINGS: CanvasSettings = { grid: 10, showGrid: true, snap: true, routing: "ortho", background: "dots" };
export type CircuitDoc = {
  v: 1;
  parts: PartInstance[];
  wires: Wire[];
  files: SourceFile[];
  main: string;
  /** For block projects: the Blockly workspace the sketch is generated from. */
  blocks?: unknown;
  view?: { x: number; y: number; zoom: number };
  settings?: Partial<CanvasSettings>;
  /** The board the sketch is compiled for. */
  board?: "uno" | "nano";
};

export const WIRE_COLORS = ["#e5484d", "#2b2b2b", "#3e63dd", "#30a46c", "#f5d90a", "#f76b15", "#ffffff", "#8e4ec6", "#0091ff", "#ad7f58"];

export const emptyDoc = (): CircuitDoc => ({ v: 1, parts: [], wires: [], files: [{ name: "sketch.ino", text: "void setup() {\n\n}\n\nvoid loop() {\n\n}\n" }], main: "sketch.ino" });

let seq = 0;
export const uid = (p = "p") => `${p}${Date.now().toString(36)}${(seq++).toString(36)}${Math.random().toString(36).slice(2, 5)}`;

/** Light structural check of data coming from storage or an imported file. */
export function validDoc(d: unknown): d is CircuitDoc {
  if (!d || typeof d !== "object") return false;
  const x = d as CircuitDoc;
  return (
    x.v === 1 &&
    Array.isArray(x.parts) &&
    Array.isArray(x.wires) &&
    Array.isArray(x.files) &&
    x.parts.every((p) => p && typeof p.id === "string" && typeof p.type === "string" && Number.isFinite(p.x) && Number.isFinite(p.y)) &&
    x.wires.every((w) => w && typeof w.id === "string" && w.a && w.b && Array.isArray(w.pts)) &&
    x.files.every((f) => f && typeof f.name === "string" && typeof f.text === "string")
  );
}
