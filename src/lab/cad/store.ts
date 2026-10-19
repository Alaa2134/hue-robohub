/** The 3D Studio's document with undo/redo and selection, in the same shape as the circuit DocStore. */
import { useSyncExternalStore } from "react";
import * as THREE from "three";
import { fromMatrix, matrixOf } from "./geometry";
import { cadId, emptyCad, type CadDoc, type CadObject, type CadSettings, type GroupOp, type Vec3 } from "./model";

const LIMIT = 200;
const MERGE_MS = 600;

export class CadStore {
  doc: CadDoc;
  selection: string[] = [];
  version = 0;
  private past: CadDoc[] = [];
  private future: CadDoc[] = [];
  private lastTag = "";
  private lastAt = 0;
  private subs = new Set<() => void>();
  private snapshot: { doc: CadDoc; sel: string[]; v: number; canUndo: boolean; canRedo: boolean };

  constructor(doc: CadDoc = emptyCad()) {
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

  reset(doc: CadDoc) {
    this.doc = doc;
    this.past = [];
    this.future = [];
    this.selection = [];
    this.emit();
  }
  /** Change the document; edits with the same tag in quick succession (a drag, typing) undo as one. */
  update(fn: (d: CadDoc) => CadDoc, tag = "") {
    const now = Date.now();
    const merge = tag && tag === this.lastTag && (tag.startsWith("drag:") || now - this.lastAt < MERGE_MS);
    if (!merge) {
      this.past.push(this.doc);
      if (this.past.length > LIMIT) this.past.shift();
    }
    this.future = [];
    this.lastTag = tag;
    this.lastAt = now;
    this.doc = fn(this.doc);
    this.version++;
    this.prune();
    this.emit();
  }
  /** Ends a drag so the next one is its own undo step. */
  endDrag() {
    this.lastTag = "";
  }
  undo() {
    const d = this.past.pop();
    if (!d) return;
    this.future.push(this.doc);
    this.doc = d;
    this.version++;
    this.lastTag = "";
    this.prune();
    this.emit();
  }
  redo() {
    const d = this.future.pop();
    if (!d) return;
    this.past.push(this.doc);
    this.doc = d;
    this.version++;
    this.lastTag = "";
    this.prune();
    this.emit();
  }
  private prune() {
    const ids = new Set(this.doc.objects.map((o) => o.id));
    this.selection = this.selection.filter((id) => ids.has(id));
  }
  select(ids: string[]) {
    this.selection = ids;
    this.emit();
  }
  get selected() {
    return this.doc.objects.filter((o) => this.selection.includes(o.id));
  }
  private editable(ids = this.selection) {
    return ids.filter((id) => !this.doc.objects.find((o) => o.id === id)?.locked);
  }

  /* ── Edits ────────────────────────────────────────────────────────── */

  add(o: CadObject) {
    this.update((d) => ({ ...d, objects: [...d.objects, o] }));
    this.select([o.id]);
  }
  set(id: string, patch: Partial<CadObject>, tag = "") {
    this.update((d) => ({ ...d, objects: d.objects.map((o) => (o.id === id ? { ...o, ...patch } : o)) }), tag);
  }
  setParam(id: string, key: string, value: number | string) {
    this.update((d) => ({ ...d, objects: d.objects.map((o) => (o.id === id ? { ...o, params: { ...o.params, [key]: value } } : o)) }), `param:${id}:${key}`);
  }
  setSettings(patch: Partial<CadSettings>) {
    this.update((d) => ({ ...d, settings: { ...d.settings, ...patch } }), "settings");
  }
  remove(ids = this.selection) {
    const set = new Set(this.editable(ids));
    if (!set.size) return;
    this.update((d) => ({ ...d, objects: d.objects.filter((o) => !set.has(o.id)) }));
    this.select([]);
  }
  duplicate(ids = this.selection, offset: Vec3 = [10, 10, 0]) {
    const copies = this.doc.objects.filter((o) => ids.includes(o.id)).map((o) => reId({ ...structuredClone(o), name: o.name, locked: false, position: [o.position[0] + offset[0], o.position[1] + offset[1], o.position[2] + offset[2]] as Vec3 }));
    if (!copies.length) return;
    this.update((d) => ({ ...d, objects: [...d.objects, ...copies] }));
    this.select(copies.map((c) => c.id));
  }
  /** Combine the selection into one group (its members keep their places). */
  group(op: GroupOp, ids = this.selection) {
    // For "subtract", the first selected object is the one cut.
    const members = ids.map((id) => this.doc.objects.find((o) => o.id === id)).filter((o): o is CadObject => !!o && !o.locked);
    if (members.length < 2) return;
    const g: CadObject = { id: cadId(), name: op === "union" ? "Group" : op === "subtract" ? "Difference" : "Intersection", kind: "group", op, children: members, params: {}, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: members.find((m) => !m.hole)?.color ?? members[0].color };
    const set = new Set(members.map((m) => m.id));
    this.update((d) => {
      const at = d.objects.findIndex((o) => set.has(o.id));
      const rest = d.objects.filter((o) => !set.has(o.id));
      rest.splice(Math.min(at, rest.length), 0, g);
      return { ...d, objects: rest };
    });
    this.select([g.id]);
  }
  /** Split groups back into their members, in their current places. */
  ungroup(ids = this.selection) {
    const groups = this.doc.objects.filter((o) => ids.includes(o.id) && o.kind === "group" && !o.locked);
    if (!groups.length) return;
    const out: string[] = [];
    this.update((d) => ({
      ...d,
      objects: d.objects.flatMap((o) => {
        if (!groups.includes(o)) return [o];
        const gm = matrixOf(o);
        return (o.children ?? []).map((c) => {
          const m = gm.clone().multiply(matrixOf(c));
          out.push(c.id);
          return { ...c, ...fromMatrix(m) };
        });
      }),
    }));
    this.select(out);
  }
  /** Mirror across the object's own centre plane. */
  mirror(axis: 0 | 1 | 2, ids = this.selection) {
    const set = new Set(this.editable(ids));
    this.update((d) => ({ ...d, objects: d.objects.map((o) => (set.has(o.id) ? { ...o, scale: o.scale.map((s, i) => (i === axis ? -s : s)) as Vec3 } : o)) }));
  }
  /** Move objects so their bounding boxes line up (boxes measured by the caller, in world mm). */
  align(boxes: Map<string, THREE.Box3>, axis: 0 | 1 | 2, where: "min" | "center" | "max") {
    const ids = this.editable().filter((id) => boxes.has(id));
    if (ids.length < 2) return;
    const B = ids.map((id) => boxes.get(id)!);
    const k = (["x", "y", "z"] as const)[axis];
    const target = where === "min" ? Math.min(...B.map((b) => b.min[k])) : where === "max" ? Math.max(...B.map((b) => b.max[k])) : (Math.min(...B.map((b) => b.min[k])) + Math.max(...B.map((b) => b.max[k]))) / 2;
    this.update((d) => ({
      ...d,
      objects: d.objects.map((o) => {
        const b = boxes.get(o.id);
        if (!b || !ids.includes(o.id)) return o;
        const cur = where === "min" ? b.min[k] : where === "max" ? b.max[k] : (b.min[k] + b.max[k]) / 2;
        const p = [...o.position] as Vec3;
        p[axis] = round(p[axis] + target - cur);
        return { ...o, position: p };
      }),
    }));
  }
  /** Put objects on the bed (lowest point at z = 0). */
  drop(boxes: Map<string, THREE.Box3>, ids = this.selection) {
    const set = new Set(this.editable(ids));
    this.update((d) => ({ ...d, objects: d.objects.map((o) => (set.has(o.id) && boxes.has(o.id) ? { ...o, position: [o.position[0], o.position[1], round(o.position[2] - boxes.get(o.id)!.min.z)] as Vec3 } : o)) }));
  }
  /** Turn an object so the face with world normal `n` faces down, then drop it on the bed. */
  layFlat(id: string, n: THREE.Vector3, box: (o: CadObject) => THREE.Box3 | null) {
    const o = this.doc.objects.find((x) => x.id === id);
    if (!o || o.locked) return;
    const turn = new THREE.Quaternion().setFromUnitVectors(n.clone().normalize(), new THREE.Vector3(0, 0, -1));
    const m = matrixOf(o);
    const pos = new THREE.Vector3().setFromMatrixPosition(m);
    const rot = new THREE.Matrix4().makeRotationFromQuaternion(turn);
    // Rotate about the object's origin.
    const next = new THREE.Matrix4().makeTranslation(pos.x, pos.y, pos.z).multiply(rot).multiply(new THREE.Matrix4().makeTranslation(-pos.x, -pos.y, -pos.z)).multiply(m);
    const t = fromMatrix(next);
    const turned = { ...o, ...t };
    const b = box(turned);
    if (b) turned.position = [turned.position[0], turned.position[1], round(turned.position[2] - b.min.z)];
    this.update((d) => ({ ...d, objects: d.objects.map((x) => (x.id === id ? turned : x)) }));
  }
}

const round = (x: number) => Math.round(x * 1000) / 1000;
function reId(o: CadObject): CadObject {
  return { ...o, id: cadId(), children: o.children?.map(reId) };
}

export function useCad(store: CadStore) {
  return useSyncExternalStore(store.subscribe, store.get, store.get);
}
