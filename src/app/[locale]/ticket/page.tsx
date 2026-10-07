import type { Metadata } from "next";
import { EventTicket } from "@/components/live/event-rsvp";
import { Band } from "@/components/pages/section";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 86400;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return pageMeta({ locale, path: "/ticket", title: locale === "ar" ? "تذكرتك" : "Your ticket", description: locale === "ar" ? "تذكرة فعالية BuildX HUE" : "Your BuildX HUE event ticket", noindex: true });
}

export default async function Ticket({ params }: Params) {
  const { locale } = await resolvePage(params);
  return (
    <Band className="pt-28 lg:pt-36">
      <h1 className="sr-only">{locale === "ar" ? "تذكرتك" : "Your ticket"}</h1>
      <EventTicket locale={locale} />
    </Band>
  );
}
