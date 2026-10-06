import type { Metadata } from "next";
import { RoadmapSection } from "@/components/home/buildx";
import { Band } from "@/components/pages/section";
import { EventRow } from "@/components/pages/event-row";
import { PageHero } from "@/components/site/page-hero";
import { SectionHead } from "@/components/ui/section-head";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getEvents } from "@/server/queries/public";

export const revalidate = 900;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/events", title: t.events.title, description: t.events.body, image: art("arena", "hero")?.og });
}

export default async function Events({ params }: Params) {
  const { locale, t, p, href } = await resolvePage(params);
  const { upcoming, past } = await getEvents();
  return (
    <>
      <PageHero eyebrow={t.events.eyebrow} title={t.events.title} body={t.events.body} image={art("arena", "team_env", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.events }]} size="md" />
      {upcoming.length > 0 && (
        <Band tight>
          <SectionHead index="01" eyebrow={p.events.upcoming} title={t.home.eventsTitle} size="md" />
          <ul className="mt-10 divide-y divide-[var(--line)] border-y border-[var(--line)]">
            {upcoming.map((e) => (
              <li key={e.id}>
                <EventRow e={e} href={href(`/events/${e.slug}`)} locale={locale} />
              </li>
            ))}
          </ul>
        </Band>
      )}
      <RoadmapSection locale={locale} index={upcoming.length ? "02" : "01"} />
      {past.length > 0 && (
        <Band alt tight>
          <SectionHead index="03" eyebrow={p.events.past} title={t.common.past} size="md" />
          <ul className="mt-10 divide-y divide-[var(--line)] border-y border-[var(--line)] opacity-90">
            {past.map((e) => (
              <li key={e.id}>
                <EventRow e={e} href={href(`/events/${e.slug}`)} locale={locale} />
              </li>
            ))}
          </ul>
        </Band>
      )}
    </>
  );
}
