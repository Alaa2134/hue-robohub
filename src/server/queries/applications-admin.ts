import "server-only";
import { and, count, desc, eq, ilike, or, type SQL } from "drizzle-orm";
import { db, schema as s } from "../db";

export const APPLICATION_STATUSES = ["pending", "interview", "accepted", "waitlist", "rejected", "trainee", "converted"] as const;
export type ApplicationStatus = (typeof APPLICATION_STATUSES)[number];

export type ApplicationFilter = { q?: string; status?: string; track?: string };

export async function listApplications(f: ApplicationFilter) {
  const where: SQL[] = [];
  if (f.q) {
    const like = `%${f.q.trim()}%`;
    where.push(or(ilike(s.applications.fullName, like), ilike(s.applications.email, like), ilike(s.applications.phone, like))!);
  }
  if (f.status && (APPLICATION_STATUSES as readonly string[]).includes(f.status)) where.push(eq(s.applications.status, f.status as ApplicationStatus));
  if (f.track && /^[0-9a-f-]{36}$/i.test(f.track)) where.push(eq(s.applications.trackId, f.track));
  return db
    .select({
      id: s.applications.id,
      fullName: s.applications.fullName,
      email: s.applications.email,
      academicYear: s.applications.academicYear,
      status: s.applications.status,
      interviewAt: s.applications.interviewAt,
      score: s.applications.score,
      createdAt: s.applications.createdAt,
      track: s.tracks.code,
      trackName: s.tracks.name,
    })
    .from(s.applications)
    .leftJoin(s.tracks, eq(s.tracks.id, s.applications.trackId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(s.applications.createdAt))
    .limit(500);
}

export async function applicationCounts() {
  const rows = await db.select({ status: s.applications.status, n: count() }).from(s.applications).groupBy(s.applications.status);
  const by = Object.fromEntries(rows.map((r) => [r.status, r.n])) as Partial<Record<ApplicationStatus, number>>;
  return { by, total: rows.reduce((a, r) => a + r.n, 0) };
}

export async function getApplication(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [row] = await db
    .select({ a: s.applications, track: { id: s.tracks.id, code: s.tracks.code, name: s.tracks.name }, decider: s.users.name, member: { id: s.members.id, fullName: s.members.fullName } })
    .from(s.applications)
    .leftJoin(s.tracks, eq(s.tracks.id, s.applications.trackId))
    .leftJoin(s.users, eq(s.users.id, s.applications.decidedBy))
    .leftJoin(s.members, eq(s.members.id, s.applications.memberId))
    .where(eq(s.applications.id, id))
    .limit(1);
  if (!row) return null;
  return { ...row.a, track: row.track?.id ? row.track : null, decidedByName: row.decider, member: row.member?.id ? row.member : null };
}

export async function trackOptions() {
  return db.select({ id: s.tracks.id, name: s.tracks.name, code: s.tracks.code }).from(s.tracks).orderBy(s.tracks.sortOrder);
}
