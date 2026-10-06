import "server-only";
import { and, count, eq, gt, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { checkPassword } from "@/lib/password-policy";
import { db, schema } from "../db";
import { env } from "../env";
import { audit } from "../audit";
import { AppError } from "../auth/errors";
import { createSession, destroyCurrentSession, getSession, revokeUserSessions } from "../auth/session";
import type { Actor } from "../auth/guard";
import { decrypt, encrypt, randomToken, sha256 } from "../security/crypto";
import { hashPassword, verifyDummy, verifyPassword } from "../security/password";
import { limit, resetRateLimit } from "../security/rate-limit";
import { generateTotpSecret, otpauthUri, verifyTotp } from "../security/totp";
import { sendEmail } from "../email";
import type { RequestContext } from "../observability/request";

export const LOCK_THRESHOLD = 5;
const RESET_TTL_MS = 30 * 60 * 1000;

const emailSchema = z.string().trim().toLowerCase().email().max(254);

export async function isSetupComplete(): Promise<boolean> {
  const [row] = await db.select({ n: count() }).from(schema.users);
  return (row?.n ?? 0) > 0;
}

export const setupSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    email: emailSchema,
    password: z.string().min(1).max(256),
    confirm: z.string(),
  })
  .refine((v) => v.password === v.confirm, { path: ["confirm"], message: "Passwords do not match" });

