import type { Metadata } from "next";
import { STATIC_SITE } from "@/lib/deploy";
import { LiveList } from "@/components/live/live-content";
import Link from "next/link";
import { Picture } from "@/components/media/picture";
import { Reveal } from "@/components/motion/reveal";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate } from "@/lib/format";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getArticles } from "@/server/queries/public";

export const revalidate = 900;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/news", title: t.news.title, image: art("team_env", "hero")?.og });
}

export default async function News({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  if (STATIC_SITE)
    return (
      <>
        <PageHero eyebrow={t.news.eyebrow} title={t.news.title} image={art("team_env", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.news }]} size="md" />
        <Band>
          <LiveList kind="post" locale={locale} href={`${href("/news/post")}/`} />
        </Band>
      </>
    );
  const articles = await getArticles();
  const [lead, ...rest] = articles;
  return (
    <>
      <PageHero eyebrow={t.news.eyebrow} title={t.news.title} image={art("team_env", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.news }]} size="md" />
      <Band tight>
        {lead ? (
          <div className="flex flex-col gap-10">
            <Reveal>
              <Link href={href(`/news/${lead.slug}`)} className="frame group grid overflow-hidden !rounded-[22px] lg:grid-cols-2">
                <div className="relative min-h-64 overflow-hidden lg:min-h-[26rem]">
                  {(lead.cover ?? art("team_env", "hero")) && <Picture image={lead.cover ?? art("team_env", "hero")!} sizes="(min-width:1024px) 50vw, 100vw" className="absolute inset-0 h-full w-full transition-transform duration-1000 group-hover:scale-105" />}
                </div>
                <div className="flex flex-col justify-end p-8 sm:p-10">
                  <p className="t-eyebrow text-cyan">{lead.kind}</p>
                  <h2 className="t-headline mt-3 text-[clamp(1.6rem,3vw,2.6rem)] text-chalk">{lead.title}</h2>
                  <p className="mt-3 text-mist">{lead.excerpt}</p>
                  <p className="mt-6 font-mono text-xs text-fog">
                    {formatDate(lead.publishedAt, locale)}
                    {lead.authorName ? ` · ${t.news.by} ${lead.authorName}` : ""}
                  </p>
                </div>
              </Link>
            </Reveal>
            {rest.length > 0 && (
              <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                {rest.map((a, i) => (
                  <Reveal key={a.id} delay={(i % 3) * 70}>
                    <Link href={href(`/news/${a.slug}`)} className="frame group flex h-full flex-col overflow-hidden">
                      <div className="relative aspect-[16/9] overflow-hidden">{a.cover && <Picture image={a.cover} sizes="(min-width:1280px) 33vw, 100vw" className="absolute inset-0 h-full w-full transition-transform duration-1000 group-hover:scale-105" />}</div>
                      <div className="flex flex-1 flex-col p-6">
                        <p className="t-eyebrow text-[0.56rem] text-cyan">{a.kind}</p>
                        <p className="t-title mt-2 text-lg text-chalk">{a.title}</p>
                        <p className="mt-2 line-clamp-3 text-sm text-mist">{a.excerpt}</p>
                        <p className="mt-auto pt-5 font-mono text-[0.65rem] text-fog">{formatDate(a.publishedAt, locale)}</p>
                      </div>
                    </Link>
                  </Reveal>
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon="news" title={t.news.title} body={t.news.empty} />
        )}
      </Band>
    </>
  );
}
