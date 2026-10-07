import type { Metadata } from "next";
import { buildItems } from "@/lib/build-content";
import { STATIC_SITE } from "@/lib/deploy";
import { LiveGallery } from "@/components/live/live-content";
import Link from "next/link";
import { Picture } from "@/components/media/picture";
import { Reveal } from "@/components/motion/reveal";
import { MediaWallGrid } from "@/components/pages/lightbox";
import { Band } from "@/components/pages/section";
import { fromArt, fromImage } from "@/components/pages/wall-items";
import { PageHero } from "@/components/site/page-hero";
import { SectionHead } from "@/components/ui/section-head";
import { formatDate, GALLERY_CATEGORY_LABEL } from "@/lib/format";
import { art } from "@/lib/media-library";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getGallery } from "@/server/queries/public";

export const revalidate = 3600;

const KEY_ART: [string, string][] = [
  ["hero", "BX-01 · humanoid platform"],
  ["arena", "Competition arena"],
  ["team_sprint", "Sprint · starting grid"],
  ["track_software", "ROS · LiDAR point cloud"],
  ["team_sumo", "Sumo · face-off"],
  ["track_mechanical", "Mechanical · exploded gearbox"],
  ["track_embedded", "Embedded · ESP32 bench"],
  ["team_autonomous", "Autonomous · mapped floor"],
  ["trophy", "BuildX Challenge trophy"],
  ["bootcamp_7", "Bootcamp · BuildX Challenge"],
  ["team_innovation", "Innovation · reveal"],
  ["recruit", "Join the next generation"],
  ["team_line_follower", "Line Follower · on the line"],
  ["idea", "Idea · blueprint"],
  ["team_env", "The lab at work"],
  ["macro", "Hardware macro"],
];

export async function generateMetadata({ params }: Params): Promise<Metadata> {
  const { locale, t } = await resolvePage(params);
  return pageMeta({ locale, path: "/gallery", title: t.gallery.title, description: t.gallery.body, image: art("team_env", "hero")?.og });
}

export default async function Gallery({ params }: Params) {
  const { locale, t, p, href } = await resolvePage(params);
  if (STATIC_SITE)
    return (
      <>
        <PageHero eyebrow={t.gallery.eyebrow} title={t.gallery.title} body={t.gallery.body} image={art("team_env", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.gallery }]} size="md" />
        <Band>
          <LiveGallery locale={locale} initial={await buildItems("photo")} />
        </Band>
      </>
    );
  const { albums, items } = await getGallery();
  const wall = items.length
    ? items.map((g) => fromImage(g.id, g.image, g.caption ?? "", GALLERY_CATEGORY_LABEL[g.category] ?? g.category))
    : KEY_ART.map(([n, c]) => [art(n), c] as const)
        .filter(([e]) => !!e)
        .map(([e, c]) => fromArt(e!, c, p.gallery.keyArt));
  return (
    <>
      <PageHero eyebrow={t.gallery.eyebrow} title={t.gallery.title} body={t.gallery.body} image={art("team_env", "hero")} crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.gallery }]} size="md" />
      {albums.length > 0 && (
        <Band tight>
          <SectionHead index="01" eyebrow={p.gallery.albums} title={t.gallery.albums} size="md" />
          <div className="mt-10 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {albums.map((a, i) => (
              <Reveal key={a.id} delay={(i % 3) * 70}>
                <Link href={href(`/gallery/${a.slug}`)} className="frame group relative block aspect-[4/3] overflow-hidden !rounded-[18px]">
                  {a.cover && <Picture image={a.cover} sizes="(min-width:1024px) 33vw, 100vw" className="absolute inset-0 h-full w-full transition-transform duration-1000 group-hover:scale-105" />}
                  <span aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/20 to-transparent" />
                  <span className="absolute inset-x-0 bottom-0 p-5">
                    <span className="t-eyebrow text-[0.56rem] text-cyan">{GALLERY_CATEGORY_LABEL[a.category] ?? a.category}</span>
                    <span className="t-headline mt-1 block text-xl text-chalk">{a.title}</span>
                    <span className="mt-1 block text-xs text-fog">
                      {a.count} {t.gallery.photos}
                      {a.takenOn ? ` · ${formatDate(a.takenOn, locale)}` : ""}
                    </span>
                  </span>
                </Link>
              </Reveal>
            ))}
          </div>
        </Band>
      )}
      <Band alt={albums.length > 0} tight>
        <SectionHead index={albums.length ? "02" : "01"} eyebrow={items.length ? t.gallery.latest : p.gallery.keyArt} title={items.length ? t.gallery.title : p.gallery.keyArt} body={items.length ? undefined : p.gallery.keyArtNote} size="md" />
        <div className="mt-10">
          <MediaWallGrid items={wall} labels={{ close: p.gallery.close, prev: p.gallery.prev, next: p.gallery.next }} />
        </div>
      </Band>
    </>
  );
}
