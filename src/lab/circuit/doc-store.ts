"use client";
/**
 * The open circuit: its document, an undo/redo history of up to 200 steps, and the selection.
 * Each edit replaces the document (immutable), so a step is just the previous object. Rapid edits
 * of the same kind (dragging, typing a value) merge into one step.
 */
import { useSyncExternalStore } from "react";
import { GRID, uid, type CircuitDoc, type PartInstance, type Rot, type Wire } from "./model";
import { PART_BY_TYPE, worldPins } from "./parts";

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
    if (!(tag && tag === this.lastTag && now - this.lastAt < 600)) {
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
  moveParts(ids: string[], dx: number, dy: number, tag = "move") {
    if (!dx && !dy) return;
    const set = new Set(ids);
    this.update((d) => ({
      ...d,
      parts: d.parts.map((p) => (set.has(p.id) ? { ...p, x: p.x + dx, y: p.y + dy } : p)),
      // Bends of wires between two moved parts move with them.
      wires: d.wires.map((w) => (set.has(w.a.part) && set.has(w.b.part) ? { ...w, pts: w.pts.map(([x, y]) => [x + dx, y + dy] as [number, number]) } : w)),
    }), tag);
  }
  rotate(ids: string[]) {
    const set = new Set(ids);
    this.update((d) => ({ ...d, parts: d.parts.map((p) => (set.has(p.id) ? { ...p, rot: (((p.rot + 90) % 360) as Rot) } : p)) }));
  }
  setProp(id: string, key: string, value: string | number | boolean) {
    this.update((d) => ({ ...d, parts: d.parts.map((p) => (p.id === id ? { ...p, props: { ...p.props, [key]: value } } : p)) }), `prop:${id}:${key}`);
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
  deleteSelection() {
    const { parts, wires } = this.selection;
    if (!parts.length && !wires.length) return;
    const ps = new Set(parts);
    const ws = new Set(wires);
    this.update((d) => ({ ...d, parts: d.parts.filter((p) => !ps.has(p.id)), wires: d.wires.filter((w) => !ws.has(w.id) && !ps.has(w.a.part) && !ps.has(w.b.part)) }));
    this.select({ parts: [], wires: [] });
  }
  /** Copy the selected parts (and wires between them), offset by two grid steps. */
  duplicate(ids = this.selection.parts) {
    const map = new Map<string, string>();
    const src = this.doc.parts.filter((p) => ids.includes(p.id));
    if (!src.length) return;
    const parts = src.map((p) => {
      const id = uid(p.type.replace(/[^a-z]/g, "").slice(0, 4));
      map.set(p.id, id);
      return { ...p, id, x: p.x + 2 * GRID, y: p.y + 2 * GRID, props: { ...p.props } };
    });
    const wires = this.doc.wires
      .filter((w) => map.has(w.a.part) && map.has(w.b.part))
      .map((w) => ({ ...w, id: uid("w"), a: { ...w.a, part: map.get(w.a.part)! }, b: { ...w.b, part: map.get(w.b.part)! }, pts: w.pts.map(([x, y]) => [x + 2 * GRID, y + 2 * GRID] as [number, number]) }));
    this.update((d) => ({ ...d, parts: [...d.parts, ...parts], wires: [...d.wires, ...wires] }));
    this.select({ parts: parts.map((p) => p.id), wires: wires.map((w) => w.id) });
  }
  setFiles(files: CircuitDoc["files"], tag = "code") {
    this.update((d) => ({ ...d, files }), tag);
  }
}

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
