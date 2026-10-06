"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TAGS } from "@/lib/cache-tags";
import { publish, runAction, type ActionResult } from "../action";
import { audit } from "../audit";
import { AppError } from "../auth/errors";
import { assertCan } from "../auth/guard";
import { db, schema as s } from "../db";
import { applyImageField, formFields, freeSlug, isUuid, zf } from "../forms";

type Saved = ActionResult<{ id: string }>;
const ok = (id: string): Saved => ({ ok: true, data: { id } });

/* ─── Competitions ────────────────────────────────────────────────────────── */

const competitionSchema = z.object({
  name: zf.text(160),
  organizer: zf.opt(160),
  location: zf.opt(160),
  category: zf.opt(80),
  teamId: zf.uuid,
  startsAt: zf.dateTime(),
  registrationDeadline: zf.dateTime(),
  status: z.enum(["planned", "registered", "competing", "completed", "withdrawn"]),
  result: zf.opt(300),
  rank: zf.optInt(1, 1000),
  url: zf.url,
  notes: zf.opt(4000),
});

export async function saveCompetition(_prev: unknown, form: FormData): Promise<Saved> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "competitions.manage");
    const id = form.get("id");
    const v = competitionSchema.parse(formFields(form));
    if (isUuid(id)) {
      const [r] = await db.update(s.competitions).set(v).where(eq(s.competitions.id, id)).returning({ id: s.competitions.id });
      if (!r) throw new AppError("NOT_FOUND", "Competition not found.");
      await audit(actor, { action: "competition.updated", targetType: "competition", targetId: id, summary: v.name }, req);
      publish(TAGS.competitions, TAGS.teams);
      return { id, created: false };
    }
    const slug = await freeSlug(v.name, async (x) => (await db.select({ id: s.competitions.id }).from(s.competitions).where(eq(s.competitions.slug, x)).limit(1)).length > 0);
    const [r] = await db.insert(s.competitions).values({ ...v, slug }).returning({ id: s.competitions.id });
    await audit(actor, { action: "competition.created", targetType: "competition", targetId: r!.id, summary: v.name }, req);
    publish(TAGS.competitions, TAGS.teams);
    return { id: r!.id, created: true };
  });
  if (res.ok && res.data.created) redirect(`/command/competitions/${res.data.id}?saved=1`);
  return res.ok ? ok(res.data.id) : res;
}

export async function deleteCompetition(id: string): Promise<ActionResult> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "competitions.manage");
    const [r] = await db.delete(s.competitions).where(eq(s.competitions.id, id)).returning({ name: s.competitions.name });
    if (!r) throw new AppError("NOT_FOUND", "Competition not found.");
    await audit(actor, { action: "competition.deleted", targetType: "competition", targetId: id, summary: r.name }, req);
    publish(TAGS.competitions, TAGS.teams);
  });
  if (res.ok) redirect("/command/competitions?deleted=1");
  return res;
}

/* ─── Achievements ────────────────────────────────────────────────────────── */

const achievementSchema = z.object({
  title: zf.text(160),
  kind: z.enum(["win", "ranking", "certificate", "milestone", "award"]),
  achievedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Pick the date"),
  rank: zf.optInt(1, 1000),
  competitionId: zf.uuid,
  teamId: zf.uuid,
  projectId: zf.uuid,
  description: zf.body(2000),
  public: zf.bool,
});

export async function saveAchievement(_prev: unknown, form: FormData): Promise<Saved> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "competitions.manage");
    const id = form.get("id");
    const v = achievementSchema.parse(formFields(form));
    if (isUuid(id)) {
      const [cur] = await db.select({ imageId: s.achievements.imageId }).from(s.achievements).where(eq(s.achievements.id, id)).limit(1);
      if (!cur) throw new AppError("NOT_FOUND", "Achievement not found.");
      const imageId = await applyImageField(form, "image", { current: cur.imageId, folder: "achievements", alt: v.title, uploadedBy: actor.userId });
      await db
        .update(s.achievements)
        .set({ ...v, ...(imageId !== undefined ? { imageId } : {}) })
        .where(eq(s.achievements.id, id));
      await audit(actor, { action: "achievement.updated", targetType: "achievement", targetId: id, summary: v.title }, req);
      publish(TAGS.achievements, TAGS.stats, TAGS.teams);
      return { id, created: false };
    }
    const imageId = await applyImageField(form, "image", { folder: "achievements", alt: v.title, uploadedBy: actor.userId });
    const [r] = await db
      .insert(s.achievements)
      .values({ ...v, imageId: imageId ?? null })
      .returning({ id: s.achievements.id });
    await audit(actor, { action: "achievement.created", targetType: "achievement", targetId: r!.id, summary: v.title }, req);
    publish(TAGS.achievements, TAGS.stats, TAGS.teams);
    return { id: r!.id, created: true };
  });
  if (res.ok && res.data.created) redirect("/command/competitions?tab=achievements&saved=1");
  return res.ok ? ok(res.data.id) : res;
}

