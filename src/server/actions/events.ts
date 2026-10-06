"use server";

import { and, eq } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TAGS } from "@/lib/cache-tags";
import { publish, runAction, type ActionResult } from "../action";
import { audit } from "../audit";
import { AppError } from "../auth/errors";
import { assertAny, assertCan } from "../auth/guard";
import { db, schema as s } from "../db";
import { applyImageField, formFields, freeSlug, isUuid, zf } from "../forms";
import { randomToken, safeEqual } from "../security/crypto";

const TYPES = ["meeting", "workshop", "training", "competition", "deadline", "presentation", "maintenance", "bootcamp"] as const;

const eventSchema = z
  .object({
    title: zf.text(140),
    type: z.enum(TYPES),
    startsAt: zf.dateTime(true),
    endsAt: zf.dateTime(),
    allDay: zf.bool,
    location: zf.opt(200),
    description: zf.body(6000),
    public: zf.bool,
    registrationUrl: zf.url,
    ctaLabel: zf.opt(40),
    teamId: zf.uuid,
  })
  .refine((v) => !v.endsAt || !v.startsAt || v.endsAt >= v.startsAt, { message: "Ends before it starts", path: ["endsAt"] });

export async function saveEvent(_prev: unknown, form: FormData): Promise<ActionResult<{ id: string }>> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "events.manage");
    const id = form.get("id");
    const input = eventSchema.parse(formFields(form));
    const values = { ...input, startsAt: input.startsAt! };
    if (isUuid(id)) {
      const [cur] = await db.select({ coverId: s.events.coverId }).from(s.events).where(eq(s.events.id, id)).limit(1);
      if (!cur) throw new AppError("NOT_FOUND", "Event not found.");
      const coverId = await applyImageField(form, "cover", { current: cur.coverId, folder: "events", alt: input.title, uploadedBy: actor.userId });
      await db
        .update(s.events)
        .set({ ...values, ...(coverId !== undefined ? { coverId } : {}) })
        .where(eq(s.events.id, id));
      await audit(actor, { action: "event.updated", targetType: "event", targetId: id, summary: input.title }, req);
      publish(TAGS.events);
      return { id, created: false };
    }
    const slug = await freeSlug(`${input.title}-${values.startsAt.toISOString().slice(0, 10)}`, async (x) => (await db.select({ id: s.events.id }).from(s.events).where(eq(s.events.slug, x)).limit(1)).length > 0);
    const coverId = await applyImageField(form, "cover", { folder: "events", alt: input.title, uploadedBy: actor.userId });
    const [e] = await db
      .insert(s.events)
      .values({ ...values, slug, coverId: coverId ?? null, createdBy: actor.userId })
      .returning({ id: s.events.id });
    await audit(actor, { action: "event.created", targetType: "event", targetId: e!.id, summary: input.title }, req);
    publish(TAGS.events);
    return { id: e!.id, created: true };
  });
  if (res.ok && res.data.created) redirect(`/command/calendar/${res.data.id}?new=1`);
  return res.ok ? { ok: true, data: { id: res.data.id } } : res;
}

export async function deleteEvent(id: string): Promise<ActionResult> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "events.manage");
    const [e] = await db.delete(s.events).where(eq(s.events.id, id)).returning({ title: s.events.title });
    if (!e) throw new AppError("NOT_FOUND", "Event not found.");
    await audit(actor, { action: "event.deleted", targetType: "event", targetId: id, summary: e.title }, req);
    publish(TAGS.events);
  });
  if (res.ok) redirect("/command/calendar?deleted=1");
  return res;
}

/** Open/close QR check-in. Opening creates a fresh secret if none exists. */
export async function setAttendanceOpen(eventId: string, open: boolean): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "attendance.manage");
    if (!isUuid(eventId)) throw new AppError("BAD_REQUEST", "Invalid event.");
    const [e] = await db.select({ code: s.events.attendanceCode, title: s.events.title }).from(s.events).where(eq(s.events.id, eventId)).limit(1);
    if (!e) throw new AppError("NOT_FOUND", "Event not found.");
    await db
      .update(s.events)
      .set({ attendanceOpen: open, ...(open && !e.code ? { attendanceCode: randomToken(12) } : {}) })
      .where(eq(s.events.id, eventId));
    await audit(actor, { action: open ? "attendance.opened" : "attendance.closed", targetType: "event", targetId: eventId, summary: e.title }, req);
  });
}

/** Invalidate printed/shared QR codes. */
export async function rotateAttendanceCode(eventId: string): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    assertCan(actor, "attendance.manage");
    if (!isUuid(eventId)) throw new AppError("BAD_REQUEST", "Invalid event.");
    await db.update(s.events).set({ attendanceCode: randomToken(12) }).where(eq(s.events.id, eventId));
  });
}

export async function markAttendance(eventId: string, memberId: string, status: "present" | "late" | "absent" | "excused" | null): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    assertCan(actor, "attendance.manage");
    if (!isUuid(eventId) || !isUuid(memberId)) throw new AppError("BAD_REQUEST", "Invalid request.");
    if (status === null) {
      await db.delete(s.attendance).where(and(eq(s.attendance.eventId, eventId), eq(s.attendance.memberId, memberId)));
      return;
    }
    if (!["present", "late", "absent", "excused"].includes(status)) throw new AppError("BAD_REQUEST", "Invalid status.");
    await db
      .insert(s.attendance)
      .values({ eventId, memberId, status, method: "manual", recordedBy: actor.userId })
      .onConflictDoUpdate({ target: [s.attendance.eventId, s.attendance.memberId], set: { status, method: "manual", recordedBy: actor.userId, recordedAt: new Date() } });
  });
}

/** QR check-in by the signed-in member. Late after 15 minutes past the start. */
export async function checkIn(eventId: string, code: string): Promise<ActionResult<{ status: "present" | "late"; title: string; already: boolean }>> {
  return runAction(async ({ actor, req }) => {
    assertAny(actor, ["attendance.self", "attendance.manage"]);
    if (!actor.memberId) throw new AppError("FORBIDDEN", "Your account isn't linked to a member profile yet. Ask an admin to link it in Accounts.");
    if (!isUuid(eventId)) throw new AppError("BAD_REQUEST", "This QR code is not valid.");
    const [e] = await db.select().from(s.events).where(eq(s.events.id, eventId)).limit(1);
    if (!e || !e.attendanceCode || !safeEqual(e.attendanceCode, code)) throw new AppError("BAD_REQUEST", "This QR code is not valid or has been replaced.");
    if (!e.attendanceOpen) throw new AppError("CONFLICT", "Check-in for this session is closed.");
    const status = Date.now() > e.startsAt.getTime() + 15 * 60_000 ? "late" : "present";
    const [row] = await db
      .insert(s.attendance)
      .values({ eventId, memberId: actor.memberId, status, method: "qr", recordedBy: actor.userId })
      .onConflictDoNothing()
      .returning({ status: s.attendance.status });
    if (!row) {
      const [prev] = await db.select({ status: s.attendance.status }).from(s.attendance).where(and(eq(s.attendance.eventId, eventId), eq(s.attendance.memberId, actor.memberId))).limit(1);
      return { status: prev?.status === "late" ? "late" : "present", title: e.title, already: true };
    }
    await audit(actor, { action: "attendance.checked_in", targetType: "event", targetId: eventId, summary: e.title, meta: { status } }, req);
    return { status, title: e.title, already: false };
  });
}
