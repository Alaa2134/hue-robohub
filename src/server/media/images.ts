import "server-only";
import { createHash, randomUUID } from "node:crypto";
import sharp from "sharp";
import { eq } from "drizzle-orm";
import { db, schema } from "../db";
import type { ImageVariant } from "../db/schema";
import { AppError } from "../auth/errors";
import { IMAGE_MIMES, MAX_IMAGE_BYTES, safeFilename, sniff } from "../security/file-signature";
import { storage, type Visibility } from "../storage";

sharp.cache(false);
sharp.concurrency(2);

export type Crop = { x: number; y: number; w: number; h: number };

export type ImagePreset = "default" | "portrait" | "logo" | "cover";

const PRESETS: Record<ImagePreset, { widths: number[]; aspect?: number; fit: "inside" | "cover" }> = {
  default: { widths: [480, 960, 1600, 2400], fit: "inside" },
  cover: { widths: [640, 1280, 1920, 2560], fit: "inside" },
  portrait: { widths: [160, 360, 720, 1080], aspect: 4 / 5, fit: "cover" },
  logo: { widths: [160, 320, 640], fit: "inside" },
};

const MAX_PIXELS = 60_000_000; // decompression-bomb guard

function clampCrop(c: Crop): Crop {
  const x = Math.min(Math.max(c.x, 0), 1);
  const y = Math.min(Math.max(c.y, 0), 1);
  const w = Math.min(Math.max(c.w, 0.02), 1 - x);
  const h = Math.min(Math.max(c.h, 0.02), 1 - y);
  return { x, y, w, h };
}

async function renderVariants(
  original: Buffer,
  assetId: string,
  visibility: Visibility,
  preset: ImagePreset,
  crop?: Crop | null,
) {
  const cfg = PRESETS[preset];
  const base = sharp(original, { limitInputPixels: MAX_PIXELS, failOn: "error" }).rotate();
  const meta = await base.metadata();
  const srcW = meta.autoOrient?.width ?? meta.width ?? 0;
  const srcH = meta.autoOrient?.height ?? meta.height ?? 0;
  if (!srcW || !srcH) throw new AppError("VALIDATION", "Unreadable image.");

  let region = { left: 0, top: 0, width: srcW, height: srcH };
  if (crop) {
    const c = clampCrop(crop);
    region = {
      left: Math.round(c.x * srcW),
      top: Math.round(c.y * srcH),
      width: Math.max(1, Math.round(c.w * srcW)),
      height: Math.max(1, Math.round(c.h * srcH)),
    };
  } else if (cfg.aspect) {
    // Centre-crop to the preset aspect ratio, biased upward for portraits (faces sit in the upper third).
    const targetH = Math.min(srcH, Math.round(srcW / cfg.aspect));
    const targetW = Math.min(srcW, Math.round(targetH * cfg.aspect));
    region = {
      left: Math.round((srcW - targetW) / 2),
      top: Math.round((srcH - targetH) * 0.3),
      width: targetW,
      height: targetH,
    };
  }

  const cropped = await sharp(original, { limitInputPixels: MAX_PIXELS }).rotate().extract(region).toBuffer();
  const version = createHash("sha1").update(JSON.stringify([region, preset])).digest("hex").slice(0, 8);
  const widths = cfg.widths.filter((w, i) => w <= region.width || i === 0);
  const variants: ImageVariant[] = [];
  const cacheControl = "public, max-age=31536000, immutable";

  await Promise.all(
    widths.map(async (w) => {
      const width = Math.min(w, region.width);
      const height = Math.round((region.height / region.width) * width);
      const pipeline = sharp(cropped).resize({ width, height, fit: "fill" });
      const [avif, webp] = await Promise.all([
        pipeline.clone().avif({ quality: 52, effort: 4 }).toBuffer(),
        pipeline.clone().webp({ quality: 78 }).toBuffer(),
      ]);
      for (const [format, buf] of [["avif", avif], ["webp", webp]] as const) {
        const key = `img/${assetId}/${version}-${width}.${format}`;
        await storage().put(visibility, key, buf, `image/${format}`, visibility === "public" ? cacheControl : undefined);
        variants.push({ w: width, h: height, format, key, bytes: buf.length });
      }
    }),
  );
  // JPEG rendition for OpenGraph / social cards and email clients.
  const ogW = Math.min(1200, region.width);
  const jpeg = await sharp(cropped).resize({ width: ogW }).jpeg({ quality: 80, mozjpeg: true }).toBuffer();
  const jpegKey = `img/${assetId}/${version}-${ogW}.jpg`;
  await storage().put(visibility, jpegKey, jpeg, "image/jpeg", visibility === "public" ? cacheControl : undefined);
  variants.push({ w: ogW, h: Math.round((region.height / region.width) * ogW), format: "jpeg", key: jpegKey, bytes: jpeg.length });

  const tiny = await sharp(cropped).resize(16).webp({ quality: 40 }).toBuffer();
  const { dominant } = await sharp(cropped).stats();
  variants.sort((a, b) => a.w - b.w);
  return {
    variants,
    width: region.width,
    height: region.height,
    placeholder: `data:image/webp;base64,${tiny.toString("base64")}`,
    dominantColor: `rgb(${dominant.r},${dominant.g},${dominant.b})`,
  };
}

