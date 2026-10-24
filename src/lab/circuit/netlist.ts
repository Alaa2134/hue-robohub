/**
 * Which pins are electrically the same node: wires, legs pushed into the same breadboard hole or
 * header socket (pins at the same spot), and connections inside parts (breadboard strips, a button's
 * paired legs, the board's GND pins).
 */
import type { CircuitDoc } from "./model";
import { PART_BY_TYPE, propsOf, worldPins } from "./parts";

export type Netlist = {
  /** "partId:pin" → net index. */
  netOf: Map<string, number>;
  /** Net index → its pins. */
  nets: string[][];
  /** Pins that touch nothing else (excluding breadboard holes). */
  unconnected: string[];
  /** Wires whose ends point at a part or pin that no longer exists. */
  brokenWires: string[];
};

export const key = (part: string, pin: string) => `${part}:${pin}`;

export function buildNetlist(doc: CircuitDoc): Netlist {
  const parent = new Map<string, string>();
  const find = (a: string): string => {
    let r = a;
    while (parent.get(r) !== r) r = parent.get(r)!;
    let c = a;
    while (parent.get(c) !== r) {
      const n = parent.get(c)!;
      parent.set(c, r);
      c = n;
    }
    return r;
  };
  const union = (a: string, b: string) => {
    const ra = find(a);
    const rb = find(b);
    if (ra !== rb) parent.set(ra, rb);
  };

  const at = new Map<string, string>();
  const isHole = new Set<string>();
  const touched = new Map<string, number>();
  for (const p of doc.parts) {
    const def = PART_BY_TYPE.get(p.type);
    if (!def) continue;
    const bb = def.category === "breadboards";
    for (const pin of worldPins(p)) {
      const k = key(p.id, pin.name);
      parent.set(k, k);
      if (bb) isHole.add(k);
      const spot = `${Math.round(pin.x)},${Math.round(pin.y)}`;
      const other = at.get(spot);
      if (other) {
        union(k, other);
        touched.set(k, (touched.get(k) ?? 0) + 1);
        touched.set(other, (touched.get(other) ?? 0) + 1);
      } else at.set(spot, k);
    }
    for (const group of def.internal?.(propsOf(p)) ?? []) for (let i = 1; i < group.length; i++) union(key(p.id, group[0]), key(p.id, group[i]));
  }
  const brokenWires: string[] = [];
  for (const w of doc.wires) {
    const a = key(w.a.part, w.a.pin);
    const b = key(w.b.part, w.b.pin);
    if (!parent.has(a) || !parent.has(b)) {
      brokenWires.push(w.id);
      continue;
    }
    union(a, b);
    touched.set(a, (touched.get(a) ?? 0) + 1);
    touched.set(b, (touched.get(b) ?? 0) + 1);
  }

  const index = new Map<string, number>();
  const nets: string[][] = [];
  const netOf = new Map<string, number>();
  for (const k of parent.keys()) {
    const r = find(k);
    let n = index.get(r);
    if (n === undefined) {
      n = nets.length;
      index.set(r, n);
      nets.push([]);
    }
    nets[n].push(k);
    netOf.set(k, n);
  }
  const live = nets.map((n) => n.some((k) => touched.has(k)));
  const unconnected = [...parent.keys()].filter((k) => !isHole.has(k) && !live[netOf.get(k)!]);
  return { netOf, nets, unconnected, brokenWires };
}
