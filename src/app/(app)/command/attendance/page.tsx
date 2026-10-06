import type { Metadata } from "next";
import Link from "next/link";
import { and, count, desc, eq, gte, inArray, lt, ne, sql } from "drizzle-orm";
import { DataTable, EmptyPanel, Meter, PageHeader, Panel, StatusBadge, type Column } from "@/components/command/ui";
import { can } from "@/lib/permissions";
import { formatZoned } from "@/lib/zoned";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "Attendance" };

export default async function AttendancePage() {
  const actor = await requirePage(["attendance.view", "attendance.self"]);
  const lead = can(actor.role, "attendance.view");

  const mine = actor.memberId
    ? await db
        .select({ title: s.events.title, startsAt: s.events.startsAt, status: s.attendance.status, method: s.attendance.method })
        .from(s.attendance)
        .innerJoin(s.events, eq(s.events.id, s.attendance.eventId))
        .where(eq(s.attendance.memberId, actor.memberId))
        .orderBy(desc(s.events.startsAt))
        .limit(50)
    : [];

  let overview: React.ReactNode = null;
  if (lead) {
    // Sessions that had attendance taken (at least one mark) in the past 120 days.
    const since = new Date(Date.now() - 120 * 86400_000);
    const sessions = await db
      .select({ id: s.events.id, title: s.events.title, startsAt: s.events.startsAt, marked: count(s.attendance.memberId), present: sql<number>`count(*) filter (where ${s.attendance.status} in ('present','late'))`.mapWith(Number) })
      .from(s.events)
      .innerJoin(s.attendance, eq(s.attendance.eventId, s.events.id))
      .where(and(gte(s.events.startsAt, since), lt(s.events.startsAt, new Date(Date.now() + 86400_000))))
      .groupBy(s.events.id)
      .orderBy(desc(s.events.startsAt))
      .limit(30);
    const total = sessions.length;
    const ids = sessions.map((x) => x.id);
    const rates = ids.length
      ? await db
          .select({
            id: s.members.id,
            name: s.members.fullName,
            rank: s.members.rank,
            attended: sql<number>`count(*) filter (where ${s.attendance.status} in ('present','late') and ${inArray(s.attendance.eventId, ids)})`.mapWith(Number),
            late: sql<number>`count(*) filter (where ${s.attendance.status} = 'late' and ${inArray(s.attendance.eventId, ids)})`.mapWith(Number),
            absent: sql<number>`count(*) filter (where ${s.attendance.status} = 'absent' and ${inArray(s.attendance.eventId, ids)})`.mapWith(Number),
          })
          .from(s.members)
          .leftJoin(s.attendance, eq(s.attendance.memberId, s.members.id))
          .where(ne(s.members.status, "alumni"))
          .groupBy(s.members.id)
          .orderBy(s.members.fullName)
      : [];
    type R = (typeof rates)[number];
    const cols: Column<R>[] = [
      { key: "name", label: "Member", render: (r) => r.name },
      { key: "att", label: "Attended", align: "center", render: (r) => <span className="font-mono text-xs">{r.attended}/{total}</span> },
      { key: "late", label: "Late", align: "center", render: (r) => <span className="font-mono text-xs text-warn">{r.late || "—"}</span> },
      { key: "abs", label: "Absent", align: "center", render: (r) => <span className="font-mono text-xs text-danger">{r.absent || "—"}</span> },
      {
        key: "rate",
        label: "Rate",
        className: "w-48",
        render: (r) => {
          const pct = total ? Math.round((r.attended / total) * 100) : 0;
          return (
            <span className="flex items-center gap-3">
              <Meter value={pct} tone={pct >= 75 ? "ok" : pct >= 50 ? "warn" : "danger"} className="flex-1" />
              <span className="w-9 text-end font-mono text-xs">{pct}%</span>
            </span>
          );
        },
      },
    ];
    overview = (
      <>
        <Panel title="Recent sessions" kicker={`${total} with attendance in the last 120 days`}>
          {!sessions.length ? (
            <EmptyPanel icon="qr" title="No attendance taken yet" body="Open check-in from any event in the Calendar to show a QR code at the session." />
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {sessions.map((x) => (
                <li key={x.id} className="flex items-center justify-between gap-3 py-2.5">
                  <Link href={`/command/calendar/${x.id}#attendance`} className="min-w-0 truncate text-sm text-mist hover:text-cyan">
                    {x.title}
                  </Link>
                  <span className="shrink-0 font-mono text-xs text-fog">
                    {formatZoned(x.startsAt, { time: false })} · {x.present} present
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        {total > 0 && (
          <Panel title="Attendance by member" padded={false}>
            <DataTable columns={cols} rows={rates} rowKey={(r) => r.id} caption="Attendance rates" />
          </Panel>
        )}
      </>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader kicker="Operations" title="Attendance" description={lead ? "Attendance across sessions. Take attendance from an event's page — QR check-in or manual marking." : "Your check-ins. Scan the QR code shown at each session to record attendance."} />
      <div className="flex flex-col gap-6">
        {overview}
        <Panel title="My attendance">
          {!actor.memberId ? (
            <p className="text-sm text-fog">Your account isn&apos;t linked to a member profile, so there&apos;s no personal attendance record.</p>
          ) : !mine.length ? (
            <p className="text-sm text-fog">No check-ins yet.</p>
          ) : (
            <ul className="divide-y divide-[var(--line)]">
              {mine.map((m, i) => (
                <li key={i} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-mist">{m.title}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="font-mono text-xs text-fog">{formatZoned(m.startsAt, { time: false })}</span>
                    <StatusBadge status={m.status} />
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
