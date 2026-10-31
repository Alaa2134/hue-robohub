import { describe, expect, it } from "vitest";
import { assignPhotos, seeded, slideWords, splitTitle, type CarouselPhoto } from "./carousel";

// Distinct 64-bit hashes (far apart), so nothing counts as a duplicate unless meant to.
const hash = (i: number) => Array.from({ length: 64 }, (_, b) => ((i * 2654435761) >>> (b % 31)) & 1 ? "1" : "0").join("");
const photo = (i: number, o: Partial<CarouselPhoto> & { skin?: number; sharp?: number } = {}): CarouselPhoto => ({
  w: o.w ?? 1600,
  h: o.h ?? 1067,
  look: { sharp: o.sharp ?? 300 + i, mean: 120, hash: hash(i + 1), skin: o.skin ?? 0.1 },
});

describe("assignPhotos", () => {
  it("fills every slide from 18 photos, the group shot as the family and a wide one as the cover", () => {
    const list = Array.from({ length: 18 }, (_, i) => photo(i, i === 7 ? { skin: 0.45 } : {}));
    const a = assignPhotos(list);
    expect(a.family).toEqual([7]);
    expect(a.cover).toHaveLength(1);
    expect([a.arrival, a.highlights, a.action, a.team, a.behind].map((x) => x?.length)).toEqual([2, 3, 2, 6, 3]);
    const all = Object.values(a).flat();
    expect(new Set(all).size).toBe(all.length);
  });

  it("with a few photos, only the slides it can fill (no repeats)", () => {
    const a = assignPhotos(Array.from({ length: 7 }, (_, i) => photo(i)));
    expect(Object.keys(a).sort()).toEqual(["action", "cover", "family", "highlights"].sort());
  });

  it("leaves out the dark ones", () => {
    const list = [photo(0), { ...photo(1), look: { ...photo(1).look!, mean: 5 } }];
    expect(assignPhotos(list).cover).toEqual([0]);
  });
});

describe("words and helpers", () => {
  it("a competition says «COMPETITION MODE»; a workshop is hands-on", () => {
    const base = { title: "Robotiada", tagline: "", place: "", date: "", from: "" };
    expect(slideWords({ ...base, kind: "competition" }).action.big).toBe("COMPETITION MODE");
    expect(slideWords({ ...base, kind: "workshop" }).action.top).toBe("HANDS-ON");
    expect(slideWords({ ...base, kind: "summit", place: "E-JUST, Alexandria", from: "From Horus University" }).arrival.foot).toEqual(["From Horus University", "to E-JUST, Alexandria"]);
    expect(slideWords({ ...base, kind: "event" }).cover.notes).toEqual(["Our Journey"]);
  });
  it("splits a title into balanced lines", () => {
    expect(splitTitle("MENA ROBOTICS SUMMIT 2026")).toEqual(["MENA ROBOTICS", "SUMMIT 2026"]);
    expect(splitTitle("A")).toEqual(["A"]);
  });
  it("the same seed gives the same strokes", () => {
    const a = seeded("x"),
      b = seeded("x");
    expect([a(), a()]).toEqual([b(), b()]);
  });
});
