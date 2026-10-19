import { describe, expect, it } from "vitest";
import { Circuit, type Drive } from "./mna";

const none = new Map<string, Drive>();

describe("DC solver", () => {
  it("solves a voltage divider", () => {
    // 1: source +, 2: divider middle
    const c = new Circuit(3, [
      { t: "V", a: 1, b: 0, v: 10, r: 1e-6 },
      { t: "R", a: 1, b: 2, r: 1000 },
      { t: "R", a: 2, b: 0, r: 3000 },
    ]);
    const s = c.solve(none);
    expect(s.ok).toBe(true);
    expect(s.v[2]).toBeCloseTo(7.5, 4);
    expect(s.i[1]).toBeCloseTo(0.0025, 6);
  });

  it("an LED with a 220 Ω resistor from a 5 V pin draws about 12 mA", () => {
    const c = new Circuit(3, [
      { t: "X", a: 1, b: 0, key: "pin" },
      { t: "R", a: 1, b: 2, r: 220 },
      { t: "D", a: 2, k: 0, vf: 1.8, ron: 15 },
    ]);
    const on = c.solve(new Map([["pin", { v: 5, r: 25 }]]));
    expect(on.i[2] * 1000).toBeCloseTo((5 - 1.8) / (25 + 220 + 15) * 1000, 2);
    const off = c.solve(new Map([["pin", { v: 0, r: 25 }]]));
    expect(Math.abs(off.i[2])).toBeLessThan(1e-6);
  });

  it("a reversed LED doesn't conduct", () => {
    const c = new Circuit(3, [
      { t: "V", a: 1, b: 0, v: 5, r: 0.01 },
      { t: "R", a: 1, b: 2, r: 220 },
      { t: "D", a: 0, k: 2, vf: 1.8, ron: 15 },
    ]);
    const s = c.solve(none);
    expect(Math.abs(s.i[2])).toBeLessThan(1e-6);
    expect(s.v[2]).toBeCloseTo(5, 2);
  });

  it("an NPN switch saturates with enough base current and cuts off without it", () => {
    // 9 V → 100 Ω load → collector; base through 1 kΩ from a pin; emitter to ground.
    const mk = () =>
      new Circuit(5, [
        { t: "V", a: 1, b: 0, v: 9, r: 0.01 },
        { t: "R", a: 1, b: 2, r: 100 },
        { t: "Q", c: 2, b: 3, e: 0, beta: 150, pnp: false },
        { t: "R", a: 4, b: 3, r: 1000 },
        { t: "X", a: 4, b: 0, key: "pin" },
      ]);
    const sat = mk().solve(new Map([["pin", { v: 5, r: 25 }]]));
    expect(sat.ok).toBe(true);
    expect(sat.v[2]).toBeLessThan(0.5); // saturated: Vce small
    const off = mk().solve(new Map([["pin", { v: 0, r: 25 }]]));
    expect(off.v[2]).toBeCloseTo(9, 1);
  });

  it("an NPN in its active region amplifies base current by β", () => {
    // Small base current: Ib ≈ (5 − 0.65) / 470k ≈ 9.3 µA → Ic ≈ 1.4 mA; 1k load keeps it active.
    const c = new Circuit(4, [
      { t: "V", a: 1, b: 0, v: 9, r: 0.01 },
      { t: "R", a: 1, b: 2, r: 1000 },
      { t: "Q", c: 2, b: 3, e: 0, beta: 150, pnp: false },
      { t: "R", a: 1, b: 3, r: 470_000 },
    ]);
    const s = c.solve(none);
    const ib = (9 - s.v[3]) / 470_000;
    expect(s.i[2] / ib).toBeCloseTo(150, 0);
  });

  it("a MOSFET turns on above its threshold", () => {
    const mk = () =>
      new Circuit(4, [
        { t: "V", a: 1, b: 0, v: 12, r: 0.01 },
        { t: "R", a: 1, b: 2, r: 10 },
        { t: "M", d: 2, g: 3, s: 0, vth: 2, ron: 0.025, p: false },
        { t: "X", a: 3, b: 0, key: "g" },
      ]);
    expect(mk().solve(new Map([["g", { v: 5, r: 25 }]])).v[2]).toBeLessThan(0.1);
    expect(mk().solve(new Map([["g", { v: 0, r: 25 }]])).v[2]).toBeCloseTo(12, 1);
  });
});
