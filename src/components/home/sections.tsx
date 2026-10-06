import Link from "next/link";
import { Icon } from "@/components/brand/icons";
import { FilmLauncher, formatDuration, type Film } from "@/components/media/film";
import { Picture } from "@/components/media/picture";
import { Reveal } from "@/components/motion/reveal";
import { Tilt } from "@/components/motion/tilt";
import { ButtonLink } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/section-head";
import { localePath, type Locale } from "@/i18n/config";
import type { Dictionary } from "@/i18n";
import { dateParts, formatDate, PROJECT_STATUS_LABEL } from "@/lib/format";
import type { LibraryEntry } from "@/lib/media-library";
import type { PublicImage } from "@/lib/types";
import type { EventCard, ProjectCard } from "@/server/queries/public";


/* ─── Projects ─────────────────────────────────────────────────────────── */

export function WorkSection({ locale, t, projects, showcase }: { locale: Locale; t: Dictionary; projects: ProjectCard[]; showcase: LibraryEntry | null }) {
  const href = (p: string) => localePath(locale, p);
  const [lead, ...rest] = projects;
  return (
    <section id="work" aria-labelledby="work-title" className="relative mx-auto max-w-[1680px] px-5 py-24 sm:px-8 lg:py-36">
      <SectionHead
        id="work-title"
        index="05"
        eyebrow={t.home.projectsEyebrow}
        title={t.home.projectsTitle}
        body={t.projects.body}
        action={projects.length > 0 ? <ButtonLink href={href("/projects")} arrow>{t.common.viewAll}</ButtonLink> : undefined}
      />
      {lead ? (
        <div className="mt-14 grid gap-4 lg:grid-cols-12">
          <ProjectTile project={lead} locale={locale} big className="lg:col-span-7" />
          <div className="grid gap-4 lg:col-span-5">
            {rest.slice(0, 2).map((p) => (
              <ProjectTile key={p.id} project={p} locale={locale} />
            ))}
          </div>
        </div>
      ) : (
        <Reveal className="mt-14">
          <div className="frame relative isolate overflow-hidden !rounded-[20px]">
            {showcase && <Picture image={showcase} sizes="100vw" decorative className="absolute inset-0 -z-10 h-full w-full opacity-70" />}
            <div aria-hidden className="absolute inset-0 -z-10 bg-gradient-to-r from-void via-void/80 to-void/20 rtl:bg-gradient-to-l" />
            <div className="grid gap-10 p-8 sm:p-12 lg:grid-cols-2 lg:p-16">
              <div>
                <p className="t-eyebrow flex items-center gap-2 text-warn">
                  <span className="size-1.5 animate-pulse-dot rounded-full bg-warn" />
                  On the bench
                </p>
                <p className="t-headline mt-4 max-w-lg text-[clamp(1.6rem,3vw,2.4rem)] text-chalk">{t.home.projectsEmpty}</p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <ButtonLink href={href("/join")} variant="primary" arrow>
                    {t.nav.join}
                  </ButtonLink>
                  <ButtonLink href={href("/tracks")}>{t.nav.tracks}</ButtonLink>
                </div>
              </div>
              <ol className="grid grid-cols-2 gap-px self-end overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-4" aria-label={t.projects.timeline}>
                {["idea", "design", "prototype", "testing", "competition_ready", "completed"].slice(0, 4).map((k, i) => (
                  <li key={k} className="bg-void/75 p-4 backdrop-blur">
                    <span className="t-data text-[0.65rem] text-cyan">{String(i + 1).padStart(2, "0")}</span>
                    <p className="mt-6 text-sm text-frost">{PROJECT_STATUS_LABEL[k]}</p>
                  </li>
                ))}
              </ol>
            </div>
          </div>
        </Reveal>
      )}
    </section>
  );
}

