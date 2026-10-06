import "server-only";
import { inArray } from "drizzle-orm";
import { db, schema } from "./db";
import type { Role } from "@/lib/permissions";

/**
 * Notification fan-out. In-app notifications are written directly; external channels (email, Discord,
 * WhatsApp, Telegram, push) are delivered by the worker so request latency never depends on them.
 */
export async function notifyRoles(roles: Role[], n: { kind: string; title: string; body?: string; href?: string }) {
  const recipients = await db
    .select({ id: schema.users.id })
    .from(schema.users)
    .where(inArray(schema.users.role, roles));
  if (!recipients.length) return;
  await db.insert(schema.notifications).values(
    recipients.map((r) => ({ userId: r.id, kind: n.kind, title: n.title, body: n.body ?? "", href: n.href ?? null })),
  );
}

export async function notifyUsers(userIds: string[], n: { kind: string; title: string; body?: string; href?: string }) {
  if (!userIds.length) return;
  await db
    .insert(schema.notifications)
    .values(userIds.map((userId) => ({ userId, kind: n.kind, title: n.title, body: n.body ?? "", href: n.href ?? null })));
}
