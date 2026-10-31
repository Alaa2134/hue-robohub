import { describe, expect, it } from "vitest";
import { type AssetInfo, type Clip, type MediaClip, Timeline } from "./edl.ts";
import { emptyTimeline, frameSize, scaleTo } from "./presets.ts";
import { addClip, appendClip, duplicateClip, duration, moveClip, quickAssemble, removeClip, snap, splitClip, trimClip, visibleAt } from "./timeline.ts";

const settings = { width: 1080, height: 1920, fps: 30 as const, background: "#000000" };
const assets = new Map<string, AssetInfo>([
  ["v", { id: "v", kind: "video", duration: 10, width: 1920, height: 1080, hasAudio: true }],
  ["i", { id: "i", kind: "image", duration: null, width: 800, height: 600, hasAudio: false }],
]);
const clip = (id: string, start: number, dur: number, assetId = "v", extra: Partial<MediaClip> = {}): Clip =>
  ({ id, type: "media", assetId, start, duration: dur, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, fit: "cover", transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, motion: null, transitionIn: null, ...extra }) as Clip;
const v1 = (t: Timeline) => t.tracks[0].clips;

describe("presets", () => {
  it("sizes frames by aspect and resolution", () => {
    expect(frameSize("9:16", "1080p")).toEqual({ width: 1080, height: 1920 });
    expect(frameSize("16:9", "2160p")).toEqual({ width: 3840, height: 2160 });
    expect(frameSize("1:1", "720p")).toEqual({ width: 720, height: 720 });
    expect(scaleTo({ width: 1080, height: 1920 }, "720p")).toEqual({ width: 720, height: 1280 });
  });
});

describe("timeline ops", () => {
  const base = () => addClip(addClip(emptyTimeline(settings), "v1", clip("a", 0, 4)), "v1", clip("b", 4, 3));

  it("keeps clips from overlapping on a track", () => {
    const t = addClip(base(), "v1", clip("c", 2, 2));
    // c keeps its place; a is trimmed to make room, b moves after c.
    expect(v1(t).map((c) => [c.id, c.start, c.duration])).toEqual([["a", 0, 2], ["c", 2, 2], ["b", 4, 3]]);
    expect(duration(t)).toBe(7);
  });

  it("splits at a time, carrying the source offset", () => {
    const { timeline, right } = splitClip(base(), "a", 1.5);
    const r = v1(timeline).find((c) => c.id === right) as MediaClip;
    expect(v1(timeline).find((c) => c.id === "a")!.duration).toBe(1.5);
    expect([r.start, r.duration, r.in]).toEqual([1.5, 2.5, 1.5]);
    expect(splitClip(base(), "a", 0.01).right).toBeNull();
  });

  it("trims both edges within the source", () => {
    let t = trimClip(base(), "b", "end", 100, assets);
    expect(v1(t).find((c) => c.id === "b")!.duration).toBe(10); // a 10 s source
    t = trimClip(base(), "b", "start", 5, assets);
    const b = v1(t).find((c) => c.id === "b") as MediaClip;
    expect([b.start, b.duration, b.in]).toEqual([5, 2, 1]);
    // Can't start before the source does.
    t = trimClip(base(), "b", "start", 1, assets);
    expect(v1(t).find((c) => c.id === "b")!.start).toBe(4);
  });

  it("moves between tracks of the same kind only", () => {
    let t = moveClip(base(), "b", 10, "v2");
    expect(t.tracks[1].clips.map((c) => c.id)).toEqual(["b"]);
    expect(t.tracks[1].clips[0].start).toBe(10);
    t = moveClip(base(), "b", 10, "a1");
    expect(v1(t).map((c) => c.id)).toEqual(["a", "b"]);
  });

  it("duplicates after the original and removes with ripple", () => {
    const { timeline, copy } = duplicateClip(base(), "a");
    expect(v1(timeline).map((c) => c.id)).toEqual(["a", copy, "b"]);
    expect(v1(timeline)[2].start).toBe(8);
    const r = removeClip(timeline, copy!, true);
    expect(v1(r).map((c) => [c.id, c.start])).toEqual([["a", 0], ["b", 4]]);
  });

  it("snaps to edges and finds what's visible", () => {
    const t = base();
    expect(snap(t, 4.07, 0.1)).toBe(4);
    expect(snap(t, 5.5, 0.1)).toBe(5.5);
    expect(visibleAt(t, 4.5).map((x) => x.clip.id)).toEqual(["b"]);
  });

  it("assembles a quick cut of a set length", () => {
    const list = [...assets.values()];
    const t = quickAssemble(emptyTimeline(settings), list, { seconds: 30 });
    expect(duration(t)).toBe(30);
    expect(v1(t).every((c) => c.duration >= 0.04)).toBe(true);
    expect(Timeline.parse(JSON.parse(JSON.stringify(t)))).toBeTruthy();
    expect(appendClip(t, "v1", { ...clip("z", 0, 2) }).tracks[0].clips.at(-1)!.start).toBe(30);
    // Too many files for the length: every one still appears, shorter.
    const many: AssetInfo[] = Array.from({ length: 15 }, (_, k) => ({ id: `x${k}`, kind: k < 5 ? "video" : "image", duration: k < 5 ? 6 : null, width: 1, height: 1, hasAudio: false }));
    const m = quickAssemble(emptyTimeline(settings), many, { seconds: 30 });
    expect(duration(m)).toBe(30);
    expect(new Set(v1(m).map((c) => (c as MediaClip).assetId)).size).toBe(15);
  });
});
