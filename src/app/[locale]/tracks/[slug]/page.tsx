import type { Metadata } from "next";
import { coreTracks } from "@/content/core-content";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon, TRACK_ICON, type IconName } from "@/components/brand/icons";
import { ProjectCard } from "@/components/cards/project-card";
import { Reveal } from "@/components/motion/reveal";
import { MotifBg } from "@/components/pages/motif";
import { Band } from "@/components/pages/section";
import { MemberCard } from "@/components/people/member-card";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/section-head";
import { safeHref } from "@/components/brand/social-icons";
import { art } from "@/lib/media-library";
import { loc, resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { trackTech } from "@/content/core-content";
import { trackWorld } from "@/lib/worlds";
import { getTeams, getTrack } from "@/server/queries/public";

export const revalidate = 3600;
export const dynamicParams = true;
/** Built-in tracks/teams are always pre-rendered (also what static exports ship). */
export async function generateStaticParams() {
  return coreTracks.map((x) => ({ slug: x.slug }));
}

type P = Params<{ slug: string }>;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, slug } = await resolvePage(params);
  const tr = await getTrack(slug);
  if (!tr) return {};
  return pageMeta({ locale, path: `/tracks/${slug}`, title: loc(locale, tr.name, tr.nameAr), description: loc(locale, tr.tagline, tr.taglineAr), image: art(...trackWorld(slug).art)?.og });
}

const RES_ICON: Record<string, IconName> = { guide: "book", datasheet: "cpu", video: "film", repository: "github", course: "rocket", tool: "wrench" };

