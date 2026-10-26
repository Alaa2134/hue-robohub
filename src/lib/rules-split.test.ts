import { describe, expect, it } from "vitest";
import { checkCitations } from "../../supabase/functions/_shared/citations";
import { duplicateRefs, splitRules } from "./rules-split";

describe("rules splitter", () => {
  it("cuts numbered rules into sections, English and Arabic", () => {
    const text = `WRO 2026 Junior rules
General notes for teams.

1 Robot
1.1 Size
The robot must fit inside a 250 x 250 x 250 mm box
before the start.
1.2 The maximum weight of the robot is 1.5 kg.

مادة ٢ وقت المحاولة
مدة كل محاولة دقيقتين.`;
    const s = splitRules(text);
    expect(s.map((x) => x.ref)).toEqual(["0", "1", "1.1", "1.2", "2"]);
    expect(s[0].body).toContain("General notes");
    expect(s[2].heading).toBe("Size");
    expect(s[2].body).toBe("The robot must fit inside a 250 x 250 x 250 mm box before the start.");
    // A one-line rule keeps its text as the body.
    expect(s[3].body).toBe("The maximum weight of the robot is 1.5 kg.");
    expect(s[4].heading).toBe("وقت المحاولة");
    expect(s[4].body).toBe("مدة كل محاولة دقيقتين.");
  });

  it("names repeated numbers (a table of contents pasted with the rules)", () => {
    expect(duplicateRefs(splitRules("1 Intro\nx\n2 Robot\ny\n1 Intro\nz"))).toEqual(["1"]);
  });
});

describe("coach citations", () => {
  const refs = ["1.1", "1.2", "2"];
  it("keeps citations of the given sections and removes made-up ones", () => {
    const r = checkCitations("The robot can weigh up to 1.5 kg [1.2] and must have wheels [7.3].", refs);
    expect(r).toEqual({ text: "The robot can weigh up to 1.5 kg [1.2] and must have wheels.", cited: ["1.2"] });
  });

  it("drops an answer that cites nothing it was given", () => {
    expect(checkCitations("Batteries must be under 12 V [9.9].", refs)).toBeNull();
    expect(checkCitations("I think it is fine.", refs)).toBeNull();
  });
});