function ProjectTile({ project: p, locale, big, className }: { project: ProjectCard; locale: Locale; big?: boolean; className?: string }) {
  return (
    <Reveal className={className}>
      <Tilt max={3} className="h-full">
        <Link href={localePath(locale, `/projects/${p.slug}`)} className={`frame group relative flex h-full flex-col justify-end overflow-hidden !rounded-[18px] ${big ? "min-h-[30rem] p-8 lg:min-h-[38rem]" : "min-h-[18rem] p-6"}`}>
          {p.hero && <Picture image={p.hero} sizes={big ? "60vw" : "40vw"} className="absolute inset-0 h-full w-full transition-transform duration-[1400ms] ease-[var(--ease-out-expo)] group-hover:scale-105" />}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/50 to-transparent" />
          <div className="relative">
            <div className="flex flex-wrap items-center gap-2">
              {p.track && <span className="t-eyebrow rounded-full border border-[var(--line-2)] bg-void/60 px-2.5 py-1 text-[0.56rem] text-mist">{p.track.code}</span>}
              <span className="t-eyebrow text-[0.56rem] text-cyan">{PROJECT_STATUS_LABEL[p.status] ?? p.status}</span>
            </div>
            <h3 className={`t-headline mt-3 text-chalk ${big ? "text-[clamp(1.8rem,3vw,2.8rem)]" : "text-xl"}`}>{p.title}</h3>
            <p className="mt-2 line-clamp-2 max-w-xl text-sm text-mist">{p.summary}</p>
            <div className="mt-5 flex items-center gap-3">
              <div className="h-[3px] flex-1 overflow-hidden rounded-full bg-white/10">
                <div className="h-full rounded-full bg-gradient-to-r from-volt to-cyan" style={{ width: `${p.progress}%` }} />
              </div>
              <span className="t-data text-xs text-mist">{p.progress}%</span>
            </div>
          </div>
        </Link>
      </Tilt>
    </Reveal>
  );
}

/* ─── Media wall ───────────────────────────────────────────────────────── */

export type WallItem = { id: string; image: LibraryEntry | PublicImage; caption: string; tag: string };

