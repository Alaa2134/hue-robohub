/**
 * The whole flow against real services: Postgres, Redis, the API over HTTP, the worker's queues and
 * FFmpeg. Five videos and ten images (and a song) are uploaded with resumable uploads, probed, put on
 * a timeline, saved, exported to a 30-second MP4, downloaded and checked with ffprobe.
 */
import { execFileSync } from "node:child_process";
import { createReadStream, mkdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import * as tus from "tus-js-client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { addClip, quickAssemble, Timeline, type AssetInfo, type Clip } from "@studio/core";
import { connect, loadConfig, makeQueues, makeStorage, migrate, type Db, type Queues } from "@studio/server";
// @ts-expect-error plain JS helper
import { start as startServices } from "../../../scripts/services.mjs";
import { makeFixtures } from "../../worker/src/fixtures.ts";
import { startWorkers } from "../../worker/src/workers.ts";
import { buildApp } from "./app.ts";

const tmp = path.join(os.tmpdir(), `studio-api-${process.pid}`);
let base = "";
let db: Db;
let queues: Queues;
let close: () => Promise<unknown>;
const fx = makeFixtures(path.join(os.tmpdir(), "studio-fixtures"));

beforeAll(async () => {
  const svc = process.env.STUDIO_TEST_DATABASE_URL
    ? { DATABASE_URL: process.env.STUDIO_TEST_DATABASE_URL, REDIS_URL: process.env.STUDIO_TEST_REDIS_URL ?? "redis://localhost:6379" }
    : startServices();
  mkdirSync(tmp, { recursive: true });
  const config = loadConfig({
    NODE_ENV: "test",
    DATABASE_URL: svc.DATABASE_URL,
    REDIS_URL: svc.REDIS_URL,
    STUDIO_LOCAL_DIR: path.join(tmp, "data"),
    STUDIO_SECRET: "test-secret-test-secret-test-secret-123",
    STUDIO_LOCAL_USERS: "admin@buildx.test:pass-admin:admin,editor@buildx.test:pass-editor:editor",
    CORS_ORIGINS: "http://localhost:5173",
    PUBLIC_API_URL: "http://127.0.0.1:0",
    MONTHLY_RENDER_MINUTES: "10",
  });
  db = connect(config);
  // A clean studio schema for this run.
  await db.query("drop schema if exists studio cascade");
  await migrate(db);
  queues = makeQueues(config);
  for (const q of Object.values(queues)) await q.obliterate({ force: true });
  const storage = makeStorage(config);
  const app = await buildApp({ config, db, storage, queues });
  await app.listen({ port: 0, host: "127.0.0.1" });
  const port = (app.server.address() as { port: number }).port;
  base = `http://127.0.0.1:${port}`;
  // Links and upload endpoints must point at the real port.
  (config as { PUBLIC_API_URL: string }).PUBLIC_API_URL = base;
  const w = startWorkers({ config, db, storage, work: path.join(tmp, "work"), log: { log: () => undefined, error: console.error } });
  close = async () => {
    await w.close();
    await app.close();
    for (const q of Object.values(queues)) await q.close();
    await db.end();
  };
});

afterAll(async () => {
  await close?.();
  rmSync(tmp, { recursive: true, force: true });
});

async function call<T = Record<string, unknown>>(method: string, url: string, token?: string, body?: unknown): Promise<{ status: number; json: T }> {
  const res = await fetch(`${base}${url}`, {
    method,
    headers: { ...(token ? { authorization: `Bearer ${token}` } : {}), ...(body ? { "content-type": "application/json" } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  return { status: res.status, json: (text ? JSON.parse(text) : {}) as T };
}

const login = async (email: string, password: string) => (await call<{ token: string }>("POST", "/auth/local/login", undefined, { email, password })).json.token;

function tusUpload(file: string, target: { endpoint: string; headers: Record<string, string>; metadata: Record<string, string>; chunkSize: number }) {
  return new Promise<void>((resolve, reject) => {
    const up = new tus.Upload(createReadStream(file), {
      endpoint: target.endpoint,
      headers: target.headers,
      metadata: target.metadata,
      chunkSize: 256 * 1024, // small chunks: the upload really resumes chunk by chunk
      uploadSize: statSync(file).size,
      onError: reject,
      onSuccess: () => resolve(),
    });
    up.start();
  });
}

async function waitFor<T>(f: () => Promise<T | null | undefined | false>, ms: number, what: string): Promise<T> {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    const v = await f();
    if (v) return v;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Timed out waiting for ${what}`);
}

type Asset = { id: string; kind: string; status: string; duration: number | null; width: number | null; height: number | null; hasAudio: boolean; thumb: string | null; preview: string; waveform: number[] | null; name: string };

describe("studio API end to end", () => {
  let admin = "";
  let editor = "";
  let projectId = "";
  let assets: Asset[] = [];
  let version = 1;

  it("signs people in and keeps others out", async () => {
    expect((await call("GET", "/me")).status).toBe(401);
    expect((await call("POST", "/auth/local/login", undefined, { email: "admin@buildx.test", password: "nope" })).status).toBe(401);
    admin = await login("admin@buildx.test", "pass-admin");
    editor = await login("editor@buildx.test", "pass-editor");
    expect((await call("GET", "/me", admin)).json).toMatchObject({ role: "admin", email: "admin@buildx.test" });
    expect((await call("GET", "/me", editor)).json).toMatchObject({ role: "editor" });
    expect((await call("GET", "/admin/members", editor)).status).toBe(403);
    expect((await call<{ members: unknown[] }>("GET", "/admin/members", admin)).json.members).toHaveLength(2);
    expect((await call("GET", "/me", "not-a-token")).status).toBe(401);
  });

  it("creates a 9:16 project, and only its people can open it", async () => {
    const r = await call<{ id: string }>("POST", "/projects", editor, { name: "Robotex reel", aspect: "9:16", resolution: "1080p", fps: 30 });
    expect(r.status).toBe(201);
    projectId = r.json.id;
    const p = await call<{ timeline: Timeline; timelineVersion: number }>("GET", `/projects/${projectId}`, editor);
    expect(p.json.timeline.settings).toMatchObject({ width: 1080, height: 1920, fps: 30 });
    version = p.json.timelineVersion;
    // The admin sees every project; a second editor wouldn't (no other editor here: check a made-up id).
    expect((await call("GET", `/projects/${projectId}`, admin)).status).toBe(200);
    expect((await call("GET", "/projects/00000000-0000-0000-0000-000000000000", editor)).status).toBe(404);
    expect((await call("POST", "/projects", editor, { name: "4K", resolution: "2160p" })).status).toBe(400); // 4K is off here
  });

  it("uploads 5 videos, 10 images and a song (resumable), then probes each one", async () => {
    const bad = await call("POST", `/projects/${projectId}/uploads`, editor, { name: "virus.exe", size: 10, type: "application/x-msdownload" });
    expect(bad.status).toBe(400);
    const files = [...fx.videos, ...fx.images, fx.music];
    for (const f of files) {
      const t = await call<{ assetId: string; upload: { endpoint: string; headers: Record<string, string>; metadata: Record<string, string>; chunkSize: number } }>(
        "POST",
        `/projects/${projectId}/uploads`,
        editor,
        { name: path.basename(f), size: statSync(f).size, type: "" },
      );
      expect(t.status).toBe(201);
      // A ticket for one file can't be used for another.
      if (f === files[0]) {
        const wrong = { ...t.json.upload, metadata: { ...t.json.upload.metadata, objectName: "projects/x/assets/y/evil.mp4" } };
        await expect(tusUpload(f, wrong)).rejects.toBeTruthy();
      }
      await tusUpload(f, t.json.upload);
      const done = await call<{ status: string }>("POST", `/projects/${projectId}/assets/${t.json.assetId}/complete`, editor);
      expect(done.json.status).toBe("processing");
    }
    assets = await waitFor(
      async () => {
        const r = await call<{ assets: Asset[] }>("GET", `/projects/${projectId}/assets`, editor);
        const failed = r.json.assets.find((a) => a.status === "failed");
        if (failed) throw new Error(`Ingest failed for ${failed.name}`);
        return r.json.assets.length === files.length && r.json.assets.every((a) => a.status === "ready") ? r.json.assets : null;
      },
      120_000,
      "all uploads to be processed",
    );
    const videos = assets.filter((a) => a.kind === "video");
    const images = assets.filter((a) => a.kind === "image");
    expect(videos).toHaveLength(5);
    expect(images).toHaveLength(10);
    expect(assets.filter((a) => a.kind === "audio")).toHaveLength(1);
    expect(videos[0]).toMatchObject({ width: 720, height: 1280, hasAudio: true });
    expect(videos[0].duration).toBeCloseTo(6, 0);
    expect(videos[0].waveform!.length).toBeGreaterThan(100);
    // Thumbnails and preview links work (and seek: Range requests).
    const thumb = await fetch(videos[0].thumb!);
    expect(thumb.headers.get("content-type")).toBe("image/jpeg");
    const part = await fetch(videos[0].preview, { headers: { range: "bytes=0-99" } });
    expect(part.status).toBe(206);
    expect((await part.arrayBuffer()).byteLength).toBe(100);
  });

  it("saves the edit, refusing a save from a stale version", async () => {
    const p = await call<{ timeline: Timeline; timelineVersion: number }>("GET", `/projects/${projectId}`, editor);
    const info = (a: Asset): AssetInfo => ({ id: a.id, kind: a.kind as AssetInfo["kind"], duration: a.duration, width: a.width, height: a.height, hasAudio: a.hasAudio });
    const vids = assets.filter((a) => a.kind === "video");
    const pics = assets.filter((a) => a.kind === "image");
    const order = vids.flatMap((v, i) => [v, pics[i * 2], pics[i * 2 + 1]]).map(info);
    let t = quickAssemble(p.json.timeline, order, { seconds: 30, still: 2, maxShot: 2.5 });
    const song = assets.find((a) => a.kind === "audio")!;
    t = addClip(t, "a1", { id: "music", type: "media", assetId: song.id, start: 0, duration: 30, in: 0, speed: 1, volume: 0.5, fadeIn: 1, fadeOut: 2, fit: "cover", transform: { x: 0, y: 0, scale: 1, rotation: 0, opacity: 1 }, motion: null, transitionIn: null } as Clip);
    t = addClip(t, "t1", { id: "title", type: "text", text: "روبوتكس 2026", start: 0.5, duration: 3, font: "Plex Arabic", size: 0.07, color: "#ffffff", box: null, weight: 700, align: "center", transform: { x: 0, y: -0.5, scale: 1, rotation: 0, opacity: 1 }, fadeIn: 0.3, fadeOut: 0.3 });
    const saved = await call<{ version: number }>("PATCH", `/projects/${projectId}/timeline`, editor, { timeline: t, version: p.json.timelineVersion });
    expect(saved.status).toBe(200);
    version = saved.json.version;
    expect(version).toBe(p.json.timelineVersion + 1);
    const stale = await call("PATCH", `/projects/${projectId}/timeline`, editor, { timeline: t, version: p.json.timelineVersion });
    expect(stale.status).toBe(409);
    // A clip pointing at a file that isn't in the project is refused.
    const foreign = structuredClone(t);
    (foreign.tracks[0].clips[0] as { assetId: string }).assetId = "11111111-1111-1111-1111-111111111111";
    expect((await call("PATCH", `/projects/${projectId}/timeline`, editor, { timeline: foreign, version })).status).toBe(400);
    // A file used on the timeline can't be deleted.
    expect((await call("DELETE", `/projects/${projectId}/assets/${vids[0].id}`, editor)).status).toBe(409);
  });

  it("estimates, exports a real 30-second MP4, and hands out a download link", async () => {
    const est = await call<{ duration: number; width: number; height: number; estimate: { wallSeconds: number }; quota: { secondsLeft: number } }>("POST", `/projects/${projectId}/renders`, editor, { version, quality: "draft", estimateOnly: true });
    expect(est.json).toMatchObject({ duration: 30, width: 1080, height: 1920, fps: 30 });
    expect(est.json.estimate.wallSeconds).toBeGreaterThan(0);
    expect(est.json.quota.secondsLeft).toBe(600);
    expect((await call("POST", `/projects/${projectId}/renders`, editor, { version: version - 1, quality: "draft" })).status).toBe(409);

    const r = await call<{ id: string; status: string }>("POST", `/projects/${projectId}/renders`, editor, { version, quality: "draft", name: "robotex-reel" });
    expect(r.status).toBe(201);
    const seen = new Set<number>();
    const done = await waitFor(
      async () => {
        const x = await call<{ status: string; progress: number; error: string | null; size: number }>("GET", `/renders/${r.json.id}`, editor);
        seen.add(Math.round(x.json.progress * 10));
        if (x.json.status === "failed") throw new Error(`Render failed: ${x.json.error}`);
        return x.json.status === "done" ? x.json : null;
      },
      200_000,
      "the render",
    );
    expect(done.size).toBeGreaterThan(100_000);
    expect(seen.size).toBeGreaterThan(2); // progress moved
    const dl = await call<{ url: string; name: string }>("GET", `/renders/${r.json.id}/download`, editor);
    expect(dl.json.name).toBe("robotex-reel.mp4");
    const res = await fetch(dl.json.url);
    expect(res.headers.get("content-disposition")).toContain("robotex-reel.mp4");
    const out = path.join(tmp, "downloaded.mp4");
    writeFileSync(out, Buffer.from(await res.arrayBuffer()));
    const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", out]).toString());
    const v = probe.streams.find((s: { codec_type: string }) => s.codec_type === "video");
    const a = probe.streams.find((s: { codec_type: string }) => s.codec_type === "audio");
    expect(v).toMatchObject({ codec_name: "h264", width: 1080, height: 1920, pix_fmt: "yuv420p", avg_frame_rate: "30/1" });
    expect(a).toMatchObject({ codec_name: "aac", sample_rate: "48000", channels: 2 });
    expect(Number(probe.format.duration)).toBeCloseTo(30, 0);
    // The month's render time went down by what was rendered.
    const me = await call<{ usage: { renderSecondsThisMonth: number } }>("GET", "/me", editor);
    expect(me.json.usage.renderSecondsThisMonth).toBeCloseTo(30, 0);
  });

  it("cancels a running export and retries it as a new attempt", async () => {
    const r = await call<{ id: string }>("POST", `/projects/${projectId}/renders`, editor, { version, quality: "high", fps: 60, name: "slow" });
    expect(r.status).toBe(201);
    await waitFor(async () => (await call<{ status: string }>("GET", `/renders/${r.json.id}`, editor)).json.status === "rendering", 60_000, "the render to start");
    expect((await call("POST", `/renders/${r.json.id}/cancel`, editor)).status).toBe(200);
    await waitFor(async () => (await call<{ status: string }>("GET", `/renders/${r.json.id}`, editor)).json.status === "cancelled", 30_000, "the cancel");
    expect((await call("GET", `/renders/${r.json.id}/download`, editor)).status).toBe(409);
    const again = await call<{ id: string; attempt: number; retryOf: string; status: string }>("POST", `/renders/${r.json.id}/retry`, editor);
    expect(again.json).toMatchObject({ attempt: 2, retryOf: r.json.id, status: "queued" });
    expect((await call("POST", `/renders/${again.json.id}/cancel`, editor)).status).toBe(200);
    await waitFor(async () => (await call<{ status: string }>("GET", `/renders/${again.json.id}`, editor)).json.status === "cancelled", 30_000, "the second cancel");
  });

  it("duplicates a project with its files, then deletes the copy", async () => {
    const d = await call<{ id: string }>("POST", `/projects/${projectId}/duplicate`, editor);
    expect(d.status).toBe(201);
    const copy = await call<{ timeline: Timeline; name: string }>("GET", `/projects/${d.json.id}`, editor);
    expect(copy.json.name).toBe("Robotex reel (نسخة)");
    const copyAssets = (await call<{ assets: Asset[] }>("GET", `/projects/${d.json.id}/assets`, editor)).json.assets;
    expect(copyAssets).toHaveLength(16);
    const ids = new Set(copyAssets.map((a) => a.id));
    const used = copy.json.timeline.tracks.flatMap((t) => t.clips).filter((c) => c.type === "media");
    expect(used.length).toBeGreaterThan(10);
    expect(used.every((c) => c.type === "media" && ids.has(c.assetId))).toBe(true);
    expect((await call("DELETE", `/projects/${d.json.id}`, editor)).status).toBe(200);
    expect((await call("GET", `/projects/${d.json.id}`, editor)).status).toBe(404);
    const list = await call<{ projects: { id: string }[] }>("GET", "/projects", editor);
    expect(list.json.projects.map((p) => p.id)).toEqual([projectId]);
  });
});
