import { describe, expect, it } from "vitest";
import { summarize, words } from "./feedback-summary";

describe("words", () => {
  it("drops filler and normalises Arabic spelling", () => {
    expect(words("الشرح كان جميل جداً والمحاضر ممتاز")).toEqual(["شرح", "جميل", "محاضر", "ممتاز"]);
    expect(words("القاعة زحمة")).toEqual(["قاعه", "زحمه"]);
  });
});

describe("summarize", () => {
  it("sums up stars, praise, complaints, the best comment and a tip", () => {
    const s = summarize([
      { rating: 5, comment: "الشرح ممتاز والمحاضر جميل" },
      { rating: 5, comment: "شرح ممتاز وعملي" },
      { rating: 4, comment: "ممتاز" },
      { rating: 2, comment: "الصوت مش واضح والقاعة زحمة" },
      { rating: 3, comment: "الصوت وحش" },
      { rating: 4, comment: null },
    ])!;
    expect(s.count).toBe(6);
    expect(s.avg).toBe(3.8);
    expect(s.stars).toEqual([0, 1, 1, 2, 2]);
    expect(s.praise[0]).toBe("ممتاز");
    expect(s.complaints[0]).toBe("صوت");
    expect(s.best).toBe("الشرح ممتاز والمحاضر جميل");
    expect(s.worst).toBe("الصوت مش واضح والقاعة زحمة");
    expect(s.tip).toContain("المايك");
  });
  it("nothing to sum up", () => {
    expect(summarize([])).toBeNull();
    expect(summarize([{ rating: 5, comment: null }])!.tip).toBeNull();
  });
});
