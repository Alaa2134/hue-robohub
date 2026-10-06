"use server";

import { and, eq, min } from "drizzle-orm";
import { z } from "zod";
import { can } from "@/lib/permissions";
import { runAction, type ActionResult } from "../action";
import { AppError, forbidden } from "../auth/errors";
import { assertCan, type Actor } from "../auth/guard";
import { db, schema as s } from "../db";
import { isUuid, zf } from "../forms";
import { notifyUsers } from "../notifications";

const STATUS = ["backlog", "todo", "in_progress", "review", "done"] as const;
const PRIORITY = ["low", "medium", "high", "critical"] as const;

/** Leads manage every task; others manage tasks assigned to them or that they created. */
async function assertTask(actor: Actor | null, taskId: string) {
  assertCan(actor, "tasks.view");
  if (!isUuid(taskId)) throw new AppError("BAD_REQUEST", "Invalid task.");
  const [t] = await db.select({ assigneeId: s.tasks.assigneeId, createdBy: s.tasks.createdBy, title: s.tasks.title, status: s.tasks.status }).from(s.tasks).where(eq(s.tasks.id, taskId)).limit(1);
  if (!t) throw new AppError("NOT_FOUND", "Task not found.");
  if (can(actor.role, "tasks.manage")) return t;
  if (can(actor.role, "tasks.manage_own") && ((actor.memberId && t.assigneeId === actor.memberId) || t.createdBy === actor.userId)) return t;
  throw forbidden("You can only change tasks assigned to you or created by you.");
}

async function log(taskId: string, actorId: string, action: string, detail?: string) {
  await db.insert(s.taskActivity).values({ taskId, actorId, action, detail: detail ?? null });
}

async function notifyAssignee(assigneeId: string | null, actor: Actor, title: string, taskId: string) {
  if (!assigneeId || assigneeId === actor.memberId) return;
  const [u] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.memberId, assigneeId)).limit(1);
  if (u) await notifyUsers([u.id], { kind: "task", title: "Task assigned to you", body: title, href: `/command/tasks?task=${taskId}` });
}

export async function createTask(input: { title: string; status: string; assigneeId?: string | null; projectId?: string | null; teamId?: string | null }): Promise<ActionResult<{ id: string }>> {
  return runAction(async ({ actor }) => {
    assertCan(actor, "tasks.view");
    if (!can(actor.role, "tasks.manage") && !can(actor.role, "tasks.manage_own")) throw forbidden();
    const title = zf.text(200).parse(input.title);
    const status = z.enum(STATUS).parse(input.status);
    // Non-leads can only create tasks for themselves.
    const assigneeId = can(actor.role, "tasks.manage") ? (isUuid(input.assigneeId) ? input.assigneeId : null) : actor.memberId;
    const [top] = await db.select({ p: min(s.tasks.position) }).from(s.tasks).where(eq(s.tasks.status, status));
    const [t] = await db
      .insert(s.tasks)
      .values({ title, status, assigneeId, projectId: isUuid(input.projectId) ? input.projectId : null, teamId: isUuid(input.teamId) ? input.teamId : null, position: (top?.p ?? 1000) - 1, createdBy: actor.userId, completedAt: status === "done" ? new Date() : null })
      .returning({ id: s.tasks.id });
    await log(t!.id, actor.userId, "created");
    await notifyAssignee(assigneeId, actor, title, t!.id);
    return { id: t!.id };
  });
}

const patchSchema = z
  .object({
    title: zf.text(200),
    description: z.string().max(10000),
    priority: z.enum(PRIORITY),
    assigneeId: z.string().nullable(),
    projectId: z.string().nullable(),
    teamId: z.string().nullable(),
    dueDate: z.string().nullable(),
    tags: z.array(z.string().trim().max(30)).max(10),
  })
  .partial();

