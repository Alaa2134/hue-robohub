import type { Metadata } from "next";
import Link from "next/link";
import { EntityForm } from "@/components/command/entity-form";
import { albumFields } from "@/components/command/gallery-fields";
import { PageHeader } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { saveAlbum } from "@/server/actions/gallery";

export const metadata: Metadata = { title: "New album" };

export default async function NewAlbum() {
  await requirePage("gallery.manage");
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker={<Link href="/command/gallery">← Gallery</Link>} title="New album" description="Name the album first; you'll add photos on the next screen." />
      <EntityForm action={saveAlbum} value={{ category: "workshop", published: true, takenOn: new Date().toISOString().slice(0, 10) }} fields={albumFields} submitLabel="Create album" cancelHref="/command/gallery" />
    </div>
  );
}
