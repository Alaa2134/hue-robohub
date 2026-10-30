import { describe, expect, it } from "vitest";
import { autoSeat, busRows, neighbours } from "./bus-seats";

describe("busRows", () => {
  it("lays a 49-seat coach out as rows of 2 + aisle + 2 and a back row of five", () => {
    const rows = busRows(49);
    expect(rows).toHaveLength(12);
    expect(rows[0]).toEqual([1, 2, null, 3, 4]);
    expect(rows.at(-1)).toEqual([45, 46, 47, 48, 49]);
    expect(rows.flat().filter((s) => s != null)).toHaveLength(49);
  });

  it("numbers every seat once, with a short row when the front doesn't fill four", () => {
    const rows = busRows(14);
    expect(rows).toEqual([
      [1, 2, null, 3, 4],
      [5, 6, null, 7, 8],
      [9, null, null, null, null],
      [10, 11, 12, 13, 14],
    ]);
  });

  it("a tiny bus is one row", () => {
    expect(busRows(3)).toEqual([[1, 2, 3]]);
  });
});

describe("neighbours", () => {
  it("pairs seats on the same side of the aisle, and the back row side by side", () => {
    const n = neighbours(busRows(13));
    expect(n.get(1)).toEqual([2]);
    expect(n.get(3)).toEqual([4]);
    expect(n.get(2)).toEqual([1]);
    expect(n.get(11)).toEqual([10, 12]);
  });
});

describe("autoSeat", () => {
  it("seats people in order and keeps friends on the same pair", () => {
    const out = autoSeat(
      [
        { id: "a" },
        { id: "b", friend: "c" },
        { id: "c" },
        { id: "d" },
      ],
      13,
    );
    // a takes seat 1; b and c need two seats together, so they get 3–4; d fills seat 2.
    expect(out).toEqual({ a: 1, b: 3, c: 4, d: 2 });
  });

  it("a friend on another bus doesn't hold a seat, and who doesn't fit stays without one", () => {
    const out = autoSeat([{ id: "a", friend: "zz" }, { id: "b" }, { id: "c" }, { id: "d" }], 3);
    expect(out).toEqual({ a: 1, b: 2, c: 3 });
  });
});
