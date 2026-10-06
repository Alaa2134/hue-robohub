import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { EntityForm } from "@/components/command/entity-form";
import { competitionFields } from "@/components/command/showcase-fields";
import { PageHeader } from "@/components/command/ui";
import { toZonedInput } from "@/lib/zoned";
import { requirePage } from "@/server/auth/guard";
import { deleteCompetition, saveCompetition } from "@/server/actions/showcase";
import { db, schema as s } from "@/server/db";
import { isUuid } from "@/server/forms";
import { options } from "@/server/queries/options";

export const metadata: Metadata = { title: "Competition" };

export default async function CompetitionEdit({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("competitions.manage");
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !isUuid(id)) notFound();
  const [c] = isNew ? [] : await db.select().from(s.competitions).where(eq(s.competitions.id, id)).limit(1);
  if (!isNew && !c) notFound();
  const teams = await options.teams();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker={<Link href="/command/competitions">← Competitions</Link>} title={c?.name ?? "Add competition"} />
      <EntityForm
        action={saveCompetition}
        value={c ? { ...c, startsAt: toZonedInput(c.startsAt), registrationDeadline: toZonedInput(c.registrationDeadline), createdAt: undefined, updatedAt: undefined } : { status: "planned" }}
        fields={competitionFields(teams)}
        submitLabel={isNew ? "Add competition" : "Save"}
        cancelHref="/command/competitions"
        onDelete={c ? deleteCompetition.bind(null, c.id) : undefined}
      />
    </div>
  );
}
