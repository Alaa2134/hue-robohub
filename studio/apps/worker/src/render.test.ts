import { mkdirSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { addClip, emptyTimeline, frameSize, planRender, quickAssemble, type AssetInfo, type Clip } from "@studio/core";
import { Cancelled, probe, runFfmpeg, waveform } from "./ffmpeg.ts";
import { makeFixtures } from "./fixtures.ts";
import { renderTitle } from "./titles.ts";

const tools = { ffmpeg: "ffmpeg", ffprobe: "ffprobe" };
const dir = path.join(os.tmpdir(), "studio-render-test");
const fx = makeFixtures(path.join(os.tmpdir(), "studio-fixtures"));
mkdirSync(dir, { recursive: true });
afterAll(() => rmSync(dir, { recursive: true, force: true }));

describe("probe", () => {
  it("tells videos, stills and sound apart and reads their facts", async () => {
    const v = await probe(tools, fx.videos[0]);
    expect(v).toMatchObject({ kind: "video", width: 720, height: 1280, hasAudio: true, codec: "h264" });
    expect(v.duration).toBeCloseTo(6, 0);
    const i = await probe(tools, fx.images[1]);
    expect(i).toMatchObject({ kind: "image", width: 1600, height: 1200, duration: null });
    const a = await probe(tools, fx.music);
    expect(a.kind).toBe("audio");
    await expect(probe(tools, __filename)).rejects.toThrow(/Not a readable media file/);
    const peaks = await waveform(tools, fx.music, 40);
    expect(peaks.length).toBeGreaterThan(700);
    expect(Math.max(...peaks)).toBeGreaterThan(0.3);
  });
});

describe("render", () => {
  it("renders 5 videos + 10 images + music + a title into a real 30-second 1080×1920 MP4", async () => {
    const assets = new Map<string, AssetInfo>();
    const files = new Map<string, string>();
    const list: AssetInfo[] = [];
    for (const [k, f] of [...fx.videos.map((f, i) => [`v${i}`, f]), ...fx.images.map((f, i) => [`i${i}`, f])] as [string, string][]) {
      const p = await probe(tools, f);
      const info: AssetInfo = { id: k, kind: p.kind as AssetInfo["kind"], duration: p.duration, width: p.width, height: p.height, hasAudio: p.hasAudio };
      assets.set(k, info);
      files.set(k, f);
      list.push(info);
    }
    // Interleave videos and stills.
    const order = list.filter((a) => a.kind === "video").flatMap((v, i) => [v, list.filter((a) => a.kind === "image")[i * 2], list.filter((a) => a.kind === "image")[i * 2 + 1]]);
    const size = frameSize("9:16", "1080p");
    let t = quickAssemble(emptyTimeline({ ...size, fps: 30, background: "#000000" }), order, { seconds: 30, still: 2, maxShot: 2.5 });
    assets.set("music", { id: "music", kind: "audio", duration: 40, width: null, height: null, hasAudio: true });
    files.set("music", fx.music);
    t = addClip(t, "a1", { id: "m", type: "media", assetId: "music", start: 0, duration: 30, in: 0, speed: 1, volume: 0.4, fadeIn: 1, fadeOut: 2, fit: "cover", transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, motion: null, transitionIn: null, color: null, duck: false } as Clip);
    const title: Clip = { id: "title", type: "text", text: "BuildX HUE — روبوتات", start: 0.5, duration: 3, font: "Plex Arabic", size: 0.06, color: "#ffffff", box: "#00000088", weight: 700, align: "center", transform: { x: 0, y: 0.6, scale: 1, rotation: 0, opacity: 1 }, fadeIn: 0.3, fadeOut: 0.3, style: "plain", subtitle: null, accent: "#45d0ff", animation: "none" };
    t = addClip(t, "t1", title);
    const png = path.join(dir, "title.png");
    renderTitle(title as never, size.width, size.height, png);
    files.set("title", png);

    const out = path.join(dir, "out.mp4");
    const plan = planRender({ timeline: t, assets, files, output: { path: out, ...size, fps: 30, quality: "draft" } });
    expect(plan.duration).toBe(30);
    const seen: number[] = [];
    await runFfmpeg(tools, plan.args, { onProgress: (s) => seen.push(s) });
    const p = await probe(tools, out);
    expect(p).toMatchObject({ kind: "video", codec: "h264", width: 1080, height: 1920, hasAudio: true, fps: 30 });
    expect(p.duration).toBeCloseTo(30, 1);
    expect(seen.length).toBeGreaterThan(3);
    expect(Math.max(...seen)).toBeGreaterThan(25);
    // A frame from the title's time, kept for a look.
    await runFfmpeg(tools, ["-y", "-ss", "2", "-i", out, "-frames:v", "1", path.join(os.tmpdir(), "studio-frame-2s.jpg")]);
  });

  it("renders color grades, animated title templates and ducked music (a valid FFmpeg graph)", async () => {
    const size = { width: 540, height: 960 };
    const v = await probe(tools, fx.videos[0]);
    const assets = new Map<string, AssetInfo>([
      ["v", { id: "v", kind: "video", duration: v.duration, width: v.width, height: v.height, hasAudio: true }],
      ["i", { id: "i", kind: "image", duration: null, width: 1600, height: 1200, hasAudio: false }],
      ["m", { id: "m", kind: "audio", duration: 40, width: null, height: null, hasAudio: true }],
    ]);
    const files = new Map([["v", fx.videos[0]], ["i", fx.images[1]], ["m", fx.music]]);
    const base = { in: 0, speed: 1, volume: 1, fadeIn: 0, fadeOut: 0, fit: "cover", transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, motion: null, transitionIn: null, color: null, duck: false } as const;
    let t = emptyTimeline({ ...size, fps: 25, background: "#000000" });
    t = addClip(t, "v1", { ...base, id: "a", type: "media", assetId: "v", start: 0, duration: 3, color: { brightness: 0.05, contrast: 1.2, saturation: 1.4, temperature: 0.6 } } as Clip);
    t = addClip(t, "v1", { ...base, id: "b", type: "media", assetId: "i", start: 3, duration: 3, color: { brightness: 0, contrast: 1.2, saturation: 0, temperature: 0 }, transitionIn: { kind: "dip", duration: 0.5 } } as Clip);
    t = addClip(t, "a1", { ...base, id: "music", type: "media", assetId: "m", start: 0, duration: 6, volume: 0.8, duck: true } as Clip);
    const titles: Clip[] = [
      { id: "lt", type: "text", text: "أحمد علي", start: 0.3, duration: 2.5, font: "Plex Arabic", size: 0.05, color: "#ffffff", box: null, weight: 700, align: "center", transform: { x: 0, y: 0.6, scale: 1, rotation: 0, opacity: 1 }, fadeIn: 0.4, fadeOut: 0.4, style: "lower-third", subtitle: "قائد فريق الروبوتات", accent: "#45d0ff", animation: "slide" },
      { id: "hl", type: "text", text: "Robotex 2026", start: 3.2, duration: 2.5, font: "Saira", size: 0.07, color: "#ffffff", box: null, weight: 800, align: "center", transform: { x: 0, y: -0.2, scale: 1, rotation: 0, opacity: 1 }, fadeIn: 0.4, fadeOut: 0.4, style: "headline", subtitle: "BuildX HUE", accent: "#ff5d6c", animation: "rise" },
    ];
    for (const c of titles) {
      t = addClip(t, "t1", c);
      const png = path.join(dir, `${c.id}.png`);
      renderTitle(c as never, size.width, size.height, png);
      files.set(c.id, png);
    }
    const out = path.join(dir, "styled.mp4");
    const plan = planRender({ timeline: t, assets, files, output: { path: out, ...size, fps: 25, quality: "draft" } });
    await runFfmpeg(tools, plan.args);
    const p = await probe(tools, out);
    expect(p).toMatchObject({ kind: "video", codec: "h264", width: 540, height: 960, hasAudio: true });
    expect(p.duration).toBeCloseTo(6, 1);
    for (const s of [1.5, 4.5]) await runFfmpeg(tools, ["-y", "-ss", String(s), "-i", out, "-frames:v", "1", path.join(os.tmpdir(), `studio-styled-${s}.jpg`)]);
  });

  it("stops when cancelled", async () => {
    const ac = new AbortController();
    const slow = ["-y", "-f", "lavfi", "-i", "testsrc2=size=1920x1080:rate=60", "-t", "600", "-c:v", "libx264", "-preset", "slow", "-progress", "pipe:1", path.join(dir, "slow.mp4")];
    const run = runFfmpeg(tools, slow, { signal: ac.signal });
    setTimeout(() => ac.abort(), 800);
    await expect(run).rejects.toBeInstanceOf(Cancelled);
  });
});
