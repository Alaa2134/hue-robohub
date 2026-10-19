import { describe, expect, it } from "vitest";
import { addSerial } from "./use-sim";

describe("serial lines", () => {
  it("stamps each line with the time its first character arrived", () => {
    let l = addSerial([], "hel", 0.1);
    l = addSerial(l, "lo\nwor", 0.2);
    l = addSerial(l, "ld\n\nend", 0.3);
    expect(l).toEqual([
      { t: 0.1, text: "hello\n" },
      { t: 0.2, text: "world\n" },
      { t: 0.3, text: "\n" },
      { t: 0.3, text: "end" },
    ]);
  });
});
