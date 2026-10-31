import { describe, expect, it } from "vitest";
import { batches } from "./share-files";

describe("batches", () => {
  it("splits into share-sheet-sized groups in order", () => {
    const list = Array.from({ length: 65 }, (_, i) => i);
    const b = batches(list);
    expect(b.map((x) => x.length)).toEqual([30, 30, 5]);
    expect(b.flat()).toEqual(list);
  });
  it("is empty for nothing", () => {
    expect(batches([])).toEqual([]);
  });
});
