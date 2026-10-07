import type { Metadata } from "next";
import { buildItems, buildSiteSettings, buildTeam } from "@/lib/build-content";
import { goalsOf, heroImageOf } from "@/lib/site-settings";
import { STATIC_SITE } from "@/lib/deploy";
import { notFound } from "next/navigation";
import { ActivitiesSection, GoalsSection, RoadmapSection, WhySection } from "@/components/home/buildx";
import { Garage, type GarageTeam } from "@/components/home/garage";
import { Hero, type HeroStat } from "@/components/home/hero";
import { TrackPanels, type TrackPanel } from "@/components/home/tracks";
import { TeamDirectory } from "@/components/team/team-directory";
import { LatestStrip, LivePartners, LiveTestimonials } from "@/components/live/live-content";
import type { Film } from "@/components/media/film";
import { Reveal } from "@/components/motion/reveal";
import { ButtonLink } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/section-head";
import { ACTIVITIES } from "@/content/buildx";
import { teamText, trackTech } from "@/content/core-content";
import { getDictionary, isLocale, localePath, type Locale } from "@/i18n";
import { art } from "@/lib/media-library";
import { pageMeta } from "@/lib/seo";
import { pick } from "@/lib/site-config";
import type { VideoSource } from "@/lib/types";
import { teamArt, trackWorld } from "@/lib/worlds";
import { getOrgStats, getSiteConfig, getTeamsWithSpecs, getTracks, getVideos } from "@/server/queries/public";

export const revalidate = 3600;

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};
  const config = await getSiteConfig();
  return pageMeta({ locale, path: "/", description: (locale === "ar" && config["site.seo"].descriptionAr) || config["site.seo"].description });
}

const KIND_KICKER: Record<string, string> = { hero: "Hero film", story: "Who we are", showreel: "Competition showreel", promo: "Bootcamp promo" };

function toFilm(v: VideoSource): Film {
  return { id: v.id, title: v.title, description: v.description, kicker: KIND_KICKER[v.kind] ?? v.kind, hls: v.hls, youtubeId: v.youtubeId, poster: v.poster, durationSeconds: v.durationSeconds };
}

