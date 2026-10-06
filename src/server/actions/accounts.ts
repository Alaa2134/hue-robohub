"use server";

import { and, count, eq } from "drizzle-orm";
import { z } from "zod";
import { canAssignRole, ROLES, type Role } from "@/lib/permissions";
import { runAction, type ActionResult } from "../action";
import { audit } from "../audit";
import { AppError, forbidden } from "../auth/errors";
import { assertCan, type Actor } from "../auth/guard";
import { revokeUserSessions } from "../auth/session";
import { db, schema as s } from "../db";
import { randomToken } from "../security/crypto";
import { hashPassword } from "../security/password";
import { issuePasswordReset } from "../services/auth";

const INVITE_TTL_MS = 7 * 86400_000;
const id = z.string().regex(/^[0-9a-f-]{36}$/i);

async function target(userId: string) {
  const [u] = await db.select({ id: s.users.id, role: s.users.role, email: s.users.email, name: s.users.name, status: s.users.status }).from(s.users).where(eq(s.users.id, userId)).limit(1);
  if (!u) throw new AppError("NOT_FOUND", "Account not found.");
  return u;
}

/** Only owners touch owners/admins; nobody edits themselves here (use Settings); the last active owner is protected. */
async function guardTarget(actor: Actor, u: { id: string; role: Role }) {
  if (u.id === actor.userId) throw new AppError("FORBIDDEN", "Manage your own account from Settings.");
  if ((u.role === "owner" || u.role === "admin") && actor.role !== "owner") throw forbidden("Only the owner can change owner or admin accounts.");
}

async function activeOwners() {
  const [r] = await db.select({ n: count() }).from(s.users).where(and(eq(s.users.role, "owner"), eq(s.users.status, "active")));
  return r?.n ?? 0;
}

const linkFor = async (userId: string, invite: boolean) => `${await issuePasswordReset(userId, INVITE_TTL_MS)}${invite ? "&invite=1" : ""}`;

const createSchema = z.object({
  name: z.string().trim().min(2, "Enter a name").max(120),
  email: z.string().trim().toLowerCase().email("Enter a valid email").max(254),
  role: z.enum(ROLES),
  memberId: z
    .string()
    .optional()
    .transform((v) => (v && /^[0-9a-f-]{36}$/i.test(v) ? v : null)),
});

/** Create an account and return a one-time "set your password" link (valid 7 days) to share by WhatsApp or email. */
export async function createAccount(_prev: unknown, form: FormData): Promise<ActionResult<{ link: string; name: string; email: string }>> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "accounts.manage");
    const input = createSchema.parse(Object.fromEntries(form));
    if (!canAssignRole(actor.role, null, input.role)) throw forbidden("You can't create an account with that role.");
    const [dupe] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.email, input.email)).limit(1);
    if (dupe) throw new AppError("CONFLICT", "An account with this email already exists.", { email: "Already has an account" });
    if (input.memberId) {
      const [linked] = await db.select({ id: s.users.id }).from(s.users).where(eq(s.users.memberId, input.memberId)).limit(1);
      if (linked) throw new AppError("CONFLICT", "That member already has an account.", { memberId: "Already linked" });
    }
    // Unusable random password until the person sets their own through the link.
    const [u] = await db
      .insert(s.users)
      .values({ name: input.name, email: input.email, role: input.role, memberId: input.memberId, passwordHash: await hashPassword(randomToken(32)) })
      .returning({ id: s.users.id });
    await audit(actor, { action: "account.created", targetType: "user", targetId: u!.id, summary: input.email, meta: { role: input.role } }, req);
    return { link: await linkFor(u!.id, true), name: input.name, email: input.email };
  });
}

export async function setAccountRole(userId: string, role: Role): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "accounts.manage");
    id.parse(userId);
    if (!ROLES.includes(role)) throw new AppError("BAD_REQUEST", "Unknown role.");
    const u = await target(userId);
    await guardTarget(actor, u);
    if (!canAssignRole(actor.role, u.role, role)) throw forbidden("You can't assign that role.");
    if (u.role === "owner" && role !== "owner" && (await activeOwners()) <= 1) throw new AppError("CONFLICT", "Keep at least one owner.");
    await db.update(s.users).set({ role }).where(eq(s.users.id, userId));
    await revokeUserSessions(userId); // new permissions apply from the next sign-in
    await audit(actor, { action: "account.role_changed", targetType: "user", targetId: userId, summary: u.email, meta: { from: u.role, to: role } }, req);
  });
}

export async function setAccountStatus(userId: string, status: "active" | "disabled"): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "accounts.manage");
    id.parse(userId);
    const u = await target(userId);
    await guardTarget(actor, u);
    if (status === "disabled" && u.role === "owner" && (await activeOwners()) <= 1) throw new AppError("CONFLICT", "Keep at least one active owner.");
    await db.update(s.users).set({ status, ...(status === "active" ? { failedLoginCount: 0, lockedUntil: null } : {}) }).where(eq(s.users.id, userId));
    if (status === "disabled") await revokeUserSessions(userId);
    await audit(actor, { action: status === "disabled" ? "account.disabled" : "account.enabled", targetType: "user", targetId: userId, summary: u.email }, req);
  });
}

/** New one-time sign-in link (forgotten password / lost invite). Signs the person out everywhere. */
export async function issueSignInLink(userId: string): Promise<ActionResult<{ link: string }>> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "accounts.manage");
    id.parse(userId);
    const u = await target(userId);
    await guardTarget(actor, u);
    if (u.status !== "active") throw new AppError("CONFLICT", "Enable the account first.");
    await revokeUserSessions(userId);
    await audit(actor, { action: "account.link_issued", targetType: "user", targetId: userId, summary: u.email }, req);
    return { link: await linkFor(userId, false) };
  });
}

/** Lost phone: remove two-factor so the person can sign in and enrol again. */
export async function resetAccountMfa(userId: string): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "accounts.manage");
    id.parse(userId);
    const u = await target(userId);
    await guardTarget(actor, u);
    await db.update(s.users).set({ totpEnabled: false, totpSecretEnc: null }).where(eq(s.users.id, userId));
    await revokeUserSessions(userId);
    await audit(actor, { action: "account.mfa_reset", targetType: "user", targetId: userId, summary: u.email }, req);
  });
}

export async function updateMyName(_prev: unknown, form: FormData): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    if (!actor) throw new AppError("UNAUTHENTICATED", "Please sign in.");
    const { name } = z.object({ name: z.string().trim().min(2, "Enter your name").max(120) }).parse({ name: form.get("name") });
    await db.update(s.users).set({ name }).where(eq(s.users.id, actor.userId));
    await audit(actor, { action: "account.renamed", targetType: "user", targetId: actor.userId }, req);
  });
}
