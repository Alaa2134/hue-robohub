import type { Metadata } from "next";
import { ProjectCard } from "@/components/cards/project-card";
import { FilterGrid } from "@/components/pages/filter-grid";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getProjects, getTracks } from "@/server/queries/public";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/projects", title: t.projects.title, description: t.projects.body, image: art("showcase", "hero")?.og });
}

export default async function Projects({ params }: Params) {
  const { locale, t, p, href } = await resolvePage(params);
  const [projects, tracks] = await Promise.all([getProjects(), getTracks()]);
  const used = new Set(projects.map((x) => x.track?.slug).filter(Boolean));
  return (
    <>
      <PageHero eyebrow={t.projects.eyebrow} title={t.home.projectsTitle} body={t.projects.body} image={art("showcase", "track_software", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.projects }]} />
      <Band tight>
        {projects.length ? (
          <FilterGrid
            allLabel={p.projects.allTracks}
            filters={tracks.filter((tr) => used.has(tr.slug)).map((tr) => ({ key: tr.slug, label: locale === "ar" && tr.nameAr ? tr.nameAr : tr.name }))}
            className="grid gap-4 md:grid-cols-2 xl:grid-cols-3"
            items={projects.map((pr) => ({ key: pr.id, tags: pr.track ? [pr.track.slug] : [], node: <ProjectCard p={pr} href={href(`/projects/${pr.slug}`)} /> }))}
          />
        ) : (
          <EmptyState icon="cpu" title={t.projects.title} body={t.projects.empty} action={<ButtonLink href={href("/join")} variant="primary" size="sm" arrow>{t.nav.join}</ButtonLink>} />
        )}
      </Band>
    </>
  );
}
