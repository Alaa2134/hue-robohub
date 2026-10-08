import type { Metadata } from "next";
import { OpenForms } from "@/components/forms/site-forms";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 3600;

const COPY = {
  en: { eyebrow: "Forms", title: "Open forms", lead: "Team tryouts, membership renewals, volunteering and surveys. Everything open right now is here." },
  ar: { eyebrow: "الفورمات", title: "الفورمات المفتوحة", lead: "اختبارات الفرق، تجديد العضوية، التطوع والاستبيانات… كل الفورمات المفتوحة دلوقتي هنا." },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return pageMeta({ locale, path: "/forms", title: COPY[locale].title, description: COPY[locale].lead });
}

export default async function Forms({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = COPY[locale];
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title} body={c.lead} crumbs={[{ label: t.nav.home, href: href("/") }, { label: c.title }]} size="md" />
      <Band tight>
        <OpenForms locale={locale} base={href("/form/")} />
      </Band>
    </>
  );
}
