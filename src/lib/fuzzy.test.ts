import { describe, expect, it } from "vitest";
import { arNorm, expand, fuzzyScore, skeleton } from "./fuzzy";

describe("forgiving search", () => {
  it("unifies Arabic letters and drops diacritics", () => {
    expect(arNorm("أُمنيّة إبداع آلة مدرسة على")).toBe("امنيه ابداع اله مدرسه علي");
    expect(arNorm("٢٠٢٦")).toBe("2026");
  });
  it("reads a word the same with or without its long vowels", () => {
    expect(skeleton("روبوت")).toBe(skeleton("روبت"));
    expect(skeleton("ربوت")).toBe(skeleton("روبوت"));
    expect(skeleton("robot")).toBe(skeleton("robt"));
  });
  it("finds titles with typos, colloquial spellings and the other language", () => {
    expect(fuzzyScore("ربوت", "الروبوت السداسي")).toBeGreaterThan(0);
    expect(fuzzyScore("روبت", "Robot arm")).toBeGreaterThan(0);
    expect(fuzzyScore("ورشه", "ورشة الطباعة")).toBe(3);
    expect(fuzzyScore("embeded", "Embedded Systems workshop")).toBeGreaterThan(0);
    expect(fuzzyScore("workshop", "ورشة الأردوينو")).toBeGreaterThan(0);
    expect(expand("سنسور")).toContain("sensor");
  });
  it("does not match unrelated words", () => {
    expect(fuzzyScore("رعاية", "الروبوت السداسي")).toBe(0);
    expect(fuzzyScore("xyz", "Embedded Systems")).toBe(0);
  });
});