export default async function Home({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: raw } = await params;
  if (!isLocale(raw)) notFound();
  const locale = raw as Locale;
  const t = getDictionary(locale);
  const href = (p: string) => localePath(locale, p);

  const [config, stats, tracks, teams, videos] = await Promise.all([getSiteConfig(), getOrgStats(), getTracks(), getTeamsWithSpecs(), getVideos()]);
  const show = config["site.homepage"].sections;
  const hero = config["site.hero"];
  const settings = STATIC_SITE ? await buildSiteSettings() : null;

  // Films (CMS): the configured hero film first, then one per kind.
  const films = videos.map(toFilm);
  const heroFilm = (hero.videoId && films.find((f) => f.id === hero.videoId)) || films.find((_, i) => videos[i]!.kind === "hero") || null;
  const ambient = heroFilm?.hls ? heroFilm : null;

  const heroStats: HeroStat[] = [
    { value: tracks.length, label: t.stats.tracks },
    { value: teams.length, label: t.stats.teams },
    { value: ACTIVITIES.length, label: locale === "ar" ? "أنواع أنشطة" : "Activity types" },
    ...(stats.members > 0 ? [{ value: stats.members, label: t.stats.members }] : []),
    ...(stats.activeProjects > 0 ? [{ value: stats.activeProjects, label: t.stats.activeProjects }] : []),
    ...(stats.events > 0 ? [{ value: stats.events, label: t.stats.events }] : []),
  ].slice(0, 4);

  const trackPanels: TrackPanel[] = tracks.map((tr) => {
    const w = trackWorld(tr.slug);
    return {
      slug: tr.slug,
      href: href(`/tracks/${tr.slug}`),
      code: tr.code,
      name: (locale === "ar" && tr.nameAr) || tr.name,
      tagline: (locale === "ar" && tr.taglineAr) || tr.tagline,
      tech: trackTech(tr.slug, locale, tr.technologies),
      accent: w.accent,
      image: art(...w.art),
      stats: [tr.memberCount > 0 ? `${tr.memberCount} ${t.common.members}` : "", tr.projectCount > 0 ? `${tr.projectCount} ${t.common.projects}` : ""].filter(Boolean),
    };
  });

  const garage: GarageTeam[] = teams.map((raw) => teamText(raw, locale)).map((tm) => ({
    slug: tm.slug,
    href: href(`/competitions/${tm.slug}`),
    code: tm.code,
    name: (locale === "ar" && tm.nameAr) || tm.name,
    tagline: tm.discipline,
    summary: tm.summary,
    accent: tm.accent,
    image: art(...teamArt(tm.slug)),
    specs: tm.specs,
    members: tm.memberCount,
  }));

  return (
    <>
      <Hero locale={locale} t={t} hero={hero} image={heroImageOf(settings) ?? art("hero")} stats={heroStats} film={heroFilm} ambient={ambient} thumbs={["team_sprint", "track_embedded", "team_sumo"].map((n) => art(n)).filter((e) => !!e) as NonNullable<ReturnType<typeof art>>[]} />

      <LatestStrip locale={locale} eventsHref={`${href("/events")}/`} newsHref={`${href("/news")}/`} />

      <WhySection locale={locale} index="01" />

      {show.tracks && (
        <section id="tracks" aria-labelledby="tracks-title" className="relative mx-auto max-w-[1680px] px-5 py-24 sm:px-8 lg:py-36">
          <SectionHead
            id="tracks-title"
            index="02"
            eyebrow={t.home.tracksEyebrow}
            title={t.home.tracksTitle}
            body={t.home.tracksBody}
            action={
              <ButtonLink href={href("/tracks")} arrow>
                {t.common.viewAll}
              </ButtonLink>
            }
          />
          <Reveal className="mt-14">
            <TrackPanels tracks={trackPanels} cta={t.common.learnMore} />
          </Reveal>
        </section>
      )}

      <ActivitiesSection locale={locale} index="03" />

      {show.teams && garage.length > 0 && (
        <section id="compete" aria-labelledby="compete-title" className="carbon relative overflow-hidden border-y border-[var(--line)] py-24 lg:py-36">
          <div aria-hidden className="speedlines absolute inset-0" />
          <div className="relative mx-auto max-w-[1680px] px-5 sm:px-8">
            <header className="mb-14 grid gap-6 lg:grid-cols-12 lg:items-end">
              <div className="lg:col-span-8">
                <Reveal as="p" className="t-eyebrow mb-5 flex items-center gap-3 text-mist">
                  <span className="t-data text-team-sumo">04</span>
                  <span className="h-px w-8 bg-team-sumo" />
                  {t.home.teamsEyebrow} · {locale === "ar" ? "موسم 2026 – 2027" : "Season 2026 – 2027"}
                </Reveal>
                <h2 id="compete-title" className="t-display origin-bottom-left text-[clamp(3rem,9vw,8.6rem)] text-chalk [transform:skewX(-8deg)] rtl:origin-bottom-right">
                  <span className="block">{locale === "ar" ? "صُممت" : "Built to"}</span>
                  <span className="block text-transparent [-webkit-text-stroke:1.5px_var(--color-chalk)]">{locale === "ar" ? "لتنافس" : "compete"}</span>
                </h2>
              </div>
              <Reveal delay={120} className="lg:col-span-4">
                <p className="max-w-md text-pretty text-mist lg:ms-auto">{t.teams.body}</p>
                <div className="mt-6 flex gap-1.5" aria-hidden>
                  {garage.map((g) => (
                    <span key={g.slug} className="h-1.5 flex-1 [transform:skewX(-20deg)]" style={{ background: g.accent }} />
                  ))}
                </div>
              </Reveal>
            </header>
            <Garage teams={garage} labels={{ specs: t.teams.specs, open: t.common.learnMore, members: t.common.members }} />
          </div>
        </section>
      )}

      <RoadmapSection locale={locale} index="05" eventsHref={href("/events")} />

      <GoalsSection locale={locale} goals={goalsOf(settings).map((g) => ({ value: g.value, label: { en: g.label_en || g.label_ar, ar: g.label_ar || g.label_en }, note: { en: g.note_en || g.note_ar, ar: g.note_ar || g.note_en } }))} />

      {STATIC_SITE && <LiveTestimonials locale={locale} title={locale === "ar" ? "قالوا عن BuildX HUE" : "What students say"} initial={await buildItems("testimonial")} />}

      <section id="founders" aria-labelledby="founders-title" className="mx-auto max-w-[1680px] px-5 py-20 sm:px-8 lg:py-28">
        <SectionHead
          id="founders-title"
          index="06"
          eyebrow={locale === "ar" ? "الفريق المؤسس" : "Founding team"}
          title={locale === "ar" ? "الناس اللي بدأوا الحكاية" : "The people who started BuildX HUE"}
          action={
            <ButtonLink href={`${href("/team")}/`} arrow>
              {locale === "ar" ? "كل الفريق" : "Meet the team"}
            </ButtonLink>
          }
        />
        <div className="mt-12">
          <TeamDirectory locale={locale} memberHref={`${href("/team")}/`} variant="founders" initial={STATIC_SITE ? await buildTeam() : undefined} />
        </div>
      </section>

      {STATIC_SITE && <LivePartners locale={locale} title={locale === "ar" ? "شركاؤنا والرعاة" : "Partners & sponsors"} initial={await buildItems("partner")} />}

      <p className="sr-only">{pick(config["site.homepage"].manifesto, locale)}</p>
    </>
  );
}
