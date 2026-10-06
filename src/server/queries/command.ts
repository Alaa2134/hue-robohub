import "server-only";
import { and, asc, count, desc, eq, gte, inArray, isNull, lt, lte, ne, sql, sum } from "drizzle-orm";
import { db, schema as s } from "../db";
import type { Actor } from "../auth/guard";
import { can } from "@/lib/permissions";

/**
 * Live Mission Control figures. Never cached across users — every number is read from the database for
 * the signed-in actor, and sections the actor may not see are not queried at all.
 */
export async function getOverview(actor: Actor) {
  const now = new Date();
  const weekAhead = new Date(now.getTime() + 7 * 864e5);
  const fortnight = new Date(now.getTime() + 14 * 864e5);
  const weekAgo = new Date(now.getTime() - 7 * 864e5);
  const today = now.toISOString().slice(0, 10);
  const in7 = weekAhead.toISOString().slice(0, 10);

  const [members, trainees, byDept] = await Promise.all([
    db.select({ n: count() }).from(s.members).where(eq(s.members.status, "active")),
    db.select({ n: count() }).from(s.members).where(and(eq(s.members.status, "active"), eq(s.members.rank, "trainee"))),
    db.select({ k: s.members.department, n: count() }).from(s.members).where(eq(s.members.status, "active")).groupBy(s.members.department),
  ]);

  const apps = can(actor.role, "applications.view")
    ? await Promise.all([
        db.select({ k: s.applications.status, n: count() }).from(s.applications).groupBy(s.applications.status),
        db.select({ n: count() }).from(s.applications).where(gte(s.applications.createdAt, weekAgo)),
        db
          .select({ id: s.applications.id, name: s.applications.fullName, status: s.applications.status, createdAt: s.applications.createdAt, track: s.tracks.code })
          .from(s.applications)
          .leftJoin(s.tracks, eq(s.tracks.id, s.applications.trackId))
          .where(inArray(s.applications.status, ["pending", "interview"]))
          .orderBy(desc(s.applications.createdAt))
          .limit(5),
      ])
    : null;

  const [projectsByStatus, budget, bomTotals] = can(actor.role, "projects.view")
    ? await Promise.all([
        db.select({ k: s.projects.status, n: count() }).from(s.projects).groupBy(s.projects.status),
        db.select({ total: sum(s.projects.budget) }).from(s.projects).where(ne(s.projects.status, "archived")),
        db
          .select({
            planned: sql<string>`coalesce(sum(${s.bomItems.quantity} * ${s.bomItems.unitPrice}), 0)`,
            committed: sql<string>`coalesce(sum(${s.bomItems.quantity} * ${s.bomItems.unitPrice}) filter (where ${s.bomItems.status} in ('ordered','received','installed')), 0)`,
            needed: sql<number>`count(*) filter (where ${s.bomItems.status} in ('needed','replacement_needed'))`,
          })
          .from(s.bomItems),
      ])
    : [[], [], []];

  const taskScope = can(actor.role, "tasks.manage") ? undefined : actor.memberId ? eq(s.tasks.assigneeId, actor.memberId) : sql`false`;
  const [tasksByStatus, dueSoon, overdue] = can(actor.role, "tasks.view")
    ? await Promise.all([
        db.select({ k: s.tasks.status, n: count() }).from(s.tasks).where(taskScope).groupBy(s.tasks.status),
        db
          .select({ id: s.tasks.id, title: s.tasks.title, due: s.tasks.dueDate, priority: s.tasks.priority, status: s.tasks.status })
          .from(s.tasks)
          .where(and(taskScope, ne(s.tasks.status, "done"), gte(s.tasks.dueDate, today), lte(s.tasks.dueDate, in7)))
          .orderBy(asc(s.tasks.dueDate))
          .limit(6),
        db.select({ n: count() }).from(s.tasks).where(and(taskScope, ne(s.tasks.status, "done"), lt(s.tasks.dueDate, today))),
      ])
    : [[], [], [{ n: 0 }]];

  const [lowStock, inventoryCount] = can(actor.role, "inventory.view")
    ? await Promise.all([
        db
          .select({ id: s.inventoryItems.id, name: s.inventoryItems.name, quantity: s.inventoryItems.quantity, min: s.inventoryItems.minQuantity })
          .from(s.inventoryItems)
          .where(and(sql`${s.inventoryItems.minQuantity} > 0`, sql`${s.inventoryItems.quantity} <= ${s.inventoryItems.minQuantity}`))
          .orderBy(asc(s.inventoryItems.quantity))
          .limit(6),
        db.select({ n: count(), units: sum(s.inventoryItems.quantity) }).from(s.inventoryItems),
      ])
    : [[], [{ n: 0, units: null }]];

  const upcoming = can(actor.role, "events.view")
    ? await db
        .select({ id: s.events.id, title: s.events.title, type: s.events.type, startsAt: s.events.startsAt, location: s.events.location })
        .from(s.events)
        .where(and(gte(s.events.startsAt, now), lte(s.events.startsAt, fortnight)))
        .orderBy(asc(s.events.startsAt))
        .limit(6)
    : [];

  const nextCompetition = can(actor.role, "competitions.view")
    ? (
        await db
          .select({ name: s.competitions.name, startsAt: s.competitions.startsAt, team: s.competitionTeams.name, accent: s.competitionTeams.accent })
          .from(s.competitions)
          .leftJoin(s.competitionTeams, eq(s.competitionTeams.id, s.competitions.teamId))
          .where(gte(s.competitions.startsAt, now))
          .orderBy(asc(s.competitions.startsAt))
          .limit(1)
      )[0] ?? null
    : null;

  const activity = can(actor.role, "audit.view")
    ? await db
        .select({ id: s.auditLogs.id, actor: s.auditLogs.actorLabel, action: s.auditLogs.action, summary: s.auditLogs.summary, targetType: s.auditLogs.targetType, createdAt: s.auditLogs.createdAt })
        .from(s.auditLogs)
        .orderBy(desc(s.auditLogs.createdAt))
        .limit(8)
    : [];

  const unreadMessages = can(actor.role, "messages.view") ? (await db.select({ n: count() }).from(s.contactMessages).where(eq(s.contactMessages.status, "new")))[0]!.n : null;

  const [teams, tracks] = await Promise.all([
    db
      .select({ id: s.competitionTeams.id, name: s.competitionTeams.name, accent: s.competitionTeams.accent, code: s.competitionTeams.code, n: sql<number>`(select count(*) from ${s.members} m where m.team_id = ${s.competitionTeams.id} and m.status = 'active')` })
      .from(s.competitionTeams)
      .orderBy(asc(s.competitionTeams.sortOrder)),
    db
      .select({ id: s.tracks.id, name: s.tracks.name, code: s.tracks.code, n: sql<number>`(select count(*) from ${s.members} m where m.track_id = ${s.tracks.id} and m.status = 'active')` })
      .from(s.tracks)
      .orderBy(asc(s.tracks.sortOrder)),
  ]);

  const toMap = (rows: { k: string | null; n: number }[]) => Object.fromEntries(rows.map((r) => [r.k ?? "none", Number(r.n)]));
  return {
    members: Number(members[0]!.n),
    trainees: Number(trainees[0]!.n),
    byDepartment: toMap(byDept),
    applications: apps ? { byStatus: toMap(apps[0]), newThisWeek: Number(apps[1][0]!.n), queue: apps[2] } : null,
    projects: can(actor.role, "projects.view")
      ? {
          byStatus: toMap(projectsByStatus as { k: string; n: number }[]),
          budget: Number((budget as { total: string | null }[])[0]?.total ?? 0),
          planned: Number((bomTotals as { planned: string }[])[0]?.planned ?? 0),
          committed: Number((bomTotals as { committed: string }[])[0]?.committed ?? 0),
          partsNeeded: Number((bomTotals as { needed: number }[])[0]?.needed ?? 0),
        }
      : null,
    tasks: can(actor.role, "tasks.view")
      ? { byStatus: toMap(tasksByStatus as { k: string; n: number }[]), dueSoon: dueSoon as { id: string; title: string; due: string | null; priority: string; status: string }[], overdue: Number((overdue as { n: number }[])[0]!.n) }
      : null,
    inventory: can(actor.role, "inventory.view") ? { lowStock: lowStock as { id: string; name: string; quantity: number; min: number }[], items: Number((inventoryCount as { n: number }[])[0]!.n) } : null,
    upcoming,
    nextCompetition,
    activity,
    unreadMessages,
    teams: teams.map((t) => ({ ...t, n: Number(t.n) })),
    tracks: tracks.map((t) => ({ ...t, n: Number(t.n) })),
  };
}

export async function unreadNotifications(userId: string) {
  const [r] = await db.select({ n: count() }).from(s.notifications).where(and(eq(s.notifications.userId, userId), isNull(s.notifications.readAt)));
  return Number(r?.n ?? 0);
}
