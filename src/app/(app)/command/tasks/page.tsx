import type { Metadata } from "next";
import { and, asc, eq, gte, isNull, ne, or, sql } from "drizzle-orm";
import { TaskBoard } from "@/components/command/task-board";
import { PageHeader } from "@/components/command/ui";
import { can } from "@/lib/permissions";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "Tasks" };

export default async function TasksPage() {
  const actor = await requirePage("tasks.view");
  const recent = new Date(Date.now() - 21 * 86400_000);
  const checklist = db
    .select({ taskId: s.taskChecklistItems.taskId, done: sql<number>`count(*) filter (where ${s.taskChecklistItems.done})`.mapWith(Number).as("done"), total: sql<number>`count(*)`.mapWith(Number).as("total") })
    .from(s.taskChecklistItems)
    .groupBy(s.taskChecklistItems.taskId)
    .as("cl");
  const [rows, members, projects, teams] = await Promise.all([
    db
      .select({ t: s.tasks, assignee: s.members.fullName, project: s.projects.title, teamAccent: s.competitionTeams.accent, clDone: checklist.done, clTotal: checklist.total })
      .from(s.tasks)
      .leftJoin(s.members, eq(s.members.id, s.tasks.assigneeId))
      .leftJoin(s.projects, eq(s.projects.id, s.tasks.projectId))
      .leftJoin(s.competitionTeams, eq(s.competitionTeams.id, s.tasks.teamId))
      .leftJoin(checklist, eq(checklist.taskId, s.tasks.id))
      // Done tasks fall off the board after three weeks.
      .where(or(ne(s.tasks.status, "done"), isNull(s.tasks.completedAt), gte(s.tasks.completedAt, recent)))
      .orderBy(asc(s.tasks.position))
      .limit(800),
    db.select({ id: s.members.id, name: s.members.fullName }).from(s.members).where(ne(s.members.status, "alumni")).orderBy(asc(s.members.fullName)),
    db.select({ id: s.projects.id, name: s.projects.title }).from(s.projects).where(and(ne(s.projects.status, "archived"), ne(s.projects.status, "completed"))).orderBy(asc(s.projects.title)),
    db.select({ id: s.competitionTeams.id, name: s.competitionTeams.name }).from(s.competitionTeams).orderBy(asc(s.competitionTeams.sortOrder)),
  ]);

  return (
    <div className="mx-auto max-w-[1700px]">
      <PageHeader kicker="Operations" title="Tasks" description="One board for the whole community. Assign, prioritise and drag work across the columns; open a card for its checklist and discussion." />
      <TaskBoard
        initial={rows.map(({ t, assignee, project, teamAccent, clDone, clTotal }) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          priority: t.priority,
          position: t.position,
          assigneeId: t.assigneeId,
          assignee,
          projectId: t.projectId,
          project,
          teamId: t.teamId,
          teamAccent,
          dueDate: t.dueDate,
          tags: t.tags,
          checklist: [clDone ?? 0, clTotal ?? 0] as [number, number],
          createdBy: t.createdBy,
        }))}
        members={members}
        projects={projects}
        teams={teams}
        me={{ userId: actor.userId, memberId: actor.memberId, manage: can(actor.role, "tasks.manage") }}
      />
    </div>
  );
}
