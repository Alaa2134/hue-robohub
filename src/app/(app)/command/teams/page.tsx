import type { Metadata } from "next";
import Link from "next/link";
import { asc, count, eq } from "drizzle-orm";
import { PageHeader, StatusBadge } from "@/components/command/ui";
import { can } from "@/lib/permissions";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";
import { thumbUrl } from "@/server/media/present";

export const metadata: Metadata = { title: "Competition teams" };

export default async function TeamsAdmin() {
  const actor = await requirePage("competitions.view");
  const [teams, members] = await Promise.all([
    db.select({ t: s.competitionTeams, cover: s.mediaAssets }).from(s.competitionTeams).leftJoin(s.mediaAssets, eq(s.mediaAssets.id, s.competitionTeams.coverId)).orderBy(asc(s.competitionTeams.sortOrder)),
    db.select({ teamId: s.members.teamId, n: count() }).from(s.members).groupBy(s.members.teamId),
  ]);
  const n = new Map(members.map((m) => [m.teamId, m.n]));
  const manage = can(actor.role, "teams.manage");
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="People" title="Competition teams" description="The five competition squads — their robot, spec sheet, captain and look on the website. Members join a team from their member profile." />
      <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {teams.map(({ t, cover }) => (
          <li key={t.id} className="relative overflow-hidden rounded-2xl border border-[var(--line)] bg-deep/50 hover:border-[var(--line-2)]">
            <div className="relative aspect-[16/8] bg-panel">
              {thumbUrl(cover, 640) && <img src={thumbUrl(cover, 640)!} alt="" className="absolute inset-0 size-full object-cover" />}
              <span className="absolute inset-x-0 top-0 h-1" style={{ background: t.accent }} />
            </div>
            <div className="p-4">
              <p className="flex items-center gap-2">
                {manage ? (
                  <Link href={`/command/teams/${t.id}`} className="font-display font-semibold text-chalk after:absolute after:inset-0 hover:text-cyan">
                    {t.name}
                  </Link>
                ) : (
                  <span className="font-display font-semibold text-chalk">{t.name}</span>
                )}
                {!t.published && <StatusBadge status="inactive" label="Hidden" />}
              </p>
              <p className="mt-1 text-xs text-fog">{t.discipline}</p>
              <p className="mt-3 font-mono text-[0.65rem] text-mist">
                {n.get(t.id) ?? 0} members{t.robotName ? ` · ${t.robotName}` : ""}
              </p>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
