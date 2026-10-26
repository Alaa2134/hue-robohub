import type { Metadata } from "next";
import { SkillPassport } from "@/components/forms/skill-passport";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 86400;

const COPY = {
  en: {
    eyebrow: "Skill Passport",
    title: "Skill Passport",
    lead: "What a BuildX HUE student has actually done — certificates, Lab challenges, courses and projects — straight from our records, shared by the student.",
  },
  ar: {
    eyebrow: "جواز المهارات",
    title: "جواز المهارات",
    lead: "اللي طالب BuildX HUE عمله فعلًا — شهادات وتحديات المعمل وكورسات ومشاريع — من سجلاتنا مباشرة، والطالب هو اللي شاركه.",
  },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  // A person's page: kept out of search engines.
  return pageMeta({ locale, path: "/passport", title: COPY[locale].title, description: COPY[locale].lead, noindex: true });
}

export default async function PassportPage({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = COPY[locale];
  return (
    <>
      <PageHero eyebrow={c.eyebrow} title={c.title} body={c.lead} crumbs={[{ label: t.nav.home, href: href("/") }, { label: c.title }]} size="md" />
      <Band tight>
        <div className="mx-auto max-w-3xl">
          <SkillPassport locale={locale} />
        </div>
      </Band>
    </>
  );
}