export type IngestImageInput = {
  buffer: Buffer;
  filename: string;
  visibility: Visibility;
  preset?: ImagePreset;
  crop?: Crop | null;
  folder?: string;
  alt?: string;
  uploadedBy?: string | null;
};

/** Validate, re-encode and store an image. The original is kept privately so crops can be regenerated. */
export async function ingestImage(input: IngestImageInput) {
  if (input.buffer.length > MAX_IMAGE_BYTES) throw new AppError("BAD_REQUEST", "Image is larger than 15 MB.");
  const sniffed = sniff(input.buffer);
  if (!sniffed || !IMAGE_MIMES.has(sniffed.mime)) {
    throw new AppError("VALIDATION", "Unsupported image. Use JPEG, PNG, WebP or AVIF.");
  }
  try {
    await sharp(input.buffer, { limitInputPixels: MAX_PIXELS, failOn: "error" }).metadata();
  } catch {
    throw new AppError("VALIDATION", "The image file is corrupted or too large to process.");
  }
  const assetId = randomUUID();
  const originalKey = `originals/${assetId}.${sniffed.ext}`;
  await storage().put("private", originalKey, input.buffer, sniffed.mime);
  const out = await renderVariants(input.buffer, assetId, input.visibility, input.preset ?? "default", input.crop);
  const [row] = await db
    .insert(schema.mediaAssets)
    .values({
      id: assetId,
      kind: "image",
      visibility: input.visibility,
      originalKey,
      filename: safeFilename(input.filename),
      mime: sniffed.mime,
      bytes: input.buffer.length,
      width: out.width,
      height: out.height,
      sha256: createHash("sha256").update(input.buffer).digest("hex"),
      variants: out.variants,
      placeholder: out.placeholder,
      dominantColor: out.dominantColor,
      alt: input.alt ?? null,
      folder: input.folder ?? null,
      uploadedBy: input.uploadedBy ?? null,
    })
    .returning();
  return row!;
}

/** Re-render an existing image with a new crop (member photo repositioning). */
export async function recropImage(assetId: string, crop: Crop, preset: ImagePreset = "portrait") {
  const [asset] = await db.select().from(schema.mediaAssets).where(eq(schema.mediaAssets.id, assetId)).limit(1);
  if (!asset || asset.kind !== "image") throw new AppError("NOT_FOUND", "Image not found.");
  const original = await storage().get("private", asset.originalKey);
  const old = asset.variants;
  const out = await renderVariants(original, asset.id, asset.visibility, preset, crop);
  await db
    .update(schema.mediaAssets)
    .set({ variants: out.variants, width: out.width, height: out.height, placeholder: out.placeholder, dominantColor: out.dominantColor })
    .where(eq(schema.mediaAssets.id, asset.id));
  const keep = new Set(out.variants.map((v) => v.key));
  await Promise.all(old.filter((v) => !keep.has(v.key)).map((v) => storage().delete(asset.visibility, v.key).catch(() => {})));
}

export async function deleteAsset(assetId: string) {
  const [asset] = await db.delete(schema.mediaAssets).where(eq(schema.mediaAssets.id, assetId)).returning();
  if (!asset) return;
  await Promise.all([
    storage().delete("private", asset.originalKey).catch(() => {}),
    ...asset.variants.map((v) => storage().delete(asset.visibility, v.key).catch(() => {})),
  ]);
}
