import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, desc, eq } from "drizzle-orm";
import { EntityForm } from "@/components/command/entity-form";
import { albumFields } from "@/components/command/gallery-fields";
import { GalleryGrid, GalleryUploader } from "@/components/command/gallery-ui";
import { PageHeader, Panel } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { deleteAlbum, saveAlbum } from "@/server/actions/gallery";
import { db, schema as s } from "@/server/db";
import { isUuid } from "@/server/forms";
import { thumbUrl } from "@/server/media/present";

export const metadata: Metadata = { title: "Album" };

export default async function AlbumAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  await requirePage("gallery.manage");
  const [{ id }, { new: fresh }] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const [album] = await db.select().from(s.galleryAlbums).where(eq(s.galleryAlbums.id, id)).limit(1);
  if (!album) notFound();
  const rows = await db
    .select({ it: s.galleryItems, asset: s.mediaAssets })
    .from(s.galleryItems)
    .innerJoin(s.mediaAssets, eq(s.mediaAssets.id, s.galleryItems.assetId))
    .where(eq(s.galleryItems.albumId, id))
    .orderBy(asc(s.galleryItems.sortOrder), desc(s.galleryItems.createdAt));

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        kicker={<Link href="/command/gallery">← Gallery</Link>}
        title={album.title}
        description={fresh ? "Album created. Now drop in the photos." : `${rows.length} photos${album.published ? " · live on the website" : " · draft (not on the website yet)"}`}
        actions={
          album.published ? (
            <Link href={`/gallery/${album.slug}`} target="_blank" className="btn btn-sm">
              <span>View on site ↗</span>
            </Link>
          ) : undefined
        }
      />
      <div className="flex flex-col gap-6">
        <Panel title="Add photos">
          <GalleryUploader albumId={album.id} />
        </Panel>
        <Panel title="Photos" kicker={`${rows.length} in this album`}>
          <GalleryGrid albumId={album.id} coverId={album.coverId} items={rows.map(({ it, asset }) => ({ id: it.id, assetId: it.assetId, thumb: thumbUrl(asset), caption: it.caption, featured: it.featured, published: it.published }))} />
        </Panel>
        <Panel title="Album details">
          <EntityForm action={saveAlbum} value={{ id: album.id, title: album.title, category: album.category, takenOn: album.takenOn, published: album.published, description: album.description }} fields={albumFields} submitLabel="Save album" onDelete={deleteAlbum.bind(null, album.id)} deleteLabel="Delete album" />
        </Panel>
      </div>
    </div>
  );
}
