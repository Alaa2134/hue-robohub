import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { EntityForm } from "@/components/command/entity-form";
import { videoFields } from "@/components/command/showcase-fields";
import { PageHeader } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { deleteVideo, saveVideo } from "@/server/actions/showcase";
import { db, schema as s } from "@/server/db";
import { isUuid } from "@/server/forms";
import { thumbUrl } from "@/server/media/present";
import { options } from "@/server/queries/options";

export const metadata: Metadata = { title: "Video" };

export default async function VideoEdit({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("gallery.manage");
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !isUuid(id)) notFound();
  const [row] = isNew ? [] : await db.select({ v: s.videos, poster: s.mediaAssets }).from(s.videos).leftJoin(s.mediaAssets, eq(s.mediaAssets.id, s.videos.posterId)).where(eq(s.videos.id, id)).limit(1);
  if (!isNew && !row) notFound();
  const [teams, projects] = await Promise.all([options.teams(), options.projects()]);
  const v = row?.v;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker={<Link href="/command/videos">← Videos</Link>} title={v?.title ?? "Add video"} />
      <EntityForm
        action={saveVideo}
        value={v ? { id: v.id, title: v.title, kind: v.kind, provider: v.provider, source: v.provider === "youtube" ? `https://youtu.be/${v.source}` : v.source, description: v.description, recordedOn: v.recordedOn, durationSeconds: v.durationSeconds, projectId: v.projectId, teamId: v.teamId, published: v.published, featured: v.featured } : { provider: "youtube", kind: "recap", published: true }}
        fields={videoFields({ teams, projects, posterUrl: thumbUrl(row?.poster, 960) })}
        submitLabel={isNew ? "Add video" : "Save"}
        cancelHref="/command/videos"
        onDelete={v ? deleteVideo.bind(null, v.id) : undefined}
      />
    </div>
  );
}
