import type { Metadata } from "next";
import Link from "next/link";
import { asc } from "drizzle-orm";
import { EntityForm } from "@/components/command/entity-form";
import { eventFields } from "@/components/command/event-fields";
import { PageHeader } from "@/components/command/ui";
import { toZonedInput } from "@/lib/zoned";
import { requirePage } from "@/server/auth/guard";
import { saveEvent } from "@/server/actions/events";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "New event" };

export default async function NewEvent() {
  await requirePage("events.manage");
  const teams = await db.select({ id: s.competitionTeams.id, name: s.competitionTeams.name }).from(s.competitionTeams).orderBy(asc(s.competitionTeams.sortOrder));
  const start = new Date(Math.ceil(Date.now() / 3600_000) * 3600_000 + 86400_000);
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker={<Link href="/command/calendar">← Calendar</Link>} title="New event" />
      <EntityForm action={saveEvent} value={{ type: "workshop", startsAt: toZonedInput(start), endsAt: toZonedInput(new Date(start.getTime() + 2 * 3600_000)), public: false }} fields={eventFields(teams)} submitLabel="Create event" cancelHref="/command/calendar" />
    </div>
  );
}
