import type { Metadata } from "next";
import Link from "next/link";
import { desc, eq } from "drizzle-orm";
import { Icon } from "@/components/brand/icons";
import { EmptyPanel, PageHeader, StatusBadge, humanize } from "@/components/command/ui";
import { resolveVideo } from "@/lib/video";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";
import { env } from "@/server/env";
import { thumbUrl } from "@/server/media/present";

export const metadata: Metadata = { title: "Videos" };

export default async function VideosAdmin({ searchParams }: { searchParams: Promise<{ saved?: string; deleted?: string }> }) {
  await requirePage("gallery.manage");
  const sp = await searchParams;
  const rows = await db.select({ v: s.videos, poster: s.mediaAssets }).from(s.videos).leftJoin(s.mediaAssets, eq(s.mediaAssets.id, s.videos.posterId)).orderBy(desc(s.videos.featured), desc(s.videos.createdAt));
  const cc = env().CLOUDFLARE_STREAM_CUSTOMER_CODE;
  return (
    <div className="mx-auto max-w-[1400px]">
      <PageHeader
        kicker="Media"
        title="Videos"
        description="Films, recaps and robot tests for the website. YouTube links cost nothing to host; self-hosted HLS films from the media pipeline also work."
        actions={
          <Link href="/command/videos/new" className="btn btn-primary btn-sm">
            <span aria-hidden className="btn-sheen" />
            <Icon name="plus" size={15} />
            <span>Add video</span>
          </Link>
        }
      />
      {(sp.saved || sp.deleted) && <p className="mb-5 rounded-xl border border-ok/30 bg-ok/[0.07] px-4 py-3 text-sm text-[#bdf5dc]">{sp.saved ? "Saved." : "Deleted."}</p>}
      {!rows.length ? (
        <EmptyPanel icon="film" title="No videos yet" body="Paste a YouTube link for a recap or robot test — it shows on the Films page and on project/team pages." />
      ) : (
        <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {rows.map(({ v, poster }) => {
            const img = thumbUrl(poster, 640) ?? resolveVideo(v.provider, v.source, cc).poster;
            return (
              <li key={v.id} className="group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-deep/50 hover:border-[var(--line-2)]">
                <div className="relative aspect-video bg-panel">
                  {img ? <img src={img} alt="" loading="lazy" className="absolute inset-0 size-full object-cover" /> : <span className="absolute inset-0 flex items-center justify-center text-steel"><Icon name="film" size={26} /></span>}
                  <span className="absolute start-2 top-2 rounded-full bg-void/80 px-2 py-0.5 font-mono text-[0.6rem] uppercase text-mist">{v.provider}</span>
                </div>
                <div className="flex items-start justify-between gap-2 p-4">
                  <span className="min-w-0">
                    <Link href={`/command/videos/${v.id}`} className="block truncate font-medium text-chalk after:absolute after:inset-0 hover:text-cyan">
                      {v.title}
                    </Link>
                    <span className="text-xs text-fog">{humanize(v.kind)}</span>
                  </span>
                  {v.published ? <StatusBadge status="active" label={v.featured ? "Featured" : "Live"} tone={v.featured ? "gold" : "ok"} /> : <StatusBadge status="inactive" label="Draft" />}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
