"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TAGS } from "@/lib/cache-tags";
import { can } from "@/lib/permissions";
import { publish, runAction, type ActionResult } from "../action";
import { audit } from "../audit";
import { AppError, forbidden } from "../auth/errors";
import { assertCan, type Actor } from "../auth/guard";
import { db, schema as s } from "../db";
import { applyImageField, formFields, freeSlug, isUuid, zf } from "../forms";
import { canEditProject } from "../services/projects";

const STATUSES = ["idea", "research", "design", "prototype", "testing", "competition_ready", "completed", "archived"] as const;
const BOM = ["needed", "ordered", "received", "installed", "failed", "replacement_needed"] as const;

async function assertEdit(actor: Actor | null, projectId: string) {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in.");
  if (!isUuid(projectId) || !(await canEditProject(actor, projectId))) throw forbidden();
}

const projectSchema = z.object({
  title: zf.text(140),
  summary: zf.body(600),
  status: z.enum(STATUSES),
  progress: zf.int(0, 100, 0),
  trackId: zf.uuid,
  teamId: zf.uuid,
  managerId: zf.uuid,
  startDate: zf.date,
  endDate: zf.date,
  budget: zf.money,
  technologies: zf.tags(30),
  githubUrl: zf.url,
  demoUrl: zf.url,
  problem: zf.body(),
  solution: zf.body(),
  electronics: zf.body(),
  mechanical: zf.body(),
  software: zf.body(),
  challenges: zf.body(),
  testing: zf.body(),
  results: zf.body(),
  notes: zf.opt(4000),
  published: zf.bool,
  featured: zf.bool,
});

export async function saveProject(_prev: unknown, form: FormData): Promise<ActionResult<{ id: string }>> {
  const res = await runAction(async ({ actor, req }) => {
    if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in.");
    const id = form.get("id");
    const input = projectSchema.parse(formFields(form));
    const lead = can(actor.role, "projects.manage");
    if (isUuid(id)) {
      await assertEdit(actor, id);
      const [cur] = await db.select({ heroId: s.projects.heroId, published: s.projects.published, featured: s.projects.featured }).from(s.projects).where(eq(s.projects.id, id)).limit(1);
      if (!cur) throw new AppError("NOT_FOUND", "Project not found.");
      const heroId = await applyImageField(form, "hero", { current: cur.heroId, folder: "projects", alt: input.title, uploadedBy: actor.userId });
      // Only leads decide what goes on the public site.
      const values = { ...input, ...(lead ? {} : { published: cur.published, featured: cur.featured }), ...(heroId !== undefined ? { heroId } : {}) };
      await db.update(s.projects).set(values).where(eq(s.projects.id, id));
      await audit(actor, { action: "project.updated", targetType: "project", targetId: id, summary: input.title }, req);
      publish(TAGS.projects, TAGS.stats, TAGS.tracks, TAGS.teams);
      return { id, created: false };
    }
    assertCan(actor, "projects.manage");
    const slug = await freeSlug(input.title, async (x) => (await db.select({ id: s.projects.id }).from(s.projects).where(eq(s.projects.slug, x)).limit(1)).length > 0);
    const heroId = await applyImageField(form, "hero", { folder: "projects", alt: input.title, uploadedBy: actor.userId });
    const [p] = await db
      .insert(s.projects)
      .values({ ...input, slug, heroId: heroId ?? null })
      .returning({ id: s.projects.id });
    await audit(actor, { action: "project.created", targetType: "project", targetId: p!.id, summary: input.title }, req);
    publish(TAGS.projects, TAGS.stats, TAGS.tracks, TAGS.teams);
    return { id: p!.id, created: true };
  });
  if (res.ok && res.data.created) redirect(`/command/projects/${res.data.id}?new=1`);
  return res.ok ? { ok: true, data: { id: res.data.id } } : res;
}

export async function deleteProject(id: string): Promise<ActionResult> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "projects.manage");
    const [p] = await db.delete(s.projects).where(eq(s.projects.id, id)).returning({ title: s.projects.title });
    if (!p) throw new AppError("NOT_FOUND", "Project not found.");
    await audit(actor, { action: "project.deleted", targetType: "project", targetId: id, summary: p.title }, req);
    publish(TAGS.projects, TAGS.stats, TAGS.tracks, TAGS.teams);
  });
  if (res.ok) redirect("/command/projects?deleted=1");
  return res;
}

