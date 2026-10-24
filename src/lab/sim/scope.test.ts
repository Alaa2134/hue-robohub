import { describe, expect, it } from "vitest";
import { measure, toCsv, triggerTime, valueAt, type Channel } from "./scope";

/** A 5 V square wave: `hz`, `duty`, for `cycles` periods starting at t = 0. */
function square(hz: number, duty: number, cycles: number): Channel {
  const c: Channel = { t: [], v: [] };
  const p = 1 / hz;
  for (let k = 0; k < cycles; k++) {
    c.t.push(k * p, k * p + duty * p);
    c.v.push(5, 0);
  }
  return c;
}

describe("scope measurements", () => {
  it("frequency, duty and average of a PWM signal", () => {
    const c = square(490.2, 0.25, 50);
    const m = measure(c, 0, 0.09)!;
    expect(m.freq).toBeCloseTo(490.2, 1);
    expect(m.duty).toBeCloseTo(0.25, 3);
    expect(m.vmax).toBe(5);
    expect(m.vmin).toBe(0);
    expect(m.avg).toBeCloseTo(1.25, 1);
  });

  it("a steady level has no frequency", () => {
    const m = measure({ t: [0], v: [3.3] }, 0, 1)!;
    expect(m).toMatchObject({ vmin: 3.3, vmax: 3.3, freq: null, duty: null });
    expect(m.avg).toBeCloseTo(3.3);
  });

  it("values hold until the next change", () => {
    const c = square(1, 0.5, 3);
    expect(valueAt(c, 0.25)).toBe(5);
    expect(valueAt(c, 0.75)).toBe(0);
    expect(valueAt(c, -1)).toBeNull();
  });

  it("triggers on the latest rising edge that leaves a full window", () => {
    const c = square(10, 0.5, 20);
    expect(triggerTime(c, 2, 0.25, 2.5, true, 5)).toBeCloseTo(1.7, 6);
    expect(triggerTime(c, 2, 0.25, 2.5, false, 5)).toBeCloseTo(1.65, 6);
  });

  it("exports every change as CSV", () => {
    const csv = toCsv(["D9"], [square(1, 0.5, 2)], 0, 1.9).split("\n");
    expect(csv[0]).toBe("time_s,D9_V");
    expect(csv.slice(1).map((r) => r.split(",")[1])).toEqual(["5.0000", "0.0000", "5.0000", "0.0000"]);
  });
});
