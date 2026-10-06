import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { EntityForm } from "@/components/command/entity-form";
import { sponsorFields } from "@/components/command/showcase-fields";
import { PageHeader } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { deleteSponsor, saveSponsor } from "@/server/actions/showcase";
import { db, schema as s } from "@/server/db";
import { isUuid } from "@/server/forms";
import { thumbUrl } from "@/server/media/present";

export const metadata: Metadata = { title: "Sponsor" };

export default async function SponsorEdit({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("sponsors.manage");
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !isUuid(id)) notFound();
  const [row] = isNew ? [] : await db.select({ x: s.sponsors, logo: s.mediaAssets }).from(s.sponsors).leftJoin(s.mediaAssets, eq(s.mediaAssets.id, s.sponsors.logoId)).where(eq(s.sponsors.id, id)).limit(1);
  if (!isNew && !row) notFound();
  const x = row?.x;
  return (
    <div className="mx-auto max-w-3xl">
      <PageHeader kicker={<Link href="/command/sponsors">← Sponsors</Link>} title={x?.name ?? "Add sponsor"} />
      <EntityForm
        action={saveSponsor}
        value={x ? { id: x.id, name: x.name, tier: x.tier, website: x.website, description: x.description, sortOrder: x.sortOrder, active: x.active } : { tier: "technical", sortOrder: 100, active: true }}
        fields={sponsorFields(thumbUrl(row?.logo, 640))}
        submitLabel={isNew ? "Add sponsor" : "Save"}
        cancelHref="/command/sponsors"
        onDelete={x ? deleteSponsor.bind(null, x.id) : undefined}
      />
    </div>
  );
}
