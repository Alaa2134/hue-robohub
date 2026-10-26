import { describe, expect, it } from "vitest";
import { explainCompile } from "./explain";

describe("compiler messages in plain words", () => {
  it("explains the common ones in Arabic and English", () => {
    expect(explainCompile("expected ';' before '}' token")?.why.ar).toContain("';'");
    expect(explainCompile("'ledPin' was not declared in this scope")?.fix.en).toContain("ledPin");
    expect(explainCompile("fatal error: Foo.h: No such file or directory")?.why.en).toContain("Foo.h");
    expect(explainCompile("stray '\\302' in program")?.why.en).toMatch(/quotes|Arabic/);
    expect(explainCompile("undefined reference to `loop'")?.fix.en).toBe("Add: void loop() { }");
  });
  it("says nothing about messages it doesn't know", () => {
    expect(explainCompile("some unusual message")).toBeNull();
  });
});
