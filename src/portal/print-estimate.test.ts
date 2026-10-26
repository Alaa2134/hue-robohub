import { describe, expect, it } from "vitest";
import { parseObj, parseStl, roughEstimate } from "./print-estimate";

/** A 20 × 10 × 5 mm box as 12 triangles, outward-facing. */
const V = [[0, 0, 0], [20, 0, 0], [20, 10, 0], [0, 10, 0], [0, 0, 5], [20, 0, 5], [20, 10, 5], [0, 10, 5]];
const F = [[0, 2, 1], [0, 3, 2], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [1, 2, 6], [1, 6, 5], [2, 3, 7], [2, 7, 6], [3, 0, 4], [3, 4, 7]];

function binaryStl() {
  const buf = new ArrayBuffer(84 + F.length * 50);
  const dv = new DataView(buf);
  dv.setUint32(80, F.length, true);
  F.forEach((f, i) => f.forEach((vi, k) => V[vi].forEach((c, j) => dv.setFloat32(84 + i * 50 + 12 + k * 12 + j * 4, c, true))));
  return buf;
}

describe("print estimate", () => {
  it("measures a binary STL, an ASCII STL and an OBJ the same", () => {
    const b = parseStl(binaryStl());
    expect(b.volume).toBeCloseTo(1000, 3);
    expect(b.bbox).toEqual([20, 10, 5]);
    expect(b.triangles).toBe(12);
    const ascii = `solid box\n${F.map((f) => `facet normal 0 0 0\nouter loop\n${f.map((i) => `vertex ${V[i].join(" ")}`).join("\n")}\nendloop\nendfacet`).join("\n")}\nendsolid`;
    expect(parseStl(new TextEncoder().encode(ascii).buffer as ArrayBuffer).volume).toBeCloseTo(1000, 3);
    const obj = `${V.map((v) => `v ${v.join(" ")}`).join("\n")}\n${F.map((f) => `f ${f.map((i) => i + 1).join(" ")}`).join("\n")}`;
    expect(parseObj(obj).volume).toBeCloseTo(1000, 3);
  });

  it("gives a range, more for more infill and more copies", () => {
    const m = parseStl(binaryStl());
    const a = roughEstimate(m, { density: 1.24, infill: 20, quality: "normal", quantity: 1 });
    expect(a.cm3).toBeCloseTo(1, 6);
    expect(a.grams[0]).toBeLessThan(a.grams[1]);
    const b = roughEstimate(m, { density: 1.24, infill: 100, quality: "normal", quantity: 2 });
    expect(b.grams[1]).toBeCloseTo(1.24 * 2 * 1.35, 6);
    expect(b.grams[0]).toBeGreaterThan(a.grams[0] * 2);
  });

  it("refuses an empty file", () => {
    expect(() => parseObj("")).toThrow();
  });
});
