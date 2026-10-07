import type { Metadata } from "next";
import { buildTeam } from "@/lib/build-content";
import { STATIC_SITE } from "@/lib/deploy";
import { Icon, type IconName } from "@/components/brand/icons";
import { Reveal } from "@/components/motion/reveal";
import { Tilt } from "@/components/motion/tilt";
import { StructureSection, WhySection } from "@/components/home/buildx";
import { TeamDirectory } from "@/components/team/team-directory";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { SectionHead } from "@/components/ui/section-head";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { pick } from "@/lib/site-config";
import { getOrgStats, getSiteConfig } from "@/server/queries/public";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t, p } = await resolvePage(params);
  return pageMeta({ locale, path: "/about", title: t.about.title, description: p.about.heroBody, image: art("team_env", "hero")?.og });
}

const VALUE_ICON: IconName[] = ["idea", "users", "award", "wrench", "flag", "handshake"];

export default async function About({ params }: Params) {
  const { locale, t, p, href } = await resolvePage(params);
  const [config, stats] = await Promise.all([getSiteConfig(), getOrgStats()]);
  const about = config["site.about"];

  return (
    <>
      <PageHero
        eyebrow={t.about.eyebrow}
        title={t.about.title}
        body={p.about.heroBody}
        image={art("team_env", "hero")}
        crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.about }]}
        meta={[
          { label: t.stats.tracks, value: "07" },
          { label: t.stats.teams, value: String(stats.teams).padStart(2, "0") },
          { label: locale === "ar" ? "فرق تنظيمية" : "Organizing teams", value: "05" },
          ...(stats.members > 0 ? [{ label: t.stats.members, value: String(stats.members).padStart(2, "0") }] : []),
        ]}
      />

      <Band>
        <SectionHead index="01" eyebrow={p.about.visionMission} title={pick(config["site.homepage"].manifesto, locale)} size="md" />
        <div className="mt-14 grid gap-4 lg:grid-cols-2">
          {[
            { k: t.about.vision, v: pick(about.vision, locale), icon: "eye" as IconName },
            { k: t.about.mission, v: pick(about.mission, locale), icon: "rocket" as IconName },
          ].map((x, i) => (
            <Reveal key={x.k} delay={i * 90}>
              <Tilt max={3} className="h-full">
                <div className="frame h-full p-8 sm:p-10">
                  <span className="flex size-12 items-center justify-center rounded-xl border border-volt/40 bg-volt/10 text-cyan">
                    <Icon name={x.icon} size={22} />
                  </span>
                  <p className="t-eyebrow mt-8 text-cyan">{x.k}</p>
                  <p className="t-title mt-3 text-pretty text-[1.45rem] leading-snug text-chalk sm:text-[1.7rem]">{x.v}</p>
                </div>
              </Tilt>
            </Reveal>
          ))}
        </div>
        <Reveal className="mt-16 grid gap-10 lg:grid-cols-12">
          <p className="t-eyebrow text-mist lg:col-span-3">{t.about.story}</p>
          <p className="text-pretty text-xl leading-relaxed text-frost lg:col-span-8">{pick(about.story, locale)}</p>
        </Reveal>
      </Band>

      <div className="border-y border-[var(--line)] bg-abyss">
        <WhySection locale={locale} index="02" />
      </div>

      <Band>
        <SectionHead index="03" eyebrow={t.about.values} title={p.about.valuesTitle} size="md" />
        <ul className="mt-14 grid gap-px overflow-hidden rounded-2xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-2 lg:grid-cols-3">
          {about.values.map((v, i) => (
            <Reveal as="li" key={i} delay={(i % 3) * 70} className="bg-void p-7 sm:p-9">
              <Icon name={VALUE_ICON[i] ?? "diamond"} size={22} className="text-cyan" />
              <p className="t-headline mt-6 text-xl text-chalk">{pick(v.title, locale)}</p>
              <p className="mt-2 text-sm leading-relaxed text-mist">{pick(v.body, locale)}</p>
            </Reveal>
          ))}
        </ul>
      </Band>

      <div className="border-t border-[var(--line)] bg-abyss">
        <StructureSection locale={locale} index="04" />
        <div className="mx-auto max-w-[1680px] px-5 pb-12 sm:px-8">
          <h3 className="t-headline mb-6 text-2xl text-chalk">{locale === "ar" ? "الفريق المؤسس" : "Founding team"}</h3>
          <TeamDirectory locale={locale} memberHref={`${href("/team")}/`} variant="founders" initial={STATIC_SITE ? await buildTeam() : undefined} />
        </div>
        <div className="mx-auto flex max-w-[1680px] flex-wrap gap-3 px-5 pb-20 sm:px-8 lg:pb-28">
          <ButtonLink href={href("/join")} variant="primary" arrow>
            {t.nav.join}
          </ButtonLink>
          <ButtonLink href={href("/contact")}>{t.nav.contact}</ButtonLink>
        </div>
      </div>
    </>
  );
}
