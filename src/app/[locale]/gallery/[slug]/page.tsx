import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MediaWallGrid } from "@/components/pages/lightbox";
import { Band } from "@/components/pages/section";
import { fromImage } from "@/components/pages/wall-items";
import { PageHero } from "@/components/site/page-hero";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDate, GALLERY_CATEGORY_LABEL } from "@/lib/format";
import { resolvePage, type Params } from "@/lib/page";
import { pageMeta } from "@/lib/seo";
import { getAlbum } from "@/server/queries/public";

export const revalidate = 3600;
export const dynamicParams = true;
export async function generateStaticParams() {
  return [];
}

type P = Params<{ slug: string }>;

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { locale, slug } = await resolvePage(params);
  const a = await getAlbum(slug);
  if (!a) return {};
  return pageMeta({ locale, path: `/gallery/${slug}`, title: a.title, description: a.description ?? undefined, image: a.ogImage });
}

export default async function Album({ params }: P) {
  const { locale, t, p, href, slug } = await resolvePage(params);
  const a = await getAlbum(slug);
  if (!a) notFound();
  const tag = GALLERY_CATEGORY_LABEL[a.category] ?? a.category;
  return (
    <>
      <PageHero
        eyebrow={`${tag}${a.takenOn ? ` · ${formatDate(a.takenOn, locale)}` : ""}`}
        title={a.title}
        body={a.description ?? undefined}
        image={a.items[0]?.image}
        crumbs={[{ label: t.nav.home, href: href("/") }, { label: t.nav.gallery, href: href("/gallery") }, { label: a.title }]}
        size="md"
      />
      <Band tight>
        {a.items.length ? (
          <MediaWallGrid items={a.items.map((g) => fromImage(g.id, g.image, g.caption ?? "", tag))} labels={{ close: p.gallery.close, prev: p.gallery.prev, next: p.gallery.next }} />
        ) : (
          <EmptyState icon="image" title={a.title} body={t.gallery.empty} />
        )}
        <div className="mt-12">
          <ButtonLink href={href("/gallery")} arrow>
            {p.gallery.back}
          </ButtonLink>
        </div>
      </Band>
    </>
  );
}
