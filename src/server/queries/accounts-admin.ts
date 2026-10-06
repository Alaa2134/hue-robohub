import "server-only";
import { asc, eq, isNull } from "drizzle-orm";
import { db, schema as s } from "../db";

export async function listAccounts() {
  return db
    .select({
      id: s.users.id,
      name: s.users.name,
      email: s.users.email,
      role: s.users.role,
      status: s.users.status,
      mfa: s.users.totpEnabled,
      lastLoginAt: s.users.lastLoginAt,
      createdAt: s.users.createdAt,
      lockedUntil: s.users.lockedUntil,
      member: s.members.fullName,
    })
    .from(s.users)
    .leftJoin(s.members, eq(s.members.id, s.users.memberId))
    .orderBy(asc(s.users.createdAt));
}

/** Members who don't have a Command Center account yet (for linking on creation). */
export async function membersWithoutAccount() {
  return db
    .select({ id: s.members.id, name: s.members.fullName })
    .from(s.members)
    .leftJoin(s.users, eq(s.users.memberId, s.members.id))
    .where(isNull(s.users.id))
    .orderBy(asc(s.members.fullName));
}
