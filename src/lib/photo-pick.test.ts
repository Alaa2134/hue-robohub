import { describe, expect, it } from "vitest";
import { skinShare, suggest, type Seen } from "./photo-pick";

const seen = (o: Partial<Seen> & { hash: string }): Seen => ({ sharp: 400, mean: 120, skin: 0.1, ...o });
// Distinct 64-bit hashes (far apart in hamming distance).
const H = ["0".repeat(64), "1".repeat(64), "01".repeat(32), "0011".repeat(16), "00001111".repeat(8), "1100".repeat(16)];

describe("skinShare", () => {
  it("counts skin-coloured pixels", () => {
    const px = new Uint8ClampedArray([200, 140, 110, 255, 20, 40, 200, 255, 210, 150, 120, 255, 0, 0, 0, 255]);
    expect(skinShare(px)).toBe(0.5);
  });
});

describe("suggest", () => {
  it("ranks people and sharpness first, and leaves out the dark and the duplicates", () => {
    const list = [
      seen({ hash: H[0], skin: 0.02 }),
      seen({ hash: H[1], skin: 0.3, sharp: 500 }),
      seen({ hash: H[2], mean: 10, skin: 0.4 }), // too dark
      seen({ hash: H[1], skin: 0.3, sharp: 300 }), // same shot as #1, softer
      seen({ hash: H[3], skin: 0.2 }),
      null,
    ];
    expect(suggest(list, 3)).toEqual([1, 4, 0]);
  });
  it("is empty when nothing can be read", () => {
    expect(suggest([null, null])).toEqual([]);
  });
});