export function MediaWall({ locale, t, items, films }: { locale: Locale; t: Dictionary; items: WallItem[]; films: Film[] }) {
  if (!items.length && !films.length) return null;
  const href = (p: string) => localePath(locale, p);
  const spans = ["sm:col-span-2 sm:row-span-2", "", "", "sm:row-span-2", "", "sm:col-span-2", "", ""];
  return (
    <section id="media" aria-labelledby="media-title" className="relative border-t border-[var(--line)] bg-abyss py-24 lg:py-36">
      <div className="mx-auto max-w-[1680px] px-5 sm:px-8">
        <SectionHead
          id="media-title"
          index="06"
          eyebrow={t.gallery.eyebrow}
          title={t.gallery.title}
          body={t.gallery.body}
          action={
            <div className="flex gap-2">
              <ButtonLink href={href("/gallery")} arrow>
                {t.nav.gallery}
              </ButtonLink>
              <ButtonLink href={href("/films")}>{t.nav.films}</ButtonLink>
            </div>
          }
        />

        {films.length > 0 && (
          <div className="rail -mx-5 mt-14 gap-4 px-5 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 xl:grid-cols-4">
            {films.map((f, i) => (
              <Reveal key={f.id} delay={i * 80} className="w-[80vw] sm:w-auto">
                <FilmLauncher film={f} className="frame group relative block aspect-video w-full overflow-hidden !rounded-[16px] text-start" closeLabel={t.nav.close}>
                  {f.poster && <img src={f.poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1200ms] ease-[var(--ease-out-expo)] group-hover:scale-105" />}
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/20 to-transparent" />
                  <span className="absolute start-4 top-4 flex size-11 items-center justify-center rounded-full border border-white/25 bg-void/40 text-white backdrop-blur-md transition-transform duration-500 group-hover:scale-110">
                    <Icon name="play" size={16} className="translate-x-px" />
                  </span>
                  <span className="absolute inset-x-0 bottom-0 p-4">
                    {f.kicker && <span className="t-eyebrow block text-[0.56rem] text-cyan">{f.kicker}</span>}
                    <span className="t-title mt-1 block text-base text-chalk">{f.title}</span>
                    <span className="t-data mt-1 block text-[0.65rem] text-fog">{formatDuration(f.durationSeconds)}</span>
                  </span>
                </FilmLauncher>
              </Reveal>
            ))}
          </div>
        )}

        {items.length > 0 && (
          <div className="mt-4 grid auto-rows-[11rem] grid-cols-2 gap-3 sm:auto-rows-[13rem] sm:grid-cols-4 sm:gap-4 lg:auto-rows-[15rem]">
            {items.slice(0, 8).map((it, i) => (
              <Reveal key={it.id} delay={(i % 4) * 70} className={`group relative overflow-hidden rounded-[14px] ${spans[i] ?? ""}`}>
                <Picture image={it.image} sizes="(min-width:640px) 50vw, 100vw" alt={it.caption} className="absolute inset-0 h-full w-full transition-transform duration-[1400ms] ease-[var(--ease-out-expo)] group-hover:scale-[1.04]" />
                <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void/85 via-transparent to-transparent opacity-80 transition-opacity group-hover:opacity-100" />
                <div className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-3 p-3 sm:p-4">
                  <p className="line-clamp-2 text-xs text-frost sm:text-sm">{it.caption}</p>
                  <span className="t-eyebrow shrink-0 text-[0.52rem] text-fog">{it.tag}</span>
                </div>
              </Reveal>
            ))}
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── Season: achievements + calendar ─────────────────────────────────── */

type Achievement = { id: string; title: string; kind: string; achievedOn: string | null; rank: number | null; teamName: string | null; teamAccent: string | null };
type Competition = { id: string; name: string; location: string | null; startsAt: string | null; teamName: string | null; teamAccent: string | null };

export function SeasonSection({
  locale,
  t,
  achievements,
  competitions,
  events,
  trophy,
}: {
  locale: Locale;
  t: Dictionary;
  achievements: Achievement[];
  competitions: Competition[];
  events: EventCard[];
  trophy: LibraryEntry | null;
}) {
  const href = (p: string) => localePath(locale, p);
  const upcoming = [
    ...competitions.map((c) => ({ id: c.id, title: c.name, when: c.startsAt, where: c.location, tag: c.teamName ?? "Competition", accent: c.teamAccent ?? "#ff3b4e", href: "/competitions" })),
    ...events.map((e) => ({ id: e.id, title: e.title, when: e.startsAt, where: e.location, tag: e.type, accent: "#38dcff", href: `/events/${e.slug}` })),
  ]
    .filter((x) => x.when)
    .sort((a, b) => a.when!.localeCompare(b.when!))
    .slice(0, 4);

  return (
    <section id="season" aria-labelledby="season-title" className="relative overflow-hidden py-24 lg:py-36">
      <div className="mx-auto grid max-w-[1680px] gap-12 px-5 sm:px-8 lg:grid-cols-12 lg:gap-16">
        <div className="lg:col-span-5">
          <SectionHead id="season-title" index="07" eyebrow={t.home.achievementsEyebrow} title={t.home.achievementsTitle} size="md" className="!block" />
          <Reveal className="relative mt-10">
            <div className="frame relative aspect-[4/5] overflow-hidden !rounded-[20px] sm:aspect-[5/4] lg:aspect-[4/5]" style={{ ["--edge" as string]: 0.5 }}>
              {trophy && <Picture image={trophy} sizes="(min-width:1024px) 40vw, 100vw" className="absolute inset-0 h-full w-full" />}
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/10 to-transparent" />
              <div className="absolute inset-x-0 bottom-0 p-6 sm:p-8">
                {achievements.length ? (
                  <>
                    <p className="t-display text-[clamp(3rem,6vw,5rem)] text-chrome" dir="ltr">
                      {String(achievements.length).padStart(2, "0")}
                    </p>
                    <p className="t-eyebrow text-gold">{t.stats.achievements}</p>
                  </>
                ) : (
                  <p className="max-w-sm text-pretty text-frost">{t.achievements.empty}</p>
                )}
              </div>
            </div>
          </Reveal>
        </div>

        <div className="flex flex-col gap-10 lg:col-span-7 lg:pt-28">
          {achievements.length > 0 && (
            <ol className="relative space-y-1 border-s border-[var(--line-2)] ps-6">
              {achievements.slice(0, 5).map((a, i) => (
                <Reveal as="li" key={a.id} delay={i * 70} className="relative py-3">
                  <span aria-hidden className="absolute -start-[1.85rem] top-5 size-2.5 rotate-45 border border-gold bg-void" />
                  <p className="t-data text-[0.65rem] text-fog">{a.achievedOn ? formatDate(a.achievedOn, locale) : ""}</p>
                  <p className="t-title mt-1 text-lg text-chalk">{a.title}</p>
                  <p className="mt-0.5 text-sm text-mist">{[a.rank ? `#${a.rank}` : null, a.teamName].filter(Boolean).join(" · ")}</p>
                </Reveal>
              ))}
            </ol>
          )}

          <div>
            <div className="flex items-center justify-between gap-4">
              <p className="t-eyebrow text-mist">{t.home.eventsTitle}</p>
              <Link href={href("/events")} className="t-label flex items-center gap-2 text-cyan">
                {t.common.viewAll}
                <Icon name="arrow" size={14} className="rtl:-scale-x-100" />
              </Link>
            </div>
            {upcoming.length ? (
              <ul className="mt-5 divide-y divide-[var(--line)] border-y border-[var(--line)]">
                {upcoming.map((u, i) => (
                  <Reveal as="li" key={u.id} delay={i * 60}>
                    <Link href={href(u.href)} className="group grid grid-cols-[4.5rem_1fr_auto] items-center gap-4 py-5 sm:grid-cols-[6rem_1fr_auto]">
                      <span className="t-data text-sm text-chalk">
                        <span className="block text-2xl leading-none sm:text-3xl">{dateParts(u.when!, locale).day}</span>
                        <span className="text-[0.65rem] uppercase text-fog">
                          {dateParts(u.when!, locale).month} {dateParts(u.when!, locale).year}
                        </span>
                      </span>
                      <span className="min-w-0">
                        <span className="t-eyebrow text-[0.56rem]" style={{ color: u.accent }}>
                          {u.tag}
                        </span>
                        <span className="t-title mt-1 block truncate text-lg text-chalk transition-colors group-hover:text-cyan">{u.title}</span>
                        {u.where && <span className="block truncate text-sm text-fog">{u.where}</span>}
                      </span>
                      <Icon name="arrow" size={18} className="text-fog transition-transform group-hover:translate-x-1 rtl:-scale-x-100 rtl:group-hover:-translate-x-1" />
                    </Link>
                  </Reveal>
                ))}
              </ul>
            ) : (
              <p className="mt-5 rounded-xl border border-dashed border-[var(--line-2)] p-6 text-mist">{t.events.emptyUpcoming}</p>
            )}
          </div>

          <div className="frame relative overflow-hidden p-6 sm:p-8">
            <div aria-hidden className="livery absolute -end-16 top-0 h-full w-56 opacity-50" style={{ ["--a" as string]: "#2b6dff" }} />
            <p className="t-eyebrow text-cyan">{t.home.sponsorsEyebrow}</p>
            <p className="t-headline mt-3 max-w-md text-2xl text-chalk">{t.home.sponsorsTitle}</p>
            <p className="mt-3 max-w-lg text-sm text-mist">{t.home.sponsorsBody}</p>
            <ul className="mt-6 grid gap-3 sm:grid-cols-3">
              {t.sponsors.reasons.map((r) => (
                <li key={r.t} className="rounded-lg border border-[var(--line)] bg-void/40 p-4">
                  <p className="text-sm font-semibold text-chalk">{r.t}</p>
                  <p className="mt-1 text-xs leading-relaxed text-fog">{r.b}</p>
                </li>
              ))}
            </ul>
            <ButtonLink href={href("/sponsors")} className="mt-6" arrow>
              {t.home.partnerCta}
            </ButtonLink>
          </div>
        </div>
      </div>
    </section>
  );
}
