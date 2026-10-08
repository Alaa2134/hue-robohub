import type { Metadata } from "next";
import { Icon } from "@/components/brand/icons";
import { safeHref } from "@/components/brand/social-icons";
import { Picture } from "@/components/media/picture";
import { Reveal } from "@/components/motion/reveal";
import { Tilt } from "@/components/motion/tilt";
import { CardGrid } from "@/components/home/buildx";
import { Band } from "@/components/pages/section";
import { PARTNERSHIP } from "@/content/buildx";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getSponsors } from "@/server/queries/public";
import { LivePartners } from "@/components/live/live-content";
import { buildItems } from "@/lib/build-content";
import { STATIC_SITE } from "@/lib/deploy";
import { SponsorRequest } from "@/components/forms/site-forms";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/sponsors", title: t.sponsors.title, description: t.sponsors.body, image: art("showcase", "hero")?.og });
}

const TIER_STYLE: Record<string, { c: string; icon: "diamond" | "award" | "trophy" | "wrench" }> = {
  strategic: { c: "#38dcff", icon: "diamond" },
  gold: { c: "#e8b45c", icon: "trophy" },
  silver: { c: "#c9d6e8", icon: "award" },
  technical: { c: "#5a90ff", icon: "wrench" },
};

export default async function Sponsors({ params }: Params) {
  const { locale, t, p, href } = await resolvePage(params);
  const sponsors = STATIC_SITE ? [] : await getSponsors();
  const partners = STATIC_SITE ? await buildItems("partner") : [];
  return (
    <>
      <PageHero
        eyebrow={t.sponsors.eyebrow}
        title={t.sponsors.title}
        body={t.sponsors.body}
        image={art("showcase", "arena", "hero")}
        crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.sponsors }]}
        actions={
          <ButtonLink href={STATIC_SITE ? "#sponsor-request" : href("/contact")} variant="primary" arrow>
            {p.sponsors.cta}
          </ButtonLink>
        }
      />
      <Band>
        <SectionHead index="01" eyebrow={locale === "ar" ? "فرص الشراكة" : "Partnership opportunities"} title={t.home.sponsorsTitle} body={t.home.sponsorsBody} size="md" />
        <div className="mt-12">
          <CardGrid items={PARTNERSHIP} locale={locale} cols={3} />
        </div>
      </Band>
      <Band alt>
        <SectionHead index="02" eyebrow={p.sponsors.tiersTitle} title={p.sponsors.tiersTitle} size="md" />
        <div className="mt-12 grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {p.sponsors.tiers.map((tier, i) => {
            const s = TIER_STYLE[tier.k]!;
            return (
              <Reveal key={tier.k} delay={i * 70}>
                <Tilt max={4} className="h-full">
                  <div className="frame relative h-full overflow-hidden p-7" style={{ ["--edge" as string]: 0.4 }}>
                    <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: s.c }} />
                    <Icon name={s.icon} size={24} style={{ color: s.c }} />
                    <p className="t-headline mt-8 text-xl text-chalk">{tier.t}</p>
                    <p className="mt-3 text-sm leading-relaxed text-mist">{tier.d}</p>
                  </div>
                </Tilt>
              </Reveal>
            );
          })}
        </div>
      </Band>
      <Band>
        <SectionHead index="03" eyebrow={p.sponsors.current} title={t.home.sponsorsEyebrow} size="md" />
        <div className="mt-12">
          {STATIC_SITE ? (
            <LivePartners locale={locale} initial={partners} variant="grid" empty={<EmptyState icon="handshake" title={p.sponsors.current} body={t.sponsors.empty} action={<ButtonLink href="#sponsor-request" variant="primary" size="sm" arrow>{p.sponsors.cta}</ButtonLink>} />} />
          ) : sponsors.length ? (
            <ul className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] md:grid-cols-4">
              {sponsors.map((sp) => {
                const site = safeHref(sp.website);
                const inner = (
                  <>
                    {sp.logo ? <Picture image={sp.logo} sizes="20vw" alt={sp.name} className="h-16 w-full [&_img]:object-contain" /> : <span className="t-headline text-lg text-chalk">{sp.name}</span>}
                    <span className="t-eyebrow mt-4 text-[0.55rem]" style={{ color: TIER_STYLE[sp.tier]?.c }}>
                      {t.sponsors.tiers[sp.tier as keyof typeof t.sponsors.tiers]}
                    </span>
                  </>
                );
                return (
                  <li key={sp.id} className="bg-void">
                    {site ? (
                      <a href={site} target="_blank" rel="noopener noreferrer" className="flex h-full flex-col items-center justify-center p-8 text-center transition-colors hover:bg-panel/50">
                        {inner}
                      </a>
                    ) : (
                      <div className="flex h-full flex-col items-center justify-center p-8 text-center">{inner}</div>
                    )}
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyState icon="handshake" title={p.sponsors.current} body={t.sponsors.empty} action={<ButtonLink href={href("/contact")} variant="primary" size="sm" arrow>{p.sponsors.cta}</ButtonLink>} />
          )}
        </div>
      </Band>
      {STATIC_SITE && (
        <Band alt id="sponsor-request">
          <SectionHead
            index="04"
            eyebrow={locale === "ar" ? "طلب رعاية" : "Sponsorship request"}
            title={locale === "ar" ? "يلا نبني الموسم ده سوا" : "Let's build this season together"}
            body={locale === "ar" ? "ابعتلنا بيانات الشركة واهتمامكم، وفريق الشراكات هيرد عليكم بالتفاصيل وملف الرعاية." : "Send us your company details and interests, and our partnerships team will reply with details and the sponsorship deck."}
            size="md"
          />
          <div className="mt-10 max-w-4xl">
            <SponsorRequest locale={locale} />
          </div>
        </Band>
      )}
    </>
  );
}
