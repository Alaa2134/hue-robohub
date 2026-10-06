import type { Metadata } from "next";
import { coreTeams } from "@/content/core-content";
import { notFound } from "next/navigation";
import { Icon, TEAM_ICON } from "@/components/brand/icons";
import { ProjectCard } from "@/components/cards/project-card";
import { FilmLauncher, formatDuration, type Film } from "@/components/media/film";
import { Picture } from "@/components/media/picture";
import { Reveal } from "@/components/motion/reveal";
import { Band } from "@/components/pages/section";
import { MemberCard } from "@/components/people/member-card";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { dateParts, formatDate } from "@/lib/format";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { teamText } from "@/content/core-content";
import { teamArt } from "@/lib/worlds";
import { getTeam } from "@/server/queries/public";

export const revalidate = 3600;
export const dynamicParams = true;
/** Built-in tracks/teams are always pre-rendered (also what static exports ship). */
export async function generateStaticParams() {
  return coreTeams.map((x) => ({ slug: x.slug }));
}

type P = Params<{ slug: string }>;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, slug } = await resolvePage(params);
  const tm = await getTeam(slug);
  if (!tm) return {};
  return pageMeta({ locale, path: `/competitions/${slug}`, title: tm.name, description: tm.summary, image: tm.ogImage ?? art(...teamArt(slug))?.og });
}

