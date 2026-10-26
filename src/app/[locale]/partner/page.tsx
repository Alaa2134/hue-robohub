import type { Metadata } from "next";
import { PartnerPortal } from "@/components/forms/impact-report";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 86400;

const COPY = {
  en: { eyebrow: "Partners", title: "Partner page", lead: "The impact reports BuildX HUE issued for you, each one verifiable by its code." },
  ar: { eyebrow: "الشركاء", title: "صفحة الشريك", lead: "تقارير الأثر اللي BuildX HUE أصدرتها لكم، وكل واحد تقدر تتحقق منه بالكود بتاعه." },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  // A private page reached by its link only.
  return pageMeta({ locale, path: "/partner", title: COPY[locale].title, description: COPY[locale].lead, noindex: true });
}

export default async function PartnerPage({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = COPY[locale];
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title} body={c.lead} crumbs={[{ label: t.nav.home, href: href("/") }, { label: c.title }]} size="md" />
      <Band tight>
        <div className="mx-auto max-w-3xl">
          <PartnerPortal locale={locale} />
        </div>
      </Band>
    </>
  );
}
