import { beforeAll, describe, expect, it } from "vitest";
import { buildSketch, type Toolchain } from "../compiler/build";
import { nodeToolchain } from "../compiler/node-toolchain";
import { DEFAULT_ROBOT, motorTorque, nearest, onLine, startState, step } from "./physics";
import { lapCheck, RobotSim } from "./sim";
import { STARTER, TRACKS, trackById } from "./tracks";

let tc: Toolchain;
beforeAll(async () => {
  tc = await nodeToolchain();
});
const build = async (code: string) => {
  const r = await buildSketch(tc, [{ name: "sketch.ino", text: code }], "sketch.ino");
  expect(r.ok, JSON.stringify(r.diagnostics)).toBe(true);
  return r.hex!;
};

describe("robot physics", () => {
  const p = DEFAULT_ROBOT;
  const full = { en: 1, a: 1, b: 0 };
  const off = { en: 0, a: 0, b: 0 };

  it("a motor gives its stall torque held still and none at its no-load speed (at the rated voltage)", () => {
    const rated = { ...p, vBattery: p.vNominal, vDriverDrop: 0 };
    expect(motorTorque(rated, full, 0)).toBeCloseTo(p.stallTorque, 6);
    expect(motorTorque(rated, full, p.noLoadSpeed)).toBeCloseTo(0, 6);
    expect(motorTorque(rated, { en: 1, a: 1, b: 1 }, 10)).toBeLessThan(0); // shorted: brakes
    expect(motorTorque(rated, off, 10)).toBe(0); // open: coasts
  });

  it("full power both sides: speeds up, then settles below the free-running speed (load + back-EMF)", () => {
    let s = startState({ x: 0, y: 0 }, 0);
    for (let i = 0; i < 4000; i++) s = step(p, s, full, full, 0.0005); // 2 s
    const vFree = ((p.vBattery - p.vDriverDrop) / p.vNominal) * p.noLoadSpeed * p.wheelRadius;
    expect(s.v).toBeGreaterThan(0.3 * vFree);
    expect(s.v).toBeLessThan(vFree);
    expect(Math.abs(s.w)).toBeLessThan(1e-9);
    expect(s.x).toBeGreaterThan(0.5);
    // Half the PWM duty: noticeably slower.
    let h = startState({ x: 0, y: 0 }, 0);
    for (let i = 0; i < 4000; i++) h = step(p, h, { en: 0.5, a: 1, b: 0 }, { en: 0.5, a: 1, b: 0 }, 0.0005);
    expect(h.v).toBeLessThan(s.v * 0.85);
    // A low duty (analogWrite ≈ 20) can't beat the gearbox friction: it stays put.
    let z = startState({ x: 0, y: 0 }, 0);
    for (let i = 0; i < 2000; i++) z = step(p, z, { en: 20 / 255, a: 1, b: 0 }, { en: 20 / 255, a: 1, b: 0 }, 0.0005);
    expect(Math.abs(z.x)).toBeLessThan(1e-6);
  });

  it("wheels in opposite directions spin it in place; more power on the right turns it left", () => {
    let s = startState({ x: 0, y: 0 }, 0);
    for (let i = 0; i < 2000; i++) s = step(p, s, { en: 1, a: 0, b: 1 }, full, 0.0005);
    expect(Math.abs(s.v)).toBeLessThan(1e-6);
    expect(s.heading).toBeGreaterThan(1);
    let t = startState({ x: 0, y: 0 }, 0);
    for (let i = 0; i < 2000; i++) t = step(p, t, { en: 0.4, a: 1, b: 0 }, full, 0.0005);
    expect(t.heading).toBeGreaterThan(0.2);
    expect(t.y).toBeGreaterThan(0);
  });

  it("every track starts on the line and is closed", () => {
    for (const tr of TRACKS) {
      expect(onLine(tr, tr.start), tr.id).toBe(true);
      // 20 cm to the side of the start, across the line: off it.
      const side = { x: tr.start.x - 0.2 * Math.sin(tr.heading), y: tr.start.y + 0.2 * Math.cos(tr.heading) };
      expect(nearest(tr, side).d, tr.id).toBeGreaterThan(0.1);
    }
  });
});

describe("robot + Arduino", () => {
  it("the starter sketch follows the oval for a full lap without leaving the line", async () => {
    const sim = new RobotSim(await build(STARTER), trackById("oval"));
    const r = lapCheck(sim, 60);
    expect(r.passed, JSON.stringify(r)).toBe(true);
    expect(r.lapTime!).toBeGreaterThan(3);
  }, 120_000);

  it("a sketch that just drives straight leaves the line and fails the lap", async () => {
    const sim = new RobotSim(await build(STARTER.replace(/int lastSide[\s\S]*$/, "void loop() { drive(150, 150); }\n")), trackById("oval"));
    const r = lapCheck(sim, 15);
    expect(r.passed).toBe(false);
    expect(r.longestOff).toBeGreaterThan(0.5);
  }, 120_000);

  it("the sensors read the floor under them and reach the program's pins", async () => {
    const sim = new RobotSim(await build("void setup(){pinMode(3,INPUT);Serial.begin(9600);}\nvoid loop(){Serial.println(digitalRead(3)?\"LINE\":\"FLOOR\");delay(50);}\n"), trackById("oval"));
    const f = sim.run(0.3);
    expect(f.sensors.C).toBe(true);
    expect(sim.mcu.serial).toContain("LINE");
  }, 60_000);
});
