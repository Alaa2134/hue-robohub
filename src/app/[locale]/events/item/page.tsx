import type { Metadata } from "next";
import { LiveDetail } from "@/components/live/live-content";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/events/item", title: t.nav.events, noindex: true });
}

/** Serves items published since the last build (?s=<slug>); built ones have their own /<slug>/ page. */
export default async function Item({ params }: Params) {
  const { locale, href } = await resolvePage(params);
  return (
    <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-28 sm:px-8 lg:pt-36">
      <LiveDetail kind="event" locale={locale} backHref={`${href("/events")}/`} />
    </div>
  );
}
