/** Postgres access for the API and the worker (both connect with server credentials). */
import { readFileSync } from "node:fs";
import pg from "pg";
import type { AssetInfo } from "@studio/core";
import type { Config } from "./config.ts";

export type Db = pg.Pool;

export function connect(config: Config): Db {
  const pool = new pg.Pool({
    connectionString: config.DATABASE_URL,
    max: 10,
    ssl: config.DATABASE_SSL ? { rejectUnauthorized: false } : undefined,
  });
  pool.on("error", (e) => console.error("[db]", e.message));
  return pool;
}

export async function migrate(db: Db) {
  const sql = readFileSync(new URL("./schema.sql", import.meta.url), "utf8");
  await db.query(sql);
}

export type AssetRow = {
  id: string;
  project_id: string;
  kind: "video" | "image" | "audio" | "font";
  name: string;
  mime: string;
  size: number;
  storage_key: string;
  status: "uploading" | "processing" | "ready" | "failed";
  error: string | null;
  duration: number | null;
  width: number | null;
  height: number | null;
  fps: number | null;
  has_audio: boolean;
  codec: string | null;
  thumb_key: string | null;
  proxy_key: string | null;
  waveform: number[] | null;
  meta: Record<string, unknown>;
  created_by: string;
  created_at: string;
};

export type RenderRow = {
  id: string;
  project_id: string;
  created_by: string;
  status: "queued" | "rendering" | "uploading" | "done" | "failed" | "cancelled";
  cancel_requested: boolean;
  progress: number;
  settings: { width: number; height: number; fps: 24 | 25 | 30 | 60; quality: "draft" | "standard" | "high"; name?: string };
  timeline: unknown;
  timeline_version: number;
  duration: number;
  estimate: unknown;
  output_key: string | null;
  output_size: number | null;
  error: string | null;
  attempt: number;
  retry_of: string | null;
  cpu_seconds: number | null;
  created_at: string;
  started_at: string | null;
  finished_at: string | null;
};

export const toAssetInfo = (a: AssetRow): AssetInfo => ({
  id: a.id,
  kind: a.kind,
  duration: a.duration,
  width: a.width,
  height: a.height,
  hasAudio: a.has_audio,
});

export async function getAsset(db: Db, id: string): Promise<AssetRow | null> {
  const r = await db.query<AssetRow>("select * from studio.assets where id = $1 and removed_at is null", [id]);
  return r.rows[0] ?? null;
}

export async function projectAssets(db: Db, projectId: string): Promise<AssetRow[]> {
  const r = await db.query<AssetRow>("select * from studio.assets where project_id = $1 and removed_at is null order by created_at", [projectId]);
  return r.rows;
}

export async function getRender(db: Db, id: string): Promise<RenderRow | null> {
  const r = await db.query<RenderRow>("select * from studio.renders where id = $1", [id]);
  return r.rows[0] ?? null;
}
