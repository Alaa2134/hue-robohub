import type { Metadata } from "next";
import { Unsubscribe } from "@/components/forms/unsubscribe";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";

export const revalidate = 86400;

const COPY = {
  en: { eyebrow: "Email", title: "Unsubscribe", lead: "Stop getting emails from BuildX HUE." },
  ar: { eyebrow: "الإيميل", title: "إلغاء الاشتراك", lead: "وقّف الإيميلات اللي بتجيلك من BuildX HUE." },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return pageMeta({
    locale,
    path: "/unsubscribe",
    title: COPY[locale].title,
    description: COPY[locale].lead,
    noindex: true,
  });
}

export default async function UnsubscribePage({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = COPY[locale];
  return (
    <>
      <PageHero
        eyebrow={c.eyebrow}
        title={c.title}
        body={c.lead}
        crumbs={[{ label: t.nav.home, href: href("/") }, { label: c.title }]}
        size="md"
      />
      <Band tight>
        <div className="mx-auto max-w-xl">
          <Unsubscribe locale={locale} />
        </div>
      </Band>
    </>
  );
}
