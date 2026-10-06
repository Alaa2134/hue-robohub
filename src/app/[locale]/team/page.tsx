import type { Metadata } from "next";
import { Band } from "@/components/pages/section";
import { FilterGrid } from "@/components/pages/filter-grid";
import { OrgMap } from "@/components/pages/org-map";
import { MemberCard } from "@/components/people/member-card";
import { PageHero } from "@/components/site/page-hero";
import { TeamDirectory } from "@/components/team/team-directory";
import { STATIC_SITE } from "@/lib/deploy";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { DEPARTMENT_LABEL } from "@/lib/members";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getPublicMembers } from "@/server/queries/public";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/team", title: t.team.title, description: t.team.body, image: art("team_env", "hero")?.og });
}

export default async function Team({ params }: Params) {
  const { locale, t, p, href } = await resolvePage(params);
  if (STATIC_SITE)
    return (
      <>
        <PageHero eyebrow={t.team.eyebrow} title={t.team.title} body={t.team.body} image={art("team_env", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.team }]} />
        <Band>
          <TeamDirectory locale={locale} memberHref={`${href("/team/member")}/`} />
        </Band>
      </>
    );
  const members = await getPublicMembers();
  const depts = [...new Set(members.map((m) => m.department).filter(Boolean))] as (keyof typeof DEPARTMENT_LABEL)[];
  const teams = [...new Map(members.filter((m) => m.team).map((m) => [m.team!.slug, m.team!])).values()];

  return (
    <>
      <PageHero eyebrow={t.team.eyebrow} title={t.team.title} body={t.team.body} image={art("team_env", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.team }]} />
      <Band>
        <SectionHead index="01" eyebrow={p.team.orgEyebrow} title={p.team.orgTitle} size="md" />
        <div className="mt-14">
          <OrgMap members={members} roles={p.team.roles} vacant={p.team.vacant} href={href} />
        </div>
      </Band>
      <Band alt id="members">
        <SectionHead index="02" eyebrow={t.team.directory} title={p.team.directoryTitle} size="md" />
        <div className="mt-12">
          {members.length ? (
            <FilterGrid
              allLabel={p.team.filterAll}
              filters={[...depts.map((d) => ({ key: `d:${d}`, label: DEPARTMENT_LABEL[d] })), ...teams.map((tm) => ({ key: `t:${tm.slug}`, label: tm.name }))]}
              className="grid grid-cols-1 gap-4 xs:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4"
              items={members.map((m, i) => ({
                key: m.id,
                tags: [m.department ? `d:${m.department}` : "", m.team ? `t:${m.team.slug}` : ""].filter(Boolean),
                node: <MemberCard m={m} href={href(`/team/${m.slug}`)} locale={locale} serial={i + 1} priority={i < 4} />,
              }))}
            />
          ) : (
            <EmptyState icon="users" title={t.team.directory} body={t.team.empty} action={<ButtonLink href={href("/join")} variant="primary" size="sm" arrow>{t.nav.join}</ButtonLink>} />
          )}
        </div>
      </Band>
    </>
  );
}