export default async function TrackPage({ params }: P) {
  const { locale, t, p, href, slug } = await resolvePage(params);
  const [tr, teams] = await Promise.all([getTrack(slug), getTeams()]);
  if (!tr) notFound();
  const w = trackWorld(slug);
  const name = loc(locale, tr.name, tr.nameAr);
  const stages = ["Foundations", "Core", "Advanced"].map((st) => ({ st, steps: tr.roadmap.filter((r) => r.stage === st) })).filter((x) => x.steps.length);
  const teamBy = (label: string) => teams.find((tm) => tm.name.toLowerCase() === label.toLowerCase());

  return (
    <>
      <PageHero
        eyebrow={`${tr.code} · ${t.tracks.eyebrow}`}
        title={name}
        body={loc(locale, tr.tagline, tr.taglineAr)}
        image={art(...w.art)}
        accent={w.accent}
        crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.tracks, href: href("/tracks") }, { label: name }]}
        actions={
          <>
            <ButtonLink href={href("/join")} variant="primary" arrow>
              {p.tracks.join}
            </ButtonLink>
            <ButtonLink href={href("/bootcamp")}>{t.nav.bootcamp}</ButtonLink>
          </>
        }
        meta={[
          { label: p.tracks.metaTools, value: String(tr.tools.length).padStart(2, "0") },
          { label: p.tracks.metaTech, value: String(tr.technologies.length).padStart(2, "0") },
          { label: p.tracks.metaRoadmap, value: String(tr.roadmap.length).padStart(2, "0") },
          { label: p.tracks.metaMembers, value: String(tr.members.length).padStart(2, "0") },
        ]}
      />

      <section className="relative overflow-hidden">
        <MotifBg motif={w.motif} accent={w.accent} className="opacity-[0.07] [mask-image:linear-gradient(to_bottom,#000,transparent_70%)]" />
        <div className="relative mx-auto grid max-w-[1680px] gap-12 px-5 py-20 sm:px-8 lg:grid-cols-12 lg:py-32">
          <div className="lg:col-span-7">
            <p className="t-eyebrow flex items-center gap-3" style={{ color: w.accent }}>
              <span className="h-px w-8" style={{ background: w.accent }} />
              {p.tracks.overview}
            </p>
            <p className="mt-6 text-pretty text-xl leading-relaxed text-frost sm:text-2xl">{loc(locale, tr.description, tr.descriptionAr)}</p>
            {tr.competitions.length > 0 && (
              <div className="mt-10">
                <p className="t-eyebrow text-fog">{p.tracks.competitions}</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  {tr.competitions.map((c) => {
                    const tm = teamBy(c);
                    return tm ? (
                      <Link key={c} href={href(`/competitions/${tm.slug}`)} className="rounded-full border px-4 py-2 text-sm transition-colors hover:bg-white/5" style={{ borderColor: `color-mix(in oklab, ${tm.accent} 55%, transparent)`, color: tm.accent }}>
                        {c}
                      </Link>
                    ) : (
                      <span key={c} className="rounded-full border border-[var(--line-2)] px-4 py-2 text-sm text-mist">
                        {c}
                      </span>
                    );
                  })}
                </div>
              </div>
            )}
          </div>
          <div className="flex flex-col gap-4 lg:col-span-5">
            {[
              { k: p.tracks.tools, v: tr.tools, icon: "wrench" as IconName },
              { k: p.tracks.tech, v: trackTech(slug, locale, tr.technologies), icon: TRACK_ICON[slug] ?? ("cpu" as IconName) },
            ].map((g) => (
              <Reveal key={g.k}>
                <div className="frame p-6">
                  <p className="t-eyebrow flex items-center gap-2 text-fog">
                    <Icon name={g.icon} size={15} style={{ color: w.accent }} />
                    {g.k}
                  </p>
                  <ul className="mt-4 flex flex-wrap gap-1.5">
                    {g.v.map((x) => (
                      <li key={x} className="rounded-md border border-[var(--line-2)] bg-void/50 px-2.5 py-1 text-sm text-frost">
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      <Band alt id="roadmap">
        <SectionHead index="02" eyebrow={p.tracks.roadmap} title={name} accent={w.accent} size="md" />
        <div className="mt-14 grid gap-4 lg:grid-cols-3">
          {stages.map((s, si) => (
            <Reveal key={s.st} delay={si * 90}>
              <div className="frame h-full p-7">
                <div className="flex items-center justify-between">
                  <p className="t-eyebrow" style={{ color: w.accent }}>
                    {p.tracks.stages[s.st] ?? s.st}
                  </p>
                  <span className="t-data text-xs text-fog">0{si + 1}</span>
                </div>
                <ol className="mt-6 flex flex-col gap-5">
                  {s.steps.map((r, i) => (
                    <li key={r.id} className="relative ps-7">
                      <span aria-hidden className="absolute start-0 top-1.5 size-3 rotate-45 border" style={{ borderColor: w.accent, background: i === 0 ? w.accent : "transparent" }} />
                      <p className="t-title text-lg text-chalk">{r.title}</p>
                      <p className="mt-1 text-sm leading-relaxed text-mist">{r.description}</p>
                    </li>
                  ))}
                </ol>
              </div>
            </Reveal>
          ))}
        </div>
      </Band>

      {tr.members.length > 0 && (
        <Band>
          <SectionHead index="03" eyebrow={p.tracks.members} title={t.team.title} accent={w.accent} size="md" />
          <div className="mt-12">
            <div className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-4">
              {tr.members.map((m, i) => (
                <MemberCard key={m.id} m={m} href={href(`/team/${m.slug}`)} locale={locale} serial={i + 1} />
              ))}
            </div>
          </div>
        </Band>
      )}

      {tr.projects.length > 0 && (
        <Band alt>
          <SectionHead index="04" eyebrow={p.tracks.projects} title={t.home.projectsTitle} accent={w.accent} size="md" />
          <div className="mt-12">
            <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
              {tr.projects.map((pr) => (
                <ProjectCard key={pr.id} p={pr} href={href(`/projects/${pr.slug}`)} />
              ))}
            </div>
          </div>
        </Band>
      )}

      {tr.resources.length > 0 && (
        <Band>
          <SectionHead index="05" eyebrow={p.tracks.resources} title={t.resources.title} accent={w.accent} size="md" />
          <ul className="mt-12 grid gap-3 md:grid-cols-2">
            {tr.resources.map((r) => {
              const url = safeHref(r.url) ?? (r.url.startsWith("/") ? r.url : null);
              return (
                <li key={r.id}>
                  <a href={url ?? "#"} target="_blank" rel="noopener noreferrer" className="frame flex items-start gap-4 p-5 transition-colors hover:bg-panel/60">
                    <Icon name={RES_ICON[r.kind] ?? "book"} size={20} className="mt-0.5 shrink-0" style={{ color: w.accent }} />
                    <span className="min-w-0">
                      <span className="block text-chalk">{r.title}</span>
                      {r.description && <span className="mt-1 block text-sm text-mist">{r.description}</span>}
                    </span>
                  </a>
                </li>
              );
            })}
          </ul>
        </Band>
      )}
    </>
  );
}
