import "server-only";
import { asc, count, desc, eq, ne, sql } from "drizzle-orm";
import { db, schema as s } from "../db";

export async function listProjects(status?: string) {
  const bom = db
    .select({ projectId: s.bomItems.projectId, total: sql<number>`coalesce(sum(${s.bomItems.quantity} * ${s.bomItems.unitPrice}), 0)`.mapWith(Number).as("total") })
    .from(s.bomItems)
    .groupBy(s.bomItems.projectId)
    .as("bom");
  const rows = await db
    .select({
      id: s.projects.id,
      slug: s.projects.slug,
      title: s.projects.title,
      status: s.projects.status,
      progress: s.projects.progress,
      budget: s.projects.budget,
      published: s.projects.published,
      featured: s.projects.featured,
      updatedAt: s.projects.updatedAt,
      track: s.tracks.code,
      team: s.competitionTeams.name,
      teamAccent: s.competitionTeams.accent,
      manager: s.members.fullName,
      bomTotal: bom.total,
    })
    .from(s.projects)
    .leftJoin(s.tracks, eq(s.tracks.id, s.projects.trackId))
    .leftJoin(s.competitionTeams, eq(s.competitionTeams.id, s.projects.teamId))
    .leftJoin(s.members, eq(s.members.id, s.projects.managerId))
    .leftJoin(bom, eq(bom.projectId, s.projects.id))
    .where(status ? eq(s.projects.status, status as "idea") : ne(s.projects.status, "archived"))
    .orderBy(desc(s.projects.featured), desc(s.projects.updatedAt));
  return rows.map((r) => ({ ...r, budget: r.budget ? Number(r.budget) : 0, bomTotal: r.bomTotal ?? 0 }));
}

export async function projectCounts() {
  const rows = await db.select({ status: s.projects.status, n: count() }).from(s.projects).groupBy(s.projects.status);
  return Object.fromEntries(rows.map((r) => [r.status, r.n])) as Record<string, number>;
}

export async function projectOptions() {
  const [tracks, teams, members] = await Promise.all([
    db.select({ id: s.tracks.id, name: s.tracks.name }).from(s.tracks).orderBy(asc(s.tracks.sortOrder)),
    db.select({ id: s.competitionTeams.id, name: s.competitionTeams.name }).from(s.competitionTeams).orderBy(asc(s.competitionTeams.sortOrder)),
    db.select({ id: s.members.id, name: s.members.fullName }).from(s.members).where(ne(s.members.status, "alumni")).orderBy(asc(s.members.fullName)),
  ]);
  return { tracks, teams, members };
}
