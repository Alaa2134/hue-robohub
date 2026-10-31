/**
 * The studio API. Every route checks who's calling and whether they may touch the project; files go
 * browser → storage directly (resumable), the API only hands out tickets and signed links; slow work
 * (probing uploads, rendering) is queued for the worker.
 */
import { createReadStream, statSync } from "node:fs";
import path from "node:path";
import cors from "@fastify/cors";
import rateLimit from "@fastify/rate-limit";
import { FileStore } from "@tus/file-store";
import { Server as TusServer } from "@tus/server";
import Fastify, { type FastifyReply, type FastifyRequest } from "fastify";
import { z } from "zod";
import {
  customSize,
  duration as timelineDuration,
  emptyTimeline,
  estimateRender,
  frameSize,
  FPS,
  parseTimeline,
  Timeline,
  TEMPLATES,
  type Aspect,
  type Resolution,
} from "@studio/core";
import { fileName, LocalStorage, signToken, verifyToken, type AssetRow, type Config, type Db, type Queues, type RenderRow, type Storage } from "@studio/server";
import { HttpError, makeAuth, type Me } from "./auth.ts";

const KINDS: Record<string, "video" | "image" | "audio" | "font"> = {
  "video/mp4": "video",
  "video/quicktime": "video",
  "video/webm": "video",
  "video/x-matroska": "video",
  "video/x-msvideo": "video",
  "image/jpeg": "image",
  "image/png": "image",
  "image/webp": "image",
  "image/gif": "image",
  "audio/mpeg": "audio",
  "audio/mp4": "audio",
  "audio/x-m4a": "audio",
  "audio/aac": "audio",
  "audio/wav": "audio",
  "audio/x-wav": "audio",
  "audio/ogg": "audio",
  "audio/webm": "audio",
  "font/ttf": "font",
  "font/otf": "font",
  "font/woff2": "font",
};
const EXT: Record<string, string> = { ".mp4": "video/mp4", ".mov": "video/quicktime", ".webm": "video/webm", ".mkv": "video/x-matroska", ".avi": "video/x-msvideo", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".png": "image/png", ".webp": "image/webp", ".gif": "image/gif", ".mp3": "audio/mpeg", ".m4a": "audio/mp4", ".aac": "audio/aac", ".wav": "audio/wav", ".ogg": "audio/ogg", ".ttf": "font/ttf", ".otf": "font/otf", ".woff2": "font/woff2" };

const uuid = z.string().uuid();
const SIGN_SECONDS = 6 * 3600;

type Deps = { config: Config; db: Db; storage: Storage; queues: Queues };

