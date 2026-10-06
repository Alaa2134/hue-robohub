import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { CheckInButton } from "@/components/command/attendance-ui";
import { formatZoned } from "@/lib/zoned";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";
import { isUuid } from "@/server/forms";

export const metadata: Metadata = { title: "Check in" };

/** QR target. Signing in first is enforced by requirePage (login returns here via ?next). */
export default async function CheckInPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ c?: string }> }) {
  const actor = await requirePage(["attendance.self", "attendance.manage"]);
  const [{ id }, { c = "" }] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const [e] = await db.select({ title: s.events.title, startsAt: s.events.startsAt, location: s.events.location, open: s.events.attendanceOpen }).from(s.events).where(eq(s.events.id, id)).limit(1);
  if (!e) notFound();
  return (
    <div className="mx-auto flex max-w-md flex-col gap-6 py-10">
      <div>
        <p className="t-eyebrow text-[0.6rem] text-cyan">Attendance check-in</p>
        <h1 className="t-headline mt-2 text-3xl text-chalk">{e.title}</h1>
        <p className="mt-2 text-sm text-mist">
          {formatZoned(e.startsAt)}
          {e.location ? ` · ${e.location}` : ""}
        </p>
        <p className="mt-1 text-xs text-fog">Signed in as {actor.name}</p>
      </div>
      {e.open ? <CheckInButton eventId={id} code={c} /> : <p className="rounded-xl border border-warn/40 bg-warn/[0.08] p-4 text-sm text-warn">Check-in for this session is closed.</p>}
    </div>
  );
}
