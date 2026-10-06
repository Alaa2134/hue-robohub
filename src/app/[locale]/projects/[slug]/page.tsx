import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Icon } from "@/components/brand/icons";
import { safeHref } from "@/components/brand/social-icons";
import { FilmPlayer } from "@/components/media/film";
import { Picture } from "@/components/media/picture";
import { Reveal } from "@/components/motion/reveal";
import { Band } from "@/components/pages/section";
import { MemberCard } from "@/components/people/member-card";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { formatDate, PROJECT_STATUS_LABEL } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { trackWorld } from "@/lib/worlds";
import { getProject } from "@/server/queries/public";

export const revalidate = 3600;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

type P = Params<{ slug: string }>;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, slug } = await resolvePage(params);
  const pr = await getProject(slug);
  if (!pr) return {};
  return pageMeta({ locale, path: `/projects/${slug}`, title: pr.title, description: pr.summary, image: pr.ogImage ?? art("showcase", "hero")?.og });
}

const SECTIONS = ["problem", "solution", "electronics", "mechanical", "software", "challenges", "testing", "results"] as const;

export default async function ProjectPage({ params }: P) {
  const { locale, t, p, href, slug } = await resolvePage(params);
  const pr = await getProject(slug);
  if (!pr) notFound();
  const accent = pr.team?.accent ?? (pr.track ? trackWorld(pr.track.slug).accent : "#38dcff");
  const img = pr.hero ?? (pr.track ? art(...trackWorld(pr.track.slug).art) : art("showcase", "hero"));
  const sections = SECTIONS.filter((k) => pr[k]?.trim());
  const gh = safeHref(pr.githubUrl);
  const demo = safeHref(pr.demoUrl);

  return (
    <>
      <PageHero
        eyebrow={`${PROJECT_STATUS_LABEL[pr.status] ?? pr.status}${pr.track ? ` · ${pr.track.code}` : ""}`}
        title={pr.title}
        body={pr.summary}
        image={img}
        accent={accent}
        crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.projects, href: href("/projects") }, { label: pr.title }]}
        actions={
          <>
            {gh && (
              <a href={gh} target="_blank" rel="noopener noreferrer" className="btn">
                <Icon name="github" size={16} />
                <span>{t.projects.repo}</span>
              </a>
            )}
            {demo && (
              <a href={demo} target="_blank" rel="noopener noreferrer" className="btn">
                <Icon name="external" size={15} />
                <span>{t.projects.demo}</span>
              </a>
            )}
          </>
        }
        meta={[
          { label: p.projects.progress, value: `${pr.progress}%` },
          { label: p.projects.status, value: PROJECT_STATUS_LABEL[pr.status] ?? pr.status },
          ...(pr.trackName ? [{ label: p.projects.track, value: pr.trackName }] : []),
          ...(pr.startDate ? [{ label: p.projects.started, value: formatDate(pr.startDate, locale) }] : []),
        ]}
      />

      <Band>
        <div className="grid gap-12 lg:grid-cols-12">
          <aside className="lg:col-span-3">
            <nav aria-label={t.projects.eyebrow} className="lg:sticky lg:top-28">
              <ol className="flex flex-col gap-1 border-s border-[var(--line)]">
                {sections.map((k, i) => (
                  <li key={k}>
                    <a href={`#${k}`} className="-ms-px flex items-center gap-3 border-s border-transparent py-1.5 ps-4 text-sm text-fog transition-colors hover:border-cyan hover:text-chalk">
                      <span className="font-mono text-[0.62rem]">{String(i + 1).padStart(2, "0")}</span>
                      {p.projects.sections[k]}
                    </a>
                  </li>
                ))}
              </ol>
              {pr.technologies.length > 0 && (
                <div className="mt-8">
                  <p className="t-eyebrow text-[0.58rem] text-fog">{t.common.technologies}</p>
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {pr.technologies.map((x) => (
                      <li key={x} className="rounded-md border border-[var(--line-2)] px-2 py-0.5 text-xs text-mist">
                        {x}
                      </li>
                    ))}
                  </ul>
                </div>
              )}
              {pr.manager && (
                <p className="mt-8 text-sm text-fog">
                  {p.projects.lead}:{" "}
                  <Link href={href(`/team/${pr.manager.slug}`)} className="text-cyan hover:underline">
                    {pr.manager.fullName}
                  </Link>
                </p>
              )}
            </nav>
          </aside>
          <article className="flex flex-col gap-14 lg:col-span-9">
            {pr.video && (
              <div className="frame overflow-hidden !rounded-[18px]">
                <FilmPlayer film={{ id: pr.video.id, title: pr.video.title, hls: pr.video.hls, youtubeId: pr.video.youtubeId, poster: pr.video.poster, durationSeconds: pr.video.durationSeconds }} autoPlay={false} />
              </div>
            )}
            {sections.map((k, i) => (
              <Reveal as="section" key={k} className="scroll-mt-28" >
                <div id={k} className="scroll-mt-28">
                  <p className="t-eyebrow flex items-center gap-3" style={{ color: accent }}>
                    <span className="font-mono">{String(i + 1).padStart(2, "0")}</span>
                    <span className="h-px w-8" style={{ background: accent }} />
                    {p.projects.sections[k]}
                  </p>
                  <div className="prose-rh mt-5 max-w-3xl">
                    <Markdown source={pr[k]!} className="" />
                  </div>
                </div>
              </Reveal>
            ))}
            {pr.milestones.length > 0 && (
              <section>
                <p className="t-eyebrow text-fog">{p.projects.timeline}</p>
                <ol className="mt-6 border-s border-[var(--line-2)]">
                  {pr.milestones.map((m) => (
                    <li key={m.id} className="relative pb-6 ps-7">
                      <span aria-hidden className="absolute -start-[0.4rem] top-1.5 size-3 rotate-45 border" style={{ borderColor: accent, background: m.completedAt ? accent : "var(--color-void)" }} />
                      <p className="text-chalk">{m.title}</p>
                      <p className="text-sm text-fog">{[m.dueDate ? formatDate(m.dueDate, locale) : null, m.description].filter(Boolean).join(" · ")}</p>
                    </li>
                  ))}
                </ol>
              </section>
            )}
          </article>
        </div>
      </Band>

      {pr.crew.length > 0 && (
        <Band alt>
          <p className="t-eyebrow text-mist">{p.projects.crew}</p>
          <div className="mt-8 grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-4">
            {pr.crew.map((m, i) => (
              <MemberCard key={m.id} m={{ ...m, title: m.role || m.title }} href={href(`/team/${m.slug}`)} locale={locale} serial={i + 1} />
            ))}
          </div>
        </Band>
      )}

      {pr.gallery.length > 0 && (
        <Band>
          <p className="t-eyebrow text-mist">{p.projects.gallery}</p>
          <div className="mt-8 grid grid-cols-2 gap-3 md:grid-cols-3">
            {pr.gallery.map((g) => (
              <div key={g.id} className="relative aspect-[4/3] overflow-hidden rounded-xl">
                <Picture image={g.image} sizes="(min-width:768px) 33vw, 50vw" className="absolute inset-0 h-full w-full" />
              </div>
            ))}
          </div>
        </Band>
      )}

      <Band tight>
        <div className="flex flex-wrap items-center justify-between gap-6">
          <ButtonLink href={href("/projects")} arrow>
            {t.common.viewAll}
          </ButtonLink>
          <ButtonLink href={href("/join")} variant="primary" arrow>
            {t.nav.join}
          </ButtonLink>
        </div>
      </Band>
    </>
  );
}
