import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { EntityForm } from "@/components/command/entity-form";
import { achievementFields } from "@/components/command/showcase-fields";
import { PageHeader } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { deleteAchievement, saveAchievement } from "@/server/actions/showcase";
import { db, schema as s } from "@/server/db";
import { isUuid } from "@/server/forms";
import { thumbUrl } from "@/server/media/present";
import { options } from "@/server/queries/options";

export const metadata: Metadata = { title: "Achievement" };

export default async function AchievementEdit({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("competitions.manage");
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !isUuid(id)) notFound();
  const [row] = isNew ? [] : await db.select({ a: s.achievements, img: s.mediaAssets }).from(s.achievements).leftJoin(s.mediaAssets, eq(s.mediaAssets.id, s.achievements.imageId)).where(eq(s.achievements.id, id)).limit(1);
  if (!isNew && !row) notFound();
  const [teams, competitions, projects] = await Promise.all([options.teams(), options.competitions(), options.projects()]);
  const a = row?.a;
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker={<Link href="/command/competitions?tab=achievements">← Achievements</Link>} title={a?.title ?? "Add achievement"} />
      <EntityForm
        action={saveAchievement}
        value={a ? { id: a.id, title: a.title, kind: a.kind, achievedOn: a.achievedOn, rank: a.rank, competitionId: a.competitionId, teamId: a.teamId, projectId: a.projectId, description: a.description, public: a.public } : { kind: "ranking", public: true, achievedOn: new Date().toISOString().slice(0, 10) }}
        fields={achievementFields({ teams, competitions, projects, imageUrl: thumbUrl(row?.img, 960) })}
        submitLabel={isNew ? "Add achievement" : "Save"}
        cancelHref="/command/competitions?tab=achievements"
        onDelete={a ? deleteAchievement.bind(null, a.id) : undefined}
      />
    </div>
  );
}
