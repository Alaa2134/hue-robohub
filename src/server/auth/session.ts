import "server-only";
import { and, eq, lt, ne, or } from "drizzle-orm";
import { cookies } from "next/headers";
import { cache } from "react";
import { db, schema } from "../db";
import { env } from "../env";
import { randomToken, sha256 } from "../security/crypto";
import type { Role } from "@/lib/permissions";

const IDLE_MS = 12 * 60 * 60 * 1000; // 12h of inactivity
const ABSOLUTE_MS = 7 * 24 * 60 * 60 * 1000; // re-authenticate weekly
const PENDING_MFA_MS = 10 * 60 * 1000;
const TOUCH_INTERVAL_MS = 5 * 60 * 1000;

export function sessionCookieName() {
  // __Host- prefix forces Secure, Path=/ and no Domain — the cookie can't be set by subdomains.
  return env().APP_URL.startsWith("https://") ? "__Host-rh_session" : "rh_session";
}

export type SessionUser = {
  sessionId: string;
  pendingMfa: boolean;
  userId: string;
  email: string;
  name: string;
  role: Role;
  memberId: string | null;
  totpEnabled: boolean;
};

export async function createSession(
  userId: string,
  opts: { pendingMfa?: boolean; ip?: string | null; userAgent?: string | null } = {},
) {
  const token = randomToken(32);
  const now = Date.now();
  const absolute = new Date(now + (opts.pendingMfa ? PENDING_MFA_MS : ABSOLUTE_MS));
  await db.insert(schema.sessions).values({
    id: sha256(token),
    userId,
    pendingMfa: !!opts.pendingMfa,
    idleExpiresAt: new Date(now + (opts.pendingMfa ? PENDING_MFA_MS : IDLE_MS)),
    absoluteExpiresAt: absolute,
    ip: opts.ip ?? null,
    userAgent: opts.userAgent ?? null,
  });
  const jar = await cookies();
  jar.set(sessionCookieName(), token, {
    httpOnly: true,
    secure: env().APP_URL.startsWith("https://"),
    sameSite: "lax",
    path: "/",
    expires: absolute,
  });
  return token;
}

async function lookup(token: string): Promise<SessionUser | null> {
  const id = sha256(token);
  const rows = await db
    .select({
      sessionId: schema.sessions.id,
      pendingMfa: schema.sessions.pendingMfa,
      idleExpiresAt: schema.sessions.idleExpiresAt,
      absoluteExpiresAt: schema.sessions.absoluteExpiresAt,
      lastSeenAt: schema.sessions.lastSeenAt,
      userId: schema.users.id,
      email: schema.users.email,
      name: schema.users.name,
      role: schema.users.role,
      status: schema.users.status,
      memberId: schema.users.memberId,
      totpEnabled: schema.users.totpEnabled,
    })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, id))
    .limit(1);
  const row = rows[0];
  if (!row) return null;
  const now = Date.now();
  if (row.status !== "active" || row.idleExpiresAt.getTime() < now || row.absoluteExpiresAt.getTime() < now) {
    await db.delete(schema.sessions).where(eq(schema.sessions.id, id));
    return null;
  }
  // Sliding idle window, written at most every few minutes to avoid a DB write per request.
  if (!row.pendingMfa && now - row.lastSeenAt.getTime() > TOUCH_INTERVAL_MS) {
    await db
      .update(schema.sessions)
      .set({ lastSeenAt: new Date(now), idleExpiresAt: new Date(Math.min(now + IDLE_MS, row.absoluteExpiresAt.getTime())) })
      .where(eq(schema.sessions.id, id));
  }
  return {
    sessionId: row.sessionId,
    pendingMfa: row.pendingMfa,
    userId: row.userId,
    email: row.email,
    name: row.name,
    role: row.role,
    memberId: row.memberId,
    totpEnabled: row.totpEnabled,
  };
}

/** Current session (memoised per request). Pending-MFA sessions are returned but grant no access. */
export const getSession = cache(async (): Promise<SessionUser | null> => {
  const token = (await cookies()).get(sessionCookieName())?.value;
  if (!token || token.length > 128) return null;
  return lookup(token);
});

export async function destroyCurrentSession() {
  const jar = await cookies();
  const token = jar.get(sessionCookieName())?.value;
  if (token) await db.delete(schema.sessions).where(eq(schema.sessions.id, sha256(token)));
  jar.delete(sessionCookieName());
}

/** Revoke every session of a user (role change, password change, disable). Optionally keep the caller's. */
export async function revokeUserSessions(userId: string, exceptSessionId?: string) {
  await db
    .delete(schema.sessions)
    .where(
      exceptSessionId
        ? and(eq(schema.sessions.userId, userId), ne(schema.sessions.id, exceptSessionId))
        : eq(schema.sessions.userId, userId),
    );
}

export async function purgeExpiredSessions() {
  const now = new Date();
  await db
    .delete(schema.sessions)
    .where(or(lt(schema.sessions.absoluteExpiresAt, now), lt(schema.sessions.idleExpiresAt, now)));
}
