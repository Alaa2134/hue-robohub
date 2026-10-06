import type { Metadata } from "next";
import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { Icon } from "@/components/brand/icons";
import { SPONSOR_TIERS } from "@/components/command/showcase-fields";
import { EmptyPanel, PageHeader, StatusBadge } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";
import { thumbUrl } from "@/server/media/present";

export const metadata: Metadata = { title: "Sponsors" };

export default async function SponsorsAdmin({ searchParams }: { searchParams: Promise<{ saved?: string; deleted?: string }> }) {
  await requirePage("sponsors.manage");
  const sp = await searchParams;
  const rows = await db.select({ x: s.sponsors, logo: s.mediaAssets }).from(s.sponsors).leftJoin(s.mediaAssets, eq(s.mediaAssets.id, s.sponsors.logoId)).orderBy(asc(s.sponsors.tier), asc(s.sponsors.sortOrder));
  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        kicker="Organisation"
        title="Sponsors"
        description="Partners shown on the website's Sponsors page by tier. Only list organisations that have actually agreed to sponsor."
        actions={
          <Link href="/command/sponsors/new" className="btn btn-primary btn-sm">
            <span aria-hidden className="btn-sheen" />
            <Icon name="plus" size={15} />
            <span>Add sponsor</span>
          </Link>
        }
      />
      {(sp.saved || sp.deleted) && <p className="mb-5 rounded-xl border border-ok/30 bg-ok/[0.07] px-4 py-3 text-sm text-[#bdf5dc]">{sp.saved ? "Saved." : "Deleted."}</p>}
      {!rows.length ? (
        <EmptyPanel icon="handshake" title="No sponsors yet" body="When a company or lab supports you, add their logo here — it appears on the website instantly." />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ x, logo }) => (
            <li key={x.id} className="relative flex items-center gap-4 rounded-2xl border border-[var(--line)] bg-deep/50 p-4 hover:border-[var(--line-2)]">
              <span className="flex h-14 w-24 shrink-0 items-center justify-center rounded-lg bg-white/[0.04] p-2">{thumbUrl(logo, 320) ? <img src={thumbUrl(logo, 320)!} alt="" className="max-h-full max-w-full object-contain" /> : <Icon name="handshake" size={20} className="text-steel" />}</span>
              <span className="min-w-0">
                <Link href={`/command/sponsors/${x.id}`} className="block truncate font-medium text-chalk after:absolute after:inset-0 hover:text-cyan">
                  {x.name}
                </Link>
                <span className="mt-1 flex items-center gap-2 text-xs text-fog">
                  {SPONSOR_TIERS.find((t) => t.value === x.tier)?.label}
                  {!x.active && <StatusBadge status="inactive" label="Hidden" />}
                </span>
              </span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
