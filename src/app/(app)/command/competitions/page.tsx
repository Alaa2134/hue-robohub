import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Icon } from "@/components/brand/icons";
import { DataTable, EmptyPanel, PageHeader, StatusBadge, Tabs, humanize, type Column } from "@/components/command/ui";
import { formatDate } from "@/lib/format";
import { can } from "@/lib/permissions";
import { formatZoned } from "@/lib/zoned";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "Competitions" };

export default async function CompetitionsAdmin({ searchParams }: { searchParams: Promise<{ tab?: string; saved?: string; deleted?: string }> }) {
  const actor = await requirePage("competitions.view");
  const sp = await searchParams;
  const tab = sp.tab === "achievements" ? "achievements" : "competitions";
  const manage = can(actor.role, "competitions.manage");
  const [comps, achs] = await Promise.all([
    db.select({ c: s.competitions, team: s.competitionTeams.name, accent: s.competitionTeams.accent }).from(s.competitions).leftJoin(s.competitionTeams, eq(s.competitionTeams.id, s.competitions.teamId)).orderBy(desc(s.competitions.startsAt)),
    db.select({ a: s.achievements, team: s.competitionTeams.name }).from(s.achievements).leftJoin(s.competitionTeams, eq(s.competitionTeams.id, s.achievements.teamId)).orderBy(desc(s.achievements.achievedOn)),
  ]);
  type C = (typeof comps)[number];
  type A = (typeof achs)[number];
  const cCols: Column<C>[] = [
    { key: "name", label: "Competition", render: ({ c, team }) => <span className="min-w-0"><span className="block truncate">{c.name}</span><span className="block truncate text-xs font-normal text-fog">{[team, c.organizer, c.location].filter(Boolean).join(" · ") || "—"}</span></span> },
    { key: "when", label: "Date", render: ({ c }) => <span className="text-xs">{c.startsAt ? formatZoned(c.startsAt, { time: false }) : "TBA"}</span> },
    { key: "deadline", label: "Registration", render: ({ c }) => (c.registrationDeadline ? <span className={c.registrationDeadline < new Date() ? "text-xs text-steel" : "text-xs text-warn"}>{formatZoned(c.registrationDeadline, { time: false })}</span> : <span className="text-xs text-steel">—</span>) },
    { key: "status", label: "Status", render: ({ c }) => <StatusBadge status={c.status} /> },
    { key: "result", label: "Result", render: ({ c }) => <span className="text-xs">{c.result ?? (c.rank ? `#${c.rank}` : "—")}</span> },
  ];
  const aCols: Column<A>[] = [
    { key: "title", label: "Achievement", render: ({ a, team }) => <span className="min-w-0"><span className="block truncate">{a.title}</span><span className="block truncate text-xs font-normal text-fog">{team ?? "—"}</span></span> },
    { key: "kind", label: "Type", render: ({ a }) => <StatusBadge status={a.kind} tone={a.kind === "win" ? "gold" : "info"} label={humanize(a.kind)} /> },
    { key: "date", label: "Date", render: ({ a }) => <span className="text-xs">{formatDate(a.achievedOn)}</span> },
    { key: "public", label: "Website", render: ({ a }) => (a.public ? <StatusBadge status="active" label="Public" /> : <span className="text-xs text-steel">Hidden</span>) },
  ];
  const action = manage && (
    <Link href={tab === "achievements" ? "/command/competitions/achievement/new" : "/command/competitions/new"} className="btn btn-primary btn-sm">
      <span aria-hidden className="btn-sheen" />
      <Icon name="plus" size={15} />
      <span>{tab === "achievements" ? "Add achievement" : "Add competition"}</span>
    </Link>
  );

  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader kicker="Engineering" title="Competitions" description="Plan entries and deadlines, then record verified results. Public achievements feed the website timeline and team pages." actions={action} />
      {(sp.saved || sp.deleted) && <p className="mb-5 rounded-xl border border-ok/30 bg-ok/[0.07] px-4 py-3 text-sm text-[#bdf5dc]">{sp.saved ? "Saved." : "Deleted."}</p>}
      <Tabs
        current={tab === "achievements" ? "/command/competitions?tab=achievements" : "/command/competitions"}
        items={[
          { href: "/command/competitions", label: "Competitions", count: comps.length },
          { href: "/command/competitions?tab=achievements", label: "Achievements", count: achs.length },
        ]}
      />
      {tab === "competitions" ? (
        <DataTable columns={cCols} rows={comps} rowKey={(r) => r.c.id} rowHref={manage ? (r) => `/command/competitions/${r.c.id}` : undefined} caption="Competitions" empty={<EmptyPanel icon="trophy" title="No competitions yet" body="Add the next competition with its registration deadline so nobody misses it." />} />
      ) : (
        <DataTable columns={aCols} rows={achs} rowKey={(r) => r.a.id} rowHref={manage ? (r) => `/command/competitions/achievement/${r.a.id}` : undefined} caption="Achievements" empty={<EmptyPanel icon="award" title="No achievements recorded" body="Record wins, rankings, awards and certificates as they happen — only real, verifiable results." />} />
      )}
    </div>
  );
}
