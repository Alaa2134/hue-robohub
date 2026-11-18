import type { Metadata } from "next";
import { ComplaintsForm } from "@/components/forms/complaints";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return pageMeta({ locale, path: "/complaints", title: locale === "ar" ? "الشكاوى والمشكلات" : "Complaints & concerns", noindex: true });
}

export default async function Complaints({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const ar = locale === "ar";
  const title = ar ? "الشكاوى والمشكلات" : "Complaints & concerns";
  return <>
    <PageHero eyebrow={ar ? "صوتك مهم" : "Your voice matters"} title={title}
      body={ar ? "ساعدنا نخلي BuildX HUE مكان آمن ومحترم لكل الأعضاء." : "Help us make BuildX HUE a safe and respectful community."}
      crumbs={[{label:t.nav.home,href:href("/")},{label:title}]} size="md" />
    <Band tight><ComplaintsForm locale={locale} /></Band>
  </>;
}