export async function deleteAchievement(id: string): Promise<ActionResult> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "competitions.manage");
    const [r] = await db.delete(s.achievements).where(eq(s.achievements.id, id)).returning({ title: s.achievements.title });
    if (!r) throw new AppError("NOT_FOUND", "Achievement not found.");
    await audit(actor, { action: "achievement.deleted", targetType: "achievement", targetId: id, summary: r.title }, req);
    publish(TAGS.achievements, TAGS.stats, TAGS.teams);
  });
  if (res.ok) redirect("/command/competitions?tab=achievements&deleted=1");
  return res;
}

/* ─── Sponsors ────────────────────────────────────────────────────────────── */

const sponsorSchema = z.object({
  name: zf.text(120),
  tier: z.enum(["strategic", "gold", "silver", "technical"]),
  website: zf.url,
  description: zf.body(1000),
  sortOrder: zf.int(0, 10000, 100),
  active: zf.bool,
});

export async function saveSponsor(_prev: unknown, form: FormData): Promise<Saved> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "sponsors.manage");
    const id = form.get("id");
    const v = sponsorSchema.parse(formFields(form));
    const [cur] = isUuid(id) ? await db.select({ logoId: s.sponsors.logoId }).from(s.sponsors).where(eq(s.sponsors.id, id)).limit(1) : [];
    if (isUuid(id) && !cur) throw new AppError("NOT_FOUND", "Sponsor not found.");
    const logoId = await applyImageField(form, "logo", { current: cur?.logoId, preset: "logo", folder: "sponsors", alt: `${v.name} logo`, uploadedBy: actor.userId });
    let sid: string;
    if (isUuid(id)) {
      await db
        .update(s.sponsors)
        .set({ ...v, ...(logoId !== undefined ? { logoId } : {}) })
        .where(eq(s.sponsors.id, id));
      sid = id;
    } else {
      const [r] = await db
        .insert(s.sponsors)
        .values({ ...v, logoId: logoId ?? null })
        .returning({ id: s.sponsors.id });
      sid = r!.id;
    }
    await audit(actor, { action: isUuid(id) ? "sponsor.updated" : "sponsor.created", targetType: "sponsor", targetId: sid, summary: v.name }, req);
    publish(TAGS.sponsors);
    return { id: sid, created: !isUuid(id) };
  });
  if (res.ok && res.data.created) redirect("/command/sponsors?saved=1");
  return res.ok ? ok(res.data.id) : res;
}

export async function deleteSponsor(id: string): Promise<ActionResult> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "sponsors.manage");
    const [r] = await db.delete(s.sponsors).where(eq(s.sponsors.id, id)).returning({ name: s.sponsors.name });
    if (!r) throw new AppError("NOT_FOUND", "Sponsor not found.");
    await audit(actor, { action: "sponsor.deleted", targetType: "sponsor", targetId: id, summary: r.name }, req);
    publish(TAGS.sponsors);
  });
  if (res.ok) redirect("/command/sponsors?deleted=1");
  return res;
}

/* ─── Videos ──────────────────────────────────────────────────────────────── */

/** Accepts a YouTube link in any common shape, or a bare id. */
function youtubeId(input: string): string | null {
  const v = input.trim();
  if (/^[\w-]{11}$/.test(v)) return v;
  const m = /(?:youtu\.be\/|youtube\.com\/(?:watch\?(?:.*&)?v=|embed\/|shorts\/|live\/))([\w-]{11})/.exec(v);
  return m?.[1] ?? null;
}

const videoSchema = z
  .object({
    title: zf.text(160),
    kind: z.enum(["hero", "story", "showreel", "recap", "promo", "interview", "reel", "testing"]),
    provider: z.enum(["youtube", "hls", "mux", "cloudflare"]),
    source: zf.text(500, 1, "Paste the link or id"),
    description: zf.body(2000),
    recordedOn: zf.date,
    durationSeconds: zf.optInt(1, 36000),
    projectId: zf.uuid,
    teamId: zf.uuid,
    published: zf.bool,
    featured: zf.bool,
  })
  .transform((v, ctx) => {
    if (v.provider === "youtube") {
      const id = youtubeId(v.source);
      if (!id) ctx.addIssue({ code: "custom", path: ["source"], message: "Paste a YouTube link like https://youtu.be/…" });
      return { ...v, source: id ?? v.source };
    }
    if (v.provider === "hls" && !/^(https:\/\/\S+\.m3u8(\?\S*)?|\/media\/films\/[\w-]+\/[\w-]+\.m3u8)$/.test(v.source)) ctx.addIssue({ code: "custom", path: ["source"], message: "Use an https://…/master.m3u8 link" });
    return v;
  });

