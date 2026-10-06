import type { Metadata } from "next";
import Link from "next/link";
import { Icon, TEAM_ICON } from "@/components/brand/icons";
import { Garage, type GarageTeam } from "@/components/home/garage";
import { Picture } from "@/components/media/picture";
import { Reveal } from "@/components/motion/reveal";
import { Tilt } from "@/components/motion/tilt";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { dateParts } from "@/lib/format";
import { art } from "@/lib/media-library";
import { loc, resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { teamText } from "@/content/core-content";
import { teamArt } from "@/lib/worlds";
import { getTeamsWithSpecs, getUpcomingCompetitions } from "@/server/queries/public";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t, p } = await resolvePage(params);
  return pageMeta({ locale, path: "/competitions", title: t.teams.title, description: p.competitions.heroBody, image: art("arena", "team_sprint", "hero")?.og });
}

export default async function Competitions({ params }: Params) {
  const { locale, t, p, href } = await resolvePage(params);
  const [rawTeams, upcoming] = await Promise.all([getTeamsWithSpecs(), getUpcomingCompetitions()]);
  const teams = rawTeams.map((tm) => teamText(tm, locale));
  const garage: GarageTeam[] = teams.map((tm) => ({
    slug: tm.slug,
    href: href(`/competitions/${tm.slug}`),
    code: tm.code,
    name: loc(locale, tm.name, tm.nameAr),
    tagline: tm.discipline,
    summary: tm.summary,
    accent: tm.accent,
    image: art(...teamArt(tm.slug)),
    specs: tm.specs,
    members: tm.memberCount,
  }));

  return (
    <>
      <PageHero
        eyebrow={`${t.teams.eyebrow} · ${locale === "ar" ? "موسم ٢٠٢٦" : "Season 2026"}`}
        title={locale === "ar" ? "صُممت لتنافس" : "Built to compete"}
        body={p.competitions.heroBody}
        image={art("arena", "team_sprint", "hero")}
        accent="#ff3b4e"
        crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.competitions }]}
      >
        <div aria-hidden className="mt-10 flex max-w-xl gap-1.5">
          {teams.map((tm) => (
            <span key={tm.slug} className="h-1.5 flex-1 [transform:skewX(-20deg)]" style={{ background: tm.accent }} />
          ))}
        </div>
      </PageHero>

      <section className="carbon relative overflow-hidden border-y border-[var(--line)]">
        <div aria-hidden className="speedlines absolute inset-0" />
        <div className="relative mx-auto max-w-[1680px] px-5 py-20 sm:px-8 lg:py-28">
          <SectionHead index="01" eyebrow={p.competitions.garageTitle} title={t.teams.title} body={t.teams.body} accent="#ff3b4e" size="md" />
          <div className="mt-12">
            <Garage teams={garage} labels={{ specs: t.teams.specs, open: p.competitions.open, members: t.common.members }} />
          </div>
        </div>
      </section>

      <Band>
        <SectionHead index="02" eyebrow={p.competitions.teamsTitle} title={locale === "ar" ? "خمسة فرق" : "Five teams"} accent="#ff3b4e" size="md" />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {teams.map((tm, i) => {
            const img = art(...teamArt(tm.slug));
            return (
              <Reveal key={tm.slug} delay={i * 60}>
                <Tilt max={5} className="h-full">
                  <Link href={href(`/competitions/${tm.slug}`)} className="frame group relative flex h-full min-h-[26rem] flex-col justify-end overflow-hidden !rounded-[18px] p-6">
                    {img && <Picture image={img} sizes="(min-width:1280px) 20vw, (min-width:640px) 50vw, 100vw" decorative className="absolute inset-0 h-full w-full transition-transform duration-[1400ms] ease-[var(--ease-out-expo)] group-hover:scale-105" />}
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/50 to-transparent" />
                    <div aria-hidden className="livery absolute -end-8 top-0 h-full w-24 opacity-70" style={{ ["--a" as string]: tm.accent }} />
                    <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: tm.accent }} />
                    <div className="relative">
                      <span className="t-display block text-5xl text-transparent [-webkit-text-stroke:1px_rgb(255_255_255/0.35)] [transform:skewX(-10deg)]" dir="ltr">
                        {String(i + 1).padStart(2, "0")}
                      </span>
                      <div className="mt-3 flex items-center gap-2">
                        <Icon name={TEAM_ICON[tm.slug] ?? "robot"} size={18} style={{ color: tm.accent }} />
                        <p className="t-headline text-2xl text-chalk">{loc(locale, tm.name, tm.nameAr)}</p>
                      </div>
                      <p className="mt-1 text-xs" style={{ color: tm.accent }}>
                        {tm.discipline}
                      </p>
                      <p className="mt-3 line-clamp-3 text-sm text-mist">{tm.summary}</p>
                    </div>
                  </Link>
                </Tilt>
              </Reveal>
            );
          })}
        </div>
      </Band>

      <Band alt>
        <SectionHead index="03" eyebrow={p.competitions.calendar} title={t.home.eventsTitle} accent="#ff3b4e" size="md" />
        <div className="mt-12">
          {upcoming.length ? (
            <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
              {upcoming.map((c) => {
                const d = c.startsAt ? dateParts(c.startsAt, locale) : null;
                return (
                  <li key={c.id} className="grid grid-cols-[4.5rem_1fr] items-center gap-5 py-5 sm:grid-cols-[6rem_1fr_auto]">
                    <span className="t-data">
                      <span className="block text-3xl leading-none text-chalk">{d?.day ?? "—"}</span>
                      <span className="text-[0.65rem] uppercase text-fog">{d ? `${d.month} ${d.year}` : ""}</span>
                    </span>
                    <span className="min-w-0">
                      <span className="t-title block truncate text-lg text-chalk">{c.name}</span>
                      <span className="block truncate text-sm text-fog">{[c.organizer, c.location].filter(Boolean).join(" · ")}</span>
                    </span>
                    {c.teamName && (
                      <span className="hidden rounded-full px-3 py-1 text-xs text-void sm:block" style={{ background: c.teamAccent ?? "#2b6dff" }}>
                        {c.teamName}
                      </span>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon="calendar" title={p.competitions.calendar} body={p.competitions.calendarEmpty} />
          )}
        </div>
      </Band>
    </>
  );
}
