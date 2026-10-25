import { beforeAll, describe, expect, it } from "vitest";
import { buildSketch, type Toolchain } from "../compiler/build";
import { nodeToolchain } from "../compiler/node-toolchain";
import { CODE } from "../examples";
import { CHALLENGES, challengeBySlug, runChallenge, starterDoc } from "./challenges";

let tc: Toolchain;
beforeAll(async () => {
  tc = await nodeToolchain();
});

/** A correct answer for each challenge. */
const SOLUTIONS: Record<string, string> = {
  "blink-2hz": CODE.blink.replace(/delay\(500\)/g, "delay(250)"),
  "button-hold": CODE.button,
  "traffic-cycle": CODE.traffic.replace("show(HIGH, LOW, LOW, 3000)", "show(HIGH, LOW, LOW, 2000)").replace("show(LOW, LOW, HIGH, 3000)", "show(LOW, LOW, HIGH, 2000)"),
  "dimmer-knob": CODE.pot,
  "serial-echo": `
void setup() {
  Serial.begin(9600);
  Serial.println("Hello BuildX");
}
void loop() {
  if (Serial.available()) {
    String line = Serial.readStringUntil('\\n');
    Serial.print("Got: ");
    Serial.println(line);
  }
}`,
  "night-light": CODE.night,
  "servo-sweep": CODE.servo,
  "buzzer-a4": `
void setup() {}
void loop() {
  tone(8, 440);
  delay(500);
  noTone(8);
  delay(500);
}`,
  "seg7-seven": `
const int SEG[7] = {2, 3, 4, 5, 6, 7, 8};
void setup() {
  for (int i = 0; i < 7; i++) pinMode(SEG[i], OUTPUT);
  for (int i = 0; i < 3; i++) digitalWrite(SEG[i], HIGH);
}
void loop() {}`,
};

async function attempt(slug: string, code?: string) {
  const ch = challengeBySlug(slug)!;
  const doc = starterDoc(ch);
  if (code) doc.files = [{ name: "sketch.ino", text: code.trim() + "\n" }];
  const r = await buildSketch(tc, doc.files, doc.main);
  expect(r.ok, `${slug} builds`).toBe(true);
  return runChallenge(ch, doc, r.hex!);
}

describe("challenges", () => {
  it("every challenge has a solution and starts from a real example", () => {
    for (const ch of CHALLENGES) {
      expect(SOLUTIONS[ch.slug], ch.slug).toBeTruthy();
      expect(() => starterDoc(ch)).not.toThrow();
    }
  });

  for (const ch of CHALLENGES) {
    it(`${ch.slug}: the solution passes and the starter doesn't`, async () => {
      const good = await attempt(ch.slug, SOLUTIONS[ch.slug]);
      expect(good.checks.filter((c) => !c.ok), JSON.stringify(good.checks)).toEqual([]);
      expect(good.passed).toBe(true);
      const start = await attempt(ch.slug);
      expect(start.passed).toBe(false);
    });
  }

  it("a near miss fails with the measured value", async () => {
    const slow = await attempt("blink-2hz", CODE.blink);
    expect(slow.passed).toBe(false);
    expect(slow.checks.find((c) => c.label.en.startsWith("Blinks"))?.got).toBe("1 Hz");
    const order = await attempt("traffic-cycle", CODE.traffic);
    expect(order.passed).toBe(false);
    expect(order.checks.find((c) => c.label.en.startsWith("Red stays"))?.got).toBe("3 s");
  });

  it("a circuit without the part says what's missing instead of crashing", async () => {
    const ch = challengeBySlug("servo-sweep")!;
    const doc = starterDoc(ch);
    doc.parts = doc.parts.filter((p) => p.type !== "servo");
    doc.wires = doc.wires.filter((w) => doc.parts.some((p) => p.id === w.a.part) && doc.parts.some((p) => p.id === w.b.part));
    const r = await buildSketch(tc, [{ name: "sketch.ino", text: SOLUTIONS["servo-sweep"] }], "sketch.ino");
    const out = runChallenge(ch, doc, r.hex!);
    expect(out.passed).toBe(false);
    expect(out.checks[0].label.en).toBe("There's a servo");
  });
});
