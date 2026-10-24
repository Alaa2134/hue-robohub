import { beforeAll, describe, expect, it } from "vitest";
import { buildSketch, type Toolchain } from "../compiler/build";
import { nodeToolchain } from "../compiler/node-toolchain";
import { EXAMPLES, exampleBySlug } from "../examples";
import { F_CPU, Simulation, TRACE_PINS, type Frame } from "./engine";
import { measure } from "./scope";
import { addTrace, newTrace } from "./use-sim";

let tc: Toolchain;
beforeAll(async () => {
  tc = await nodeToolchain();
});

async function start(slug: string) {
  const ex = exampleBySlug(slug)!;
  const r = await buildSketch(tc, ex.doc.files, ex.doc.main);
  expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  const sim = new Simulation(ex.doc, r.hex!);
  const frames: Frame[] = [];
  const run = (seconds: number, step = 0.05) => {
    for (let t = 0; t < seconds; t += step) {
      sim.run(Math.round(step * F_CPU));
      frames.push(sim.frame(step));
    }
    return frames;
  };
  return { ex, sim, run, frames, serial: () => frames.map((f) => f.serial).join("") };
}
const partOf = (slug: string, type: string, i = 0) => exampleBySlug(slug)!.doc.parts.filter((p) => p.type === type)[i].id;

