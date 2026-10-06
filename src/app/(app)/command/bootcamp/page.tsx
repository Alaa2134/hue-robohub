import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, count, eq } from "drizzle-orm";
import { Icon } from "@/components/brand/icons";
import { ProgressMatrix } from "@/components/command/bootcamp-ui";
import { EmptyPanel, PageHeader, Panel, StatusBadge } from "@/components/command/ui";
import { can } from "@/lib/permissions";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "Bootcamp" };

export default async function BootcampAdmin() {
  const actor = await requirePage("bootcamp.view");
  const manage = can(actor.role, "bootcamp.manage");
  const [weeks, lessons, trainees, progress] = await Promise.all([
    db.select().from(s.bootcampModules).orderBy(asc(s.bootcampModules.week)),
    db.select({ moduleId: s.bootcampLessons.moduleId, n: count() }).from(s.bootcampLessons).groupBy(s.bootcampLessons.moduleId),
    manage ? db.select({ id: s.members.id, name: s.members.fullName }).from(s.members).where(and(eq(s.members.rank, "trainee"), eq(s.members.status, "active"))).orderBy(asc(s.members.fullName)) : Promise.resolve([]),
    db.select().from(s.bootcampProgress),
  ]);
  const ln = new Map(lessons.map((l) => [l.moduleId, l.n]));
  const prog = Object.fromEntries(progress.map((p) => [`${p.memberId}:${p.moduleId}`, p.status]));
  const mine = actor.memberId ? weeks.map((w) => ({ w, st: prog[`${actor.memberId}:${w.id}`] ?? "not_started" })) : [];

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        kicker="Engineering"
        title="Bootcamp"
        description="The week-by-week curriculum shown on the website, plus trainee progress. Edit a week to change its lessons and outcomes."
        actions={
          manage && (
            <Link href="/command/bootcamp/new" className="btn btn-primary btn-sm">
              <span aria-hidden className="btn-sheen" />
              <Icon name="plus" size={15} />
              <span>Add week</span>
            </Link>
          )
        }
      />
      <div className="flex flex-col gap-6">
        <Panel title="Curriculum" kicker={`${weeks.length} weeks`}>
          {!weeks.length ? (
            <EmptyPanel icon="robot" title="No weeks yet" body="The website shows the built-in curriculum until weeks are added here." />
          ) : (
            <ol className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {weeks.map((w) => (
                <li key={w.id} className="relative rounded-xl border border-[var(--line)] bg-deep/40 p-4 hover:border-[var(--line-2)]">
                  <p className="font-mono text-[0.62rem] text-cyan">WEEK {String(w.week).padStart(2, "0")}</p>
                  {manage ? (
                    <Link href={`/command/bootcamp/${w.id}`} className="mt-1 block font-display font-semibold text-chalk after:absolute after:inset-0 hover:text-cyan">
                      {w.title}
                    </Link>
                  ) : (
                    <p className="mt-1 font-display font-semibold text-chalk">{w.title}</p>
                  )}
                  <p className="mt-1 line-clamp-2 text-xs text-fog">{w.summary}</p>
                  <p className="mt-3 flex items-center gap-2 font-mono text-[0.62rem] text-mist">
                    {ln.get(w.id) ?? 0} lessons {!w.published && <StatusBadge status="inactive" label="Hidden" />}
                  </p>
                </li>
              ))}
            </ol>
          )}
        </Panel>
        {manage && (
          <Panel title="Trainee progress">
            <ProgressMatrix weeks={weeks.map((w) => ({ id: w.id, week: w.week }))} trainees={trainees} progress={prog} canEdit={manage} />
          </Panel>
        )}
        {mine.length > 0 && !manage && (
          <Panel title="My progress">
            <ul className="divide-y divide-[var(--line)]">
              {mine.map(({ w, st }) => (
                <li key={w.id} className="flex items-center justify-between py-2 text-sm">
                  <span className="text-mist">
                    Week {w.week} · {w.title}
                  </span>
                  <StatusBadge status={st} tone={st === "passed" ? "ok" : st === "failed" ? "danger" : st === "not_started" ? "neutral" : "progress"} />
                </li>
              ))}
            </ul>
          </Panel>
        )}
      </div>
    </div>
  );
}
