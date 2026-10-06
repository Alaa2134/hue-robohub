import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, ne } from "drizzle-orm";
import QRCode from "qrcode";
import { AttendancePanel } from "@/components/command/attendance-ui";
import { EntityForm } from "@/components/command/entity-form";
import { EVENT_COLOR, eventFields } from "@/components/command/event-fields";
import { PageHeader, Panel, StatusBadge, humanize } from "@/components/command/ui";
import { can } from "@/lib/permissions";
import { SITE_URL } from "@/lib/seo";
import { formatZoned, toZonedInput } from "@/lib/zoned";
import { requirePage } from "@/server/auth/guard";
import { deleteEvent, saveEvent } from "@/server/actions/events";
import { db, schema as s } from "@/server/db";
import { isUuid } from "@/server/forms";
import { thumbUrl } from "@/server/media/present";

export const metadata: Metadata = { title: "Event" };

export default async function EventAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const actor = await requirePage("events.view");
  const [{ id }, { new: fresh }] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const [row] = await db.select({ e: s.events, cover: s.mediaAssets }).from(s.events).leftJoin(s.mediaAssets, eq(s.mediaAssets.id, s.events.coverId)).where(eq(s.events.id, id)).limit(1);
  if (!row) notFound();
  const e = row.e;
  const manage = can(actor.role, "events.manage");
  const attend = can(actor.role, "attendance.manage");

  let attendance: React.ReactNode = null;
  if (attend) {
    const [members, marks] = await Promise.all([
      db.select({ id: s.members.id, name: s.members.fullName }).from(s.members).where(ne(s.members.status, "alumni")).orderBy(asc(s.members.fullName)),
      db.select().from(s.attendance).where(eq(s.attendance.eventId, id)),
    ]);
    const mark = new Map(marks.map((m) => [m.memberId, m]));
    const url = e.attendanceCode ? `${SITE_URL}/command/checkin/${e.id}?c=${e.attendanceCode}` : null;
    const qrSvg = url && e.attendanceOpen ? await QRCode.toString(url, { type: "svg", margin: 1, errorCorrectionLevel: "M", color: { dark: "#05080f", light: "#ffffff" } }) : null;
    attendance = (
      <Panel id="attendance" title="Attendance" kicker="QR check-in">
        <AttendancePanel eventId={e.id} open={e.attendanceOpen} qrSvg={qrSvg} url={url} roster={members.map((m) => ({ id: m.id, name: m.name, status: (mark.get(m.id)?.status ?? null) as "present" | null, method: mark.get(m.id)?.method ?? null }))} />
      </Panel>
    );
  }

  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader
        kicker={<Link href="/command/calendar">← Calendar</Link>}
        title={e.title}
        description={
          <span className="flex flex-wrap items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: EVENT_COLOR[e.type] }} />
            {humanize(e.type)} · {formatZoned(e.startsAt, { time: !e.allDay })}
            {e.endsAt && !e.allDay ? `–${formatZoned(e.endsAt).split(" · ")[1]}` : ""}
            {e.location ? ` · ${e.location}` : ""}
            <StatusBadge status={e.public ? "active" : "inactive"} label={e.public ? "On website" : "Internal"} />
            {fresh && <span className="text-ok">Created.</span>}
          </span>
        }
        actions={
          e.public ? (
            <Link href={`/events/${e.slug}`} target="_blank" className="btn btn-sm">
              <span>View on site ↗</span>
            </Link>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-6">
        {attendance}
        {manage ? (
          <Panel title="Event details">
            <EntityForm
              action={saveEvent}
              value={{ id: e.id, title: e.title, type: e.type, location: e.location, startsAt: toZonedInput(e.startsAt), endsAt: toZonedInput(e.endsAt), allDay: e.allDay, teamId: e.teamId, description: e.description, public: e.public, registrationUrl: e.registrationUrl, ctaLabel: e.ctaLabel }}
              fields={eventFields(await db.select({ id: s.competitionTeams.id, name: s.competitionTeams.name }).from(s.competitionTeams).orderBy(asc(s.competitionTeams.sortOrder)), thumbUrl(row.cover, 960))}
              submitLabel="Save event"
              onDelete={deleteEvent.bind(null, e.id)}
              deleteLabel="Delete event"
            />
          </Panel>
        ) : (
          e.description && (
            <Panel title="About this event">
              <p className="whitespace-pre-line text-sm leading-relaxed text-mist">{e.description}</p>
            </Panel>
          )
        )}
      </div>
    </div>
  );
}
