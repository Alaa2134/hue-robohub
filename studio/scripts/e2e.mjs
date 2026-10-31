#!/usr/bin/env node
/**
 * End to end, the way a person uses it: the API and the worker as real processes, the built web app
 * in Chromium. Sign in → new 9:16 project → upload 5 videos + 10 images + a song → auto-assemble 30 s
 * → cut, undo/redo, add a title → preview → export → download the MP4 → ffprobe it (H.264, 1080×1920,
 * 30 s). Screenshots land in $E2E_SHOTS (default: the OS temp folder).
 */
import { execFileSync, spawn } from "node:child_process";
import { mkdirSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { start as startServices } from "./services.mjs";

const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const root = path.resolve(import.meta.dirname, "..");
const tmp = path.join(os.tmpdir(), "studio-e2e");
const shots = process.env.E2E_SHOTS || tmp;
rmSync(path.join(tmp, "data"), { recursive: true, force: true });
mkdirSync(shots, { recursive: true });
const API = "http://127.0.0.1:8787";
const WEB = "http://127.0.0.1:4173";

const svc = startServices();
try {
  execFileSync("psql", ["-h", "localhost", "-p", "55432", "-U", "postgres", "-c", "drop database if exists studio_e2e", "-c", "create database studio_e2e"], { stdio: "pipe" });
} catch (e) {
  console.error(String(e.stderr));
}
const env = {
  ...process.env,
  NODE_ENV: "development",
  PORT: "8787",
  DATABASE_URL: svc.DATABASE_URL.replace(/\/studio$/, "/studio_e2e"),
  REDIS_URL: svc.REDIS_URL,
  STUDIO_LOCAL_DIR: path.join(tmp, "data"),
  WORK_DIR: path.join(tmp, "work"),
  STUDIO_SECRET: "e2e-secret-e2e-secret-e2e-secret-e2e",
  STUDIO_LOCAL_USERS: "media@buildx.test:media-pass:admin",
  CORS_ORIGINS: WEB,
  PUBLIC_API_URL: API,
};
// Fresh queues.
execFileSync("redis-cli", ["-p", new URL(svc.REDIS_URL).port, "flushall"]);

const procs = [];
const run = (name, cmd, args, opts = {}) => {
  const p = spawn(cmd, args, { cwd: root, env, stdio: ["ignore", "pipe", "pipe"], ...opts });
  p.stdout.on("data", (d) => process.env.E2E_VERBOSE && process.stdout.write(`[${name}] ${d}`));
  p.stderr.on("data", (d) => process.stderr.write(`[${name}] ${d}`));
  procs.push(p);
  return p;
};
const stopAll = () => procs.forEach((p) => p.kill("SIGTERM"));
process.on("exit", stopAll);

const waitHttp = async (url, ms = 60000) => {
  const end = Date.now() + ms;
  while (Date.now() < end) {
    try {
      if ((await fetch(url)).ok) return;
    } catch {
      /* not yet */
    }
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`${url} didn't come up`);
};

console.log("• building the web app");
execFileSync("npx", ["vite", "build"], { cwd: path.join(root, "apps/web"), env: { ...env, VITE_STUDIO_API_URL: API }, stdio: "inherit" });
run("api", "npx", ["tsx", "apps/api/src/main.ts"]);
run("worker", "npx", ["tsx", "apps/worker/src/main.ts"]);
run("web", "npx", ["vite", "preview", "--port", "4173", "--strictPort", "--host", "127.0.0.1"], { cwd: path.join(root, "apps/web") });
await waitHttp(`${API}/health`);
await waitHttp(WEB);

// Test media.
const { makeFixtures } = await import(path.join(root, "apps/worker/src/fixtures.ts")).catch(async () => {
  // Plain node can't import .ts: make them with tsx.
  const out = execFileSync("npx", ["tsx", "-e", `import { makeFixtures } from "./apps/worker/src/fixtures.ts"; console.log(JSON.stringify(makeFixtures("${path.join(os.tmpdir(), "studio-fixtures")}")));`], { cwd: root }).toString();
  const fx = JSON.parse(out.trim().split("\n").at(-1));
  return { makeFixtures: () => fx };
});
const fx = makeFixtures(path.join(os.tmpdir(), "studio-fixtures"));

const check = (ok, msg) => {
  if (!ok) throw new Error(`✗ ${msg}`);
  console.log(`✓ ${msg}`);
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1600, height: 1000 }, acceptDownloads: true });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
try {
  await page.goto(`${WEB}/`);
  await page.getByLabel("الإيميل").fill("media@buildx.test");
  await page.getByLabel("الباسورد").fill("media-pass");
  await page.getByRole("button", { name: "دخول" }).click();
  await page.getByTestId("new-project").first().click();
  await page.locator("#pname").fill("Robotex 2026 reel");
  await page.getByTestId("create-project").click();
  await page.getByTestId("editor").waitFor();
  check(true, "signed in and opened a new 9:16 project");

  await page.getByTestId("upload-input").setInputFiles([...fx.videos, ...fx.images, fx.music]);
  await page.waitForFunction(() => document.querySelectorAll('[data-testid="asset"][data-status="ready"]').length === 16, null, { timeout: 180000 });
  const kinds = await page.$$eval('[data-testid="asset"]', (els) => els.map((e) => e.getAttribute("data-kind")));
  check(kinds.filter((k) => k === "video").length === 5 && kinds.filter((k) => k === "image").length === 10, "uploaded 5 videos + 10 images + a song, all processed");

  await page.getByRole("button", { name: "تجميع تلقائي" }).click();
  await page.getByTestId("auto-seconds").selectOption("30");
  await page.getByTestId("auto-go").click();
  const clips = await page.getByTestId("clip").count();
  check(clips === 16, `auto-assembled all 15 files + the song (${clips} clips) on the timeline`);
  check((await page.getByTestId("timecode").textContent()).startsWith("00:00"), "playhead at the start");

  // Edit: cut at 5 s, undo, redo; add a title.
  await page.getByTestId("ruler").click({ position: { x: 5 * 60 + 1, y: 10 } });
  await page.getByTestId("split").click();
  const afterSplit = await page.getByTestId("clip").count();
  check(afterSplit === clips + 1, "cut a clip at the playhead");
  await page.getByTestId("undo").click();
  check((await page.getByTestId("clip").count()) === clips, "undo");
  await page.getByTestId("redo").click();
  check((await page.getByTestId("clip").count()) === clips + 1, "redo");
  await page.getByTestId("ruler").click({ position: { x: 1 * 60, y: 10 } });
  await page.getByTestId("add-text").click();
  await page.getByTestId("text-input").fill("روبوتكس ٢٠٢٦");
  // Drag the title 2 s later on its track.
  const title = page.locator('[data-clip^="title_"]');
  const box = await title.boundingBox();
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 + 120, box.y + box.height / 2, { steps: 6 });
  await page.mouse.up();
  const moved = await title.boundingBox();
  check(Math.round(moved.x - box.x) >= 100, "dragged the title along the timeline");
  await page.waitForFunction(() => document.querySelector('[data-testid="save-state"]')?.textContent === "محفوظ", null, { timeout: 15000 });
  check(true, "autosaved");

  // Preview: a still frame (headless Chromium has no H.264, so check where a photo shows) and playback.
  await page.getByTestId("ruler").click({ position: { x: Math.round(3.5 * 60), y: 10 } });
  await page.waitForTimeout(800);
  const lit = await page.$eval('[data-testid="preview"]', (c) => {
    const d = c.getContext("2d").getImageData(0, 0, c.width, c.height).data;
    let n = 0;
    for (let i = 0; i < d.length; i += 4 * 97) if (d[i] + d[i + 1] + d[i + 2] > 60) n++;
    return n;
  });
  check(lit > 50, "the preview draws the frame at the playhead");
  await page.getByTestId("play").click();
  await page.waitForTimeout(1200);
  await page.getByTestId("play").click();
  const tc = await page.getByTestId("timecode").textContent();
  check(tc > "00:03", `playback moved the playhead (${tc})`);
  await page.screenshot({ path: path.join(shots, "studio-editor.png") });

  // Export.
  await page.getByTestId("export").click();
  await page.getByTestId("export-quality").selectOption("draft");
  await page.getByTestId("export-estimate").getByText("الطول").waitFor();
  const estimate = await page.getByTestId("export-estimate").textContent();
  check(/00:30/.test(estimate) && /1080×1920/.test(estimate), "the estimate shows 30 s at 1080×1920 before starting");
  await page.screenshot({ path: path.join(shots, "studio-export.png") });
  await page.getByTestId("export-start").click();
  await page.locator('[data-testid="render"][data-status="done"]').waitFor({ timeout: 300000 });
  check(true, "the render finished on the server");
  const [download] = await Promise.all([page.waitForEvent("download"), page.getByTestId("render-download").first().click()]);
  const file = path.join(tmp, download.suggestedFilename());
  await download.saveAs(file);
  const probe = JSON.parse(execFileSync("ffprobe", ["-v", "error", "-print_format", "json", "-show_format", "-show_streams", file]).toString());
  const v = probe.streams.find((s) => s.codec_type === "video");
  const a = probe.streams.find((s) => s.codec_type === "audio");
  check(v.codec_name === "h264" && v.width === 1080 && v.height === 1920, `downloaded ${download.suggestedFilename()}: H.264 1080×1920`);
  check(Math.abs(Number(probe.format.duration) - 30) < 0.2, `30 seconds (${Number(probe.format.duration).toFixed(2)} s) with ${a?.codec_name} sound`);
  for (const s of [2, 6, 12]) execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", "-ss", String(s), "-i", file, "-frames:v", "1", "-vf", "scale=270:-2", path.join(shots, `studio-out-${s}s.jpg`)]);
  await page.screenshot({ path: path.join(shots, "studio-done.png") });
  check(errors.length === 0, `no page errors${errors.length ? `: ${errors.join(" | ")}` : ""}`);
  console.log(`\nAll good. Output: ${file}`);
} finally {
  await browser.close();
  stopAll();
}
process.exit(0);
