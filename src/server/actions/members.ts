"use server";

import { and, eq, ne } from "drizzle-orm";
import { z } from "zod";
import { redirect } from "next/navigation";
import { TAGS } from "@/lib/cache-tags";
import { slugify } from "@/lib/format";
import { publish, runAction, type ActionResult } from "../action";
import { audit } from "../audit";
import { AppError } from "../auth/errors";
import { assertCan } from "../auth/guard";
import { db, schema as s } from "../db";
import { deleteAsset, ingestImage, recropImage, type Crop } from "../media/images";

const opt = z
  .string()
  .trim()
  .max(500)
  .optional()
  .transform((v) => v || null);
const url = z
  .string()
  .trim()
  .max(300)
  .optional()
  .transform((v) => v || null)
  .refine((v) => v === null || /^https?:\/\/\S+$/i.test(v), "Must be a full http(s) URL");
const uuidOrNull = z
  .string()
  .optional()
  .transform((v) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null));

const memberSchema = z.object({
  fullName: z.string().trim().min(2, "Enter the full name").max(120),
  fullNameAr: opt,
  rank: z.enum(["founder", "team_leader", "vice_leader", "technical_lead", "competition_lead", "media", "pr", "member", "trainee"]),
  department: z
    .enum(["", "leadership", "hardware", "embedded", "mechanical", "software", "competition", "media", "pr", "events"])
    .transform((v) => v || null),
  title: opt,
  trackId: uuidOrNull,
  teamId: uuidOrNull,
  academicYear: z
    .string()
    .optional()
    .transform((v) => (v ? Number(v) : null))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 1 && v <= 7), "Pick a year"),
  bio: z.string().trim().max(4000).default(""),
  skills: z
    .string()
    .max(600)
    .default("")
    .transform((v) =>
      v
        .split(",")
        .map((x) => x.trim())
        .filter(Boolean)
        .slice(0, 24),
    ),
  linkedin: url,
  github: url,
  instagram: url,
  facebook: url,
  youtube: url,
  website: url,
  joinedAt: z
    .string()
    .optional()
    .transform((v) => (v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : null)),
  status: z.enum(["active", "inactive", "alumni"]).default("active"),
  sortOrder: z.coerce.number().int().min(0).max(10000).default(100),
  publicProfile: z
    .string()
    .optional()
    .transform((v) => v === "on" || v === "true"),
  phone: opt,
  privateEmail: z
    .string()
    .trim()
    .max(254)
    .optional()
    .transform((v) => v || null)
    .refine((v) => v === null || z.string().email().safeParse(v).success, "Enter a valid email"),
  adminNotes: z.string().trim().max(4000).optional().transform((v) => v || null),
});

function readCrop(form: FormData): Crop | null {
  const n = (k: string) => Number(form.get(k));
  const c = { x: n("cropX"), y: n("cropY"), w: n("cropW"), h: n("cropH") };
  return [c.x, c.y, c.w, c.h].every((v) => Number.isFinite(v)) && c.w > 0 && c.h > 0 ? c : null;
}

async function uniqueSlug(name: string, exceptId?: string) {
  const base = slugify(name);
  for (let i = 0; i < 50; i++) {
    const slug = i === 0 ? base : `${base}-${i + 1}`;
    const [hit] = await db
      .select({ id: s.members.id })
      .from(s.members)
      .where(exceptId ? and(eq(s.members.slug, slug), ne(s.members.id, exceptId)) : eq(s.members.slug, slug))
      .limit(1);
    if (!hit) return slug;
  }
  return `${base}-${Date.now().toString(36)}`;
}

/** Create or update a member (with optional new photo + crop). Publishes to the public site immediately. */
export async function saveMember(_prev: unknown, form: FormData): Promise<ActionResult<{ id: string }>> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "members.manage");
    const id = String(form.get("id") ?? "") || null;
    const input = memberSchema.parse(Object.fromEntries(form));
    const crop = readCrop(form);
    const file = form.get("photo");
    let photoId: string | undefined;

    const existing = id ? (await db.select().from(s.members).where(eq(s.members.id, id)).limit(1))[0] : undefined;
    if (id && !existing) throw new AppError("NOT_FOUND", "Member not found.");

    if (file instanceof File && file.size > 0) {
      const asset = await ingestImage({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, visibility: "public", preset: "portrait", crop, folder: "members", alt: input.fullName, uploadedBy: actor.userId });
      photoId = asset.id;
      if (existing?.photoId) await deleteAsset(existing.photoId).catch(() => {});
    } else if (existing?.photoId && crop && JSON.stringify(crop) !== JSON.stringify(existing.photoCrop)) {
      await recropImage(existing.photoId, crop, "portrait");
    }
    if (form.get("removePhoto") === "1" && existing?.photoId && !photoId) {
      await deleteAsset(existing.photoId).catch(() => {});
      photoId = "";
    }

    const values = {
      ...input,
      ...(photoId !== undefined ? { photoId: photoId || null } : {}),
      ...(crop ? { photoCrop: crop } : {}),
    };
    let memberId: string;
    if (existing) {
      const slug = existing.fullName !== input.fullName ? await uniqueSlug(input.fullName, existing.id) : existing.slug;
      await db.update(s.members).set({ ...values, slug }).where(eq(s.members.id, existing.id));
      memberId = existing.id;
      await audit(actor, { action: "member.updated", targetType: "member", targetId: memberId, summary: input.fullName, meta: { publicProfile: input.publicProfile } }, req);
    } else {
      const [row] = await db
        .insert(s.members)
        .values({ ...values, slug: await uniqueSlug(input.fullName) })
        .returning({ id: s.members.id });
      memberId = row!.id;
      await audit(actor, { action: "member.created", targetType: "member", targetId: memberId, summary: input.fullName }, req);
    }
    publish(TAGS.members, TAGS.stats, TAGS.teams, TAGS.tracks, TAGS.projects);
    return { id: memberId };
  });
  if (res.ok) redirect(`/command/members/${res.data.id}?saved=1`);
  return res;
}

export async function setMemberPublic(id: string, value: boolean): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "members.manage");
    const [m] = await db.update(s.members).set({ publicProfile: value }).where(eq(s.members.id, id)).returning({ name: s.members.fullName });
    if (!m) throw new AppError("NOT_FOUND", "Member not found.");
    await audit(actor, { action: value ? "member.published" : "member.unpublished", targetType: "member", targetId: id, summary: m.name }, req);
    publish(TAGS.members, TAGS.stats);
  });
}

export async function deleteMember(id: string): Promise<ActionResult> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "members.manage");
    const [m] = await db.delete(s.members).where(eq(s.members.id, id)).returning({ name: s.members.fullName, photoId: s.members.photoId });
    if (!m) throw new AppError("NOT_FOUND", "Member not found.");
    if (m.photoId) await deleteAsset(m.photoId).catch(() => {});
    await audit(actor, { action: "member.deleted", targetType: "member", targetId: id, summary: m.name }, req);
    publish(TAGS.members, TAGS.stats, TAGS.teams, TAGS.tracks, TAGS.projects);
  });
  if (res.ok) redirect("/command/members?deleted=1");
  return res;
}
