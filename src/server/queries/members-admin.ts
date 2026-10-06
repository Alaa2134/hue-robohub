import "server-only";
import { and, asc, count, desc, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db, schema as s } from "../db";
import { presentImage } from "../media/present";
import { storage } from "../storage";

export type AdminMemberFilter = { q?: string; status?: string; visibility?: string; department?: string };

/** Command Center member list (includes non-public members; never exposed to public routes). */
export async function listMembers(f: AdminMemberFilter) {
  const where: SQL[] = [];
  if (f.q) where.push(or(ilike(s.members.fullName, `%${f.q}%`), ilike(s.members.title, `%${f.q}%`))!);
  if (f.status && ["active", "inactive", "alumni"].includes(f.status)) where.push(eq(s.members.status, f.status as "active"));
  if (f.visibility === "public") where.push(eq(s.members.publicProfile, true));
  if (f.visibility === "private") where.push(eq(s.members.publicProfile, false));
  if (f.department) where.push(eq(s.members.department, f.department as "hardware"));
  const rows = await db
    .select({
      id: s.members.id,
      slug: s.members.slug,
      fullName: s.members.fullName,
      rank: s.members.rank,
      department: s.members.department,
      title: s.members.title,
      academicYear: s.members.academicYear,
      status: s.members.status,
      publicProfile: s.members.publicProfile,
      updatedAt: s.members.updatedAt,
      track: s.tracks.code,
      team: s.competitionTeams.name,
      teamAccent: s.competitionTeams.accent,
      photo: s.mediaAssets,
    })
    .from(s.members)
    .leftJoin(s.tracks, eq(s.tracks.id, s.members.trackId))
    .leftJoin(s.competitionTeams, eq(s.competitionTeams.id, s.members.teamId))
    .leftJoin(s.mediaAssets, eq(s.mediaAssets.id, s.members.photoId))
    .where(where.length ? and(...where) : undefined)
    .orderBy(asc(s.members.sortOrder), desc(s.members.updatedAt))
    .limit(500);
  return rows.map(({ photo, ...r }) => ({ ...r, photoUrl: presentImage(photo)?.src ?? null }));
}

/** Roster totals for the list header (unfiltered). */
export async function memberCounts() {
  const [r] = await db
    .select({
      total: count(),
      public: sql<number>`count(*) filter (where ${s.members.publicProfile})`.mapWith(Number),
      active: sql<number>`count(*) filter (where ${s.members.status} = 'active')`.mapWith(Number),
      noPhoto: sql<number>`count(*) filter (where ${s.members.photoId} is null)`.mapWith(Number),
    })
    .from(s.members);
  return r ?? { total: 0, public: 0, active: 0, noPhoto: 0 };
}

export async function getMemberForEdit(id: string) {
  if (!/^[0-9a-f-]{36}$/i.test(id)) return null;
  const [m] = await db.select().from(s.members).where(eq(s.members.id, id)).limit(1);
  if (!m) return null;
  let photoUrl: string | null = null;
  let originalUrl: string | null = null;
  if (m.photoId) {
    const [a] = await db.select().from(s.mediaAssets).where(eq(s.mediaAssets.id, m.photoId)).limit(1);
    photoUrl = presentImage(a)?.src ?? null;
    if (a) originalUrl = await storage().signedUrl(a.originalKey, 600);
  }
  return { ...m, photoUrl, originalUrl };
}

export async function memberFormOptions() {
  const [tracks, teams] = await Promise.all([
    db.select({ id: s.tracks.id, name: s.tracks.name }).from(s.tracks).orderBy(asc(s.tracks.sortOrder)),
    db.select({ id: s.competitionTeams.id, name: s.competitionTeams.name }).from(s.competitionTeams).orderBy(asc(s.competitionTeams.sortOrder)),
  ]);
  return { tracks, teams };
}
