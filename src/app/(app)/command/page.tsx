import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/brand/icons";
import { EmptyPanel, Kpi, Meter, PageHeader, Panel, StatusBadge, humanize, money, relTime } from "@/components/command/ui";
import { DEPARTMENT_LABEL } from "@/lib/members";
import { can } from "@/lib/permissions";
import { requirePage } from "@/server/auth/guard";
import { getOverview } from "@/server/queries/command";

export const metadata: Metadata = { title: "Overview" };

const APP_FLOW = ["pending", "interview", "accepted", "waitlist", "rejected", "trainee", "converted"] as const;
const PROJECT_FLOW = ["idea", "research", "design", "prototype", "testing", "competition_ready", "completed"] as const;

function greeting() {
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "numeric", hour12: false }).format(new Date()));
  return h < 12 ? "Good morning" : h < 18 ? "Good afternoon" : "Good evening";
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const actor = await requirePage("dashboard.view");
  const { welcome } = await searchParams;
  const o = await getOverview(actor);
  const firstName = actor.name.split(" ")[0];
  const committedPct = o.projects && o.projects.budget > 0 ? (o.projects.committed / o.projects.budget) * 100 : 0;
  const openTasks = o.tasks ? Object.entries(o.tasks.byStatus).filter(([k]) => k !== "done").reduce((a, [, n]) => a + n, 0) : 0;
  const pendingApps = o.applications ? (o.applications.byStatus.pending ?? 0) + (o.applications.byStatus.interview ?? 0) : 0;
  const maxTrack = Math.max(1, ...o.tracks.map((t) => t.n));

  return (
    <div className="mx-auto max-w-[1500px]">
      {welcome && (
        <div className="mb-6 flex items-start gap-3 rounded-2xl border border-ok/30 bg-ok/[0.07] p-4 text-sm text-[#bdf5dc]">
          <Icon name="check" size={18} className="mt-0.5 shrink-0" />
          <p>
            Owner account created and setup locked. Next: secure your account with two-factor authentication in{" "}
            <Link href="/command/settings#security" className="underline">
              Settings
            </Link>
            , then add your first members.
          </p>
        </div>
      )}
      <PageHeader
        kicker="Mission control · live"
        title={`${greeting()}, ${firstName}.`}
        description="Every figure on this screen is read live from the database for your role."
        actions={
          <>
            {can(actor.role, "members.manage") && (
              <Link href="/command/members/new" className="btn btn-primary btn-sm">
                <span aria-hidden className="btn-sheen" />
                <Icon name="plus" size={15} />
                <span>Add member</span>
              </Link>
            )}
            <Link href="/" className="btn btn-sm" target="_blank">
              <Icon name="external" size={14} />
              <span>View site</span>
            </Link>
          </>
        }
      />

      <div className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
        <Kpi label="Active members" value={String(o.members).padStart(2, "0")} sub={`${o.trainees} trainee${o.trainees === 1 ? "" : "s"}`} icon="users" href={can(actor.role, "members.view") ? "/command/members" : undefined} />
        {o.applications ? (
          <Kpi label="Applications to review" value={String(pendingApps).padStart(2, "0")} tone={pendingApps ? "cyan" : "default"} sub={`${o.applications.newThisWeek} new this week`} icon="rocket" href="/command/applications" />
        ) : (
          <Kpi label="Competition teams" value={String(o.teams.length).padStart(2, "0")} icon="flag" />
        )}
        {o.tasks ? (
          <Kpi label="Open tasks" value={String(openTasks).padStart(2, "0")} tone={o.tasks.overdue ? "warn" : "default"} sub={o.tasks.overdue ? `${o.tasks.overdue} overdue` : "Nothing overdue"} icon="check" href="/command/tasks" />
        ) : (
          <Kpi label="Tracks" value={String(o.tracks.length).padStart(2, "0")} icon="layers" />
        )}
        {o.projects ? (
          <Kpi label="Budget committed" value={money(o.projects.committed)} sub={o.projects.budget ? `of ${money(o.projects.budget)} across active projects` : "No project budgets set yet"} bar={committedPct} icon="gauge" href="/command/projects" />
        ) : (
          <Kpi label="Upcoming events" value={String(o.upcoming.length).padStart(2, "0")} icon="calendar" />
        )}
      </div>

      <div className="mt-4 grid gap-4 xl:grid-cols-3">
        <div className="flex flex-col gap-4 xl:col-span-2">
          {o.applications && (
            <Panel title="Recruitment pipeline" kicker="Applications" action={<Link href="/command/applications" className="text-xs text-cyan hover:underline">Open pipeline</Link>}>
              <ol className="grid grid-cols-2 gap-2 sm:grid-cols-4 lg:grid-cols-7">
                {APP_FLOW.map((k) => (
                  <li key={k} className="rounded-xl border border-[var(--line)] bg-deep/50 p-3">
                    <StatusBadge status={k} />
                    <p className="t-display mt-3 text-2xl text-chalk">{String(o.applications!.byStatus[k] ?? 0).padStart(2, "0")}</p>
                  </li>
                ))}
              </ol>
              {o.applications.queue.length > 0 ? (
                <ul className="mt-5 divide-y divide-[var(--line)]">
                  {o.applications.queue.map((a) => (
                    <li key={a.id}>
                      <Link href={`/command/applications/${a.id}`} className="flex items-center justify-between gap-4 py-3 text-sm hover:text-chalk">
                        <span className="min-w-0 truncate text-frost">{a.name}</span>
                        <span className="flex shrink-0 items-center gap-3">
                          {a.track && <span className="font-mono text-[0.65rem] text-fog">{a.track}</span>}
                          <StatusBadge status={a.status} />
                          <span className="hidden text-xs text-fog sm:inline">{relTime(a.createdAt)}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="mt-5 text-sm text-fog">No applications waiting for review.</p>
              )}
            </Panel>
          )}

          {o.projects && (
            <Panel title="Engineering pipeline" kicker="Projects · budget" action={<Link href="/command/projects" className="text-xs text-cyan hover:underline">All projects</Link>}>
              <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                <ol className="flex flex-col gap-2">
                  {PROJECT_FLOW.map((k) => {
                    const n = o.projects!.byStatus[k] ?? 0;
                    const max = Math.max(1, ...Object.values(o.projects!.byStatus));
                    return (
                      <li key={k} className="grid grid-cols-[8.5rem_1fr_2rem] items-center gap-3 text-xs">
                        <span className="text-mist">{humanize(k)}</span>
                        <Meter value={(n / max) * 100} />
                        <span className="t-data text-end text-chalk">{n}</span>
                      </li>
                    );
                  })}
                </ol>
                <dl className="grid grid-cols-2 gap-2 self-start">
                  {[
                    ["Planned (BOM)", money(o.projects.planned)],
                    ["Committed", money(o.projects.committed)],
                    ["Remaining", money(Math.max(0, o.projects.budget - o.projects.committed))],
                    ["Parts needed", String(o.projects.partsNeeded)],
                  ].map(([k, v]) => (
                    <div key={k} className="rounded-xl border border-[var(--line)] bg-deep/50 p-3">
                      <dt className="t-eyebrow text-[0.52rem] text-fog">{k}</dt>
                      <dd className="mt-1.5 font-display text-lg font-semibold text-chalk">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </Panel>
          )}

          <div className="grid gap-4 lg:grid-cols-2">
            <Panel title="Competition teams" kicker="Roster strength">
              <ul className="flex flex-col gap-2.5">
                {o.teams.map((t) => (
                  <li key={t.id} className="flex items-center gap-3 text-sm">
                    <span className="h-7 w-1 rounded-full" style={{ background: t.accent }} />
                    <span className="flex-1 text-frost">{t.name}</span>
                    <span className="t-data text-chalk">{t.n}</span>
                    <span className="text-xs text-fog">members</span>
                  </li>
                ))}
              </ul>
            </Panel>
            <Panel title="Tracks" kicker="Members per discipline">
              <ul className="flex flex-col gap-3">
                {o.tracks.map((t) => (
                  <li key={t.id} className="text-xs">
                    <div className="mb-1.5 flex justify-between">
                      <span className="text-mist">
                        <span className="me-2 font-mono text-fog">{t.code}</span>
                        {t.name}
                      </span>
                      <span className="t-data text-chalk">{t.n}</span>
                    </div>
                    <Meter value={(t.n / maxTrack) * 100} />
                  </li>
                ))}
              </ul>
              {Object.keys(o.byDepartment).length > 0 && (
                <p className="mt-4 text-xs text-fog">
                  {Object.entries(o.byDepartment)
                    .filter(([k]) => k !== "none")
                    .map(([k, n]) => `${DEPARTMENT_LABEL[k as keyof typeof DEPARTMENT_LABEL] ?? k} ${n}`)
                    .join(" · ")}
                </p>
              )}
            </Panel>
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {o.nextCompetition && (
            <Panel title="Next competition" kicker="Countdown">
              <p className="font-display text-lg font-semibold text-chalk">{o.nextCompetition.name}</p>
              <p className="mt-1 text-sm text-mist">{o.nextCompetition.team ?? "All teams"}</p>
              {o.nextCompetition.startsAt && (
                <p className="t-display mt-4 text-4xl text-cyan">
                  {Math.max(0, Math.ceil((new Date(o.nextCompetition.startsAt).getTime() - Date.now()) / 864e5))}
                  <span className="ms-2 font-mono text-sm normal-case text-fog">days</span>
                </p>
              )}
            </Panel>
          )}
          <Panel title="Next 14 days" kicker="Calendar" action={can(actor.role, "events.view") ? <Link href="/command/calendar" className="text-xs text-cyan hover:underline">Calendar</Link> : undefined}>
            {o.upcoming.length ? (
              <ul className="flex flex-col gap-3">
                {o.upcoming.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className="flex w-12 shrink-0 flex-col items-center rounded-lg border border-[var(--line)] bg-deep/60 py-1.5">
                      <span className="font-mono text-[0.55rem] uppercase text-fog">{new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", month: "short" }).format(e.startsAt)}</span>
                      <span className="font-display text-lg font-bold leading-none text-chalk">{new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", day: "2-digit" }).format(e.startsAt)}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="block truncate text-sm text-frost">{e.title}</span>
                      <span className="block truncate text-xs text-fog">
                        {humanize(e.type)} · {new Intl.DateTimeFormat("en-GB", { timeZone: "Africa/Cairo", hour: "2-digit", minute: "2-digit" }).format(e.startsAt)}
                        {e.location ? ` · ${e.location}` : ""}
                      </span>
                    </span>
                  </li>
                ))}
              </ul>
            ) : (
              <EmptyPanel icon="calendar" title="Nothing scheduled" body="Sessions, workshops and deadlines in the next two weeks appear here." />
            )}
          </Panel>
          {o.tasks && (
            <Panel title="Due this week" kicker={can(actor.role, "tasks.manage") ? "All teams" : "Assigned to you"}>
              {o.tasks.dueSoon.length ? (
                <ul className="flex flex-col gap-2.5">
                  {o.tasks.dueSoon.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="min-w-0 truncate text-frost">{t.title}</span>
                      <StatusBadge status={t.priority} />
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fog">No tasks due in the next seven days.</p>
              )}
            </Panel>
          )}
          {o.inventory && (
            <Panel title="Low stock" kicker={`Inventory · ${o.inventory.items} items`} action={<Link href="/command/inventory" className="text-xs text-cyan hover:underline">Inventory</Link>}>
              {o.inventory.lowStock.length ? (
                <ul className="flex flex-col gap-2.5">
                  {o.inventory.lowStock.map((i) => (
                    <li key={i.id} className="flex items-center justify-between gap-3 text-sm">
                      <span className="truncate text-frost">{i.name}</span>
                      <span className={`t-data text-xs ${i.quantity === 0 ? "text-danger" : "text-warn"}`}>
                        {i.quantity} / min {i.min}
                      </span>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="text-sm text-fog">All tracked parts are above their restock threshold.</p>
              )}
            </Panel>
          )}
          {o.activity.length > 0 && (
            <Panel title="Recent activity" kicker="Audit log" action={<Link href="/command/audit" className="text-xs text-cyan hover:underline">Full log</Link>}>
              <ul className="flex flex-col gap-3">
                {o.activity.map((a) => (
                  <li key={a.id} className="text-xs">
                    <p className="text-frost">
                      <span className="font-mono text-cyan">{a.action}</span> {a.summary ?? ""}
                    </p>
                    <p className="mt-0.5 text-fog">
                      {a.actor} · {relTime(a.createdAt)}
                    </p>
                  </li>
                ))}
              </ul>
            </Panel>
          )}
          {o.unreadMessages !== null && (
            <Kpi label="Unread contact messages" value={String(o.unreadMessages).padStart(2, "0")} icon="mail" tone={o.unreadMessages ? "cyan" : "default"} href="/command/content?tab=messages" />
          )}
        </div>
      </div>
    </div>
  );
}
