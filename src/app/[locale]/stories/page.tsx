import type { Metadata } from "next";
import { buildItems } from "@/lib/build-content";
import { LiveStories } from "@/components/live/live-content";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/stories", title: t.stories.eyebrow, description: t.stories.body, image: art("team_innovation", "hero")?.og });
}

/** Success stories, written by the team in the BuildX App (site content kind "story"). */
export default async function Stories({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  return (
    <>
      <PageHero eyebrow={t.stories.eyebrow} title={t.stories.title} body={t.stories.body} image={art("team_innovation", "hero")} accent="#e8b45c" crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.stories }]} size="md" />
      <Band>
        <LiveStories locale={locale} initial={await buildItems("story")} />
      </Band>
    </>
  );
}
