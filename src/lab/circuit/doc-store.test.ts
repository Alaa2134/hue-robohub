import { describe, expect, it } from "vitest";
import { DocStore, isClipboard } from "./doc-store";
import { emptyDoc } from "./model";
import { worldBox } from "./parts";

const setup = () => {
  const s = new DocStore(emptyDoc());
  const a = s.addPart("led", 0, 0)!;
  const b = s.addPart("resistor", 100, 40)!;
  const c = s.addPart("led", 200, 80)!;
  return { s, a, b, c };
};

describe("DocStore editing", () => {
  it("copies parts with the wires between them and pastes fresh copies", () => {
    const { s, a, b } = setup();
    s.addWire({ part: a.id, pin: "A" }, { part: b.id, pin: "1" }, [], "#fff");
    const clip = s.copy([a.id, b.id]);
    expect(isClipboard(clip)).toBe(true);
    expect(clip!.wires).toHaveLength(1);
    // Survives the system clipboard round trip.
    const back = JSON.parse(JSON.stringify(clip));
    expect(isClipboard(back)).toBe(true);
    s.paste(back, 30, 50);
    const doc = s.current;
    expect(doc.parts).toHaveLength(5);
    expect(doc.wires).toHaveLength(2);
    const pasted = doc.parts.filter((p) => s.selection.parts.includes(p.id));
    expect(pasted.map((p) => [p.type, p.x, p.y])).toEqual([
      ["led", 30, 50],
      ["resistor", 130, 90],
    ]);
    const w = doc.wires[1];
    expect(new Set([w.a.part, w.b.part])).toEqual(new Set(pasted.map((p) => p.id)));
    s.undo();
    expect(s.current.parts).toHaveLength(3);
  });

  it("drops clipboard parts of unknown types", () => {
    const s = new DocStore(emptyDoc());
    s.paste({ kind: "buildx-lab-parts", parts: [{ id: "x", type: "warp-drive", x: 0, y: 0, rot: 0, props: {} }], wires: [] });
    expect(s.current.parts).toHaveLength(0);
  });

  it("keeps locked parts in place", () => {
    const { s, a, b } = setup();
    s.setLocked([a.id], true);
    s.moveParts([a.id, b.id], 10, 10, "t");
    s.rotate([a.id, b.id]);
    const [pa, pb] = s.current.parts;
    expect([pa.x, pa.y, pa.rot]).toEqual([0, 0, 0]);
    expect([pb.x, pb.y, pb.rot]).toEqual([110, 50, 90]);
    s.select({ parts: [a.id, b.id], wires: [] });
    s.deleteSelection();
    expect(s.current.parts.map((p) => p.id)).toContain(a.id);
    expect(s.current.parts.map((p) => p.id)).not.toContain(b.id);
  });

  it("rotates counter-clockwise", () => {
    const { s, a } = setup();
    s.rotate([a.id], true);
    expect(s.current.parts[0].rot).toBe(270);
  });

  it("aligns left edges and distributes evenly", () => {
    const { s, a, b, c } = setup();
    s.align([a.id, b.id, c.id], "left");
    const lefts = s.current.parts.map((p) => worldBox(p).x);
    expect(Math.max(...lefts) - Math.min(...lefts)).toBeLessThanOrEqual(5);
    s.undo();
    s.align([a.id, b.id, c.id], "distributeX");
    const boxes = s.current.parts.map((p) => worldBox(p)).sort((x, y) => x.x - y.x);
    const gap1 = boxes[1].x - (boxes[0].x + boxes[0].w);
    const gap2 = boxes[2].x - (boxes[1].x + boxes[1].w);
    // Snapped to the 10-unit grid, so equal within one grid step.
    expect(Math.abs(gap1 - gap2)).toBeLessThanOrEqual(10);
  });

  it("orders parts front and back, and saves labels and canvas settings", () => {
    const { s, a, c } = setup();
    s.reorder([a.id], "front");
    expect(s.current.parts.at(-1)!.id).toBe(a.id);
    s.reorder([c.id], "back");
    expect(s.current.parts[0].id).toBe(c.id);
    s.setPart(a.id, { label: "status" });
    expect(s.current.parts.find((p) => p.id === a.id)!.label).toBe("status");
    s.setSettings({ snap: false, grid: 20 });
    expect(s.current.settings).toEqual({ snap: false, grid: 20 });
  });
});
