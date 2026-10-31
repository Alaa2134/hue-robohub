/**
 * File storage. "supabase": a private Supabase Storage bucket — browsers upload straight to it with
 * resumable (TUS) uploads under row-level security, and read through short-lived signed URLs.
 * "local": files on this server's disk, with the same flow served by the API (TUS endpoint and signed
 * links). Keys look like projects/<project>/assets/<asset>/<file>.
 */
import { createHmac, timingSafeEqual } from "node:crypto";
import { copyFileSync, createReadStream, createWriteStream, existsSync, mkdirSync, readFileSync, renameSync, rmSync, statSync } from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import * as tus from "tus-js-client";
import type { Config } from "./config.ts";

export type UploadTarget = {
  endpoint: string;
  /** "session": the browser adds its Supabase session token; "ticket": use the given headers as they are. */
  auth: "session" | "ticket";
  headers: Record<string, string>;
  metadata: Record<string, string>;
  chunkSize: number;
};

export interface Storage {
  readonly kind: "supabase" | "local";
  putFile(key: string, file: string, contentType: string): Promise<void>;
  getFile(key: string, file: string): Promise<void>;
  size(key: string): Promise<number | null>;
  signedUrl(key: string, seconds: number, download?: string): Promise<string>;
  remove(keys: string[]): Promise<void>;
  copy(from: string, to: string): Promise<void>;
  uploadTarget(key: string, contentType: string, ticket: string): UploadTarget;
}

// ── Signed tokens (upload tickets, local file links) ────────────────────────────────────────────────

const b64 = (b: Buffer | string) => Buffer.from(b).toString("base64url");

export function signToken(secret: string, payload: Record<string, unknown>): string {
  const body = b64(JSON.stringify(payload));
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

export function verifyToken<T extends { exp: number }>(secret: string, token: string): T | null {
  const [body, sig] = token.split(".");
  if (!body || !sig) return null;
  const want = createHmac("sha256", secret).update(body).digest();
  const got = Buffer.from(sig, "base64url");
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, "base64url").toString()) as T;
    return typeof p.exp === "number" && p.exp > Date.now() / 1000 ? p : null;
  } catch {
    return null;
  }
}

/** Keys are made by the server; this still refuses anything that could leave the storage folder. */
export function safeKey(key: string): string {
  if (!/^[A-Za-z0-9/_.\-]+$/.test(key) || key.includes("..") || key.startsWith("/")) throw new Error("Bad storage key.");
  return key;
}

