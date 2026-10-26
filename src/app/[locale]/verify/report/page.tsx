import type { Metadata } from "next";
import { ImpactVerify } from "@/components/forms/impact-report";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 86400;

const COPY = {
  en: {
    eyebrow: "Impact",
    title: "Verify an impact report",
    lead: "Every BuildX HUE impact report has a code. Type it, or open the link on the report, to see the numbers exactly as they were issued — each counted from our records, with how.",
  },
  ar: {
    eyebrow: "الأثر",
    title: "تحقّق من تقرير أثر",
    lead: "كل تقرير أثر من BuildX HUE ليه كود. اكتبه أو افتح اللينك اللي على التقرير عشان تشوف الأرقام زي ما اتصدرت بالظبط — كل رقم محسوب من سجلاتنا، ومكتوب اتحسب إزاي.",
  },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return pageMeta({ locale, path: "/verify/report", title: COPY[locale].title, description: COPY[locale].lead, noindex: true });
}

export default async function VerifyReport({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = COPY[locale];
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title} body={c.lead} crumbs={[{ label: t.nav.home, href: href("/") }, { label: c.title }]} size="md" />
      <Band tight>
        <div className="mx-auto max-w-3xl">
          <ImpactVerify locale={locale} />
        </div>
      </Band>
    </>
  );
}