export default async function TeamPage({ params }: P) {
  const { locale, t, p, href, slug } = await resolvePage(params);
  const raw = await getTeam(slug);
  if (!raw) notFound();
  const tm = teamText(raw, locale);
  const img = tm.cover ?? art(...teamArt(slug));
  const a = tm.accent;
  const films: Film[] = tm.videos.map((v) => ({ id: v.id, title: v.title, description: v.description, hls: v.hls, youtubeId: v.youtubeId, poster: v.poster, durationSeconds: v.durationSeconds }));

  return (
    <>
      <section className="relative isolate flex min-h-[min(100svh,56rem)] overflow-hidden bg-void">
        {img && (
          <div aria-hidden className="absolute inset-0 -z-10">
            <Picture image={img} sizes="100vw" priority decorative className="h-full w-full" />
            <div className="absolute inset-0 bg-gradient-to-r from-void via-void/70 to-transparent rtl:bg-gradient-to-l" />
            <div className="absolute inset-0 bg-gradient-to-t from-void via-transparent to-void/50" />
            <div className="livery absolute -end-10 top-0 h-full w-72 opacity-80" style={{ ["--a" as string]: a }} />
          </div>
        )}
        <div className="mx-auto flex w-full max-w-[1680px] flex-col justify-end px-5 pb-14 pt-32 sm:px-8 lg:pb-20">
          <p className="enter t-eyebrow flex items-center gap-3" style={{ color: a, ["--d" as string]: "150ms" }}>
            <Icon name={TEAM_ICON[slug] ?? "robot"} size={16} />
            {tm.code} · {t.teams.eyebrow}
          </p>
          <h1 className="enter t-display mt-5 max-w-4xl origin-bottom-left text-[clamp(2.4rem,7vw,6.4rem)] text-chalk [transform:skewX(-8deg)] rtl:origin-bottom-right" style={{ ["--d" as string]: "250ms" }}>
            {tm.name}
          </h1>
          <p className="enter t-eyebrow mt-5 text-sm" style={{ color: a, ["--d" as string]: "380ms" }}>
            {tm.discipline}
          </p>
          <p className="enter mt-5 max-w-xl text-pretty text-lg text-mist" style={{ ["--d" as string]: "460ms" }}>
            {tm.summary}
          </p>
          <div className="enter mt-9 flex flex-wrap gap-3" style={{ ["--d" as string]: "560ms" }}>
            <ButtonLink href={href("/join")} variant="primary" arrow>
              {t.nav.join}
            </ButtonLink>
            <ButtonLink href={href("/competitions")}>{t.nav.competitions}</ButtonLink>
          </div>
        </div>
      </section>

      <Band>
        <div className="grid gap-12 lg:grid-cols-12">
          <div className="lg:col-span-7">
            <SectionHead index="01" eyebrow={p.competitions.specs} title={tm.robotName ?? t.teams.robot} accent={a} size="md" className="!block" />
            <p className="mt-6 text-pretty text-lg leading-relaxed text-frost">{tm.robotDescription ?? tm.description}</p>
          </div>
          <Reveal className="lg:col-span-5">
            <dl className="overflow-hidden rounded-2xl border border-[var(--line)]">
              {tm.specs.map((s, i) => (
                <div key={s.label} className={`flex items-center justify-between gap-6 px-6 py-5 ${i % 2 ? "bg-void" : "bg-panel/40"}`}>
                  <dt className="t-eyebrow text-[0.62rem] text-fog">{s.label}</dt>
                  <dd className="text-end text-chalk">{s.value}</dd>
                </div>
              ))}
            </dl>
          </Reveal>
        </div>
      </Band>

      {tm.members.length > 0 && (
        <Band alt>
          <SectionHead index="02" eyebrow={p.competitions.roster} title={t.teams.roster} accent={a} size="md" />
          <div className="mt-12">
            <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-4">
              {tm.members.map((m, i) => (
                <MemberCard key={m.id} m={m} href={href(`/team/${m.slug}`)} locale={locale} serial={i + 1} />
              ))}
            </div>
          </div>
        </Band>
      )}

      {(tm.competitions.length > 0 || tm.achievements.length > 0) && (
        <Band>
          <div className="grid gap-12 lg:grid-cols-2">
            <div>
              <SectionHead index="03" eyebrow={t.teams.competitionsEntered} title={p.competitions.results} accent={a} size="md" className="!block" />
              <div className="mt-10">
                {tm.competitions.length ? (
                  <ul className="divide-y divide-[var(--line)] border-y border-[var(--line)]">
                    {tm.competitions.map((c) => {
                      const d = c.startsAt ? dateParts(c.startsAt, locale) : null;
                      return (
                        <li key={c.id} className="flex items-center justify-between gap-4 py-4">
                          <span className="min-w-0">
                            <span className="block truncate text-chalk">{c.name}</span>
                            <span className="block truncate text-sm text-fog">{[d ? `${d.day} ${d.month} ${d.year}` : null, c.location].filter(Boolean).join(" · ")}</span>
                          </span>
                          <span className="shrink-0 font-mono text-xs" style={{ color: a }}>
                            {c.rank ? `#${c.rank}` : c.result ?? c.status}
                          </span>
                        </li>
                      );
                    })}
                  </ul>
                ) : (
                  <EmptyState icon="flag" title={p.competitions.results} body={p.competitions.resultsEmpty} />
                )}
              </div>
            </div>
            <div>
              <SectionHead index="04" eyebrow={t.nav.achievements} title={t.achievements.title} accent={a} size="md" className="!block" />
              <div className="mt-10">
                {tm.achievements.length ? (
                  <ol className="space-y-3">
                    {tm.achievements.map((ac) => (
                      <li key={ac.id} className="frame flex items-start gap-4 p-5">
                        <Icon name="trophy" size={20} className="mt-0.5 shrink-0 text-gold" />
                        <span>
                          <span className="block text-chalk">{ac.title}</span>
                          <span className="block text-sm text-fog">{[ac.rank ? `#${ac.rank}` : null, ac.achievedOn ? formatDate(ac.achievedOn, locale) : null].filter(Boolean).join(" · ")}</span>
                        </span>
                      </li>
                    ))}
                  </ol>
                ) : (
                  <EmptyState icon="award" title={t.achievements.title} body={t.achievements.empty} />
                )}
              </div>
            </div>
          </div>
        </Band>
      )}

      {tm.projects.length > 0 && (
        <Band alt>
          <SectionHead index="05" eyebrow={p.competitions.projects} title={t.home.projectsTitle} accent={a} size="md" />
          <div className="mt-12 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {tm.projects.map((pr) => (
              <ProjectCard key={pr.id} p={pr} href={href(`/projects/${pr.slug}`)} />
            ))}
          </div>
        </Band>
      )}

      {films.length > 0 && (
        <Band>
          <SectionHead index="06" eyebrow={p.competitions.films} title={t.media.title} accent={a} size="md" />
          <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
            {films.map((f) => (
              <FilmLauncher key={f.id} film={f} closeLabel={t.nav.close} className="frame group relative block aspect-video overflow-hidden !rounded-[16px] text-start">
                {f.poster && <img src={f.poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105" />}
                <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-void to-transparent" />
                <span className="absolute inset-x-0 bottom-0 flex items-center gap-3 p-4">
                  <span className="flex size-10 items-center justify-center rounded-full border border-white/30 bg-void/40 text-white backdrop-blur">
                    <Icon name="play" size={15} />
                  </span>
                  <span className="text-sm text-chalk">{f.title}</span>
                  <span className="ms-auto font-mono text-xs text-fog">{formatDuration(f.durationSeconds)}</span>
                </span>
              </FilmLauncher>
            ))}
          </div>
        </Band>
      )}
    </>
  );
}
