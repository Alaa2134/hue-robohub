/**
 * One export: the render row's timeline snapshot → MP4 in storage. Progress is FFmpeg's own clock
 * (out_time) over the output length; a cancel from the app stops FFmpeg within a second. Nothing is
 * marked done until the file is uploaded and FFprobe confirms its length.
 */
import { existsSync, mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { parseTimeline, planRender, type AssetInfo, type TextClip } from "@studio/core";
import { getRender, projectAssets, toAssetInfo, type Db, type Storage } from "@studio/server";
import { Cancelled, probe, runFfmpeg, type Tools } from "./ffmpeg.ts";
import { renderTitle } from "./titles.ts";

export type RenderCtx = { db: Db; storage: Storage; tools: Tools; work: string; maxSeconds: number };

const set = (db: Db, id: string, fields: Record<string, unknown>) => {
  const keys = Object.keys(fields);
  return db.query(`update studio.renders set ${keys.map((k, i) => `${k} = $${i + 2}`).join(", ")} where id = $1`, [id, ...keys.map((k) => fields[k])]);
};

/** Keep downloaded sources between renders (same asset id = same file). */
async function cached(ctx: RenderCtx, key: string, id: string): Promise<string> {
  const dir = path.join(ctx.work, "cache");
  mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${id}${path.extname(key)}`);
  if (existsSync(file) && statSync(file).size > 0) return file;
  const tmp = `${file}.part`;
  await ctx.storage.getFile(key, tmp);
  const { renameSync } = await import("node:fs");
  renameSync(tmp, file);
  return file;
}

export async function render(ctx: RenderCtx, renderId: string) {
  const r = await getRender(ctx.db, renderId);
  if (!r || r.status === "done" || r.status === "cancelled") return;
  if (r.cancel_requested) return void (await set(ctx.db, renderId, { status: "cancelled", finished_at: new Date() }));
  await set(ctx.db, renderId, { status: "rendering", started_at: new Date(), progress: 0, error: null });
  const dir = path.join(ctx.work, `render-${renderId}`);
  mkdirSync(dir, { recursive: true });
  const abort = new AbortController();
  let watcher: NodeJS.Timeout | null = null;
  try {
    const timeline = parseTimeline(r.timeline);
    const rows = await projectAssets(ctx.db, r.project_id);
    const used = new Set<string>();
    for (const t of timeline.tracks) for (const c of t.clips) if (c.type === "media") used.add(c.assetId);
    const assets = new Map<string, AssetInfo>();
    const files = new Map<string, string>();
    for (const id of used) {
      const a = rows.find((x) => x.id === id);
      if (!a) throw new Error("A clip uses a file that was deleted from the project.");
      if (a.status !== "ready") throw new Error(`"${a.name}" isn't ready yet (${a.status}).`);
      assets.set(id, toAssetInfo(a));
      files.set(id, await cached(ctx, a.storage_key, a.id));
    }
    const { width, height, fps, quality } = r.settings;
    for (const t of timeline.tracks) {
      if (t.kind !== "video" || t.hidden) continue;
      for (const c of t.clips) {
        if (c.type !== "text") continue;
        const f = path.join(dir, `title-${c.id}.png`);
        renderTitle(c as TextClip, width, height, f);
        files.set(c.id, f);
      }
    }
    const out = path.join(dir, "out.mp4");
    const plan = planRender({ timeline, assets, files, output: { path: out, width, height, fps, quality, maxSeconds: Math.min(ctx.maxSeconds, r.duration) } });

    // Progress to the database once a second, and the cancel flag back.
    let seen = 0;
    let wrote = -1;
    watcher = setInterval(async () => {
      try {
        const p = Math.min(0.99, seen / plan.duration);
        if (Math.abs(p - wrote) >= 0.005) {
          wrote = p;
          await set(ctx.db, renderId, { progress: p });
        }
        const now = await getRender(ctx.db, renderId);
        if (now?.cancel_requested) abort.abort();
      } catch {
        /* the next tick tries again */
      }
    }, 1000);
    const { wallMs } = await runFfmpeg(ctx.tools, plan.args, {
      onProgress: (s) => (seen = s),
      signal: abort.signal,
      timeoutMs: Math.max(10 * 60_000, plan.duration * 120_000),
    });
    clearInterval(watcher);
    watcher = null;

    // Check the result before calling it done.
    const check = await probe(ctx.tools, out);
    if (check.kind !== "video" || check.codec !== "h264" || !check.duration || Math.abs(check.duration - plan.duration) > 0.25)
      throw new Error(`The rendered file didn't come out right (${check.codec}, ${check.duration}s of ${plan.duration}s).`);
    await set(ctx.db, renderId, { status: "uploading", progress: 0.99 });
    const name = (r.settings.name || "buildx-studio").replace(/[^A-Za-z0-9_-]+/g, "-").slice(0, 60) || "buildx-studio";
    const key = `projects/${r.project_id}/renders/${renderId}/${name}.mp4`;
    await ctx.storage.putFile(key, out, "video/mp4");
    const size = statSync(out).size;
    await set(ctx.db, renderId, { status: "done", progress: 1, output_key: key, output_size: size, duration: check.duration, cpu_seconds: wallMs / 1000, finished_at: new Date() });
    await ctx.db.query("insert into studio.usage (user_id, project_id, kind, amount, unit, ref) values ($1, $2, 'render', $3, 'seconds', $4)", [r.created_by, r.project_id, check.duration, renderId]);
    return { key, size, duration: check.duration };
  } catch (e) {
    if (e instanceof Cancelled) {
      await set(ctx.db, renderId, { status: "cancelled", finished_at: new Date() });
      return;
    }
    const msg = e instanceof Error ? e.message : String(e);
    await set(ctx.db, renderId, { status: "failed", error: msg.slice(0, 1000), finished_at: new Date() });
    throw e;
  } finally {
    if (watcher) clearInterval(watcher);
    rmSync(dir, { recursive: true, force: true });
  }
}
