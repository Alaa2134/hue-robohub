import type { Metadata } from "next";
import { Icon } from "@/components/brand/icons";
import { FilmLauncher, formatDuration, type Film } from "@/components/media/film";
import { Reveal } from "@/components/motion/reveal";
import { Band } from "@/components/pages/section";
import { PageHero } from "@/components/site/page-hero";
import { EmptyState } from "@/components/ui/empty-state";
import { SectionHead } from "@/components/ui/section-head";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getVideos } from "@/server/queries/public";

export const revalidate = 3600;

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/films", title: t.media.title, description: t.media.body, image: art("arena", "hero")?.og });
}

export default async function Media({ params }: Params) {
  const { locale: _l, t, p, href } = await resolvePage(params);
  const films: Film[] = (await getVideos()).map((v) => ({ id: v.id, title: v.title, description: v.description, kicker: v.kind, hls: v.hls, youtubeId: v.youtubeId, poster: v.poster, durationSeconds: v.durationSeconds }));
  const [lead, ...rest] = films;
  return (
    <>
      <PageHero eyebrow={t.media.eyebrow} title={t.media.title} body={t.media.body} image={art("arena", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.media }]} size="md" />
      <Band tight>
        {lead ? (
          <>
            <Reveal>
              <FilmLauncher film={lead} closeLabel={t.nav.close} className="frame group relative block aspect-[16/8] w-full overflow-hidden !rounded-[22px] text-start">
                {lead.poster && <img src={lead.poster} alt="" className="absolute inset-0 h-full w-full object-cover transition-transform duration-[1400ms] group-hover:scale-[1.03]" />}
                <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/30 to-transparent" />
                <span className="absolute inset-x-0 bottom-0 flex items-end justify-between gap-6 p-6 sm:p-10">
                  <span>
                    <span className="t-eyebrow text-cyan">{p.media.featured}</span>
                    <span className="t-display mt-2 block text-[clamp(1.8rem,4vw,3.4rem)] text-chalk">{lead.title}</span>
                    {lead.description && <span className="mt-2 hidden max-w-xl text-sm text-mist sm:block">{lead.description}</span>}
                  </span>
                  <span className="flex size-16 shrink-0 items-center justify-center rounded-full border border-white/30 bg-void/40 text-white backdrop-blur-md transition-transform group-hover:scale-110 sm:size-20">
                    <Icon name="play" size={26} className="translate-x-0.5" />
                  </span>
                </span>
              </FilmLauncher>
            </Reveal>
            {rest.length > 0 && (
              <>
                <SectionHead index="02" eyebrow={p.media.all} title={t.media.title} size="md" className="mt-20" />
                <div className="mt-10 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                  {rest.map((f, i) => (
                    <Reveal key={f.id} delay={(i % 3) * 70}>
                      <FilmLauncher film={f} closeLabel={t.nav.close} className="frame group relative block aspect-video w-full overflow-hidden !rounded-[16px] text-start">
                        {f.poster && <img src={f.poster} alt="" loading="lazy" className="absolute inset-0 h-full w-full object-cover transition-transform duration-1000 group-hover:scale-105" />}
                        <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-void to-transparent" />
                        <span className="absolute inset-x-0 bottom-0 flex items-center gap-3 p-4">
                          <span className="flex size-10 items-center justify-center rounded-full border border-white/30 bg-void/40 text-white backdrop-blur">
                            <Icon name="play" size={15} />
                          </span>
                          <span className="min-w-0 truncate text-sm text-chalk">{f.title}</span>
                          <span className="ms-auto font-mono text-xs text-fog">{formatDuration(f.durationSeconds)}</span>
                        </span>
                      </FilmLauncher>
                    </Reveal>
                  ))}
                </div>
              </>
            )}
          </>
        ) : (
          <EmptyState icon="film" title={t.media.title} body={t.media.empty} />
        )}
      </Band>
    </>
  );
}
