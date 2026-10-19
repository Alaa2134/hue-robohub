import { readFileSync } from "node:fs";
import path from "node:path";
import { beforeAll, describe, expect, it } from "vitest";
import * as THREE from "three";
import { STLLoader } from "three/examples/jsm/loaders/STLLoader.js";
import { fromMatrix, indexedFrom, loadKernel, matrixOf, mergedSolid, setKernelLoader, solidOf, statsOf, toObj, toStl, type Kernel } from "./geometry";
import { newShape, packMesh, cadId, type CadObject } from "./model";

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

const vol = (o: CadObject) => {
  const m = solidOf(k, o)!;
  const v = m.volume();
  m.delete();
  return v;
};
const shape = (kind: Parameters<typeof newShape>[0], params: Record<string, number | string> = {}, at: [number, number, number] = [0, 0, 0]) => {
  const o = newShape(kind, at);
  Object.assign(o.params, params);
  return o;
};
const group = (op: CadObject["op"], children: CadObject[]): CadObject => ({ id: cadId(), name: "Group", kind: "group", op, children, params: {}, position: [0, 0, 0], rotation: [0, 0, 0], scale: [1, 1, 1], color: "#fff" });

describe("3D Studio geometry", () => {
  it("builds primitives with the right volumes", () => {
    expect(vol(shape("box", { w: 10, d: 20, h: 30 }))).toBeCloseTo(6000, 3);
    expect(vol(shape("cylinder", { dia: 20, h: 10, seg: 256 }))).toBeCloseTo(Math.PI * 100 * 10, -1);
    expect(vol(shape("wedge", { w: 10, d: 20, h: 30 }))).toBeCloseTo(3000, 3);
    expect(vol(shape("tube", { dia: 20, wall: 2, h: 10, seg: 256 }))).toBeCloseTo(Math.PI * (100 - 64) * 10, -1);
    expect(vol(shape("sphere", { dia: 20, seg: 128 }))).toBeCloseTo((4 / 3) * Math.PI * 1000, -2);
    const rounded = vol(shape("box", { w: 20, d: 20, h: 20, r: 3 }));
    expect(rounded).toBeLessThan(8000);
    expect(rounded).toBeGreaterThan(7500);
  });

  it("shapes rest on the bed, centred on their position", () => {
    for (const kind of ["box", "cylinder", "cone", "sphere", "torus", "wedge", "tube"] as const) {
      const m = solidOf(k, shape(kind))!;
      const b = m.boundingBox();
      expect(b.min[2], kind).toBeCloseTo(0, 5);
      expect((b.min[0] + b.max[0]) / 2, kind).toBeCloseTo(0, 5);
      expect((b.min[1] + b.max[1]) / 2, kind).toBeCloseTo(0, 5);
      m.delete();
    }
  });

  it("a hole grouped with a solid cuts it; subtract and intersect work", () => {
    const box = shape("box", { w: 20, d: 20, h: 20 });
    const hole = { ...shape("cylinder", { dia: 10, h: 40, seg: 256 }, [0, 0, -10]), hole: true };
    const cut = vol(group("union", [box, hole]));
    expect(cut).toBeCloseTo(8000 - Math.PI * 25 * 20, -1);
    const a = shape("box", { w: 20, d: 20, h: 20 });
    const b = shape("box", { w: 20, d: 20, h: 20 }, [10, 0, 0]);
    expect(vol(group("subtract", [a, b]))).toBeCloseTo(4000, 3);
    expect(vol(group("intersect", [a, b]))).toBeCloseTo(4000, 3);
    expect(vol(group("union", [a, b]))).toBeCloseTo(12000, 3);
  });

  it("applies rotation about X, then Y, then Z, and round-trips transforms", () => {
    const o = { ...shape("box", { w: 10, d: 20, h: 30 }), rotation: [90, 0, 0] as [number, number, number] };
    const g = new THREE.Box3().setFromBufferAttribute(new THREE.BufferGeometry().setAttribute("position", new THREE.BufferAttribute(new Float32Array([5, 10, 30, -5, -10, 0]), 3)).getAttribute("position") as THREE.BufferAttribute);
    g.applyMatrix4(matrixOf(o));
    // 90° about X turns depth (Y) into height (Z).
    expect(g.max.z - g.min.z).toBeCloseTo(20, 5);
    const t = { position: [1, 2, 3] as [number, number, number], rotation: [10, 20, 30] as [number, number, number], scale: [1, 2, 3] as [number, number, number] };
    const back = fromMatrix(matrixOf(t));
    back.rotation.forEach((r, i) => expect(r).toBeCloseTo(t.rotation[i], 3));
    back.scale.forEach((s, i) => expect(s).toBeCloseTo(t.scale[i], 5));
  });

  it("extrudes text into a solid", () => {
    const t = shape("text", { text: "BX", size: 10, depth: 2 });
    const m = solidOf(k, t)!;
    expect(m.volume()).toBeGreaterThan(20);
    expect(m.boundingBox().max[2]).toBeCloseTo(2, 5);
    expect(m.genus()).toBeGreaterThanOrEqual(0);
    m.delete();
  });

  it("measures the design and exports STL and OBJ that read back the same", () => {
    const objects = [shape("box", { w: 10, d: 10, h: 10 }), shape("box", { w: 10, d: 10, h: 10 }, [30, 0, 0]), { ...shape("box"), hole: true }];
    const s = statsOf(k, objects);
    expect(s.count).toBe(2);
    expect(s.volume).toBeCloseTo(2000, 3);
    expect(s.min[0]).toBeCloseTo(-5);
    expect(s.max[0]).toBeCloseTo(35);
    const merged = mergedSolid(k, objects)!;
    const stl = toStl(merged);
    expect(new DataView(stl.buffer).getUint32(80, true)).toBe(merged.numTri());
    // Read it back like a slicer would and rebuild a solid from it.
    const geo = new STLLoader().parse(stl.buffer as ArrayBuffer);
    const { v, i } = indexedFrom(geo);
    const imported: CadObject = { ...shape("box"), kind: "mesh", mesh: packMesh(v, i) };
    expect(vol(imported)).toBeCloseTo(2000, 2);
    merged.delete();
    const obj = toObj(k, objects);
    expect(obj.match(/^o /gm)).toHaveLength(2);
    expect(obj.match(/^f /gm)).toHaveLength(24);
  });
});
