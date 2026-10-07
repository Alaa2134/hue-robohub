import type { Metadata } from "next";
import { ApplicationStatus } from "@/components/forms/application-status";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { coreTracks } from "@/content/core-content";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 86400;

const COPY = {
  en: { title: "Track your application", lead: "Enter your application reference and the phone number you applied with to see where it stands.", noRef: "Lost your reference? Message us on WhatsApp with your name and we'll find it." },
  ar: { title: "تابع طلبك", lead: "اكتب رقم طلبك ورقم الموبايل اللي قدّمت بيه وهتعرف طلبك وصل لفين.", noRef: "ضيّعت رقم الطلب؟ ابعتلنا على الواتساب باسمك وهنلاقيه." },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return pageMeta({ locale, path: "/join/status", title: COPY[locale].title, description: COPY[locale].lead });
}

export default async function JoinStatus({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = COPY[locale];
  const tracks = Object.fromEntries(coreTracks.map((x) => [x.slug, locale === "ar" ? x.nameAr : x.name]));
  return (
    <>
      <PageHero eyebrow={t.join.eyebrow} title={c.title} body={c.lead} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.join, href: href("/join") }, { label: c.title }]} size="md" />
      <Band tight>
        <div className="mx-auto max-w-2xl">
          <ApplicationStatus locale={locale} tracks={tracks} />
          <p className="mt-6 text-sm text-fog">{c.noRef}</p>
        </div>
      </Band>
    </>
  );
}
