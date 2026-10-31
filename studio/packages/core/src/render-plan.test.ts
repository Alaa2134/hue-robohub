import { describe, expect, it } from "vitest";
import type { AssetInfo, Clip } from "./edl.ts";
import { emptyTimeline } from "./presets.ts";
import { planRender } from "./render-plan.ts";
import { addClip } from "./timeline.ts";

const settings = { width: 1080, height: 1920, fps: 30 as const, background: "#101820" };
const assets = new Map<string, AssetInfo>([
  ["v", { id: "v", kind: "video", duration: 6, width: 1920, height: 1080, hasAudio: true }],
  ["m", { id: "m", kind: "video", duration: 6, width: 1920, height: 1080, hasAudio: false }],
  ["i", { id: "i", kind: "image", duration: null, width: 800, height: 600, hasAudio: false }],
  ["s", { id: "s", kind: "audio", duration: 60, width: null, height: null, hasAudio: true }],
]);
const files = new Map([["v", "/x/v.mp4"], ["m", "/x/m.mp4"], ["i", "/x/i.jpg"], ["s", "/x/s.mp3"], ["title", "/x/title.png"]]);
const media = (id: string, assetId: string, start: number, duration: number, extra: object = {}): Clip =>
  ({ id, type: "media", assetId, start, duration, in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, fit: "cover", transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, motion: null, transitionIn: null, ...extra }) as Clip;

describe("planRender", () => {
  it("builds one command: inputs, layers, mixed sound, H.264/AAC", () => {
    let t = emptyTimeline(settings);
    t = addClip(t, "v1", media("a", "v", 0, 4, { in: 1 }));
    t = addClip(t, "v1", media("b", "i", 4, 3, { motion: { from: { scale: 1, x: 0, y: 0 }, to: { scale: 1.2, x: 0.1, y: 0 } }, transitionIn: { kind: "crossfade", duration: 0.5 } }));
    t = addClip(t, "v2", media("c", "m", 1, 2, { fit: "contain", transform: { x: 0.5, y: -0.5, scale: 0.4, rotation: 0, opacity: 0.8 } }));
    t = addClip(t, "t1", { id: "title", type: "text", text: "BuildX", start: 0, duration: 2, font: "Plex Arabic", size: 0.06, color: "#ffffff", box: null, weight: 700, align: "center", transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, fadeIn: 0.3, fadeOut: 0.3 });
    t = addClip(t, "a1", media("music", "s", 0, 7, { volume: 0.5, fadeOut: 1 }));
    const p = planRender({ timeline: t, assets, files, output: { path: "/out.mp4", width: 1080, height: 1920, fps: 30, quality: "standard" } });
    expect(p.duration).toBe(7);
    expect(p.frames).toBe(210);
    expect(p.layers).toBe(4);
    expect(p.sounds).toBe(2); // the video with sound + the music (the silent video adds none)
    const g = p.args[p.args.indexOf("-filter_complex") + 1];
    expect(g).toContain("color=c=0x101820:s=1080x1920:r=30:d=7");
    expect(g).toContain("zoompan=");
    expect(g).toContain("fade=t=in:st=0:d=0.5:alpha=1"); // the crossfade
    expect(g).toContain("amix=inputs=2");
    // A title's place is drawn into its image: its layer isn't moved again (it was, and fell off the frame).
    expect(g).toMatch(/\[o2\]\[l3\]overlay=x='\(W-w\)\/2':y='\(H-h\)\/2'/);
    // The clip before the crossfade keeps playing 0.5 s under it.
    expect(p.args.join(" ")).toContain("-ss 1 -t 4.5 -i /x/v.mp4");
    expect(p.args).toEqual(expect.arrayContaining(["libx264", "yuv420p", "aac", "+faststart", "/out.mp4"]));
  });

  it("caps at a maximum length and adds silence when nothing has sound", () => {
    let t = emptyTimeline(settings);
    t = addClip(t, "v1", media("a", "i", 0, 40));
    const p = planRender({ timeline: t, assets, files, output: { path: "/o.mp4", width: 720, height: 1280, fps: 24, quality: "draft", maxSeconds: 30 } });
    expect(p.duration).toBe(30);
    expect(p.frames).toBe(720);
    expect(p.args.join(" ")).toContain("anullsrc");
  });

  it("refuses an empty timeline and a missing file", () => {
    expect(() => planRender({ timeline: emptyTimeline(settings), assets, files, output: { path: "/o.mp4", width: 720, height: 1280, fps: 30, quality: "draft" } })).toThrow(/empty/);
    const t = addClip(emptyTimeline(settings), "v1", media("a", "v", 0, 2));
    expect(() => planRender({ timeline: t, assets, files: new Map(), output: { path: "/o.mp4", width: 720, height: 1280, fps: 30, quality: "draft" } })).toThrow(/Missing file/);
  });
});
