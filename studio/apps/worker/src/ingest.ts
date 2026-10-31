/**
 * After an upload: read the file with ffprobe (kind, duration, size, sound), make a thumbnail, the
 * waveform, and — when the browser can't play the original smoothly — a 720p H.264 preview copy.
 * Renders always use the original.
 */
import { mkdirSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import type { Db, Storage } from "@studio/server";
import { getAsset } from "@studio/server";
import { probe, runFfmpeg, waveform, type Tools } from "./ffmpeg.ts";

const WEB_VIDEO = new Set(["h264", "vp8", "vp9", "av1"]);
const WEB_IMAGE = /^(png_pipe|jpeg_pipe|webp_pipe|gif|image2)/;

export async function ingest(ctx: { db: Db; storage: Storage; tools: Tools; work: string }, assetId: string) {
  const a = await getAsset(ctx.db, assetId);
  if (!a || a.status === "ready") return;
  const dir = path.join(ctx.work, `ingest-${assetId}`);
  mkdirSync(dir, { recursive: true });
  try {
    const src = path.join(dir, `source${path.extname(a.storage_key) || ".bin"}`);
    await ctx.storage.getFile(a.storage_key, src);
    const p = await probe(ctx.tools, src);
    if (a.kind === "font") throw new Error("Fonts aren't processed here.");
    if (p.kind !== a.kind) {
      // Trust the file, not its name: a ".mp4" that is really a still is treated as a still.
      await ctx.db.query("update studio.assets set kind = $2 where id = $1", [a.id, p.kind]);
    }
    const prefix = a.storage_key.replace(/\/[^/]+$/, "");
    let thumb: string | null = null;
    let proxy: string | null = null;
    let peaks: number[] | null = null;
    if (p.kind === "video" || p.kind === "image") {
      const t = path.join(dir, "thumb.jpg");
      const at = p.kind === "video" && p.duration ? Math.min(1, p.duration / 3) : 0;
      await runFfmpeg(ctx.tools, ["-hide_banner", "-nostdin", "-y", ...(at ? ["-ss", String(at)] : []), "-i", src, "-frames:v", "1", "-vf", "scale=320:320:force_original_aspect_ratio=decrease", "-q:v", "4", t], { timeoutMs: 60_000 });
      thumb = `${prefix}/thumb.jpg`;
      await ctx.storage.putFile(thumb, t, "image/jpeg");
    }
    if (p.kind === "video") {
      const heavy = !WEB_VIDEO.has(p.codec ?? "") || (p.height ?? 0) > 1080 || (p.width ?? 0) > 1920 || /10le|12le|422|444/.test(p.pixFmt ?? "");
      if (heavy) {
        const out = path.join(dir, "proxy.mp4");
        await runFfmpeg(ctx.tools, ["-hide_banner", "-nostdin", "-y", "-i", src, "-vf", "scale=-2:'min(720,ih)'", "-c:v", "libx264", "-preset", "veryfast", "-crf", "26", "-pix_fmt", "yuv420p", "-c:a", "aac", "-b:a", "128k", "-movflags", "+faststart", out], { timeoutMs: 30 * 60_000 });
        proxy = `${prefix}/proxy.mp4`;
        await ctx.storage.putFile(proxy, out, "video/mp4");
      }
    }
    if (p.kind === "image" && (!WEB_IMAGE.test(p.format) || (p.width ?? 0) > 4096 || (p.height ?? 0) > 4096)) {
      const out = path.join(dir, "proxy.jpg");
      await runFfmpeg(ctx.tools, ["-hide_banner", "-nostdin", "-y", "-i", src, "-frames:v", "1", "-vf", "scale=2048:2048:force_original_aspect_ratio=decrease", "-q:v", "3", out], { timeoutMs: 120_000 });
      proxy = `${prefix}/proxy.jpg`;
      await ctx.storage.putFile(proxy, out, "image/jpeg");
    }
    if (p.hasAudio && p.duration) peaks = await waveform(ctx.tools, src, p.duration);
    await ctx.db.query(
      `update studio.assets set status = 'ready', error = null, duration = $2, width = $3, height = $4, fps = $5, has_audio = $6, codec = $7,
         thumb_key = $8, proxy_key = $9, waveform = $10, size = $11, meta = meta || $12::jsonb, updated_at = now() where id = $1`,
      [a.id, p.duration, p.width, p.height, p.fps, p.hasAudio, p.codec, thumb, proxy, peaks ? JSON.stringify(peaks) : null, statSync(src).size, JSON.stringify({ format: p.format, pixFmt: p.pixFmt })],
    );
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    await ctx.db.query("update studio.assets set status = 'failed', error = $2, updated_at = now() where id = $1", [assetId, msg.slice(0, 500)]);
    throw e;
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}