/** First-run owner creation. Serialised with an advisory lock so two racing requests can't both succeed. */
export async function createOwner(input: z.infer<typeof setupSchema>, ctx: RequestContext) {
  const pw = checkPassword(input.password, [input.name, input.email]);
  if (!pw.ok) throw new AppError("VALIDATION", "Password does not meet requirements.", { password: pw.issues.join(". ") });
  const passwordHash = await hashPassword(input.password);
  const user = await db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(724001)`);
    const [existing] = await tx.select({ n: count() }).from(schema.users);
    if ((existing?.n ?? 0) > 0) throw new AppError("FORBIDDEN", "Setup has already been completed.");
    const [u] = await tx
      .insert(schema.users)
      .values({ name: input.name, email: input.email, passwordHash, role: "owner" })
      .returning();
    return u!;
  });
  await audit({ userId: null, label: `${user.name} <${user.email}>` }, { action: "auth.setup_owner", targetType: "user", targetId: user.id }, ctx);
  await createSession(user.id, { ip: ctx.ip, userAgent: ctx.userAgent });
  return user;
}

export type LoginResult = { status: "ok" } | { status: "mfa_required" };

const GENERIC = "Incorrect email or password.";

export async function login(rawEmail: string, password: string, ctx: RequestContext): Promise<LoginResult> {
  const email = emailSchema.safeParse(rawEmail);
  if (!email.success || !password) throw new AppError("VALIDATION", GENERIC);

  const ipKey = ctx.ip ?? "unknown";
  const [ipLimit, acctLimit] = await Promise.all([limit("loginIp", ipKey), limit("loginAccount", email.data)]);
  if (!ipLimit.ok || !acctLimit.ok) {
    await audit({ userId: null, label: email.data }, { action: "auth.login_rate_limited" }, ctx);
    throw new AppError("RATE_LIMITED", "Too many sign-in attempts. Please wait a few minutes and try again.");
  }

  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email.data)).limit(1);
  if (!user) {
    await verifyDummy(password);
    await audit({ userId: null, label: email.data }, { action: "auth.login_failed", summary: "unknown account" }, ctx);
    throw new AppError("VALIDATION", GENERIC);
  }
  if (user.lockedUntil && user.lockedUntil.getTime() > Date.now()) {
    await verifyDummy(password);
    await audit({ userId: null, label: email.data }, { action: "auth.login_blocked_locked", targetType: "user", targetId: user.id }, ctx);
    throw new AppError("LOCKED", "This account is temporarily locked after repeated failed sign-ins. Try again later or reset your password.");
  }

  const ok = await verifyPassword(user.passwordHash, password);
  if (!ok || user.status !== "active") {
    const failures = user.failedLoginCount + 1;
    // Exponential lockout: 15 min, 30, 60 … capped at 24h.
    const lockedUntil =
      failures >= LOCK_THRESHOLD
        ? new Date(Date.now() + Math.min(24 * 60, 15 * 2 ** (failures - LOCK_THRESHOLD)) * 60_000)
        : null;
    await db.update(schema.users).set({ failedLoginCount: failures, lockedUntil }).where(eq(schema.users.id, user.id));
    await audit(
      { userId: null, label: email.data },
      { action: "auth.login_failed", targetType: "user", targetId: user.id, meta: { failures, locked: !!lockedUntil, disabled: user.status !== "active" } },
      ctx,
    );
    throw new AppError("VALIDATION", GENERIC);
  }

  await db
    .update(schema.users)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(schema.users.id, user.id));
  await resetRateLimit("loginAccount", email.data);
  // Session fixation defence: always discard any existing session and mint a fresh one.
  await destroyCurrentSession();

  if (user.totpEnabled) {
    await createSession(user.id, { pendingMfa: true, ip: ctx.ip, userAgent: ctx.userAgent });
    return { status: "mfa_required" };
  }
  await createSession(user.id, { ip: ctx.ip, userAgent: ctx.userAgent });
  await audit({ userId: null, label: `${user.name} <${user.email}>` }, { action: "auth.login", targetType: "user", targetId: user.id }, ctx);
  return { status: "ok" };
}

export async function completeMfa(code: string, ctx: RequestContext) {
  const s = await getSession();
  if (!s || !s.pendingMfa) throw new AppError("UNAUTHENTICATED", "Your sign-in session expired. Start again.");
  const rl = await limit("loginAccount", `mfa:${s.userId}`);
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many attempts. Start again in a few minutes.");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, s.userId)).limit(1);
  if (!user?.totpSecretEnc || !verifyTotp(decrypt(user.totpSecretEnc), code.replace(/\s/g, ""))) {
    await audit({ userId: null, label: s.email }, { action: "auth.mfa_failed", targetType: "user", targetId: s.userId }, ctx);
    throw new AppError("VALIDATION", "That code is not valid.");
  }
  await destroyCurrentSession();
  await createSession(user.id, { ip: ctx.ip, userAgent: ctx.userAgent });
  await audit({ userId: null, label: `${user.name} <${user.email}>` }, { action: "auth.login", targetType: "user", targetId: user.id, meta: { mfa: true } }, ctx);
}

export async function logout(actor: Actor | null, ctx: RequestContext) {
  await destroyCurrentSession();
  if (actor) await audit(actor, { action: "auth.logout", targetType: "user", targetId: actor.userId }, ctx);
}

/** Issues a single-use reset token. Returns the URL so admins can hand it over when email isn't configured. */
/** One-time link that lets a user set a new password. Invites use a longer TTL than "forgot password". */
export async function issuePasswordReset(userId: string, ttlMs = RESET_TTL_MS): Promise<string> {
  const token = randomToken(32);
  await db
    .update(schema.passwordResetTokens)
    .set({ usedAt: new Date() })
    .where(and(eq(schema.passwordResetTokens.userId, userId), isNull(schema.passwordResetTokens.usedAt)));
  await db.insert(schema.passwordResetTokens).values({ id: sha256(token), userId, expiresAt: new Date(Date.now() + ttlMs) });
  return `${env().APP_URL}/reset-password?token=${token}`;
}

/** Always responds the same way whether or not the account exists (no user enumeration). */
export async function requestPasswordReset(rawEmail: string, ctx: RequestContext) {
  const email = emailSchema.safeParse(rawEmail);
  const rl = await limit("passwordReset", ctx.ip ?? "unknown");
  if (!rl.ok) throw new AppError("RATE_LIMITED", "Too many requests. Try again later.");
  if (!email.success) return;
  const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email.data)).limit(1);
  if (!user || user.status !== "active") return;
  const url = await issuePasswordReset(user.id);
  await sendEmail({
    to: user.email,
    subject: "Reset your BuildX HUE password",
    text: `Someone requested a password reset for your BuildX HUE Command Center account.\n\nReset it here (valid for 30 minutes):\n${url}\n\nIf this wasn't you, ignore this email.`,
  });
  await audit({ userId: null, label: user.email }, { action: "auth.password_reset_requested", targetType: "user", targetId: user.id }, ctx);
}

