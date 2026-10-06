import type { Metadata } from "next";
import Link from "next/link";
import { count, desc, eq } from "drizzle-orm";
import { Icon } from "@/components/brand/icons";
import { EmptyPanel, PageHeader, StatusBadge } from "@/components/command/ui";
import { GALLERY_CATEGORY_LABEL, formatDate } from "@/lib/format";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";
import { thumbUrl } from "@/server/media/present";

export const metadata: Metadata = { title: "Gallery" };

export default async function GalleryAdmin({ searchParams }: { searchParams: Promise<{ deleted?: string }> }) {
  await requirePage("gallery.manage");
  const { deleted } = await searchParams;
  const [albums, counts] = await Promise.all([
    db.select({ a: s.galleryAlbums, cover: s.mediaAssets }).from(s.galleryAlbums).leftJoin(s.mediaAssets, eq(s.mediaAssets.id, s.galleryAlbums.coverId)).orderBy(desc(s.galleryAlbums.takenOn), desc(s.galleryAlbums.createdAt)),
    db.select({ albumId: s.galleryItems.albumId, n: count() }).from(s.galleryItems).groupBy(s.galleryItems.albumId),
  ]);
  const n = new Map(counts.map((c) => [c.albumId, c.n]));

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        kicker="Media"
        title="Gallery"
        description="Albums of workshops, builds and competitions. Create an album, drop in photos — they're resized, converted to AVIF/WebP and published to the website gallery."
        actions={
          <Link href="/command/gallery/new" className="btn btn-primary btn-sm">
            <span aria-hidden className="btn-sheen" />
            <Icon name="plus" size={15} />
            <span>New album</span>
          </Link>
        }
      />
      {deleted && (
        <p role="status" className="mb-5 rounded-xl border border-ok/30 bg-ok/[0.07] px-4 py-3 text-sm text-[#bdf5dc]">
          Album and its photos deleted.
        </p>
      )}
      {!albums.length ? (
        <EmptyPanel
          icon="image"
          title="No albums yet"
          body="Start with your latest workshop or competition — one album per event keeps the website gallery tidy."
          action={
            <Link href="/command/gallery/new" className="btn btn-primary btn-sm">
              <span aria-hidden className="btn-sheen" />
              <Icon name="plus" size={15} />
              <span>New album</span>
            </Link>
          }
        />
      ) : (
        <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
          {albums.map(({ a, cover }) => {
            const t = thumbUrl(cover, 640);
            return (
              <li key={a.id} className="group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-deep/60 hover:border-[var(--line-2)]">
                <div className="relative aspect-[16/10] bg-panel">
                  {t ? <img src={t} alt="" loading="lazy" className="absolute inset-0 size-full object-cover transition-transform duration-500 group-hover:scale-[1.03]" /> : <span className="absolute inset-0 flex items-center justify-center text-steel"><Icon name="image" size={28} /></span>}
                </div>
                <div className="flex items-start justify-between gap-3 p-4">
                  <div className="min-w-0">
                    <Link href={`/command/gallery/${a.id}`} className="block truncate font-display font-semibold text-chalk after:absolute after:inset-0 hover:text-cyan">
                      {a.title}
                    </Link>
                    <p className="mt-1 text-xs text-fog">
                      {GALLERY_CATEGORY_LABEL[a.category]} · {n.get(a.id) ?? 0} photos{a.takenOn ? ` · ${formatDate(a.takenOn)}` : ""}
                    </p>
                  </div>
                  <StatusBadge status={a.published ? "active" : "inactive"} label={a.published ? "Live" : "Draft"} />
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
