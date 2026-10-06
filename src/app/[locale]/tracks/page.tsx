import type { Metadata } from "next";
import Link from "next/link";
import { Icon, TRACK_ICON } from "@/components/brand/icons";
import { TrackPanels, type TrackPanel } from "@/components/home/tracks";
import { Picture } from "@/components/media/picture";
import { Reveal } from "@/components/motion/reveal";
import { MotifBg } from "@/components/pages/motif";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { SectionHead } from "@/components/ui/section-head";
import { art } from "@/lib/media-library";
import { loc, resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { trackTech } from "@/content/core-content";
import { trackWorld } from "@/lib/worlds";
import { getTracks } from "@/server/queries/public";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/tracks", title: t.tracks.title, description: t.tracks.body, image: art("track_embedded", "hero")?.og });
}

export default async function Tracks({ params }: Params) {
  const { locale, t, p, href } = await resolvePage(params);
  const tracks = await getTracks();
  const panels: TrackPanel[] = tracks.map((tr) => {
    const w = trackWorld(tr.slug);
    return {
      slug: tr.slug,
      href: href(`/tracks/${tr.slug}`),
      code: tr.code,
      name: loc(locale, tr.name, tr.nameAr),
      tagline: loc(locale, tr.tagline, tr.taglineAr),
      tech: trackTech(tr.slug, locale, tr.technologies),
      accent: w.accent,
      image: art(...w.art),
      stats: [tr.memberCount > 0 ? `${tr.memberCount} ${t.common.members}` : "", tr.projectCount > 0 ? `${tr.projectCount} ${t.common.projects}` : ""].filter(Boolean),
    };
  });

  return (
    <>
      <PageHero eyebrow={t.tracks.eyebrow} title={t.tracks.title} body={t.tracks.body} image={art("idea", "track_mechanical", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.tracks }]} />
      <Band tight>
        <TrackPanels tracks={panels} cta={p.tracks.explore} />
      </Band>
      <Band alt>
        <SectionHead index="02" eyebrow={p.tracks.worlds} title={t.home.tracksTitle} body={t.home.tracksBody} size="md" />
        <div className="mt-14 flex flex-col gap-4">
          {tracks.map((tr, i) => {
            const w = trackWorld(tr.slug);
            const img = art(...w.art);
            return (
              <Reveal key={tr.slug}>
                <Link href={href(`/tracks/${tr.slug}`)} className="frame group relative grid overflow-hidden !rounded-[20px] md:grid-cols-[1.1fr_1fr]" style={{ ["--edge" as string]: 0.2 }}>
                  <div className={`relative min-h-[15rem] overflow-hidden md:min-h-[22rem] ${i % 2 ? "md:order-2" : ""}`}>
                    {img && <Picture image={img} sizes="(min-width:768px) 52vw, 100vw" decorative className="absolute inset-0 h-full w-full transition-transform duration-[1400ms] ease-[var(--ease-out-expo)] group-hover:scale-105" />}
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void/80 to-transparent md:bg-none" />
                  </div>
                  <div className="relative flex flex-col justify-center overflow-hidden p-7 sm:p-10">
                    <MotifBg motif={w.motif} accent={w.accent} className="opacity-[0.12]" />
                    <div className="relative">
                      <div className="flex items-center gap-3">
                        <span className="flex size-11 items-center justify-center rounded-lg border" style={{ borderColor: `color-mix(in oklab, ${w.accent} 50%, transparent)`, color: w.accent }}>
                          <Icon name={TRACK_ICON[tr.slug] ?? "robot"} size={20} />
                        </span>
                        <span className="t-data text-xs" style={{ color: w.accent }}>
                          {String(i + 1).padStart(2, "0")} · {tr.code}
                        </span>
                      </div>
                      <h2 className="t-display mt-6 text-[clamp(1.9rem,3.6vw,3.2rem)] text-chalk">{loc(locale, tr.name, tr.nameAr)}</h2>
                      <p className="mt-2 text-lg text-frost">{loc(locale, tr.tagline, tr.taglineAr)}</p>
                      <p className="mt-4 line-clamp-3 max-w-xl text-sm leading-relaxed text-mist">{loc(locale, tr.description, tr.descriptionAr)}</p>
                      <p className="mt-5 text-sm text-fog">{trackTech(tr.slug, locale, tr.technologies).slice(0, 6).join(" · ")}</p>
                      <span className="mt-7 inline-flex items-center gap-2 font-display text-[0.72rem] font-semibold uppercase tracking-[0.16em] [font-stretch:112%]" style={{ color: w.accent }}>
                        {p.tracks.explore}
                        <Icon name="arrow" size={15} className="transition-transform group-hover:translate-x-1 rtl:-scale-x-100" />
                      </span>
                    </div>
                  </div>
                </Link>
              </Reveal>
            );
          })}
        </div>
      </Band>
    </>
  );
}
