"use server";

import { and, eq, ne } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { TAGS } from "@/lib/cache-tags";
import { publish, runAction, type ActionResult } from "../action";
import { audit } from "../audit";
import { AppError } from "../auth/errors";
import { assertCan } from "../auth/guard";
import { db, schema as s } from "../db";
import { formFields, freeSlug, isUuid, zf } from "../forms";
import { deleteAsset, ingestImage } from "../media/images";
import { thumbUrl } from "../media/present";

const CATEGORIES = ["workshop", "competition", "robot_build", "behind_the_scenes", "events", "awards"] as const;

const albumSchema = z.object({
  title: zf.text(120),
  description: zf.body(2000),
  category: z.enum(CATEGORIES),
  takenOn: zf.date,
  published: zf.bool,
});

export async function saveAlbum(_prev: unknown, form: FormData): Promise<ActionResult<{ id: string }>> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "gallery.manage");
    const id = form.get("id");
    const input = albumSchema.parse(formFields(form));
    if (isUuid(id)) {
      const [a] = await db.update(s.galleryAlbums).set(input).where(eq(s.galleryAlbums.id, id)).returning({ id: s.galleryAlbums.id });
      if (!a) throw new AppError("NOT_FOUND", "Album not found.");
      await audit(actor, { action: "album.updated", targetType: "album", targetId: id, summary: input.title }, req);
      publish(TAGS.gallery);
      return { id, created: false };
    }
    const slug = await freeSlug(input.title, async (x) => (await db.select({ id: s.galleryAlbums.id }).from(s.galleryAlbums).where(eq(s.galleryAlbums.slug, x)).limit(1)).length > 0);
    const [a] = await db.insert(s.galleryAlbums).values({ ...input, slug }).returning({ id: s.galleryAlbums.id });
    await audit(actor, { action: "album.created", targetType: "album", targetId: a!.id, summary: input.title }, req);
    publish(TAGS.gallery);
    return { id: a!.id, created: true };
  });
  if (res.ok && res.data.created) redirect(`/command/gallery/${res.data.id}?new=1`);
  return res.ok ? { ok: true, data: { id: res.data.id } } : res;
}

export async function deleteAlbum(id: string): Promise<ActionResult> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "gallery.manage");
    const items = await db.select({ assetId: s.galleryItems.assetId }).from(s.galleryItems).where(eq(s.galleryItems.albumId, id));
    const [a] = await db.delete(s.galleryAlbums).where(eq(s.galleryAlbums.id, id)).returning({ title: s.galleryAlbums.title });
    if (!a) throw new AppError("NOT_FOUND", "Album not found.");
    for (const it of items) await deleteAsset(it.assetId).catch(() => {});
    await audit(actor, { action: "album.deleted", targetType: "album", targetId: id, summary: a.title, meta: { photos: items.length } }, req);
    publish(TAGS.gallery);
  });
  if (res.ok) redirect("/command/gallery?deleted=1");
  return res;
}

/** One photo per request (keeps each upload under serverless body limits); the browser resizes first. */
export async function uploadGalleryPhoto(form: FormData): Promise<ActionResult<{ id: string; assetId: string; thumb: string | null }>> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "gallery.manage");
    const albumId = form.get("albumId");
    const file = form.get("file");
    if (!isUuid(albumId)) throw new AppError("BAD_REQUEST", "Pick an album first.");
    if (!(file instanceof File) || !file.size) throw new AppError("BAD_REQUEST", "No file received.");
    const [album] = await db.select().from(s.galleryAlbums).where(eq(s.galleryAlbums.id, albumId)).limit(1);
    if (!album) throw new AppError("NOT_FOUND", "Album not found.");
    const asset = await ingestImage({ buffer: Buffer.from(await file.arrayBuffer()), filename: file.name, visibility: "public", preset: "default", folder: "gallery", alt: album.title, uploadedBy: actor.userId });
    const [item] = await db
      .insert(s.galleryItems)
      .values({ albumId, assetId: asset.id, category: album.category, takenOn: album.takenOn, published: true, sortOrder: Date.now() % 2_000_000_000 })
      .returning({ id: s.galleryItems.id });
    if (!album.coverId) await db.update(s.galleryAlbums).set({ coverId: asset.id }).where(eq(s.galleryAlbums.id, albumId));
    await audit(actor, { action: "gallery.photo_added", targetType: "album", targetId: albumId, summary: album.title }, req);
    publish(TAGS.gallery);
    return { id: item!.id, assetId: asset.id, thumb: thumbUrl(asset) };
  });
}

const itemPatch = z.object({ caption: z.string().trim().max(300).nullable().optional(), featured: z.boolean().optional(), published: z.boolean().optional() });

export async function updateGalleryItem(id: string, patch: z.input<typeof itemPatch>): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    assertCan(actor, "gallery.manage");
    if (!isUuid(id)) throw new AppError("BAD_REQUEST", "Invalid photo.");
    const p = itemPatch.parse(patch);
    await db.update(s.galleryItems).set({ ...p, ...(p.caption !== undefined ? { caption: p.caption || null } : {}) }).where(eq(s.galleryItems.id, id));
    publish(TAGS.gallery);
  });
}

export async function deleteGalleryItem(id: string): Promise<ActionResult> {
  return runAction(async ({ actor, req }) => {
    assertCan(actor, "gallery.manage");
    const [it] = await db.select().from(s.galleryItems).where(eq(s.galleryItems.id, id)).limit(1);
    if (!it) throw new AppError("NOT_FOUND", "Photo not found.");
    if (it.albumId) {
      // Move the album cover to another photo when its cover is removed.
      const [album] = await db.select({ coverId: s.galleryAlbums.coverId }).from(s.galleryAlbums).where(eq(s.galleryAlbums.id, it.albumId)).limit(1);
      if (album?.coverId === it.assetId) {
        const [next] = await db.select({ assetId: s.galleryItems.assetId }).from(s.galleryItems).where(and(eq(s.galleryItems.albumId, it.albumId), ne(s.galleryItems.id, id))).limit(1);
        await db.update(s.galleryAlbums).set({ coverId: next?.assetId ?? null }).where(eq(s.galleryAlbums.id, it.albumId));
      }
    }
    await deleteAsset(it.assetId);
    await audit(actor, { action: "gallery.photo_deleted", targetType: "album", targetId: it.albumId ?? undefined }, req);
    publish(TAGS.gallery);
  });
}

export async function setAlbumCover(albumId: string, assetId: string): Promise<ActionResult> {
  return runAction(async ({ actor }) => {
    assertCan(actor, "gallery.manage");
    if (!isUuid(albumId) || !isUuid(assetId)) throw new AppError("BAD_REQUEST", "Invalid request.");
    const [owned] = await db.select({ id: s.galleryItems.id }).from(s.galleryItems).where(and(eq(s.galleryItems.albumId, albumId), eq(s.galleryItems.assetId, assetId))).limit(1);
    if (!owned) throw new AppError("BAD_REQUEST", "That photo isn't in this album.");
    await db.update(s.galleryAlbums).set({ coverId: assetId }).where(eq(s.galleryAlbums.id, albumId));
    publish(TAGS.gallery);
  });
}