export function fileName(name: string): string {
  const ext = path.extname(name).toLowerCase().replace(/[^.a-z0-9]/g, "").slice(0, 8);
  const base = path.basename(name, path.extname(name)).normalize("NFKD").replace(/[^A-Za-z0-9_-]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "file";
  return `${base}${ext}`;
}

// ── Local disk ──────────────────────────────────────────────────────────────────────────────────────

export class LocalStorage implements Storage {
  readonly kind = "local" as const;
  readonly root: string;
  constructor(private config: Config) {
    this.root = path.resolve(config.STUDIO_LOCAL_DIR, "objects");
    mkdirSync(this.root, { recursive: true });
  }
  path(key: string) {
    return path.join(this.root, safeKey(key));
  }
  async putFile(key: string, file: string) {
    const to = this.path(key);
    mkdirSync(path.dirname(to), { recursive: true });
    await pipeline(createReadStream(file), createWriteStream(to));
  }
  /** Move a finished upload into place (the TUS endpoint's last step). */
  adopt(key: string, file: string) {
    const to = this.path(key);
    mkdirSync(path.dirname(to), { recursive: true });
    renameSync(file, to);
  }
  async getFile(key: string, file: string) {
    mkdirSync(path.dirname(file), { recursive: true });
    await pipeline(createReadStream(this.path(key)), createWriteStream(file));
  }
  async size(key: string) {
    const p = this.path(key);
    return existsSync(p) ? statSync(p).size : null;
  }
  async signedUrl(key: string, seconds: number, download?: string) {
    const t = signToken(this.config.STUDIO_SECRET, { k: safeKey(key), d: download ?? null, exp: Math.floor(Date.now() / 1000) + seconds });
    return `${this.config.PUBLIC_API_URL.replace(/\/$/, "")}/files/${t}`;
  }
  async remove(keys: string[]) {
    for (const k of keys) rmSync(this.path(k), { force: true });
  }
  async copy(from: string, to: string) {
    const dest = this.path(to);
    mkdirSync(path.dirname(dest), { recursive: true });
    copyFileSync(this.path(from), dest);
  }
  uploadTarget(key: string, contentType: string, ticket: string): UploadTarget {
    return {
      endpoint: `${this.config.PUBLIC_API_URL.replace(/\/$/, "")}/uploads/`,
      auth: "ticket",
      headers: { "x-upload-ticket": ticket },
      metadata: { objectName: key, contentType },
      chunkSize: 8 * 1024 * 1024,
    };
  }
  readJson(key: string) {
    return JSON.parse(readFileSync(this.path(key), "utf8"));
  }
}

// ── Supabase Storage ────────────────────────────────────────────────────────────────────────────────

export class SupabaseStorage implements Storage {
  readonly kind = "supabase" as const;
  private sb: SupabaseClient;
  constructor(private config: Config) {
    this.sb = createClient(config.SUPABASE_URL, config.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  private get bucket() {
    return this.sb.storage.from(this.config.STUDIO_BUCKET);
  }
  async putFile(key: string, file: string, contentType: string) {
    const size = statSync(file).size;
    if (size < 6 * 1024 * 1024) {
      const { error } = await this.bucket.upload(safeKey(key), readFileSync(file), { contentType, upsert: true });
      if (error) throw new Error(`Storage upload failed: ${error.message}`);
      return;
    }
    // Big files (renders): resumable, in the 6 MB chunks Supabase expects.
    await new Promise<void>((resolve, reject) => {
      const up = new tus.Upload(createReadStream(file), {
        endpoint: `${this.config.SUPABASE_URL}/storage/v1/upload/resumable`,
        headers: { authorization: `Bearer ${this.config.SUPABASE_SERVICE_ROLE_KEY}`, apikey: this.config.SUPABASE_SERVICE_ROLE_KEY, "x-upsert": "true" },
        chunkSize: 6 * 1024 * 1024,
        uploadSize: size,
        retryDelays: [0, 2000, 5000, 10000, 20000],
        uploadDataDuringCreation: true,
        removeFingerprintOnSuccess: true,
        metadata: { bucketName: this.config.STUDIO_BUCKET, objectName: safeKey(key), contentType, cacheControl: "3600" },
        onError: reject,
        onSuccess: () => resolve(),
      });
      up.start();
    });
  }
  async getFile(key: string, file: string) {
    const url = await this.signedUrl(key, 600);
    const res = await fetch(url);
    if (!res.ok || !res.body) throw new Error(`Storage download failed (${res.status}) for ${key}`);
    mkdirSync(path.dirname(file), { recursive: true });
    await pipeline(Readable.fromWeb(res.body as never), createWriteStream(file));
  }
  async size(key: string) {
    const dir = path.posix.dirname(safeKey(key));
    const name = path.posix.basename(key);
    const { data, error } = await this.bucket.list(dir, { search: name, limit: 10 });
    if (error) throw new Error(`Storage list failed: ${error.message}`);
    const hit = data?.find((o) => o.name === name);
    return hit ? Number((hit.metadata as { size?: number } | null)?.size ?? 0) : null;
  }
  async signedUrl(key: string, seconds: number, download?: string) {
    const { data, error } = await this.bucket.createSignedUrl(safeKey(key), seconds, download ? { download } : undefined);
    if (error || !data) throw new Error(`Could not sign ${key}: ${error?.message}`);
    return data.signedUrl;
  }
  async remove(keys: string[]) {
    for (let i = 0; i < keys.length; i += 100) {
      const { error } = await this.bucket.remove(keys.slice(i, i + 100).map(safeKey));
      if (error) throw new Error(`Storage remove failed: ${error.message}`);
    }
  }
  async copy(from: string, to: string) {
    const { error } = await this.bucket.copy(safeKey(from), safeKey(to));
    if (error) throw new Error(`Storage copy failed: ${error.message}`);
  }
  uploadTarget(key: string, contentType: string): UploadTarget {
    return {
      endpoint: `${this.config.SUPABASE_URL}/storage/v1/upload/resumable`,
      auth: "session",
      headers: { apikey: this.config.SUPABASE_ANON_KEY, "x-upsert": "false" },
      metadata: { bucketName: this.config.STUDIO_BUCKET, objectName: safeKey(key), contentType, cacheControl: "3600" },
      chunkSize: 6 * 1024 * 1024,
    };
  }
}

export function makeStorage(config: Config): Storage {
  return config.STUDIO_STORAGE === "supabase" ? new SupabaseStorage(config) : new LocalStorage(config);
}