describe("examples", () => {
  it("every example builds and has no wiring problems", async () => {
    for (const ex of EXAMPLES) {
      const r = await buildSketch(tc, ex.doc.files, ex.doc.main);
      expect(r.ok, ex.slug).toBe(true);
      const sim = new Simulation(ex.doc, r.hex!);
      expect(sim.diagnostics.filter((d) => d.level !== "info"), ex.slug).toEqual([]);
    }
  });

  it("Blink: the LED is on for 0.5 s and off for 0.5 s at about 12 mA", async () => {
    const s = await start("blink");
    const led = partOf("blink", "led");
    s.run(2, 0.1);
    const mA = s.frames.map((f) => (f.parts[led]?.i ?? 0) * 1000);
    const on = mA.filter((x) => x > 10);
    const off = mA.filter((x) => x < 0.01);
    expect(on.length).toBeGreaterThanOrEqual(8);
    expect(off.length).toBeGreaterThanOrEqual(8);
    expect(on[0]).toBeGreaterThan(11);
    expect(on[0]).toBeLessThan(14);
  });

  it("Button LED: pressing the button lights the LED and prints", async () => {
    const s = await start("button-led");
    const led = partOf("button-led", "led");
    s.run(0.3);
    expect(s.frames.at(-1)!.parts[led]?.i ?? 0).toBeLessThan(1e-5);
    s.sim.setLive(partOf("button-led", "pushbutton"), "pressed", true);
    s.run(0.3);
    expect(s.frames.at(-1)!.parts[led].i).toBeGreaterThan(0.005);
    s.sim.setLive(partOf("button-led", "pushbutton"), "pressed", false);
    s.run(0.3);
    expect(s.frames.at(-1)!.parts[led].i).toBeLessThan(1e-5);
    expect(s.serial()).toContain("pressed");
    expect(s.serial()).toContain("released");
  });

  it("Potentiometer: A0 follows the knob and the LED's average current follows A0", async () => {
    const s = await start("potentiometer-dimmer");
    const pot = partOf("potentiometer-dimmer", "potentiometer");
    const led = partOf("potentiometer-dimmer", "led");
    s.sim.setLive(pot, "pos", 0.2);
    s.run(0.6);
    const low = s.frames.at(-1)!.parts[led].i;
    s.sim.setLive(pot, "pos", 0.9);
    s.run(0.6);
    const high = s.frames.at(-1)!.parts[led].i;
    expect(high).toBeGreaterThan(low * 2);
    const values = [...s.serial().matchAll(/A0 = (\d+)/g)].map((m) => Number(m[1]));
    expect(Math.min(...values)).toBeLessThan(300);
    expect(Math.max(...values)).toBeGreaterThan(700);
  });

  it("Serial hello: greets and echoes input", async () => {
    const s = await start("serial-hello");
    s.run(0.2);
    expect(s.serial()).toContain("Hello from BuildX Lab!");
    s.sim.serialWrite("robots\n");
    s.run(1.2);
    expect(s.serial()).toContain("You said: robots");
  });

  it("Servo sweep: the measured angle moves across the range", async () => {
    const s = await start("servo-sweep");
    const servo = partOf("servo-sweep", "servo");
    s.run(3, 0.1);
    const angles = s.frames.map((f) => f.parts[servo]?.angle ?? -1).filter((a) => a >= 0);
    expect(Math.max(...angles) - Math.min(...angles)).toBeGreaterThan(90);
  });

  it("Ultrasonic: prints the distance set on the sensor", async () => {
    const s = await start("ultrasonic-ruler");
    s.run(1);
    expect(s.serial()).toMatch(/Distance: (41|42|43) cm/);
    s.sim.setLive(partOf("ultrasonic-ruler", "hc-sr04"), "cm", 120);
    s.run(1);
    expect(s.serial()).toMatch(/Distance: (119|120|121) cm/);
  });

  it("Night light: the LED turns on in the dark", async () => {
    const s = await start("night-light");
    const led = partOf("night-light", "led");
    const ldr = partOf("night-light", "ldr");
    s.sim.setLive(ldr, "lux", 500);
    s.run(0.5);
    expect(s.frames.at(-1)!.parts[led].i).toBeLessThan(1e-5);
    s.sim.setLive(ldr, "lux", 1);
    s.run(0.5);
    expect(s.frames.at(-1)!.parts[led].i).toBeGreaterThan(0.005);
  });

  it("Melody: the buzzer frequency is the note the code plays", async () => {
    const s = await start("buzzer-melody");
    const bz = partOf("buzzer-melody", "buzzer");
    s.run(2.2, 0.1);
    const f = s.frames.map((x) => x.parts[bz]?.freq ?? 0).filter((x) => x > 0);
    expect(f.some((x) => Math.abs(x - 262) < 15)).toBe(true);
    expect(f.some((x) => Math.abs(x - 523) < 25)).toBe(true);
  });

  it("Transistor motor: the motor speeds up with PWM", async () => {
    const s = await start("transistor-motor");
    const m = partOf("transistor-motor", "dc-motor");
    s.run(1.6, 0.1);
    const speeds = s.frames.map((f) => f.parts[m]?.speed ?? 0);
    expect(speeds[2]).toBeLessThan(speeds[12]);
    expect(Math.max(...speeds)).toBeGreaterThan(0.5);
  });

  it("Traffic light: exactly one LED is on at a time", async () => {
    const s = await start("traffic-light");
    const leds = exampleBySlug("traffic-light")!.doc.parts.filter((p) => p.type === "led").map((p) => p.id);
    s.run(7.5, 0.25);
    for (const f of s.frames.slice(1)) {
      const lit = leds.filter((id) => (f.parts[id]?.i ?? 0) > 0.008);
      expect(lit.length).toBeLessThanOrEqual(1);
    }
    const seen = new Set(s.frames.flatMap((f) => leds.filter((id) => (f.parts[id]?.i ?? 0) > 0.008)));
    expect(seen.size).toBe(3);
  });

  it("Oscilloscope traces: Blink's D13 is 1 Hz at 50 %, PWM on D9 is about 490 Hz", async () => {
    const blink = await start("blink");
    blink.sim.setTracing(true);
    const tr = newTrace();
    for (const f of blink.run(3.2)) if (f.trace) addTrace(tr, f.trace, f.t);
    const d13 = measure(tr[TRACE_PINS.indexOf("D13")], 0.1, 3.2)!;
    expect(d13.freq).toBeCloseTo(1, 2);
    expect(d13.duty).toBeCloseTo(0.5, 2);
    expect(d13.vmax).toBeGreaterThan(4.5);

    const fade = await start("pwm-fade");
    fade.sim.setTracing(true);
    const tf = newTrace();
    for (const f of fade.run(0.4, 0.01)) if (f.trace) addTrace(tf, f.trace, f.t);
    const d9 = measure(tf[TRACE_PINS.indexOf("D9")], 0.3, 0.32)!;
    expect(d9.freq! / 490.2).toBeCloseTo(1, 2);
    expect(d9.duty).toBeGreaterThan(0);
    expect(d9.duty).toBeLessThan(1);
  });

  it("7-segment counter: shows 0, 1, 2 … as the sketch counts", async () => {
    const { run, frames } = await start("seven-segment-counter");
    const seg = partOf("seven-segment-counter", "seg7");
    const lit = (f: Frame) => ["a", "b", "c", "d", "e", "f", "g"].filter((s) => f.parts[seg][`i_${s}`] > 0.003).join("");
    run(2.4);
    // 0.35 s into each 0.7 s step.
    const at = (t: number) => lit(frames[Math.round(t / 0.05) - 1]);
    expect(at(0.35)).toBe("abcdef");
    expect(at(1.05)).toBe("bc");
    expect(at(1.75)).toBe("abdeg");
    expect(frames.at(-1)!.parts[seg].i_a).toBeLessThan(0.012);
  });
});
