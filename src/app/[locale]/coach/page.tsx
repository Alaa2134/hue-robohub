import type { Metadata } from "next";
import { CompetitionCoach } from "@/components/forms/competition-coach";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 86400;

const COPY = {
  en: {
    eyebrow: "Competitions",
    title: "Competition Coach",
    lead: "Ask about a competition's rules in your own words and get the official rules that answer it — with their numbers, so you can quote them to the judges.",
  },
  ar: {
    eyebrow: "المسابقات",
    title: "مدرب المسابقات",
    lead: "اسأل عن قواعد المسابقة بكلامك، وخد القواعد الرسمية اللي بتجاوب — بأرقامها، عشان تقدر تستشهد بيها قدام الحكام.",
  },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return pageMeta({ locale, path: "/coach", title: COPY[locale].title, description: COPY[locale].lead });
}

export default async function CoachPage({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = COPY[locale];
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title} body={c.lead} crumbs={[{ label: t.nav.home, href: href("/") }, { label: c.title }]} size="md" />
      <Band tight>
        <div className="mx-auto max-w-3xl">
          <CompetitionCoach locale={locale} />
        </div>
      </Band>
    </>
  );
}