export async function buildApp({ config, db, storage, queues }: Deps) {
  const app = Fastify({ logger: config.NODE_ENV !== "test" ? { level: "info" } : false, bodyLimit: 4 * 1024 * 1024, trustProxy: true, routerOptions: { maxParamLength: 2000 } });
  const auth = makeAuth(config, db);

  await app.register(cors, {
    origin: (origin, cb) => cb(null, !origin || config.corsOrigins.includes(origin) || config.corsOrigins.includes("*")),
    methods: ["GET", "POST", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["authorization", "content-type"],
    maxAge: 600,
  });
  await app.register(rateLimit, { max: 600, timeWindow: "1 minute", allowList: (req) => req.url.startsWith("/uploads") || req.url.startsWith("/files/") });

  app.setErrorHandler((err, _req, reply) => {
    if (err instanceof HttpError) return reply.status(err.status).send({ error: err.message, code: err.code });
    if (err instanceof z.ZodError) return reply.status(400).send({ error: "البيانات مش صحيحة.", code: "invalid", issues: err.issues.slice(0, 5).map((i) => `${i.path.join(".")}: ${i.message}`) });
    const status = (err as { statusCode?: number }).statusCode;
    if (status && status < 500) return reply.status(status).send({ error: (err as Error).message, code: "error" });
    app.log.error(err);
    return reply.status(500).send({ error: "حصلت مشكلة في السيرفر.", code: "server" });
  });

  const me = (req: FastifyRequest) => auth.me(req.headers.authorization);

  /** The project, if this person may use it (admins: all; others: their own or shared with them). */
  async function project(user: Me, id: string, need: "view" | "edit" = "edit") {
    if (!uuid.safeParse(id).success) throw new HttpError(404, "المشروع مش موجود.", "not_found");
    const r = await db.query<{ id: string; name: string; owner_id: string; timeline: unknown; timeline_version: number; storage_quota_mb: number | null; template: string | null; created_at: string; updated_at: string; role: string | null }>(
      `select p.*, m.role from studio.projects p left join studio.project_members m on m.project_id = p.id and m.user_id = $2 where p.id = $1 and p.removed_at is null`,
      [id, user.userId],
    );
    const p = r.rows[0];
    if (!p) throw new HttpError(404, "المشروع مش موجود.", "not_found");
    const role = user.role === "admin" || p.owner_id === user.userId ? "owner" : p.role;
    if (!role || (need === "edit" && role === "viewer")) throw new HttpError(403, "مش مسموحلك تفتح المشروع ده.", "forbidden");
    return p;
  }

  async function storageUsed(projectId: string): Promise<number> {
    const r = await db.query<{ n: string }>(
      `select coalesce((select sum(size) from studio.assets where project_id = $1 and removed_at is null), 0)
            + coalesce((select sum(output_size) from studio.renders where project_id = $1 and removed_at is null and output_size is not null), 0) as n`,
      [projectId],
    );
    return Number(r.rows[0].n);
  }

  async function sign(key: string | null, download?: string) {
    return key ? storage.signedUrl(key, SIGN_SECONDS, download) : null;
  }

  async function assetOut(a: AssetRow) {
    const [url, thumb, proxy] = await Promise.all([sign(a.storage_key), sign(a.thumb_key), sign(a.proxy_key)]);
    return {
      id: a.id,
      kind: a.kind,
      name: a.name,
      mime: a.mime,
      size: Number(a.size),
      status: a.status,
      error: a.error,
      duration: a.duration,
      width: a.width,
      height: a.height,
      fps: a.fps,
      hasAudio: a.has_audio,
      codec: a.codec,
      waveform: a.waveform,
      url,
      thumb,
      preview: proxy ?? url,
      createdAt: a.created_at,
    };
  }

  const renderOut = (r: RenderRow) => ({
    id: r.id,
    status: r.status,
    cancelRequested: r.cancel_requested,
    progress: r.progress,
    settings: r.settings,
    duration: r.duration,
    estimate: r.estimate,
    size: r.output_size ? Number(r.output_size) : null,
    error: r.error,
    attempt: r.attempt,
    retryOf: r.retry_of,
    createdAt: r.created_at,
    startedAt: r.started_at,
    finishedAt: r.finished_at,
  });

  // ── Public ──────────────────────────────────────────────────────────────────────────────────────
  app.get("/health", async () => {
    await db.query("select 1");
    return { ok: true };
  });

  app.get("/config", async () => ({
    auth: config.STUDIO_AUTH,
    storage: config.STUDIO_STORAGE,
    supabaseUrl: config.STUDIO_AUTH === "supabase" ? config.SUPABASE_URL : null,
    supabaseAnonKey: config.STUDIO_AUTH === "supabase" ? config.SUPABASE_ANON_KEY : null,
    limits: { maxUploadMb: config.MAX_UPLOAD_MB, projectStorageMb: config.PROJECT_STORAGE_MB, monthlyRenderMinutes: config.MONTHLY_RENDER_MINUTES, maxRenderSeconds: config.MAX_RENDER_SECONDS, allow4k: config.ALLOW_4K },
    features: { ai: !!config.GEMINI_API_KEY },
    templates: TEMPLATES,
  }));

  app.post("/auth/local/login", { config: { rateLimit: { max: 10, timeWindow: "1 minute" } } }, async (req) => {
    const b = z.object({ email: z.string().email(), password: z.string().min(1).max(200) }).parse(req.body);
    return auth.localLogin(b.email, b.password);
  });

  // ── Me, members ─────────────────────────────────────────────────────────────────────────────────
  app.get("/me", async (req) => {
    const u = await me(req);
    const used = await db.query<{ s: number }>("select coalesce(sum(amount), 0)::float as s from studio.usage where user_id = $1 and kind = 'render' and created_at >= date_trunc('month', now())", [u.userId]);
    return { ...u, usage: { renderSecondsThisMonth: used.rows[0].s, renderMinutesLimit: u.monthlyMinutes ?? config.MONTHLY_RENDER_MINUTES } };
  });

  const adminOnly = async (req: FastifyRequest) => {
    const u = await me(req);
    if (u.role !== "admin") throw new HttpError(403, "للأدمن بس.", "forbidden");
    return u;
  };

  app.get("/admin/members", async (req) => {
    await adminOnly(req);
    const r = await db.query("select email, user_id as \"userId\", role, active, monthly_render_minutes as \"monthlyRenderMinutes\", created_at as \"createdAt\" from studio.members order by created_at");
    return { members: r.rows };
  });

  app.post("/admin/members", async (req) => {
    const u = await adminOnly(req);
    const b = z.object({ email: z.string().email().max(200), role: z.enum(["admin", "editor"]), active: z.boolean().default(true), monthlyRenderMinutes: z.number().int().min(0).max(100000).nullable().default(null) }).parse(req.body);
    const email = b.email.toLowerCase();
    if (email === u.email && (b.role !== "admin" || !b.active)) throw new HttpError(400, "مينفعش تشيل الأدمن من نفسك.", "self");
    const r = await db.query(
      `insert into studio.members (email, role, active, monthly_render_minutes, added_by) values ($1, $2, $3, $4, $5)
       on conflict (email) do update set role = excluded.role, active = excluded.active, monthly_render_minutes = excluded.monthly_render_minutes
       returning email, user_id as "userId", role, active, monthly_render_minutes as "monthlyRenderMinutes"`,
      [email, b.role, b.active, b.monthlyRenderMinutes, u.userId],
    );
    return r.rows[0];
  });

  // ── Projects ────────────────────────────────────────────────────────────────────────────────────
  app.get("/projects", async (req) => {
    const u = await me(req);
    const r = await db.query(
      `select p.id, p.name, p.template, p.timeline -> 'settings' as settings, p.timeline_version as "timelineVersion", p.created_at as "createdAt", p.updated_at as "updatedAt",
              (select thumb_key from studio.assets a where a.project_id = p.id and a.removed_at is null and a.thumb_key is not null order by a.created_at limit 1) as thumb_key,
              (select count(*)::int from studio.assets a where a.project_id = p.id and a.removed_at is null) as assets
         from studio.projects p
        where p.removed_at is null and ($2 or p.owner_id = $1 or exists (select 1 from studio.project_members m where m.project_id = p.id and m.user_id = $1))
        order by p.updated_at desc limit 500`,
      [u.userId, u.role === "admin"],
    );
    const projects = await Promise.all(r.rows.map(async ({ thumb_key, ...p }) => ({ ...p, thumb: await sign(thumb_key) })));
    return { projects };
  });

  const NewProject = z.object({
    name: z.string().trim().min(1).max(120),
    template: z.string().max(40).optional(),
    aspect: z.enum(["9:16", "16:9", "1:1", "4:5", "custom"]).default("9:16"),
    resolution: z.enum(["720p", "1080p", "2160p"]).default("1080p"),
    width: z.number().int().optional(),
    height: z.number().int().optional(),
    fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).default(30),
  });

  app.post("/projects", async (req, reply) => {
    const u = await me(req);
    const b = NewProject.parse(req.body);
    if (b.resolution === "2160p" && !config.ALLOW_4K) throw new HttpError(400, "الـ 4K مش متاح على السيرفر ده.", "no_4k");
    const size = b.aspect === "custom" ? customSize(b.width ?? 1080, b.height ?? 1920) : frameSize(b.aspect as Aspect, b.resolution as Resolution);
    const timeline = emptyTimeline({ ...size, fps: b.fps, background: "#000000" });
    const r = await db.query("insert into studio.projects (name, owner_id, template, timeline) values ($1, $2, $3, $4) returning id", [b.name, u.userId, b.template ?? null, JSON.stringify(timeline)]);
    await db.query("insert into studio.project_members (project_id, user_id, role) values ($1, $2, 'owner')", [r.rows[0].id, u.userId]);
    reply.status(201);
    return { id: r.rows[0].id };
  });

  app.get("/projects/:id", async (req) => {
    const u = await me(req);
    const p = await project(u, (req.params as { id: string }).id, "view");
    const used = await storageUsed(p.id);
    return {
      id: p.id,
      name: p.name,
      template: p.template,
      // Filled with the current defaults, so a project saved before a new setting existed opens fine.
      timeline: parseTimeline(p.timeline),
      timelineVersion: p.timeline_version,
      createdAt: p.created_at,
      updatedAt: p.updated_at,
      storage: { usedBytes: used, quotaBytes: (p.storage_quota_mb ?? config.PROJECT_STORAGE_MB) * 1024 * 1024 },
    };
  });

  app.patch("/projects/:id", async (req) => {
    const u = await me(req);
    const p = await project(u, (req.params as { id: string }).id);
    const b = z.object({ name: z.string().trim().min(1).max(120) }).parse(req.body);
    await db.query("update studio.projects set name = $2, updated_at = now() where id = $1", [p.id, b.name]);
    return { ok: true };
  });

  /** Autosave. Refused (409) if someone saved a newer version meanwhile; the app then reloads it. */
  app.patch("/projects/:id/timeline", async (req, reply) => {
    const u = await me(req);
    const p = await project(u, (req.params as { id: string }).id);
    const b = z.object({ timeline: z.unknown(), version: z.number().int().min(1) }).parse(req.body);
    const timeline = Timeline.parse(b.timeline);
    const ids = new Set<string>();
    for (const t of timeline.tracks) for (const c of t.clips) if (c.type === "media") ids.add(c.assetId);
    if (ids.size) {
      const ok = await db.query<{ id: string }>("select id from studio.assets where project_id = $1 and removed_at is null and id = any($2::uuid[])", [p.id, [...ids].filter((x) => uuid.safeParse(x).success)]);
      if (ok.rows.length !== ids.size) throw new HttpError(400, "التايملاين فيه ملف مش في المشروع.", "unknown_asset");
    }
    if (timelineDuration(timeline) > 6 * 3600) throw new HttpError(400, "Too long.");
    const r = await db.query<{ timeline_version: number }>(
      "update studio.projects set timeline = $2, timeline_version = timeline_version + 1, updated_at = now() where id = $1 and timeline_version = $3 returning timeline_version",
      [p.id, JSON.stringify(timeline), b.version],
    );
    if (!r.rows[0]) {
      reply.status(409);
      return { error: "المشروع اتعدّل من مكان تاني — هنحمّل آخر نسخة.", code: "conflict", version: p.timeline_version };
    }
    return { version: r.rows[0].timeline_version };
  });

  app.post("/projects/:id/duplicate", async (req, reply) => {
    const u = await me(req);
    const p = await project(u, (req.params as { id: string }).id, "view");
    const assets = (await db.query<AssetRow>("select * from studio.assets where project_id = $1 and removed_at is null and status = 'ready'", [p.id])).rows;
    const used = await storageUsed(p.id);
    if (used > (p.storage_quota_mb ?? config.PROJECT_STORAGE_MB) * 1024 * 1024) throw new HttpError(400, "المساحة مش كفاية لنسخة.", "quota");
    const client = await db.connect();
    try {
      await client.query("begin");
      const np = await client.query<{ id: string }>("insert into studio.projects (name, owner_id, template, timeline) values ($1, $2, $3, '{}'::jsonb) returning id", [`${p.name} (نسخة)`.slice(0, 120), u.userId, p.template]);
      const nid = np.rows[0].id;
      await client.query("insert into studio.project_members (project_id, user_id, role) values ($1, $2, 'owner')", [nid, u.userId]);
      const map = new Map<string, string>();
      for (const a of assets) {
        const na = await client.query<{ id: string }>("select gen_random_uuid() as id");
        const id = na.rows[0].id;
        const base = `projects/${nid}/assets/${id}`;
        const key = `${base}/${path.posix.basename(a.storage_key)}`;
        await storage.copy(a.storage_key, key);
        const thumb = a.thumb_key ? `${base}/thumb.jpg` : null;
        const proxy = a.proxy_key ? `${base}/${path.posix.basename(a.proxy_key)}` : null;
        if (thumb) await storage.copy(a.thumb_key!, thumb);
        if (proxy) await storage.copy(a.proxy_key!, proxy);
        await client.query(
          `insert into studio.assets (id, project_id, kind, name, mime, size, storage_key, status, duration, width, height, fps, has_audio, codec, thumb_key, proxy_key, waveform, meta, created_by)
           values ($1, $2, $3, $4, $5, $6, $7, 'ready', $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18)`,
          [id, nid, a.kind, a.name, a.mime, a.size, key, a.duration, a.width, a.height, a.fps, a.has_audio, a.codec, thumb, proxy, a.waveform ? JSON.stringify(a.waveform) : null, JSON.stringify(a.meta), u.userId],
        );
        map.set(a.id, id);
      }
      const t = parseTimeline(p.timeline);
      for (const tr of t.tracks) tr.clips = tr.clips.filter((c) => c.type !== "media" || map.has(c.assetId)).map((c) => (c.type === "media" ? { ...c, assetId: map.get(c.assetId)! } : c));
      await client.query("update studio.projects set timeline = $2 where id = $1", [nid, JSON.stringify(t)]);
      await client.query("commit");
      reply.status(201);
      return { id: nid };
    } catch (e) {
      await client.query("rollback");
      throw e;
    } finally {
      client.release();
    }
  });

  app.delete("/projects/:id", async (req) => {
    const u = await me(req);
    const p = await project(u, (req.params as { id: string }).id);
    if (u.role !== "admin" && p.owner_id !== u.userId) throw new HttpError(403, "صاحب المشروع بس اللي يمسحه.", "forbidden");
    await db.query("update studio.projects set removed_at = now() where id = $1", [p.id]);
    const keys = await db.query<{ k: string }>(
      `select unnest(array[storage_key, thumb_key, proxy_key]) as k from studio.assets where project_id = $1
       union all select output_key from studio.renders where project_id = $1 and output_key is not null`,
      [p.id],
    );
    const list = keys.rows.map((r) => r.k).filter(Boolean);
    if (list.length) await queues.cleanup.add("project", { keys: list }, { delay: 60_000 });
    return { ok: true };
  });

  // ── Assets ──────────────────────────────────────────────────────────────────────────────────────
  app.get("/projects/:id/assets", async (req) => {
    const u = await me(req);
    const p = await project(u, (req.params as { id: string }).id, "view");
    const rows = (await db.query<AssetRow>("select * from studio.assets where project_id = $1 and removed_at is null order by created_at", [p.id])).rows;
    return { assets: await Promise.all(rows.map(assetOut)) };
  });

  /** Step 1 of an upload: check type, size and room; reserve the asset; return where to upload. */
  app.post("/projects/:id/uploads", async (req, reply) => {
    const u = await me(req);
    const p = await project(u, (req.params as { id: string }).id);
    const b = z.object({ name: z.string().min(1).max(200), size: z.number().int().min(1), type: z.string().max(100).default("") }).parse(req.body);
    const mime = KINDS[b.type] ? b.type : EXT[path.extname(b.name).toLowerCase()] ?? "";
    const kind = KINDS[mime];
    if (!kind) throw new HttpError(400, `نوع الملف ده مش مدعوم (${b.type || path.extname(b.name)}). المدعوم: فيديو MP4/MOV/WebM، صور JPG/PNG/WebP، صوت MP3/M4A/WAV.`, "type");
    if (b.size > config.MAX_UPLOAD_MB * 1024 * 1024) throw new HttpError(400, `الملف أكبر من ${config.MAX_UPLOAD_MB} ميجا.`, "too_big");
    const quota = (p.storage_quota_mb ?? config.PROJECT_STORAGE_MB) * 1024 * 1024;
    if ((await storageUsed(p.id)) + b.size > quota) throw new HttpError(400, "مساحة المشروع خلصت — امسح ملفات أو رندرات قديمة.", "quota");
    const id = (await db.query<{ id: string }>("select gen_random_uuid() as id")).rows[0].id;
    const key = `projects/${p.id}/assets/${id}/${fileName(b.name)}`;
    await db.query("insert into studio.assets (id, project_id, kind, name, mime, size, storage_key, status, created_by) values ($1, $2, $3, $4, $5, $6, $7, 'uploading', $8)", [id, p.id, kind, b.name.slice(0, 200), mime, b.size, key, u.userId]);
    const ticket = signToken(config.STUDIO_SECRET, { a: id, k: key, s: b.size, u: u.userId, exp: Math.floor(Date.now() / 1000) + 24 * 3600 });
    reply.status(201);
    return { assetId: id, upload: storage.uploadTarget(key, mime, ticket) };
  });

  /** Step 2: the upload finished — check it's really there, then queue the probing. */
  app.post("/projects/:id/assets/:assetId/complete", async (req) => {
    const u = await me(req);
    const p = await project(u, (req.params as { id: string }).id);
    const { assetId } = req.params as { assetId: string };
    if (!uuid.safeParse(assetId).success) throw new HttpError(404, "الملف مش موجود.");
    const a = (await db.query<AssetRow>("select * from studio.assets where id = $1 and project_id = $2 and removed_at is null", [assetId, p.id])).rows[0];
    if (!a) throw new HttpError(404, "الملف مش موجود.");
    if (a.status !== "uploading") return { status: a.status };
    const size = await storage.size(a.storage_key);
    if (size == null) throw new HttpError(409, "الملف لسه موصلش للتخزين.", "not_uploaded");
    if (size !== Number(a.size)) throw new HttpError(409, "الملف وصل ناقص — ارفعه تاني.", "size_mismatch");
    if (a.kind === "font") {
      await db.query("update studio.assets set status = 'ready', updated_at = now() where id = $1", [a.id]);
      return { status: "ready" };
    }
    await db.query("update studio.assets set status = 'processing', updated_at = now() where id = $1", [a.id]);
    await queues.ingest.add("ingest", { assetId: a.id }, { jobId: `ingest-${a.id}` });
    return { status: "processing" };
  });

  app.delete("/projects/:id/assets/:assetId", async (req) => {
    const u = await me(req);
    const p = await project(u, (req.params as { id: string }).id);
    const { assetId } = req.params as { assetId: string };
    if (!uuid.safeParse(assetId).success) throw new HttpError(404, "الملف مش موجود.");
    const t = parseTimeline(p.timeline);
    const usedIn = t.tracks.flatMap((tr) => tr.clips).filter((c) => c.type === "media" && c.assetId === assetId).length;
    if (usedIn) throw new HttpError(409, `الملف مستخدم في ${usedIn} كليب على التايملاين — شيلهم الأول.`, "in_use");
    const r = await db.query<AssetRow>("update studio.assets set removed_at = now() where id = $1 and project_id = $2 and removed_at is null returning *", [assetId, p.id]);
    const a = r.rows[0];
    if (!a) throw new HttpError(404, "الملف مش موجود.");
    await queues.cleanup.add("asset", { keys: [a.storage_key, a.thumb_key, a.proxy_key].filter((k): k is string => !!k) }, { delay: 60_000 });
    return { ok: true };
  });

  // ── Renders ─────────────────────────────────────────────────────────────────────────────────────
  const RenderReq = z.object({
    version: z.number().int().min(1),
    resolution: z.enum(["720p", "1080p", "2160p", "project"]).default("project"),
    fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]).optional(),
    quality: z.enum(["draft", "standard", "high"]).default("standard"),
    name: z.string().max(80).optional(),
    /** Just say how long and how much it would take, don't start. */
    estimateOnly: z.boolean().default(false),
  });

  app.post("/projects/:id/renders", async (req, reply) => {
    const u = await me(req);
    const p = await project(u, (req.params as { id: string }).id);
    const b = RenderReq.parse(req.body);
    if (b.version !== p.timeline_version) throw new HttpError(409, "احفظ آخر تعديلاتك الأول (التايملاين اتغيّر).", "stale");
    const t = parseTimeline(p.timeline);
    const total = timelineDuration(t);
    if (total < 0.5) throw new HttpError(400, "التايملاين فاضي.", "empty");
    if (total > config.MAX_RENDER_SECONDS) throw new HttpError(400, `أقصى طول للتصدير ${Math.round(config.MAX_RENDER_SECONDS / 60)} دقيقة.`, "too_long");
    const ids = new Set<string>();
    for (const tr of t.tracks) for (const c of tr.clips) if (c.type === "media") ids.add(c.assetId);
    const assets = (await db.query<AssetRow>("select * from studio.assets where project_id = $1 and removed_at is null", [p.id])).rows;
    const notReady = assets.filter((a) => ids.has(a.id) && a.status !== "ready");
    if (notReady.length) throw new HttpError(409, `استنى لحد ما الملفات دي تجهز: ${notReady.map((a) => a.name).join("، ")}`, "not_ready");
    let size = { width: t.settings.width, height: t.settings.height };
    if (b.resolution !== "project") {
      const short = { "720p": 720, "1080p": 1080, "2160p": 2160 }[b.resolution];
      const k = short / Math.min(t.settings.width, t.settings.height);
      size = customSize(t.settings.width * k, t.settings.height * k);
    }
    if (Math.max(size.width, size.height) > 2160 && Math.min(size.width, size.height) > 1440 && !config.ALLOW_4K) throw new HttpError(400, "الـ 4K مش متاح على السيرفر ده.", "no_4k");
    const fps = b.fps ?? t.settings.fps;
    if (!FPS.includes(fps)) throw new HttpError(400, "Bad fps.");
    const layers = t.tracks.filter((x) => x.kind === "video").reduce((n, x) => n + x.clips.length, 0);
    const estimate = estimateRender(total, size.width, size.height, fps, b.quality, layers);
    const month = await db.query<{ s: number }>(
      `select coalesce((select sum(amount) from studio.usage where user_id = $1 and kind = 'render' and created_at >= date_trunc('month', now())), 0)
            + coalesce((select sum(duration) from studio.renders where created_by = $1 and status in ('queued', 'rendering', 'uploading')), 0) as s`,
      [u.userId],
    );
    const limit = (u.monthlyMinutes ?? config.MONTHLY_RENDER_MINUTES) * 60;
    const left = Math.max(0, limit - Number(month.rows[0].s));
    const out = { duration: total, width: size.width, height: size.height, fps, quality: b.quality, estimate, quota: { secondsLeft: left, secondsLimit: limit } };
    if (b.estimateOnly) return out;
    if (total > left) throw new HttpError(400, `رصيد التصدير الشهري مش كفاية (فاضل ${Math.floor(left)} ثانية).`, "quota");
    const settings = { width: size.width, height: size.height, fps, quality: b.quality, name: b.name || p.name };
    const r = await db.query<RenderRow>(
      "insert into studio.renders (project_id, created_by, settings, timeline, timeline_version, duration, estimate) values ($1, $2, $3, $4, $5, $6, $7) returning *",
      [p.id, u.userId, JSON.stringify(settings), JSON.stringify(t), p.timeline_version, total, JSON.stringify(estimate)],
    );
    await queues.render.add("render", { renderId: r.rows[0].id }, { jobId: r.rows[0].id });
    reply.status(201);
    return renderOut(r.rows[0]);
  });

  app.get("/projects/:id/renders", async (req) => {
    const u = await me(req);
    const p = await project(u, (req.params as { id: string }).id, "view");
    const rows = (await db.query<RenderRow>("select * from studio.renders where project_id = $1 and removed_at is null order by created_at desc limit 50", [p.id])).rows;
    return { renders: rows.map(renderOut) };
  });

  async function ownRender(req: FastifyRequest) {
    const u = await me(req);
    const { renderId } = req.params as { renderId: string };
    if (!uuid.safeParse(renderId).success) throw new HttpError(404, "التصدير مش موجود.");
    const r = (await db.query<RenderRow>("select * from studio.renders where id = $1 and removed_at is null", [renderId])).rows[0];
    if (!r) throw new HttpError(404, "التصدير مش موجود.");
    await project(u, r.project_id, "view");
    return { u, r };
  }

  app.get("/renders/:renderId", async (req) => renderOut((await ownRender(req)).r));

  app.post("/renders/:renderId/cancel", async (req) => {
    const { r } = await ownRender(req);
    if (r.status === "queued") {
      const job = await queues.render.getJob(r.id);
      await job?.remove().catch(() => undefined);
      const x = await db.query<RenderRow>("update studio.renders set status = 'cancelled', cancel_requested = true, finished_at = now() where id = $1 and status = 'queued' returning *", [r.id]);
      if (x.rows[0]) return renderOut(x.rows[0]);
    }
    if (r.status === "rendering" || r.status === "uploading" || r.status === "queued") {
      const x = await db.query<RenderRow>("update studio.renders set cancel_requested = true where id = $1 returning *", [r.id]);
      return renderOut(x.rows[0]);
    }
    throw new HttpError(409, "التصدير ده خلص خلاص.", "finished");
  });

  app.post("/renders/:renderId/retry", async (req, reply) => {
    const { u, r } = await ownRender(req);
    if (r.status !== "failed" && r.status !== "cancelled") throw new HttpError(409, "إعادة المحاولة للتصدير اللي فشل أو اتلغى بس.", "not_failed");
    const x = await db.query<RenderRow>(
      "insert into studio.renders (project_id, created_by, settings, timeline, timeline_version, duration, estimate, attempt, retry_of) values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning *",
      [r.project_id, u.userId, JSON.stringify(r.settings), JSON.stringify(r.timeline), r.timeline_version, r.duration, JSON.stringify(r.estimate), r.attempt + 1, r.id],
    );
    await queues.render.add("render", { renderId: x.rows[0].id }, { jobId: x.rows[0].id });
    reply.status(201);
    return renderOut(x.rows[0]);
  });

  app.get("/renders/:renderId/download", async (req) => {
    const { r } = await ownRender(req);
    if (r.status !== "done" || !r.output_key) throw new HttpError(409, "الفيديو لسه مخلصش.", "not_done");
    const name = `${(r.settings.name || "buildx-studio").replace(/[\\/:*?"<>|]+/g, "-").slice(0, 60)}.mp4`;
    return { url: await storage.signedUrl(r.output_key, 3600, name), name, size: Number(r.output_size) };
  });

  // ── Local storage: signed file links (with Range, so videos seek) and the resumable upload endpoint ──
  if (storage instanceof LocalStorage) {
    const local = storage;
    app.get("/files/:token", async (req, reply) => {
      const t = verifyToken<{ k: string; d: string | null; exp: number }>(config.STUDIO_SECRET, (req.params as { token: string }).token);
      if (!t) throw new HttpError(403, "The link expired.", "expired");
      const file = local.path(t.k);
      let st;
      try {
        st = statSync(file);
      } catch {
        throw new HttpError(404, "Not found.");
      }
      const type = EXT[path.extname(file).toLowerCase()] ?? (file.endsWith(".json") ? "application/json" : "application/octet-stream");
      reply.header("content-type", type).header("accept-ranges", "bytes").header("cache-control", "private, max-age=3600").header("cross-origin-resource-policy", "cross-origin");
      if (t.d) reply.header("content-disposition", `attachment; filename="${t.d.replace(/[^\w.\- ]+/g, "_")}"; filename*=UTF-8''${encodeURIComponent(t.d)}`);
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
      if (range && (range[1] || range[2])) {
        const start = range[1] ? Number(range[1]) : Math.max(0, st.size - Number(range[2]));
        const end = range[1] && range[2] ? Math.min(Number(range[2]), st.size - 1) : st.size - 1;
        if (start > end || start >= st.size) return reply.status(416).header("content-range", `bytes */${st.size}`).send();
        reply.status(206).header("content-range", `bytes ${start}-${end}/${st.size}`).header("content-length", end - start + 1);
        return reply.send(createReadStream(file, { start, end }));
      }
      reply.header("content-length", st.size);
      return reply.send(createReadStream(file));
    });

    const tus = new TusServer({
      path: "/uploads",
      datastore: new FileStore({ directory: path.resolve(config.STUDIO_LOCAL_DIR, "tus") }),
      maxSize: config.MAX_UPLOAD_MB * 1024 * 1024,
      respectForwardedHeaders: true,
      allowedHeaders: ["x-upload-ticket"],
      allowedOrigins: config.corsOrigins,
      async onIncomingRequest(req) {
        const t = verifyToken<{ a: string; k: string; s: number; exp: number }>(config.STUDIO_SECRET, req.headers.get("x-upload-ticket") ?? "");
        if (!t) throw { status_code: 401, body: "Upload ticket missing or expired.\n" };
      },
      async onUploadCreate(req, upload) {
        const t = verifyToken<{ a: string; k: string; s: number; exp: number }>(config.STUDIO_SECRET, req.headers.get("x-upload-ticket") ?? "")!;
        if (upload.metadata?.objectName !== t.k || upload.size !== t.s) throw { status_code: 403, body: "This upload doesn't match its ticket.\n" };
        return { metadata: upload.metadata };
      },
      async onUploadFinish(_req, upload) {
        const key = upload.metadata?.objectName;
        if (key) local.adopt(key, path.resolve(config.STUDIO_LOCAL_DIR, "tus", upload.id));
        return {};
      },
    });
    const handle = async (req: FastifyRequest, reply: FastifyReply) => {
      reply.hijack();
      await tus.handle(req.raw, reply.raw);
    };
    app.register(async (scope) => {
      scope.removeAllContentTypeParsers();
      scope.addContentTypeParser("*", (_req, _payload, done) => done(null));
      // The upload endpoint answers CORS itself (with the TUS headers), so the app-wide CORS steps aside.
      scope.all("/uploads", { config: { cors: false } as never }, handle);
      scope.all("/uploads/*", { config: { cors: false } as never }, handle);
    });
  }

  return app;
}
