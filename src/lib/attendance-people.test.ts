import { describe, expect, it } from "vitest";
import { attendancePeople, reviewed } from "./attendance-people";

const r = (id: string, status: string) => ({ id, status });

describe("attendancePeople", () => {
  it("counts only the accepted once the team reviews the form", () => {
    const rs = [r("a", "accepted"), r("b", "new"), r("c", "waiting"), r("d", "rejected")];
    expect(reviewed(rs)).toBe(true);
    expect(attendancePeople(rs).map((x) => x.id)).toEqual(["a"]);
  });

  it("a waiting list alone means the form is reviewed", () => {
    expect(attendancePeople([r("a", "new"), r("b", "waiting")]).map((x) => x.id)).toEqual([]);
  });

  it("counts everyone on an open registration nobody reviews", () => {
    const rs = [r("a", "new"), r("b", "new"), r("c", "rejected")];
    expect(reviewed(rs)).toBe(false);
    expect(attendancePeople(rs).map((x) => x.id)).toEqual(["a", "b"]);
  });

  it("keeps whoever was let in at the door", () => {
    const rs = [r("a", "accepted"), r("b", "new"), r("c", "waiting")];
    expect(attendancePeople(rs, (x) => x.id === "b").map((x) => x.id)).toEqual(["a", "b"]);
  });
});