export async function resetPassword(token: string, password: string, ctx: RequestContext) {
  if (!token || token.length > 128) throw new AppError("VALIDATION", "This reset link is invalid or has expired.");
  const [row] = await db
    .select()
    .from(schema.passwordResetTokens)
    .where(
      and(
        eq(schema.passwordResetTokens.id, sha256(token)),
        isNull(schema.passwordResetTokens.usedAt),
        gt(schema.passwordResetTokens.expiresAt, new Date()),
      ),
    )
    .limit(1);
  if (!row) throw new AppError("VALIDATION", "This reset link is invalid or has expired.");
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, row.userId)).limit(1);
  if (!user) throw new AppError("VALIDATION", "This reset link is invalid or has expired.");
  const pw = checkPassword(password, [user.name, user.email]);
  if (!pw.ok) throw new AppError("VALIDATION", "Password does not meet requirements.", { password: pw.issues.join(". ") });
  await db.transaction(async (tx) => {
    await tx.update(schema.passwordResetTokens).set({ usedAt: new Date() }).where(eq(schema.passwordResetTokens.id, row.id));
    await tx
      .update(schema.users)
      .set({ passwordHash: await hashPassword(password), passwordChangedAt: new Date(), failedLoginCount: 0, lockedUntil: null })
      .where(eq(schema.users.id, user.id));
  });
  await revokeUserSessions(user.id);
  await audit({ userId: null, label: user.email }, { action: "auth.password_reset", targetType: "user", targetId: user.id }, ctx);
}

export async function changePassword(actor: Actor, current: string, next: string, ctx: RequestContext) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, actor.userId)).limit(1);
  if (!user || !(await verifyPassword(user.passwordHash, current))) {
    throw new AppError("VALIDATION", "Current password is incorrect.", { current: "Incorrect password" });
  }
  const pw = checkPassword(next, [user.name, user.email]);
  if (!pw.ok) throw new AppError("VALIDATION", "Password does not meet requirements.", { next: pw.issues.join(". ") });
  await db
    .update(schema.users)
    .set({ passwordHash: await hashPassword(next), passwordChangedAt: new Date() })
    .where(eq(schema.users.id, actor.userId));
  // Rotate: every other device is signed out.
  await revokeUserSessions(actor.userId, actor.sessionId);
  await audit(actor, { action: "auth.password_changed", targetType: "user", targetId: actor.userId }, ctx);
}

export async function beginTotpEnrollment(actor: Actor) {
  const secret = generateTotpSecret();
  await db.update(schema.users).set({ totpSecretEnc: encrypt(secret), totpEnabled: false }).where(eq(schema.users.id, actor.userId));
  return { secret, uri: otpauthUri(secret, actor.email) };
}

export async function confirmTotpEnrollment(actor: Actor, code: string, ctx: RequestContext) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, actor.userId)).limit(1);
  if (!user?.totpSecretEnc || !verifyTotp(decrypt(user.totpSecretEnc), code.replace(/\s/g, ""))) {
    throw new AppError("VALIDATION", "That code is not valid.", { code: "Invalid code" });
  }
  await db.update(schema.users).set({ totpEnabled: true }).where(eq(schema.users.id, actor.userId));
  await revokeUserSessions(actor.userId, actor.sessionId);
  await audit(actor, { action: "auth.mfa_enabled", targetType: "user", targetId: actor.userId }, ctx);
}

export async function disableTotp(actor: Actor, password: string, ctx: RequestContext) {
  const [user] = await db.select().from(schema.users).where(eq(schema.users.id, actor.userId)).limit(1);
  if (!user || !(await verifyPassword(user.passwordHash, password))) throw new AppError("VALIDATION", "Password is incorrect.");
  await db.update(schema.users).set({ totpEnabled: false, totpSecretEnc: null }).where(eq(schema.users.id, actor.userId));
  await audit(actor, { action: "auth.mfa_disabled", targetType: "user", targetId: actor.userId }, ctx);
}
