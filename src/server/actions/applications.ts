"use server";

import { eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TAGS } from "@/lib/cache-tags";
import { slugify } from "@/lib/format";
import { can } from "@/lib/permissions";
import { fromZonedInput } from "@/lib/zoned";
import { publish, runAction, type ActionResult } from "../action";
import { audit } from "../audit";
import { AppError, forbidden } from "../auth/errors";
import { assertCan } from "../auth/guard";
import { db, schema as s } from "../db";

const decisionSchema = z.object({
  id: z.string().regex(/^[0-9a-f-]{36}$/i),
  status: z.enum(["pending", "interview", "accepted", "waitlist", "rejected", "trainee", "converted"]),
  interviewAt: z.string().optional().default(""),
  score: z
    .string()
    .optional()
    .transform((v) => (v === undefined || v === "" ? null : Number(v)))
    .refine((v) => v === null || (Number.isInteger(v) && v >= 0 && v <= 10), "Score is 0–10"),
  reviewerNotes: z.string().trim().max(4000).optional().transform((v) => v || null),
});

/** Record a recruitment decision: status, interview slot (Cairo time), score and private reviewer notes. */
export async function decideApplication(_prev: unknown, form: FormData): Promise<ActionResult<{ status: string }>> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "applications.decide");
    const input = decisionSchema.parse(Object.fromEntries(form));
    const interviewAt = input.interviewAt ? fromZonedInput(input.interviewAt) : null;
    if (input.interviewAt && !interviewAt) throw new AppError("VALIDATION", "Pick a valid interview date and time.", { interviewAt: "Pick a valid date and time" });
    if (input.status === "interview" && !interviewAt) throw new AppError("VALIDATION", "Set the interview date and time.", { interviewAt: "Required for interviews" });

    const [prev] = await db.select({ status: s.applications.status, name: s.applications.fullName, memberId: s.applications.memberId }).from(s.applications).where(eq(s.applications.id, input.id)).limit(1);
    if (!prev) throw new AppError("NOT_FOUND", "Application not found.");
    if (input.status === "converted" && !prev.memberId) throw new AppError("VALIDATION", "Use “Convert to member” to create the member record.");

    const changed = prev.status !== input.status;
    await db
      .update(s.applications)
      .set({ status: input.status, interviewAt, score: input.score, reviewerNotes: input.reviewerNotes, ...(changed ? { decidedBy: actor.userId, decidedAt: new Date() } : {}) })
      .where(eq(s.applications.id, input.id));
    await audit(actor, { action: changed ? "application.status_changed" : "application.updated", targetType: "application", targetId: input.id, summary: prev.name, meta: changed ? { from: prev.status, to: input.status } : undefined }, req);
    return { status: input.status };
  });
}

/**
 * Turn an applicant into a member record (private by default — an admin adds the photo and switches
 * PUBLIC PROFILE on when ready). Contact details move into the member's private fields.
 */
export async function convertApplication(id: string): Promise<ActionResult> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "applications.decide");
    if (!can(actor.role, "members.manage")) throw forbidden();
    const [a] = await db.select().from(s.applications).where(eq(s.applications.id, id)).limit(1);
    if (!a) throw new AppError("NOT_FOUND", "Application not found.");
    if (a.memberId) return a.memberId;

    const base = slugify(a.fullName);
    let slug = base;
    for (let i = 2; (await db.select({ id: s.members.id }).from(s.members).where(eq(s.members.slug, slug)).limit(1)).length; i++) slug = `${base}-${i}`;

    const memberId = await db.transaction(async (tx) => {
      const [m] = await tx
        .insert(s.members)
        .values({
          slug,
          fullName: a.fullName,
          rank: a.status === "trainee" ? "trainee" : "member",
          trackId: a.trackId,
          academicYear: a.academicYear,
          skills: a.skills,
          github: a.githubUrl,
          website: a.portfolioUrl,
          phone: a.phone,
          privateEmail: a.email,
          joinedAt: new Date().toISOString().slice(0, 10),
          publicProfile: false,
          adminNotes: a.reviewerNotes,
        })
        .returning({ id: s.members.id });
      await tx.update(s.applications).set({ status: "converted", memberId: m!.id, decidedBy: actor.userId, decidedAt: new Date() }).where(eq(s.applications.id, id));
      return m!.id;
    });
    await audit(actor, { action: "application.converted", targetType: "application", targetId: id, summary: a.fullName, meta: { memberId } }, req);
    publish(TAGS.members, TAGS.stats);
    return memberId;
  });
  if (res.ok) redirect(`/command/members/${res.data}?converted=1`);
  return { ok: false, error: res.error, code: res.code, requestId: res.requestId };
}

export async function deleteApplication(id: string): Promise<ActionResult> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "applications.decide");
    const [a] = await db.delete(s.applications).where(eq(s.applications.id, id)).returning({ name: s.applications.fullName });
    if (!a) throw new AppError("NOT_FOUND", "Application not found.");
    await audit(actor, { action: "application.deleted", targetType: "application", targetId: id, summary: a.name }, req);
  });
  if (res.ok) redirect("/command/applications?deleted=1");
  return res;
}
