import { describe, expect, it } from "vitest";
import { bestWindows, direct, estimateBeat, norms, planMontage, shotLength, type Clip, type Sample } from "./montage";

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

describe("direct", () => {
  const clips = Array.from({ length: 8 }, (_, i) =>
    clip(12, i, i === 5 ? [2, 3, 4] : [3], i === 6 ? { skin: 0.3, motion: 1 } : {}),
  );
  const plan = planMontage(clips, 20);
  const sizes = clips.map(() => ({ w: 1920, h: 1080 }));

  it("tells a story: hook first, the climax near the end, a calm people shot to close", () => {
    const shots = direct(clips, plan, { style: "energetic", seed: "x", aspect: 9 / 16, sizes });
    expect(shots[0].role).toBe("hook");
    expect(shots.at(-1)!.role).toBe("close");
    const roles = shots.map((s) => s.role);
    expect(roles.lastIndexOf("build")).toBeLessThan(roles.indexOf("climax") === -1 ? Infinity : roles.indexOf("climax"));
    expect(shots[0].transition).toBe("cut");
    expect(shots.at(-1)!.transition).toBe("dip");
  });

  it("cinematic: crossfades and slow motion on the climax; clean: plain cuts", () => {
    const cine = direct(clips, plan, { style: "cinematic", seed: "x", aspect: 9 / 16, sizes });
    expect(cine.slice(1, -1).every((s) => s.transition === "fade")).toBe(true);
    expect(cine.filter((s) => s.role === "climax").every((s) => s.speed < 1)).toBe(true);
    const clean = direct(clips, plan, { style: "clean", seed: "x", aspect: 9 / 16, sizes });
    expect(clean.slice(1, -1).every((s) => s.transition === "cut" && s.speed === 1)).toBe(true);
  });

  it("a wide group shot in a tall reel sits whole on a blur instead of losing people", () => {
    const shots = direct(clips, plan, { style: "clean", seed: "x", aspect: 9 / 16, sizes });
    expect(shots.find((s) => s.role === "close")!.fit).toBe("blur");
    const square = direct(clips, plan, { style: "clean", seed: "x", aspect: 16 / 9, sizes });
    expect(square.every((s) => s.fit === "fill")).toBe(true);
  });

  it("on the beat, shots last whole beats", () => {
    const shots = direct(clips, planMontage(clips, 20, 0.5), { style: "energetic", seed: "x", aspect: 1, sizes, beat: 0.5 });
    expect(shots.every((s) => Math.abs(s.len / 0.5 - Math.round(s.len / 0.5)) < 1e-9)).toBe(true);
  });
});
