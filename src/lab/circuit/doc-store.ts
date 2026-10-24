"use client";
/**
 * The open circuit: its document, an undo/redo history of up to 200 steps, and the selection.
 * Each edit replaces the document (immutable), so a step is just the previous object. Rapid edits
 * of the same kind (dragging, typing a value) merge into one step.
 */
import { useSyncExternalStore } from "react";
import { DEFAULT_SETTINGS, GRID, uid, type CanvasSettings, type CircuitDoc, type PartInstance, type Rot, type Wire } from "./model";
import { PART_BY_TYPE, worldBox, worldPins } from "./parts";

export type Selection = { parts: string[]; wires: string[] };

export class DocStore {
  private doc: CircuitDoc;
  private past: CircuitDoc[] = [];
  private future: CircuitDoc[] = [];
  private lastTag = "";
  private lastAt = 0;
  private subs = new Set<() => void>();
  selection: Selection = { parts: [], wires: [] };
  /** Bumped on every change to the document (autosave watches it). */
  version = 0;
  private snapshot: { doc: CircuitDoc; sel: Selection; v: number; canUndo: boolean; canRedo: boolean };

  constructor(doc: CircuitDoc) {
    this.doc = doc;
    this.snapshot = this.snap();
  }
  private snap() {
    return { doc: this.doc, sel: this.selection, v: this.version, canUndo: this.past.length > 0, canRedo: this.future.length > 0 };
  }
  private emit() {
    this.snapshot = this.snap();
    this.subs.forEach((s) => s());
  }
  subscribe = (fn: () => void) => {
    this.subs.add(fn);
    return () => void this.subs.delete(fn);
  };
  get = () => this.snapshot;
  get current() {
    return this.doc;
  }

  /** Apply an edit. `tag`: edits with the same tag within 600 ms are one undo step. */
  update(fn: (d: CircuitDoc) => CircuitDoc, tag = "") {
    const next = fn(this.doc);
    if (next === this.doc) return;
    const now = Date.now();
    // One drag (or one knob turn) is one undo step however long it takes.
    const same = tag && tag === this.lastTag && (tag.startsWith("drag:") || now - this.lastAt < 600);
    if (!same) {
      this.past.push(this.doc);
      if (this.past.length > 200) this.past.shift();
    }
    this.lastTag = tag;
    this.lastAt = now;
    this.future = [];
    this.doc = next;
    this.version++;
    this.pruneSelection();
    this.emit();
  }
  /** Replace without history (loading, restoring a version). */
  reset(doc: CircuitDoc) {
    this.doc = doc;
    this.past = [];
    this.future = [];
    this.selection = { parts: [], wires: [] };
    this.version++;
    this.emit();
  }
  undo() {
    const prev = this.past.pop();
    if (!prev) return;
    this.future.push(this.doc);
    this.doc = prev;
    this.lastTag = "";
    this.version++;
    this.pruneSelection();
    this.emit();
  }
  redo() {
    const next = this.future.pop();
    if (!next) return;
    this.past.push(this.doc);
    this.doc = next;
    this.lastTag = "";
    this.version++;
    this.pruneSelection();
    this.emit();
  }
  select(sel: Selection) {
    this.selection = sel;
    this.emit();
  }
  private pruneSelection() {
    const parts = new Set(this.doc.parts.map((p) => p.id));
    const wires = new Set(this.doc.wires.map((w) => w.id));
    this.selection = { parts: this.selection.parts.filter((p) => parts.has(p)), wires: this.selection.wires.filter((w) => wires.has(w)) };
  }

  /* ── Edits ─────────────────────────────────────────────────────────── */

