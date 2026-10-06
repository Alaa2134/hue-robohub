import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Icon } from "@/components/brand/icons";
import { safeHref } from "@/components/brand/social-icons";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { EVENT_TYPE_LABEL, formatDate, formatTime } from "@/lib/format";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getEvent } from "@/server/queries/public";

export const revalidate = 900;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

type P = Params<{ slug: string }>;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, slug } = await resolvePage(params);
  const e = await getEvent(slug);
  if (!e) return {};
  return pageMeta({ locale, path: `/events/${slug}`, title: e.title, description: e.description.slice(0, 160), image: e.ogImage });
}

export default async function EventPage({ params }: P) {
  const { locale, t, p, href, slug } = await resolvePage(params);
  const e = await getEvent(slug);
  if (!e) notFound();
  const reg = safeHref(e.registrationUrl);
  const when = `${formatDate(e.startsAt, locale, { weekday: "long", day: "numeric", month: "long", year: "numeric" })}${e.allDay ? "" : ` · ${formatTime(e.startsAt, locale)}${e.endsAt ? `–${formatTime(e.endsAt, locale)}` : ""}`}`;
  const ld = {
    "@context": "https://schema.org",
    "@type": "Event",
    name: e.title,
    startDate: e.startsAt,
    endDate: e.endsAt ?? undefined,
    eventAttendanceMode: "https://schema.org/OfflineEventAttendanceMode",
    location: e.location ? { "@type": "Place", name: e.location } : undefined,
    organizer: { "@type": "Organization", name: "BuildX HUE" },
    description: e.description,
  };
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(ld).replace(/</g, "\\u003c") }} />
      <PageHero
        eyebrow={EVENT_TYPE_LABEL[e.type] ?? e.type}
        title={e.title}
        image={e.cover ?? art("arena", "team_env", "hero")}
        crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.events, href: href("/events") }, { label: e.title }]}
        size="md"
        actions={
          <>
            {reg && (
              <a href={reg} target="_blank" rel="noopener noreferrer" className="btn btn-primary">
                <span aria-hidden className="btn-sheen" />
                <span>{e.ctaLabel || p.events.register}</span>
              </a>
            )}
            <a href={`/api/public/events/${slug}/ics`} className="btn">
              <Icon name="calendar" size={15} />
              <span>{p.events.addToCalendar}</span>
            </a>
          </>
        }
        meta={[{ label: p.events.when, value: <span className="text-base">{when}</span> }, ...(e.location ? [{ label: p.events.where, value: <span className="text-base">{e.location}</span> }] : [])]}
      />
      <Band tight>
        <div className="mx-auto max-w-3xl">
          <p className="whitespace-pre-line text-pretty text-lg leading-relaxed text-frost">{e.description}</p>
          <div className="mt-12">
            <ButtonLink href={href("/events")} arrow>
              {p.events.back}
            </ButtonLink>
          </div>
        </div>
      </Band>
    </>
  );
}
