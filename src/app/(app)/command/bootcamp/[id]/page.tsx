import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq, max } from "drizzle-orm";
import { LessonsEditor } from "@/components/command/bootcamp-ui";
import { EntityForm, type EntityField } from "@/components/command/entity-form";
import { PageHeader, Panel } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { deleteModule, saveModule } from "@/server/actions/bootcamp";
import { db, schema as s } from "@/server/db";
import { isUuid } from "@/server/forms";

export const metadata: Metadata = { title: "Bootcamp week" };

const fields: EntityField[] = [
  { kind: "number", name: "week", label: "Week", min: 1, max: 52, required: true },
  { kind: "switch", name: "published", label: "Show on the website" },
  { kind: "text", name: "title", label: "Title", required: true, maxLength: 140, wide: true },
  { kind: "textarea", name: "summary", label: "Summary", rows: 2 },
  { kind: "textarea", name: "outcomes", label: "Outcomes", rows: 4, hint: "One per line — what trainees can do after this week." },
];

export default async function ModuleEdit({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("bootcamp.manage");
  const { id } = await params;
  const isNew = id === "new";
  if (!isNew && !isUuid(id)) notFound();
  const [m] = isNew ? [] : await db.select().from(s.bootcampModules).where(eq(s.bootcampModules.id, id)).limit(1);
  if (!isNew && !m) notFound();
  const lessons = m ? await db.select().from(s.bootcampLessons).where(eq(s.bootcampLessons.moduleId, m.id)).orderBy(asc(s.bootcampLessons.position)) : [];
  const [last] = isNew ? await db.select({ w: max(s.bootcampModules.week) }).from(s.bootcampModules) : [];
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker={<Link href="/command/bootcamp">← Bootcamp</Link>} title={m ? `Week ${m.week} · ${m.title}` : "Add week"} />
      <div className="flex flex-col gap-6">
        {m && (
          <Panel title="Lessons">
            <LessonsEditor moduleId={m.id} lessons={lessons.map((l) => ({ id: l.id, title: l.title, durationMinutes: l.durationMinutes, materialUrl: l.materialUrl }))} />
          </Panel>
        )}
        <Panel title="Week details">
          <EntityForm action={saveModule} value={m ? { id: m.id, week: m.week, title: m.title, summary: m.summary, outcomes: m.outcomes.join("\n"), published: m.published } : { week: (last?.w ?? 0) + 1, published: true }} fields={fields} submitLabel={isNew ? "Add week" : "Save week"} cancelHref="/command/bootcamp" onDelete={m ? deleteModule.bind(null, m.id) : undefined} deleteLabel="Delete week" />
        </Panel>
      </div>
    </div>
  );
}