/* ─── BOM ─────────────────────────────────────────────────────────────────── */

const bomSchema = z.object({
  part: zf.text(160),
  quantity: zf.int(1, 100000, 1),
  unitPrice: zf.money,
  vendor: zf.opt(120),
  url: zf.url,
  status: z.enum(BOM),
  notes: zf.opt(500),
});

async function assertBom(actor: Actor | null, projectId: string) {
  if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in.");
  if (can(actor.role, "bom.manage")) return;
  await assertEdit(actor, projectId);
}

export async function saveBomItem(projectId: string, raw: Record<string, string>, itemId?: string): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    await assertBom(actor, projectId);
    const v = bomSchema.parse(raw);
    if (itemId) {
      if (!isUuid(itemId)) throw new AppError("BAD_REQUEST", "Invalid item.");
      await db.update(s.bomItems).set(v).where(and(eq(s.bomItems.id, itemId), eq(s.bomItems.projectId, projectId)));
    } else {
      await db.insert(s.bomItems).values({ ...v, projectId });
      await audit(actor, { action: "bom.item_added", targetType: "project", targetId: projectId, summary: v.part }, req);
    }
    publish(TAGS.projects);
  });
}

export async function setBomStatus(projectId: string, itemId: string, status: (typeof BOM)[number]): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    await assertBom(actor, projectId);
    if (!BOM.includes(status) || !isUuid(itemId)) throw new AppError("BAD_REQUEST", "Invalid request.");
    await db.update(s.bomItems).set({ status }).where(and(eq(s.bomItems.id, itemId), eq(s.bomItems.projectId, projectId)));
  });
}

export async function deleteBomItem(projectId: string, itemId: string): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    await assertBom(actor, projectId);
    if (!isUuid(itemId)) throw new AppError("BAD_REQUEST", "Invalid item.");
    const [it] = await db.delete(s.bomItems).where(and(eq(s.bomItems.id, itemId), eq(s.bomItems.projectId, projectId))).returning({ part: s.bomItems.part });
    if (it) await audit(actor, { action: "bom.item_removed", targetType: "project", targetId: projectId, summary: it.part }, req);
    publish(TAGS.projects);
  });
}

/* ─── Team & milestones ───────────────────────────────────────────────────── */

export async function addProjectMember(projectId: string, memberId: string, role: string): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    await assertEdit(actor, projectId);
    if (!isUuid(memberId)) throw new AppError("BAD_REQUEST", "Pick a member.");
    const r = z.string().trim().min(1).max(60).catch("Engineer").parse(role);
    await db.insert(s.projectMembers).values({ projectId, memberId, role: r }).onConflictDoUpdate({ target: [s.projectMembers.projectId, s.projectMembers.memberId], set: { role: r } });
    publish(TAGS.projects, TAGS.members);
  });
}

export async function removeProjectMember(projectId: string, memberId: string): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    await assertEdit(actor, projectId);
    await db.delete(s.projectMembers).where(and(eq(s.projectMembers.projectId, projectId), eq(s.projectMembers.memberId, memberId)));
    publish(TAGS.projects, TAGS.members);
  });
}

export async function addMilestone(projectId: string, title: string, dueDate: string): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    await assertEdit(actor, projectId);
    const t = zf.text(160).parse(title);
    const d = zf.date.parse(dueDate);
    await db.insert(s.projectMilestones).values({ projectId, title: t, dueDate: d, position: Date.now() % 1_000_000_000 });
    publish(TAGS.projects);
  });
}

export async function toggleMilestone(projectId: string, id: string, done: boolean): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    await assertEdit(actor, projectId);
    await db.update(s.projectMilestones).set({ completedAt: done ? new Date() : null }).where(and(eq(s.projectMilestones.id, id), eq(s.projectMilestones.projectId, projectId)));
    publish(TAGS.projects);
  });
}

export async function deleteMilestone(projectId: string, id: string): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    await assertEdit(actor, projectId);
    await db.delete(s.projectMilestones).where(and(eq(s.projectMilestones.id, id), eq(s.projectMilestones.projectId, projectId)));
    publish(TAGS.projects);
  });
}
