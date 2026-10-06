import "server-only";
import { createReadStream } from "node:fs";
import { mkdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { Readable } from "node:stream";
import { DeleteObjectCommand, GetObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "../env";
import { signUrlPayload } from "../security/crypto";

export type Visibility = "public" | "private";

export interface StorageDriver {
  put(vis: Visibility, key: string, body: Buffer, contentType: string, cacheControl?: string): Promise<void>;
  get(vis: Visibility, key: string): Promise<Buffer>;
  stream(vis: Visibility, key: string): Promise<{ body: ReadableStream; size: number } | null>;
  delete(vis: Visibility, key: string): Promise<void>;
  /** Public, cacheable URL (CDN). */
  publicUrl(key: string): string;
  /** Short-lived URL for private objects. */
  signedUrl(key: string, ttlSeconds: number, downloadName?: string): Promise<string>;
}

const SAFE_KEY = /^[a-z0-9][a-z0-9/_.-]{0,300}$/i;
function assertKey(key: string) {
  if (!SAFE_KEY.test(key) || key.includes("..")) throw new Error("unsafe storage key");
}

class LocalDriver implements StorageDriver {
  constructor(private root: string) {}
  private file(vis: Visibility, key: string) {
    assertKey(key);
    const base = path.resolve(this.root, vis);
    const full = path.resolve(base, key);
    if (!full.startsWith(base + path.sep)) throw new Error("path traversal");
    return full;
  }
  async put(vis: Visibility, key: string, body: Buffer) {
    const f = this.file(vis, key);
    await mkdir(path.dirname(f), { recursive: true });
    await writeFile(f, body);
  }
  async get(vis: Visibility, key: string) {
    return readFile(this.file(vis, key));
  }
  async stream(vis: Visibility, key: string) {
    const f = this.file(vis, key);
    try {
      const s = await stat(f);
      return { body: Readable.toWeb(createReadStream(f)) as ReadableStream, size: s.size };
    } catch {
      return null;
    }
  }
  async delete(vis: Visibility, key: string) {
    await rm(this.file(vis, key), { force: true });
  }
  publicUrl(key: string) {
    const base = env().PUBLIC_MEDIA_BASE_URL;
    return base ? `${base.replace(/\/$/, "")}/${key}` : `/uploads/${key}`;
  }
  async signedUrl(key: string, ttlSeconds: number, downloadName?: string) {
    const exp = Math.floor(Date.now() / 1000) + ttlSeconds;
    const sig = signUrlPayload(key, exp);
    const dl = downloadName ? `&dl=${encodeURIComponent(downloadName)}` : "";
    return `/api/files/signed?key=${encodeURIComponent(key)}&exp=${exp}&sig=${sig}${dl}`;
  }
}

class S3Driver implements StorageDriver {
  private client: S3Client;
  constructor() {
    const e = env();
    this.client = new S3Client({
      region: e.S3_REGION,
      endpoint: e.S3_ENDPOINT || undefined,
      forcePathStyle: e.S3_FORCE_PATH_STYLE,
      credentials:
        e.S3_ACCESS_KEY_ID && e.S3_SECRET_ACCESS_KEY
          ? { accessKeyId: e.S3_ACCESS_KEY_ID, secretAccessKey: e.S3_SECRET_ACCESS_KEY }
          : undefined,
    });
  }
  private bucket(vis: Visibility) {
    return vis === "public" ? env().S3_PUBLIC_BUCKET : env().S3_PRIVATE_BUCKET;
  }
  async put(vis: Visibility, key: string, body: Buffer, contentType: string, cacheControl?: string) {
    assertKey(key);
    await this.client.send(
      new PutObjectCommand({
        Bucket: this.bucket(vis),
        Key: key,
        Body: body,
        ContentType: contentType,
        CacheControl: cacheControl ?? (vis === "public" ? "public, max-age=31536000, immutable" : "private, no-store"),
      }),
    );
  }
  async get(vis: Visibility, key: string) {
    const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket(vis), Key: key }));
    return Buffer.from(await out.Body!.transformToByteArray());
  }
  async stream(vis: Visibility, key: string) {
    try {
      const out = await this.client.send(new GetObjectCommand({ Bucket: this.bucket(vis), Key: key }));
      return { body: out.Body!.transformToWebStream() as ReadableStream, size: Number(out.ContentLength ?? 0) };
    } catch {
      return null;
    }
  }
  async delete(vis: Visibility, key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.bucket(vis), Key: key }));
  }
  publicUrl(key: string) {
    const e = env();
    if (e.PUBLIC_MEDIA_BASE_URL) return `${e.PUBLIC_MEDIA_BASE_URL.replace(/\/$/, "")}/${key}`;
    return `/media/${key}`;
  }
  async signedUrl(key: string, ttlSeconds: number, downloadName?: string) {
    return getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: env().S3_PRIVATE_BUCKET,
        Key: key,
        ResponseContentDisposition: downloadName ? `attachment; filename="${downloadName.replace(/[^\w.\- ]/g, "_")}"` : undefined,
      }),
      { expiresIn: ttlSeconds },
    );
  }
}

const g = globalThis as unknown as { __rhStorage?: StorageDriver };

export function storage(): StorageDriver {
  if (!g.__rhStorage) {
    g.__rhStorage = env().STORAGE_DRIVER === "s3" ? new S3Driver() : new LocalDriver(path.resolve(env().STORAGE_LOCAL_DIR));
  }
  return g.__rhStorage;
}
