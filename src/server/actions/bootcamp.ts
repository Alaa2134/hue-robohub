"use server";

import { and, eq, max } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TAGS } from "@/lib/cache-tags";
import { publish, runAction, type ActionResult } from "../action";
import { audit } from "../audit";
import { AppError } from "../auth/errors";
import { assertCan } from "../auth/guard";
import { db, schema as s } from "../db";
import { formFields, isUuid, zf } from "../forms";

const moduleSchema = z.object({
  week: zf.int(1, 52, 1),
  title: zf.text(140),
  summary: zf.body(1000),
  outcomes: z
    .string()
    .max(4000)
    .optional()
    .default("")
    .transform((v) =>
      v
        .split(/\r?\n/)
        .map((x) => x.replace(/^[-•*]\s*/, "").trim())
        .filter(Boolean)
        .slice(0, 12),
    ),
  published: zf.bool,
});

export async function saveModule(_prev: unknown, form: FormData): Promise<ActionResult<{ id: string }>> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "bootcamp.manage");
    const id = form.get("id");
    const v = moduleSchema.parse(formFields(form));
    const [clash] = await db.select({ id: s.bootcampModules.id }).from(s.bootcampModules).where(eq(s.bootcampModules.week, v.week)).limit(1);
    if (clash && clash.id !== id) throw new AppError("CONFLICT", `Week ${v.week} already exists.`, { week: "Week already used" });
    if (isUuid(id)) {
      await db.update(s.bootcampModules).set(v).where(eq(s.bootcampModules.id, id));
      await audit(actor, { action: "bootcamp.module_updated", targetType: "bootcamp_module", targetId: id, summary: `Week ${v.week}: ${v.title}` }, req);
      publish(TAGS.bootcamp);
      return { id, created: false };
    }
    const [m] = await db.insert(s.bootcampModules).values(v).returning({ id: s.bootcampModules.id });
    await audit(actor, { action: "bootcamp.module_created", targetType: "bootcamp_module", targetId: m!.id, summary: `Week ${v.week}: ${v.title}` }, req);
    publish(TAGS.bootcamp);
    return { id: m!.id, created: true };
  });
  if (res.ok && res.data.created) redirect(`/command/bootcamp/${res.data.id}`);
  return res.ok ? { ok: true, data: { id: res.data.id } } : res;
}

export async function deleteModule(id: string): Promise<ActionResult> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "bootcamp.manage");
    const [m] = await db.delete(s.bootcampModules).where(eq(s.bootcampModules.id, id)).returning({ title: s.bootcampModules.title });
    if (!m) throw new AppError("NOT_FOUND", "Week not found.");
    await audit(actor, { action: "bootcamp.module_deleted", targetType: "bootcamp_module", targetId: id, summary: m.title }, req);
    publish(TAGS.bootcamp);
  });
  if (res.ok) redirect("/command/bootcamp");
  return res;
}

const lessonSchema = z.object({ title: zf.text(160), durationMinutes: zf.optInt(1, 600), materialUrl: zf.url });

export async function addLesson(moduleId: string, raw: Record<string, string>): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    assertCan(actor, "bootcamp.manage");
    if (!isUuid(moduleId)) throw new AppError("BAD_REQUEST", "Invalid week.");
    const v = lessonSchema.parse(raw);
    const [last] = await db.select({ p: max(s.bootcampLessons.position) }).from(s.bootcampLessons).where(eq(s.bootcampLessons.moduleId, moduleId));
    await db.insert(s.bootcampLessons).values({ ...v, moduleId, position: (last?.p ?? 0) + 1 });
    publish(TAGS.bootcamp);
  });
}

export async function deleteLesson(moduleId: string, lessonId: string): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    assertCan(actor, "bootcamp.manage");
    await db.delete(s.bootcampLessons).where(and(eq(s.bootcampLessons.id, lessonId), eq(s.bootcampLessons.moduleId, moduleId)));
    publish(TAGS.bootcamp);
  });
}

const PROGRESS = ["not_started", "in_progress", "submitted", "passed", "failed"] as const;

export async function setProgress(memberId: string, moduleId: string, status: (typeof PROGRESS)[number]): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    assertCan(actor, "bootcamp.manage");
    if (!isUuid(memberId) || !isUuid(moduleId) || !PROGRESS.includes(status)) throw new AppError("BAD_REQUEST", "Invalid request.");
    await db
      .insert(s.bootcampProgress)
      .values({ memberId, moduleId, status })
      .onConflictDoUpdate({ target: [s.bootcampProgress.memberId, s.bootcampProgress.moduleId], set: { status, updatedAt: new Date() } });
  });
}
