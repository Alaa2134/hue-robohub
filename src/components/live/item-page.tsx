/** Pre-rendered page for one published news post, project or event (static site, see src/static-routes). */
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { LiveDetail } from "@/components/live/live-content";
import { JsonLd } from "@/components/seo/json-ld";
import { buildItem, buildPages, slugParams } from "@/lib/build-content";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { bodyOf, locationOf, safeLink, siteImageUrl, summaryOf, titleOf, type SiteItem } from "@/lib/site-content";
import { breadcrumbs, campus, organizationRef, pageUrl } from "@/lib/structured-data";
import type { Locale } from "@/i18n/config";

type Kind = "post" | "project" | "event";
type P = Params<{ slug: string }>;
const SECTION: Record<Kind, { path: string; nav: "news" | "projects" | "events" }> = {
  post: { path: "/news", nav: "news" },
  project: { path: "/projects", nav: "projects" },
  event: { path: "/events", nav: "events" },
};

const describe = (i: SiteItem, locale: Locale) => (summaryOf(i, locale) || bodyOf(i, locale)).replace(/\s+/g, " ").trim().slice(0, 160);

function structured(kind: Kind, i: SiteItem, locale: Locale) {
  const url = pageUrl(locale, `${SECTION[kind].path}/${i.slug}`);
  const image = i.image_path ? siteImageUrl(i.image_path) : undefined;
  const base = { "@context": "https://schema.org", name: titleOf(i, locale), description: describe(i, locale) || undefined, image, url, inLanguage: locale };
  if (kind === "post")
    return { ...base, "@type": "NewsArticle", headline: titleOf(i, locale).slice(0, 110), datePublished: i.created_at, dateModified: i.updated_at ?? i.created_at, author: organizationRef, publisher: organizationRef, mainEntityOfPage: url };
  if (kind === "project") return { ...base, "@type": "CreativeWork", creator: organizationRef, keywords: i.tags.length ? i.tags.join(", ") : undefined, dateCreated: i.created_at };
  const where = locationOf(i, locale);
  return {
    ...base,
    "@type": "Event",
    startDate: i.starts_at ?? undefined,
    endDate: i.ends_at ?? undefined,
    eventStatus: "https://schema.org/EventScheduled",
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: where ? { ...campus, name: `${where} — ${campus.name}` } : campus,
    organizer: organizationRef,
    offers: safeLink(i.url) ? { "@type": "Offer", url: safeLink(i.url), price: 0, priceCurrency: "EGP", availability: "https://schema.org/InStock" } : undefined,
  };
}

export function itemPage(kind: Kind) {
  const section = SECTION[kind];
  return {
    async generateStaticParams() {
      return slugParams((await buildPages(kind)).map((i) => i.slug!));
    },
    async generateMetadata({ params }: P): Promise<Metadata> {
      const { locale, slug } = await resolvePage(params);
      const i = await buildItem(kind, slug);
      if (!i) return { robots: { index: false } };
      return pageMeta({ locale, path: `${section.path}/${slug}`, title: titleOf(i, locale), description: describe(i, locale), image: i.image_path ? siteImageUrl(i.image_path) : undefined, type: kind === "post" ? "article" : "website", published: i.created_at });
    },
    async Page({ params }: P) {
      const { locale, slug, t, href } = await resolvePage(params);
      const i = await buildItem(kind, slug);
      if (!i) notFound();
      return (
        <div className="mx-auto max-w-[1400px] px-5 pb-24 pt-28 sm:px-8 lg:pt-36">
          <JsonLd
            data={[
              structured(kind, i, locale),
              breadcrumbs(locale, [
                { name: t.nav.home, path: "/" },
                { name: t.nav[section.nav], path: section.path },
                { name: titleOf(i, locale), path: `${section.path}/${slug}` },
              ]),
            ]}
          />
          <LiveDetail kind={kind} locale={locale} backHref={`${href(section.path)}/`} slug={slug} initial={i} />
        </div>
      );
    },
  };
}
