import "server-only";
import { z } from "zod";
import { slugify } from "@/lib/format";
import { fromZonedInput } from "@/lib/zoned";
import { deleteAsset, ingestImage, type ImagePreset } from "./media/images";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const blank = (v: unknown) => v === undefined || v === null || v === "";

/** Zod field builders for FormData-backed Command Center forms (strings in, typed values out). */
export const zf = {
  text: (max = 200, min = 1, msg = "Required") => z.string().trim().min(min, msg).max(max),
  opt: (max = 2000) =>
    z
      .string()
      .trim()
      .max(max)
      .optional()
      .transform((v) => v || null),
  body: (max = 20000) => z.string().trim().max(max).optional().default(""),
  url: z
    .string()
    .trim()
    .max(500)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), "Use a full link starting with https://"),
  bool: z.preprocess((v) => v === "on" || v === "true" || v === "1", z.boolean()),
  int: (min: number, max: number, fallback = min) => z.preprocess((v) => (blank(v) ? fallback : Number(v)), z.number().int(`Whole number ${min}–${max}`).min(min).max(max)),
  optInt: (min: number, max: number) =>
    z
      .string()
      .optional()
      .transform((v) => (blank(v) ? null : Number(v)))
      .refine((v) => v === null || (Number.isInteger(v) && v >= min && v <= max), `Whole number ${min}–${max}`),
  money: z
    .string()
    .optional()
    .transform((v) => (blank(v) ? "0" : String(Number(v))))
    .refine((v) => Number.isFinite(Number(v)) && Number(v) >= 0 && Number(v) < 1e10, "Enter an amount"),
  date: z
    .string()
    .optional()
    .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
  /** datetime-local in Cairo wall-clock time → Date */
  dateTime: (required = false) =>
    z
      .string()
      .optional()
      .transform((v) => (v ? fromZonedInput(v) : null))
      .refine((v) => !required || v !== null, "Pick a date and time"),
  uuid: z
    .string()
    .optional()
    .transform((v) => (v && UUID.test(v) ? v : null)),
  tags: (maxItems = 24) =>
    z
      .string()
      .max(1000)
      .optional()
      .default("")
      .transform((v) =>
        v
          .split(",")
          .map((x) => x.trim())
          .filter(Boolean)
          .slice(0, maxItems),
      ),
  color: z
    .string()
    .trim()
    .regex(/^#[0-9a-f]{6}$/i, "Use a hex colour like #2B6DFF"),
};

export const isUuid = (v: unknown): v is string => typeof v === "string" && UUID.test(v);

/** Non-file form entries as a plain object, for zod parsing. */
export function formFields(form: FormData): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of form.entries()) if (typeof v === "string" && !k.startsWith("$")) out[k] = v;
  return out;
}

/** First free slug: "title", "title-2", … */
export async function freeSlug(text: string, taken: (slug: string) => Promise<boolean>) {
  const base = slugify(text);
  for (let i = 1; i < 60; i++) {
    const slug = i === 1 ? base : `${base}-${i}`;
    if (!(await taken(slug))) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/**
 * Optional image input: a new file is ingested (old asset removed); `<name>_remove=1` clears it.
 * Returns the new asset id, null when removed, or undefined when unchanged.
 */
export async function applyImageField(
  form: FormData,
  name: string,
  opts: { current?: string | null; preset?: ImagePreset; folder: string; alt: string; uploadedBy: string; visibility?: "public" | "private" },
): Promise<string | null | undefined> {
  const file = form.get(name);
  if (file instanceof File && file.size > 0) {
    const asset = await ingestImage({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, visibility: opts.visibility ?? "public", preset: opts.preset ?? "cover", folder: opts.folder, alt: opts.alt, uploadedBy: opts.uploadedBy });
    if (opts.current) await deleteAsset(opts.current).catch(() => {});
    return asset.id;
  }
  if (form.get(`${name}_remove`) === "1" && opts.current) {
    await deleteAsset(opts.current).catch(() => {});
    return null;
  }
  return undefined;
}
