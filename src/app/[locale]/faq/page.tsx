import type { Metadata } from "next";
import { LiveFaq } from "@/components/live/live-content";
import { Band } from "@/components/pages/section";
import { JsonLd } from "@/components/seo/json-ld";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { buildItems } from "@/lib/build-content";
import { STATIC_SITE } from "@/lib/deploy";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { bodyOf, titleOf } from "@/lib/site-content";
import { FAQ_DEFAULTS } from "@/content/faq";

export const revalidate = 3600;

const COPY = {
  en: {
    title: "Frequently asked questions",
    lead: "Joining, tracks, competitions and how the community works — the questions students ask us most.",
    more: "Still have a question?",
    ask: "Ask us",
    defaults: FAQ_DEFAULTS.en,
  },
  ar: {
    title: "الأسئلة الشائعة",
    lead: "الانضمام والمسارات والمسابقات وطريقة شغل المجتمع — أكتر الأسئلة اللي الطلبة بيسألوها.",
    more: "لسه عندك سؤال؟",
    ask: "اسألنا",
    defaults: FAQ_DEFAULTS.ar,
  },
};

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale } = await resolvePage(params);
  return pageMeta({ locale, path: "/faq", title: COPY[locale].title, description: COPY[locale].lead });
}

export default async function Faq({ params }: Params) {
  const { locale, t, href } = await resolvePage(params);
  const c = COPY[locale];
  const items = STATIC_SITE ? await buildItems("faq") : [];
  const qa = items.length ? items.map((i) => ({ q: titleOf(i, locale), a: bodyOf(i, locale) })) : c.defaults;
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "FAQPage", mainEntity: qa.map((x) => ({ "@type": "Question", name: x.q, acceptedAnswer: { "@type": "Answer", text: x.a } })) }} />
      <PageHero eyebrow={t.nav.community} title={c.title} body={c.lead} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.faq }]} size="md" />
      <Band tight>
        <LiveFaq locale={locale} initial={items} fallback={c.defaults} />
        <div className="mx-auto mt-12 flex max-w-3xl flex-wrap items-center justify-between gap-4 rounded-[18px] border border-[var(--line-2)] p-6">
          <p className="t-title text-lg text-chalk">{c.more}</p>
          <div className="flex flex-wrap gap-3">
            <ButtonLink href={href("/contact")} variant="outline" size="sm">
              {c.ask}
            </ButtonLink>
            <ButtonLink href={href("/join")} variant="primary" size="sm" arrow>
              {t.nav.join}
            </ButtonLink>
          </div>
        </div>
      </Band>
    </>
  );
}
