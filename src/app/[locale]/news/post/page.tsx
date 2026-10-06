import type { Metadata } from "next";
import { LiveDetail } from "@/components/live/live-content";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/news/post", title: t.news.title });
}

/** One static page shows every item; the slug comes from ?s=<slug>. */
export default async function Item({ params }: Params) {
  const { locale, href } = await resolvePage(params);
  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-28 sm:px-8 lg:pt-36">
      <LiveDetail kind="post" locale={locale} backHref={`${href("/news")}/`} />
    </div>
  );
}
