import type { Metadata } from "next";
import { STATIC_SITE } from "@/lib/deploy";
import { LiveAchievements } from "@/components/live/live-content";
import Link from "next/link";
import { Icon } from "@/components/brand/icons";
import { Picture } from "@/components/media/picture";
import { Reveal } from "@/components/motion/reveal";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { dateParts, formatDate } from "@/lib/format";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getAchievements, getUpcomingCompetitions } from "@/server/queries/public";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/achievements", title: t.achievements.title, description: t.achievements.body, image: art("trophy", "hero")?.og });
}

export default async function Achievements({ params }: Params) {
  const { locale, t, p, href } = await resolvePage(params);
  if (STATIC_SITE)
    return (
      <>
        <PageHero eyebrow={t.achievements.eyebrow} title={t.achievements.title} body={t.achievements.body} image={art("trophy", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.achievements }]} size="md" />
        <Band>
          <LiveAchievements locale={locale} />
        </Band>
      </>
    );
  const [items, upcoming] = await Promise.all([getAchievements(), getUpcomingCompetitions()]);
  const kinds = Object.entries(items.reduce<Record<string, number>>((a, x) => ((a[x.kind] = (a[x.kind] ?? 0) + 1), a), {}));

  return (
    <>
      <PageHero
        eyebrow={t.achievements.eyebrow}
        title={t.achievements.title}
        body={t.achievements.body}
        image={art("trophy", "hero")}
        accent="#e8b45c"
        crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.achievements }]}
        meta={kinds.length ? kinds.map(([k, n]) => ({ label: p.achievements.kinds[k] ?? k, value: String(n).padStart(2, "0") })) : undefined}
      />
      <Band>
        {items.length ? (
          <ol className="relative mx-auto max-w-4xl border-s border-[var(--line-2)]">
            {items.map((a, i) => (
              <Reveal as="li" key={a.id} delay={(i % 4) * 60} className="relative pb-10 ps-8 sm:ps-12">
                <span aria-hidden className="absolute -start-[0.55rem] top-2 size-4 rotate-45 border-2 border-gold bg-void shadow-[0_0_14px_rgb(232_180_92/0.6)]" />
                <p className="t-data text-xs text-gold">{a.achievedOn ? formatDate(a.achievedOn, locale) : ""}</p>
                <div className="frame mt-3 grid overflow-hidden sm:grid-cols-[1fr_auto]">
                  <div className="p-6">
                    <p className="t-eyebrow text-[0.58rem] text-fog">{p.achievements.kinds[a.kind] ?? a.kind}</p>
                    <h2 className="t-headline mt-2 text-2xl text-chalk">{a.title}</h2>
                    {a.description && <p className="mt-2 text-sm leading-relaxed text-mist">{a.description}</p>}
                    <div className="mt-4 flex flex-wrap gap-2 text-sm">
                      {a.rank && <span className="rounded-full bg-gold/15 px-3 py-1 font-mono text-gold">#{a.rank}</span>}
                      {a.teamName && (
                        <Link href={href(`/competitions/${a.teamSlug}`)} className="rounded-full border px-3 py-1" style={{ borderColor: a.teamAccent ?? undefined, color: a.teamAccent ?? undefined }}>
                          {a.teamName}
                        </Link>
                      )}
                      {a.competitionName && <span className="rounded-full border border-[var(--line-2)] px-3 py-1 text-mist">{a.competitionName}</span>}
                      {a.project && (
                        <Link href={href(`/projects/${a.project.slug}`)} className="rounded-full border border-[var(--line-2)] px-3 py-1 text-cyan">
                          {a.project.title}
                        </Link>
                      )}
                    </div>
                  </div>
                  {a.image && (
                    <div className="relative min-h-40 sm:w-56">
                      <Picture image={a.image} sizes="14rem" className="absolute inset-0 h-full w-full" />
                    </div>
                  )}
                </div>
              </Reveal>
            ))}
          </ol>
        ) : (
          <EmptyState icon="trophy" title={t.achievements.title} body={t.achievements.empty} />
        )}
      </Band>
      {upcoming.length > 0 && (
        <Band alt>
          <SectionHead index="02" eyebrow={p.achievements.upcoming} title={t.teams.competitionsEntered} accent="#e8b45c" size="md" />
          <ul className="mt-10 grid gap-3 md:grid-cols-2">
            {upcoming.map((c) => {
              const d = c.startsAt ? dateParts(c.startsAt, locale) : null;
              return (
                <li key={c.id} className="frame flex items-center gap-5 p-5">
                  <Icon name="flag" size={20} style={{ color: c.teamAccent ?? "#ff3b4e" }} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-chalk">{c.name}</span>
                    <span className="block truncate text-sm text-fog">{[d ? `${d.day} ${d.month} ${d.year}` : null, c.location].filter(Boolean).join(" · ")}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </Band>
      )}
    </>
  );
}
