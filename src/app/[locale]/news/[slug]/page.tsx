import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { Picture } from "@/components/media/picture";
import { Band } from "@/components/pages/section";
import { ButtonLink } from "@/components/ui/button";
import { formatDate } from "@/lib/format";
import { Markdown } from "@/lib/markdown";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta, SITE_URL } from "@/lib/seo";
import { getArticle } from "@/server/queries/public";

export const revalidate = 900;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

type P = Params<{ slug: string }>;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, slug } = await resolvePage(params);
  const a = await getArticle(slug);
  if (!a) return {};
  return pageMeta({ locale, path: `/news/${slug}`, title: a.title, description: a.excerpt, image: a.ogImage });
}

export default async function Article({ params }: P) {
  const { locale, t, href, slug } = await resolvePage(params);
  const a = await getArticle(slug);
  if (!a) notFound();
  const minutes = Math.max(1, Math.round(a.body.split(/\s+/).length / 220));
  const ld = { "@context": "https://schema.org", "@type": "Article", headline: a.title, datePublished: a.publishedAt, dateModified: a.updatedAt, author: a.authorName ? { "@type": "Person", name: a.authorName } : undefined, publisher: { "@type": "Organization", name: "BuildX HUE", url: SITE_URL } };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <article className="pt-28 lg:pt-36">
        <header className="mx-auto max-w-3xl px-5 sm:px-8">
          <Link href={href("/news")} className="font-mono text-[0.68rem] uppercase tracking-[0.18em] text-fog hover:text-chalk">
            ← {t.news.title}
          </Link>
          <p className="t-eyebrow mt-8 text-cyan">{a.kind}</p>
          <h1 className="t-display mt-4 text-[clamp(2.2rem,5.4vw,4.2rem)] text-chalk">{a.title}</h1>
          <p className="mt-5 text-lg text-mist">{a.excerpt}</p>
          <p className="mt-6 font-mono text-xs text-fog">
            {formatDate(a.publishedAt, locale)} · {minutes} min
            {a.authorName && (
              <>
                {" · "}
                {a.authorSlug ? (
                  <Link href={href(`/team/${a.authorSlug}`)} className="text-cyan hover:underline">
                    {a.authorName}
                  </Link>
                ) : (
                  a.authorName
                )}
              </>
            )}
          </p>
        </header>
        {a.cover && (
          <div className="mx-auto mt-12 max-w-5xl px-5 sm:px-8">
            <div className="frame relative aspect-[16/9] overflow-hidden !rounded-[20px]">
              <Picture image={a.cover} sizes="(min-width:1024px) 64rem, 100vw" priority className="absolute inset-0 h-full w-full" />
            </div>
          </div>
        )}
        <Band tight>
          <div className="mx-auto max-w-3xl">
            <Markdown source={a.body} />
            <div className="mt-14">
              <ButtonLink href={href("/news")} arrow>
                {t.common.viewAll}
              </ButtonLink>
            </div>
          </div>
        </Band>
      </article>
    </>
  );
}
