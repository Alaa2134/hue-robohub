import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, gte, lt } from "drizzle-orm";
import { Icon } from "@/components/brand/icons";
import { EVENT_COLOR } from "@/components/command/event-fields";
import { EmptyPanel, PageHeader, Panel, humanize } from "@/components/command/ui";
import { cn } from "@/lib/cn";
import { can } from "@/lib/permissions";
import { formatZoned, fromZonedInput, zonedParts } from "@/lib/zoned";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "Calendar" };

const WEEK = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
const MONTHS = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const pad = (n: number) => String(n).padStart(2, "0");

export default async function CalendarPage({ searchParams }: { searchParams: Promise<{ m?: string; deleted?: string }> }) {
  const actor = await requirePage("events.view");
  const { m, deleted } = await searchParams;
  const today = zonedParts(new Date());
  const [y, mo] = m && /^\d{4}-\d{2}$/.test(m) ? m.split("-").map(Number) as [number, number] : [today.y, today.mo];
  const first = new Date(Date.UTC(y, mo - 1, 1));
  const days = new Date(Date.UTC(y, mo, 0)).getUTCDate();
  const lead = first.getUTCDay();
  const cells = Math.ceil((lead + days) / 7) * 7;
  const from = fromZonedInput(`${y}-${pad(mo)}-01T00:00`)!;
  const to = fromZonedInput(`${mo === 12 ? y + 1 : y}-${pad(mo === 12 ? 1 : mo + 1)}-01T00:00`)!;
  const [rows, upcoming] = await Promise.all([
    db.select().from(s.events).where(and(gte(s.events.startsAt, from), lt(s.events.startsAt, to))).orderBy(asc(s.events.startsAt)),
    db.select().from(s.events).where(gte(s.events.startsAt, new Date(Date.now() - 3 * 3600_000))).orderBy(asc(s.events.startsAt)).limit(8),
  ]);
  const byDay = new Map<number, typeof rows>();
  for (const e of rows) {
    const d = zonedParts(e.startsAt).day;
    byDay.set(d, [...(byDay.get(d) ?? []), e]);
  }
  const prev = mo === 1 ? `${y - 1}-12` : `${y}-${pad(mo - 1)}`;
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${pad(mo + 1)}`;
  const manage = can(actor.role, "events.manage");

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        kicker="Operations"
        title="Calendar"
        description="Sessions, workshops, deadlines and competitions. Public events also appear on the website; any event can run QR attendance."
        actions={
          manage && (
            <Link href="/command/calendar/new" className="btn btn-primary btn-sm">
              <span aria-hidden className="btn-sheen" />
              <Icon name="plus" size={15} />
              <span>New event</span>
            </Link>
          )
        }
      />
      {deleted && <p className="mb-5 rounded-xl border border-ok/30 bg-ok/[0.07] px-4 py-3 text-sm text-[#bdf5dc]">Event deleted.</p>}
      <div className="grid gap-6 xl:grid-cols-[1fr_22rem]">
        <Panel
          title={`${MONTHS[mo - 1]} ${y}`}
          action={
            <div className="flex items-center gap-1">
              <Link href={`/command/calendar?m=${prev}`} className="btn btn-sm" aria-label="Previous month">
                <Icon name="arrow" size={14} className="rotate-180" />
              </Link>
              <Link href="/command/calendar" className="btn btn-sm">
                <span>Today</span>
              </Link>
              <Link href={`/command/calendar?m=${next}`} className="btn btn-sm" aria-label="Next month">
                <Icon name="arrow" size={14} />
              </Link>
            </div>
          }
          padded={false}
        >
          <div className="grid grid-cols-7 border-b border-[var(--line)] text-center font-mono text-[0.6rem] uppercase tracking-[0.14em] text-fog">
            {WEEK.map((d) => (
              <div key={d} className="py-2">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {Array.from({ length: cells }, (_, i) => {
              const day = i - lead + 1;
              const inMonth = day >= 1 && day <= days;
              const list = inMonth ? (byDay.get(day) ?? []) : [];
              const isToday = inMonth && y === today.y && mo === today.mo && day === today.day;
              return (
                <div key={i} className={cn("min-h-[5.5rem] border-b border-e border-[var(--line)] p-1.5 sm:min-h-[7.5rem] sm:p-2 [&:nth-child(7n)]:border-e-0", !inMonth && "bg-void/40")}>
                  {inMonth && (
                    <>
                      <span className={cn("inline-flex size-6 items-center justify-center rounded-full font-mono text-xs", isToday ? "bg-cyan font-semibold text-void" : "text-fog")}>{day}</span>
                      <ul className="mt-1 flex flex-col gap-1">
                        {list.slice(0, 3).map((e) => (
                          <li key={e.id}>
                            <Link href={manage ? `/command/calendar/${e.id}` : `/command/calendar/${e.id}`} className="flex items-center gap-1.5 truncate rounded px-1 py-0.5 text-[0.7rem] text-mist hover:bg-panel hover:text-chalk" title={e.title}>
                              <span className="size-1.5 shrink-0 rounded-full" style={{ background: EVENT_COLOR[e.type] }} />
                              <span className="hidden font-mono text-[0.62rem] text-fog sm:inline">{e.allDay ? "" : `${zonedParts(e.startsAt).hh}:${zonedParts(e.startsAt).mm}`}</span>
                              <span className="truncate">{e.title}</span>
                            </Link>
                          </li>
                        ))}
                        {list.length > 3 && <li className="px-1 text-[0.65rem] text-fog">+{list.length - 3} more</li>}
                      </ul>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </Panel>
        <Panel title="Coming up">
          {!upcoming.length ? (
            <EmptyPanel icon="calendar" title="Nothing scheduled" body={manage ? "Add the next session, workshop or deadline." : undefined} />
          ) : (
            <ul className="flex flex-col gap-3">
              {upcoming.map((e) => (
                <li key={e.id}>
                  <Link href={`/command/calendar/${e.id}`} className="flex gap-3 rounded-lg p-2 hover:bg-panel">
                    <span className="mt-1 h-10 w-1 shrink-0 rounded-full" style={{ background: EVENT_COLOR[e.type] }} />
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-chalk">{e.title}</span>
                      <span className="block text-xs text-fog">
                        {formatZoned(e.startsAt, { time: !e.allDay })} · {humanize(e.type)}
                        {e.public ? " · public" : ""}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
