import { beforeAll, describe, expect, it } from "vitest";
import { buildSketch, type Toolchain } from "./build";
import { nodeToolchain } from "./node-toolchain";
import { functionDefinitions, sketchToCpp } from "./sketch";

let tc: Toolchain;
beforeAll(async () => {
  tc = await nodeToolchain();
});

describe("sketch preprocessing", () => {
  it("adds prototypes so functions can be called before they're defined", () => {
    const cpp = sketchToCpp([{ name: "sketch.ino", text: "void setup() { go(3); }\nvoid loop() {}\nint go(int n) { return n; }\n" }])!;
    expect(cpp).toContain("int go(int n);");
    expect(cpp.indexOf("int go(int n);")).toBeLessThan(cpp.indexOf("void setup() {"));
    expect(cpp.startsWith("#include <Arduino.h>")).toBe(true);
  });
  it("ignores control statements, strings and comments", () => {
    const defs = functionDefinitions('// void fake() {}\nconst char* s = "void no() {";\nvoid real() {\n  if (x) { }\n  while (y) {}\n}\n');
    expect(defs.map((d) => d.name)).toEqual(["real"]);
  });
});

describe("compiler", () => {
  it("compiles Blink to HEX with sizes", async () => {
    const r = await buildSketch(tc, [{ name: "sketch.ino", text: "void setup(){ pinMode(13, OUTPUT); }\nvoid loop(){ digitalWrite(13, !digitalRead(13)); delay(500); }\n" }]);
    expect(r.ok).toBe(true);
    expect(r.hex).toMatch(/^:/);
    expect(r.sizes!.flash).toBeGreaterThan(500);
    expect(r.sizes!.flash).toBeLessThan(1200); // only what Blink uses is linked (no Serial)
  });
  it("reports errors at the user's own file and line", async () => {
    const r = await buildSketch(tc, [{ name: "sketch.ino", text: "void setup() {\n  pinMode(13, OUTPUT)\n}\nvoid loop() {}\n" }]);
    expect(r.ok).toBe(false);
    const e = r.diagnostics.find((d) => d.severity === "error")!;
    expect(e.file).toBe("sketch.ino");
    expect([2, 3]).toContain(e.line);
  });
  it("builds several files and a library", async () => {
    const r = await buildSketch(tc, [
      { name: "sketch.ino", text: '#include <Servo.h>\n#include "twice.h"\nServo s;\nvoid setup(){ s.attach(9); }\nvoid loop(){ s.write(twice(45)); }\n' },
      { name: "twice.h", text: "int twice(int x);\n" },
      { name: "twice.cpp", text: '#include "twice.h"\nint twice(int x) { return 2 * x; }\n' },
    ]);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.libraries).toContain("Servo.h");
  });
  it("refuses libraries that aren't available instead of failing obscurely", async () => {
    const r = await buildSketch(tc, [{ name: "sketch.ino", text: "#include <WiFi.h>\nvoid setup(){}\nvoid loop(){}\n" }]);
    expect(r.ok).toBe(false);
    expect(r.diagnostics[0].message).toContain("WiFi.h");
  });
  it("reports a missing function at link time", async () => {
    const r = await buildSketch(tc, [{ name: "sketch.ino", text: "void helper();\nvoid setup(){ helper(); }\nvoid loop(){}\n" }]);
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => /undefined reference/.test(d.message))).toBe(true);
  });
});
