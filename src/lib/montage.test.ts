import { describe, expect, it } from "vitest";
import { bestWindows, estimateBeat, norms, planMontage, shotLength, type Clip, type Sample } from "./montage";

/** A video `d` seconds long sampled every second; `hot` seconds are busy, sharp and full of people. */
function clip(d: number, at: number, hot: number[] = [], base: Partial<Sample> = {}): Clip {
  return {
    duration: d,
    at,
    samples: Array.from({ length: Math.floor(d) }, (_, t) =>
      hot.includes(t) ? { t, motion: 20, sharp: 900, skin: 0.3, mean: 130 } : { t, motion: 2, sharp: 200, skin: 0.02, mean: 120, ...base },
    ),
  };
}

describe("bestWindows", () => {
  it("finds the busy moment in a video", () => {
    const c = clip(20, 0, [12, 13]);
    const w = bestWindows(c, 2, norms([c]));
    expect(w[0].start).toBe(12);
  });
  it("a too-dark video scores nothing", () => {
    const c = clip(10, 0, [], { mean: 10 });
    expect(bestWindows(c, 2, norms([c]))[0].score).toBe(0);
  });
});

describe("planMontage", () => {
  it("opens with the best moment, then follows the filming order, about the length asked", () => {
    const clips = [clip(15, 300, [3]), clip(15, 100, [8, 9]), clip(15, 200, [5]), clip(15, 400)];
    const plan = planMontage(clips, 8);
    expect(plan[0].clip).toBe(1);
    expect(plan.slice(1).map((s) => clips[s.clip].at)).toEqual([...plan.slice(1).map((s) => clips[s.clip].at)].sort((a, b) => a - b));
    const total = plan.reduce((a, s) => a + s.len, 0);
    expect(total).toBeGreaterThan(6);
    expect(total).toBeLessThan(10.5);
  });
  it("with few videos, takes two moments from one", () => {
    const plan = planMontage([clip(30, 0, [4, 20])], 6);
    expect(plan.length).toBe(2);
    expect(new Set(plan.map((s) => s.start)).size).toBe(2);
  });
  it("nothing in, nothing out", () => {
    expect(planMontage([], 30)).toEqual([]);
  });
});

describe("music", () => {
  it("shots last a few beats", () => {
    expect(shotLength(30, 50, 0.5)).toBeCloseTo(2);
    expect(shotLength(30, 50, 0.4)).toBeCloseTo(1.6);
    expect(shotLength(30, 50, null)).toBeGreaterThanOrEqual(1.6);
  });
  it("hears 120 beats a minute", () => {
    const rate = 100;
    const env = new Float32Array(rate * 12);
    for (let i = 0; i < env.length; i++) env[i] = i % 50 < 4 ? 1 : 0.1;
    expect(estimateBeat(env, rate)).toBeCloseTo(0.5, 2);
  });
  it("no beat in silence", () => {
    expect(estimateBeat(new Float32Array(1200), 100)).toBeNull();
  });
});
