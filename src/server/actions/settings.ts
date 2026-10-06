"use server";

import { z } from "zod";
import { TAGS } from "@/lib/cache-tags";
import { SETTING_KEYS, type SettingKey } from "@/lib/site-config";
import { publish, runAction, type ActionResult } from "../action";
import { audit } from "../audit";
import { AppError } from "../auth/errors";
import { assertCan } from "../auth/guard";
import { db, schema as s } from "../db";

const text = (max: number) => z.string().trim().max(max);
const loc = (max: number, required = true) =>
  z.object({
    en: required ? text(max).min(1, "Required") : text(max).default(""),
    ar: text(max)
      .optional()
      .transform((v) => v || undefined),
  });
const url = text(300)
  .default("")
  .refine((v) => v === "" || /^https?:\/\/\S+$/i.test(v), "Use a full link starting with https://");
const href = text(200).refine((v) => v.startsWith("/") || /^https?:\/\/\S+$/i.test(v), "Use a path like /join or a full https:// link");
const bool = z.preprocess((v) => v === "on" || v === "true" || v === true, z.boolean());

const SCHEMAS: Record<SettingKey, z.ZodType> = {
  "site.recruitment": z.object({ open: bool, headline: loc(160), closedMessage: loc(400) }),
  "site.contact": z.object({
    email: text(254).email("Enter a valid email"),
    phone: text(40).default(""),
    whatsapp: text(40).default(""),
    address: loc(200, false),
    hours: loc(200, false),
    mapUrl: url,
  }),
  "site.socials": z.object({ linkedin: url, facebook: url, instagram: url, youtube: url, github: url }),
  "site.hero": z.object({
    eyebrow: loc(200),
    lines: z.tuple([loc(60), loc(60), loc(60)]),
    subtitle: loc(400),
    primaryCta: z.object({ label: loc(40), href }),
    secondaryCta: z.object({ label: loc(40), href }),
  }),
  "site.homepage": z.object({
    manifesto: loc(200),
    sections: z.object({ anatomy: bool, tracks: bool, teams: bool, bootcamp: bool, projects: bool, achievements: bool, events: bool, sponsors: bool }),
  }),
  "site.about": z.object({ vision: loc(600), mission: loc(600), story: loc(2000), values: z.array(z.object({ title: loc(60), body: loc(300) })).max(8) }),
  "site.seo": z.object({
    description: text(300).min(50, "Write at least 50 characters"),
    keywords: text(400).transform((v) =>
      v
        .split(",")
        .map((k) => k.trim())
        .filter(Boolean)
        .slice(0, 20),
    ),
  }),
};

const UNSAFE = new Set(["__proto__", "prototype", "constructor"]);

/** "lines.0.en" style field names → nested objects/arrays. */
function unflatten(form: FormData) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of form.entries()) {
    if (k.startsWith("_") || k.startsWith("$")) continue;
    const parts = k.split(".");
    if (parts.some((p) => UNSAFE.has(p))) continue;
    let o = out as Record<string, unknown>;
    parts.forEach((p, i) => {
      if (i === parts.length - 1) o[p] = typeof v === "string" ? v : "";
      else o = (o[p] ??= /^\d+$/.test(parts[i + 1]!) ? [] : {}) as Record<string, unknown>;
    });
  }
  return out;
}

/** Save one CMS section; the public site re-renders with it on the next request. */
export async function saveSetting(_prev: unknown, form: FormData): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "content.manage");
    const key = String(form.get("_key") ?? "") as SettingKey;
    if (!SETTING_KEYS.includes(key)) throw new AppError("BAD_REQUEST", "Unknown settings section.");
    const raw = unflatten(form);
    if (key === "site.about" && Array.isArray(raw.values)) raw.values = raw.values.filter(Boolean);
    const value = SCHEMAS[key].parse(raw);
    await db
      .insert(s.settings)
      .values({ key, value, updatedBy: actor.userId })
      .onConflictDoUpdate({ target: s.settings.key, set: { value, updatedBy: actor.userId, updatedAt: new Date() } });
    await audit(actor, { action: "settings.updated", targetType: "setting", targetId: key, summary: key }, req);
    publish(TAGS.settings);
  });
}
