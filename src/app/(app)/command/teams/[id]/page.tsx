import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { EntityForm } from "@/components/command/entity-form";
import { teamFields } from "@/components/command/showcase-fields";
import { PageHeader } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { saveTeam } from "@/server/actions/showcase";
import { db, schema as s } from "@/server/db";
import { isUuid } from "@/server/forms";
import { thumbUrl } from "@/server/media/present";
import { options } from "@/server/queries/options";

export const metadata: Metadata = { title: "Team" };

export default async function TeamEdit({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("teams.manage");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [[row], specs, members] = await Promise.all([
    db.select({ t: s.competitionTeams, cover: s.mediaAssets }).from(s.competitionTeams).leftJoin(s.mediaAssets, eq(s.mediaAssets.id, s.competitionTeams.coverId)).where(eq(s.competitionTeams.id, id)).limit(1),
    db.select().from(s.teamSpecs).where(eq(s.teamSpecs.teamId, id)).orderBy(asc(s.teamSpecs.position)),
    options.members(),
  ]);
  if (!row) notFound();
  const t = row.t;
  const specRows = Math.min(12, Math.max(6, specs.length + 2));
  const specValues = Object.fromEntries(specs.flatMap((sp, i) => [[`spec.${i}.label`, sp.label], [`spec.${i}.value`, sp.value]]));
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        kicker={<Link href="/command/teams">← Competition teams</Link>}
        title={t.name}
        actions={
          <Link href={`/competitions/${t.slug}`} target="_blank" className="btn btn-sm">
            <span>View on site ↗</span>
          </Link>
        }
      />
      <EntityForm
        action={saveTeam}
        value={{ id: t.id, name: t.name, nameAr: t.nameAr, discipline: t.discipline, summary: t.summary, description: t.description, accent: t.accent, robotName: t.robotName, robotDescription: t.robotDescription, captainId: t.captainId, sortOrder: t.sortOrder, published: t.published, ...specValues }}
        fields={teamFields({ members, coverUrl: thumbUrl(row.cover, 960), specRows })}
        submitLabel="Save team"
        cancelHref="/command/teams"
      />
    </div>
  );
}