  addPart(type: string, x: number, y: number) {
    const def = PART_BY_TYPE.get(type);
    if (!def) return null;
    const p: PartInstance = { id: uid(type.replace(/[^a-z]/g, "").slice(0, 4)), type, x: snap(x), y: snap(y), rot: 0, props: { ...def.defaults } };
    this.update((d) => ({ ...d, parts: [...d.parts, p] }));
    this.select({ parts: [p.id], wires: [] });
    return p;
  }
  private unlocked(ids: string[]) {
    const locked = new Set(this.doc.parts.filter((p) => p.locked).map((p) => p.id));
    return ids.filter((id) => !locked.has(id));
  }
  moveParts(ids: string[], dx: number, dy: number, tag = "move") {
    ids = this.unlocked(ids);
    if ((!dx && !dy) || !ids.length) return;
    const set = new Set(ids);
    this.update((d) => ({
      ...d,
      parts: d.parts.map((p) => (set.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
      // Bends of wires between two moved parts move with them.
      wires: d.wires.map((w) => (set.has(w.a.part) && set.has(w.b.part) ? { ...w, pts: w.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) } : w)),
    }), tag);
  }
  /** Rotate by 90° clockwise (or counter-clockwise), each part about its own origin. */
  rotate(ids: string[], ccw = false) {
    const set = new Set(this.unlocked(ids));
    if (!set.size) return;
    this.update((d) => ({ ...d, parts: d.parts.map((p) => (set.has(p.id) ? { ...p, rot: (((p.rot + (ccw ? 270 : 90)) % 360) as Rot) } : p)) }));
  }
  setProp(id: string, key: string, value: string | number | boolean) {
    this.update((d) => ({ ...d, parts: d.parts.map((p) => (p.id === id ? { ...p, props: { ...p.props, [key]: value } } : p)) }), `prop:${id}:${key}`);
  }
  setPart(id: string, patch: Partial<Pick<PartInstance, "locked" | "label">>, tag = "") {
    this.update((d) => ({ ...d, parts: d.parts.map((p) => (p.id === id ? { ...p, ...patch } : p)) }), tag);
  }
  setLocked(ids: string[], locked: boolean) {
    const set = new Set(ids);
    this.update((d) => ({ ...d, parts: d.parts.map((p) => (set.has(p.id) ? { ...p, locked } : p)) }));
  }
  /** Draw order: later parts are drawn on top (within boards / breadboards / components). */
  reorder(ids: string[], where: "front" | "back") {
    const set = new Set(ids);
    this.update((d) => {
      const moved = d.parts.filter((p) => set.has(p.id));
      const rest = d.parts.filter((p) => !set.has(p.id));
      return { ...d, parts: where === "front" ? [...rest, ...moved] : [...moved, ...rest] };
    });
  }
  /** Line up the selected parts' boxes, or spread them evenly (3 or more). */
  align(ids: string[], how: "left" | "centerX" | "right" | "top" | "centerY" | "bottom" | "distributeX" | "distributeY") {
    const parts = this.doc.parts.filter((p) => ids.includes(p.id) && !p.locked);
    if (parts.length < 2) return;
    const boxes = new Map(parts.map((p) => [p.id, worldBox(p)]));
    const B = [...boxes.values()];
    const minX = Math.min(...B.map((b) => b.x));
    const maxX = Math.max(...B.map((b) => b.x + b.w));
    const minY = Math.min(...B.map((b) => b.y));
    const maxY = Math.max(...B.map((b) => b.y + b.h));
    const delta = new Map<string, [number, number]>();
    if (how.startsWith("distribute")) {
      if (parts.length < 3) return;
      const horiz = how === "distributeX";
      const sorted = [...parts].sort((a, b) => (horiz ? boxes.get(a.id)!.x - boxes.get(b.id)!.x : boxes.get(a.id)!.y - boxes.get(b.id)!.y));
      const total = sorted.reduce((n, p) => n + (horiz ? boxes.get(p.id)!.w : boxes.get(p.id)!.h), 0);
      const gap = ((horiz ? maxX - minX : maxY - minY) - total) / (sorted.length - 1);
      let at = horiz ? minX : minY;
      for (const p of sorted) {
        const b = boxes.get(p.id)!;
        delta.set(p.id, horiz ? [at - b.x, 0] : [0, at - b.y]);
        at += (horiz ? b.w : b.h) + gap;
      }
    } else
      for (const p of parts) {
        const b = boxes.get(p.id)!;
        const d: [number, number] =
          how === "left" ? [minX - b.x, 0] : how === "right" ? [maxX - (b.x + b.w), 0] : how === "centerX" ? [(minX + maxX) / 2 - (b.x + b.w / 2), 0]
          : how === "top" ? [0, minY - b.y] : how === "bottom" ? [0, maxY - (b.y + b.h)] : [0, (minY + maxY) / 2 - (b.y + b.h / 2)];
        delta.set(p.id, d);
      }
    this.update((d) => ({ ...d, parts: d.parts.map((p) => (delta.has(p.id) ? { ...p, x: snap(p.x + delta.get(p.id)![0]), y: snap(p.y + delta.get(p.id)![1]) } : p)) }));
  }
  addWire(a: Wire["a"], b: Wire["b"], pts: [number, number][], color: string) {
    if (a.part === b.part && a.pin === b.pin) return null;
    const w: Wire = { id: uid("w"), a, b, pts, color };
    this.update((d) => ({ ...d, wires: [...d.wires, w] }));
    return w;
  }
  setWire(id: string, patch: Partial<Wire>, tag = "") {
    this.update((d) => ({ ...d, wires: d.wires.map((w) => (w.id === id ? { ...w, ...patch } : w)) }), tag);
  }
  /** Delete the selection; locked parts stay (and keep their wires). */
  deleteSelection() {
    const parts = this.unlocked(this.selection.parts);
    const { wires } = this.selection;
    if (!parts.length && !wires.length) return;
    const ps = new Set(parts);
    const ws = new Set(wires);
    this.update((d) => ({ ...d, parts: d.parts.filter((p) => !ps.has(p.id)), wires: d.wires.filter((w) => !ws.has(w.id) && !ps.has(w.a.part) && !ps.has(w.b.part)) }));
    this.select({ parts: [], wires: [] });
  }
  selectAll() {
    this.select({ parts: this.doc.parts.map((p) => p.id), wires: this.doc.wires.map((w) => w.id) });
  }
  /** Copy the selected parts (and wires between them), offset by two grid steps. */
  duplicate(ids = this.selection.parts) {
    const clip = this.copy(ids);
    if (clip) this.paste(clip, 2 * GRID);
  }
  /** The selected parts and the wires among them, as a clipboard payload. */
  copy(ids = this.selection.parts): Clipboard | null {
    const set = new Set(ids);
    const parts = this.doc.parts.filter((p) => set.has(p.id));
    if (!parts.length) return null;
    return { kind: "buildx-lab-parts", parts: structuredClone(parts), wires: structuredClone(this.doc.wires.filter((w) => set.has(w.a.part) && set.has(w.b.part))) };
  }
  /** Add a copy of the clipboard, moved by (dx, dy); the copy becomes the selection. */
  paste(clip: Clipboard, dx = 2 * GRID, dy = dx) {
    const map = new Map<string, string>();
    const parts = clip.parts
      .filter((p) => PART_BY_TYPE.has(p.type))
      .map((p) => {
        const id = uid(p.type.replace(/[^a-z]/g, "").slice(0, 4));
        map.set(p.id, id);
        return { ...p, id, x: p.x + dx, y: p.y + dy, locked: false, props: { ...p.props } };
      });
    if (!parts.length) return;
    const wires = clip.wires
      .filter((w) => map.has(w.a.part) && map.has(w.b.part))
      .map((w) => ({ ...w, id: uid("w"), a: { ...w.a, part: map.get(w.a.part)! }, b: { ...w.b, part: map.get(w.b.part)! }, pts: w.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) }));
    this.update((d) => ({ ...d, parts: [...d.parts, ...parts], wires: [...d.wires, ...wires] }));
    this.select({ parts: parts.map((p) => p.id), wires: wires.map((w) => w.id) });
  }
  setFiles(files: CircuitDoc["files"], tag = "code") {
    this.update((d) => ({ ...d, files }), tag);
  }
  setSettings(patch: Partial<CanvasSettings>) {
    this.update((d) => ({ ...d, settings: { ...d.settings, ...patch } }), "settings");
  }
}

export type Clipboard = { kind: "buildx-lab-parts"; parts: PartInstance[]; wires: Wire[] };
export const isClipboard = (x: unknown): x is Clipboard => !!x && typeof x === "object" && (x as Clipboard).kind === "buildx-lab-parts" && Array.isArray((x as Clipboard).parts) && Array.isArray((x as Clipboard).wires);
export const settingsOf = (d: CircuitDoc): CanvasSettings => ({ ...DEFAULT_SETTINGS, ...d.settings });

export const snap = (v: number) => Math.round(v / GRID) * GRID;

export function useDoc(store: DocStore) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}

/** All pins on the canvas with their positions (for hit testing and drawing wires). */
export function pinIndex(doc: CircuitDoc) {
  const map = new Map<string, { part: string; pin: string; x: number; y: number }>();
  for (const p of doc.parts) for (const q of worldPins(p)) map.set(`${p.id}:${q.name}`, { part: p.id, pin: q.name, x: q.x, y: q.y });
  return map;
}