export async function updateTask(id: string, patch: z.input<typeof patchSchema>): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    const t = await assertTask(actor, id);
    const p = patchSchema.parse(patch);
    const values: Partial<typeof s.tasks.$inferInsert> = {};
    if (p.title !== undefined) values.title = p.title;
    if (p.description !== undefined) values.description = p.description;
    if (p.priority !== undefined) values.priority = p.priority;
    if (p.dueDate !== undefined) values.dueDate = p.dueDate && /^\d{4}-\d{2}-\d{2}$/.test(p.dueDate) ? p.dueDate : null;
    if (p.projectId !== undefined) values.projectId = isUuid(p.projectId) ? p.projectId : null;
    if (p.teamId !== undefined) values.teamId = isUuid(p.teamId) ? p.teamId : null;
    if (p.tags !== undefined) values.tags = p.tags.filter(Boolean);
    if (p.assigneeId !== undefined) {
      if (!can(actor!.role, "tasks.manage")) throw forbidden("Only leads can reassign tasks.");
      values.assigneeId = isUuid(p.assigneeId) ? p.assigneeId : null;
    }
    await db.update(s.tasks).set(values).where(eq(s.tasks.id, id));
    if (values.assigneeId) await notifyAssignee(values.assigneeId, actor!, values.title ?? t.title, id);
    await log(id, actor!.userId, "updated", Object.keys(values).join(", "));
  });
}

export async function moveTask(id: string, status: string, position: number): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    const t = await assertTask(actor, id);
    const st = z.enum(STATUS).parse(status);
    if (!Number.isFinite(position)) throw new AppError("BAD_REQUEST", "Invalid position.");
    await db
      .update(s.tasks)
      .set({ status: st, position, ...(st !== t.status ? { completedAt: st === "done" ? new Date() : null } : {}) })
      .where(eq(s.tasks.id, id));
    if (st !== t.status) await log(id, actor!.userId, "moved", `${t.status} → ${st}`);
  });
}

export async function deleteTask(id: string): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    await assertTask(actor, id);
    await db.delete(s.tasks).where(eq(s.tasks.id, id));
  });
}

export async function addChecklistItem(taskId: string, label: string): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    await assertTask(actor, taskId);
    await db.insert(s.taskChecklistItems).values({ taskId, label: zf.text(200).parse(label), position: Date.now() % 1_000_000_000 });
  });
}

export async function toggleChecklistItem(taskId: string, itemId: string, done: boolean): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    await assertTask(actor, taskId);
    await db.update(s.taskChecklistItems).set({ done }).where(and(eq(s.taskChecklistItems.id, itemId), eq(s.taskChecklistItems.taskId, taskId)));
  });
}

export async function deleteChecklistItem(taskId: string, itemId: string): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    await assertTask(actor, taskId);
    await db.delete(s.taskChecklistItems).where(and(eq(s.taskChecklistItems.id, itemId), eq(s.taskChecklistItems.taskId, taskId)));
  });
}

/** Anyone who can see the board may comment. */
export async function addTaskComment(taskId: string, body: string): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    assertCan(actor, "tasks.view");
    if (!isUuid(taskId)) throw new AppError("BAD_REQUEST", "Invalid task.");
    const text = zf.text(4000).parse(body);
    await db.insert(s.taskComments).values({ taskId, authorId: actor.userId, body: text });
  });
}

/** Task details for the drawer (checklist, comments, activity). */
export async function getTaskDetail(taskId: string) {
  const res = await runAction(async ({ actor }) => {
    assertCan(actor, "tasks.view");
    if (!isUuid(taskId)) throw new AppError("BAD_REQUEST", "Invalid task.");
    const [checklist, comments, activity] = await Promise.all([
      db.select().from(s.taskChecklistItems).where(eq(s.taskChecklistItems.taskId, taskId)).orderBy(s.taskChecklistItems.position),
      db.select({ id: s.taskComments.id, body: s.taskComments.body, createdAt: s.taskComments.createdAt, author: s.users.name }).from(s.taskComments).leftJoin(s.users, eq(s.users.id, s.taskComments.authorId)).where(eq(s.taskComments.taskId, taskId)).orderBy(s.taskComments.createdAt),
      db.select({ action: s.taskActivity.action, detail: s.taskActivity.detail, createdAt: s.taskActivity.createdAt, actor: s.users.name }).from(s.taskActivity).leftJoin(s.users, eq(s.users.id, s.taskActivity.actorId)).where(eq(s.taskActivity.taskId, taskId)).orderBy(s.taskActivity.createdAt).limit(30),
    ]);
    return {
      checklist: checklist.map((c) => ({ id: c.id, label: c.label, done: c.done })),
      comments: comments.map((c) => ({ id: c.id, body: c.body, author: c.author ?? "Former user", at: c.createdAt.toISOString() })),
      activity: activity.map((a) => ({ text: `${a.actor ?? "Someone"} ${a.action}${a.detail ? ` (${a.detail})` : ""}`, at: a.createdAt.toISOString() })),
    };
  });
  return res;
}
