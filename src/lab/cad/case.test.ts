import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import { loadKernel, placed, printables, setKernelLoader, toStl, type Kernel } from "./geometry";
import { CASE_SIZE, UNO, unoCase } from "./case";
import { validCad } from "./model";

let k: Kernel;
beforeAll(async () => {
  setKernelLoader(async () => {
    const { default: Module } = await import("manifold-3d");
    const wasm = await Module();
    wasm.setup();
    const { parse } = await import("opentype.js");
    const woff = readFileSync(path.join(process.cwd(), "node_modules/@fontsource/saira/files/saira-latin-700-normal.woff"));
    return { wasm, font: parse(woff.buffer.slice(woff.byteOffset, woff.byteOffset + woff.byteLength)) };
  });
  k = await loadKernel();
});

describe("Arduino Uno case", () => {
  it("is a valid design of two printable parts: the case and its lid", () => {
    const doc = unoCase();
    expect(validCad(doc)).toBe(true);
    const parts = printables(k, doc.objects);
    expect(parts.map((p) => p.obj.name)).toEqual(["Arduino Uno case", "Lid"]);
    const [box, lid] = parts.map((p) => p.solid.boundingBox());
    expect(box.max[0] - box.min[0]).toBeCloseTo(CASE_SIZE.w, 3);
    expect(box.max[1] - box.min[1]).toBeCloseTo(CASE_SIZE.d, 3);
    expect(box.max[2] - box.min[2]).toBeCloseTo(CASE_SIZE.h, 3);
    expect(lid.max[2] - lid.min[2]).toBeCloseTo(4, 3);
    // Hollow: much less plastic than a solid block, and the openings and screw holes really cut it.
    const v = parts[0].solid.volume();
    expect(v).toBeLessThan(CASE_SIZE.w * CASE_SIZE.d * CASE_SIZE.h * 0.4);
    const noHoles = unoCase();
    const g = noHoles.objects[0];
    g.children = g.children!.filter((c) => !c.hole);
    g.children[0].children = g.children[0].children!.filter((c) => !c.name.includes("opening"));
    const full = placed(k, g)!;
    expect(full.volume() - v).toBeGreaterThan(600); // two 2 mm walls: ≈ 14 × 13 and 11 × 13 mm openings, plus the screw holes
    expect(toStl(parts[0].solid).byteLength).toBeGreaterThan(84);
    for (const p of parts) p.solid.delete();
    full.delete();
  });

  it("puts the standoffs on the board's mounting holes, inside the walls", () => {
    const g = unoCase().objects[0];
    const standoffs = g.children!.filter((c) => c.name.startsWith("Standoff"));
    expect(standoffs).toHaveLength(4);
    standoffs.forEach((s, i) => {
      expect(s.position[0] + UNO.w / 2).toBeCloseTo(UNO.holes[i][0], 6);
      expect(s.position[1] + UNO.d / 2).toBeCloseTo(UNO.holes[i][1], 6);
      expect(Math.abs(s.position[0]) + 3).toBeLessThan(CASE_SIZE.w / 2 - 2);
      expect(Math.abs(s.position[1]) + 3).toBeLessThan(CASE_SIZE.d / 2 - 2);
    });
  });
});
