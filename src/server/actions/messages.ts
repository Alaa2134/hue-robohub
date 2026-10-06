"use server";

import { eq } from "drizzle-orm";
import { runAction, type ActionResult } from "../action";
import { audit } from "../audit";
import { AppError } from "../auth/errors";
import { assertCan } from "../auth/guard";
import { db, schema as s } from "../db";

const STATUSES = ["new", "read", "archived"] as const;

export async function setMessageStatus(id: string, status: (typeof STATUSES)[number]): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    assertCan(actor, "messages.view");
    if (!STATUSES.includes(status) || !/^[0-9a-f-]{36}$/i.test(id)) throw new AppError("BAD_REQUEST", "Invalid request.");
    await db.update(s.contactMessages).set({ status }).where(eq(s.contactMessages.id, id));
  });
}

export async function deleteMessage(id: string): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "messages.view");
    const [m] = await db.delete(s.contactMessages).where(eq(s.contactMessages.id, id)).returning({ topic: s.contactMessages.topic });
    if (!m) throw new AppError("NOT_FOUND", "Message not found.");
    await audit(actor, { action: "message.deleted", targetType: "contact_message", targetId: id, summary: m.topic }, req);
  });
}