export async function saveVideo(_prev: unknown, form: FormData): Promise<Saved> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "gallery.manage");
    const id = form.get("id");
    const v = videoSchema.parse(formFields(form));
    const [cur] = isUuid(id) ? await db.select({ posterId: s.videos.posterId }).from(s.videos).where(eq(s.videos.id, id)).limit(1) : [];
    if (isUuid(id) && !cur) throw new AppError("NOT_FOUND", "Video not found.");
    const posterId = await applyImageField(form, "poster", { current: cur?.posterId, folder: "videos", alt: v.title, uploadedBy: actor.userId });
    let vid: string;
    if (isUuid(id)) {
      await db
        .update(s.videos)
        .set({ ...v, ...(posterId !== undefined ? { posterId } : {}) })
        .where(eq(s.videos.id, id));
      vid = id;
    } else {
      const [r] = await db
        .insert(s.videos)
        .values({ ...v, posterId: posterId ?? null })
        .returning({ id: s.videos.id });
      vid = r!.id;
    }
    await audit(actor, { action: isUuid(id) ? "video.updated" : "video.created", targetType: "video", targetId: vid, summary: v.title }, req);
    publish(TAGS.videos, TAGS.projects, TAGS.teams);
    return { id: vid, created: !isUuid(id) };
  });
  if (res.ok && res.data.created) redirect("/command/videos?saved=1");
  return res.ok ? ok(res.data.id) : res;
}

export async function deleteVideo(id: string): Promise<ActionResult> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "gallery.manage");
    const [r] = await db.delete(s.videos).where(eq(s.videos.id, id)).returning({ title: s.videos.title });
    if (!r) throw new AppError("NOT_FOUND", "Video not found.");
    await audit(actor, { action: "video.deleted", targetType: "video", targetId: id, summary: r.title }, req);
    publish(TAGS.videos, TAGS.projects, TAGS.teams);
  });
  if (res.ok) redirect("/command/videos?deleted=1");
  return res;
}

/* ─── Competition teams ───────────────────────────────────────────────────── */

const teamSchema = z.object({
  name: zf.text(80),
  nameAr: zf.opt(80),
  discipline: zf.text(120),
  summary: zf.body(400),
  description: zf.body(4000),
  accent: zf.color,
  robotName: zf.opt(80),
  robotDescription: zf.opt(2000),
  captainId: zf.uuid,
  sortOrder: zf.int(0, 1000, 0),
  published: zf.bool,
});

export async function saveTeam(_prev: unknown, form: FormData): Promise<Saved> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "teams.manage");
    const id = form.get("id");
    if (!isUuid(id)) throw new AppError("BAD_REQUEST", "Pick a team.");
    const v = teamSchema.parse(formFields(form));
    const [cur] = await db.select({ coverId: s.competitionTeams.coverId }).from(s.competitionTeams).where(eq(s.competitionTeams.id, id)).limit(1);
    if (!cur) throw new AppError("NOT_FOUND", "Team not found.");
    const coverId = await applyImageField(form, "cover", { current: cur.coverId, folder: "teams", alt: v.name, uploadedBy: actor.userId });
    await db
      .update(s.competitionTeams)
      .set({ ...v, ...(coverId !== undefined ? { coverId } : {}) })
      .where(eq(s.competitionTeams.id, id));
    // Specs: "spec.N.label" / "spec.N.value" rows; blank rows are dropped.
    const specs: { label: string; value: string }[] = [];
    for (let i = 0; i < 12; i++) {
      const label = String(form.get(`spec.${i}.label`) ?? "").trim().slice(0, 40);
      const value = String(form.get(`spec.${i}.value`) ?? "").trim().slice(0, 80);
      if (label && value) specs.push({ label, value });
    }
    await db.transaction(async (tx) => {
      await tx.delete(s.teamSpecs).where(eq(s.teamSpecs.teamId, id));
      if (specs.length) await tx.insert(s.teamSpecs).values(specs.map((sp, position) => ({ ...sp, teamId: id, position })));
    });
    await audit(actor, { action: "team.updated", targetType: "team", targetId: id, summary: v.name }, req);
    publish(TAGS.teams, TAGS.competitions);
    return { id };
  });
  return res;
}
