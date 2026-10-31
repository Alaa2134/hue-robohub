import { describe, expect, it } from "vitest";
import type { Clip } from "./edl.ts";
import { fitRect, layersAt, motionRect } from "./compose.ts";
import { emptyTimeline } from "./presets.ts";
import { addClip } from "./timeline.ts";

const media = (id: string, start: number, duration: number, extra: object = {}): Clip =>
  ({ id, type: "media", assetId: "a", start, duration, in: 1, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, fit: "cover", transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, motion: null, transitionIn: null, ...extra }) as Clip;

describe("layersAt", () => {
  const t0 = emptyTimeline({ width: 1080, height: 1920, fps: 30, background: "#000000" });
  it("keeps the outgoing clip under a crossfade, fading the new one in", () => {
    let t = addClip(t0, "v1", media("a", 0, 4));
    t = addClip(t, "v1", media("b", 4, 4, { transitionIn: { kind: "crossfade", duration: 1 } }));
    const at = layersAt(t, 4.5);
    expect(at.map((l) => l.clip.id)).toEqual(["a", "b"]);
    expect(at[0].sourceTime).toBeCloseTo(5.5);
    expect(at[1].alpha).toBeCloseTo(0.5);
    expect(layersAt(t, 5.1).map((l) => l.clip.id)).toEqual(["b"]);
  });
  it("dips to black, slides in, and zooms over time", () => {
    let t = addClip(t0, "v1", media("a", 0, 4));
    t = addClip(t, "v1", media("b", 4, 4, { transitionIn: { kind: "dip", duration: 1 }, motion: { from: { scale: 1, x: 0, y: 0 }, to: { scale: 1.2, x: 0, y: 0 } } }));
    t = addClip(t, "v2", media("c", 0, 2, { transitionIn: { kind: "slide-left", duration: 1 } }));
    expect(layersAt(t, 3.5).find((l) => l.clip.id === "a")!.black).toBeCloseTo(0.5);
    const b = layersAt(t, 4.25).find((l) => l.clip.id === "b")!;
    expect(b.black).toBeCloseTo(0.75);
    expect(b.motion!.zoom).toBeCloseTo(1.0125);
    expect(layersAt(t, 0.5).find((l) => l.clip.id === "c")!.slideX).toBeCloseTo(540);
  });
});

describe("fit", () => {
  it("covers by cropping and contains by letterboxing", () => {
    const c = fitRect(1920, 1080, 1080, 1920, "cover");
    expect(c.src.h).toBeCloseTo(1080);
    expect(c.src.w).toBeCloseTo(607.5);
    const k = fitRect(1920, 1080, 1080, 1920, "contain");
    expect(k.dst.w).toBeCloseTo(1080);
    expect(k.dst.h).toBeCloseTo(607.5);
    const m = motionRect({ x: 0, y: 0, w: 1000, h: 1000 }, 2, 1, 0);
    expect(m).toEqual({ x: 500, y: 250, w: 500, h: 500 });
  });
});
