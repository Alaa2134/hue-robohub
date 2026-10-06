import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { asc, eq } from "drizzle-orm";
import { EntityForm } from "@/components/command/entity-form";
import { projectFields } from "@/components/command/project-fields";
import { BomEditor, Milestones, ProjectTeam } from "@/components/command/project-ui";
import { Meter, PageHeader, Panel, StatusBadge } from "@/components/command/ui";
import { can } from "@/lib/permissions";
import { requirePage } from "@/server/auth/guard";
import { deleteProject, saveProject } from "@/server/actions/projects";
import { db, schema as s } from "@/server/db";
import { isUuid } from "@/server/forms";
import { thumbUrl } from "@/server/media/present";
import { projectOptions } from "@/server/queries/projects-admin";
import { canEditProject } from "@/server/services/projects";

export const metadata: Metadata = { title: "Project" };

export default async function ProjectAdmin({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ new?: string }> }) {
  const actor = await requirePage("projects.view");
  const [{ id }, { new: fresh }] = await Promise.all([params, searchParams]);
  if (!isUuid(id)) notFound();
  const [row] = await db.select({ p: s.projects, hero: s.mediaAssets }).from(s.projects).leftJoin(s.mediaAssets, eq(s.mediaAssets.id, s.projects.heroId)).where(eq(s.projects.id, id)).limit(1);
  if (!row) notFound();
  const p = row.p;
  const [edit, o, bom, team, milestones] = await Promise.all([
    canEditProject(actor, id),
    projectOptions(),
    db.select().from(s.bomItems).where(eq(s.bomItems.projectId, id)).orderBy(asc(s.bomItems.createdAt)),
    db.select({ id: s.members.id, name: s.members.fullName, role: s.projectMembers.role }).from(s.projectMembers).innerJoin(s.members, eq(s.members.id, s.projectMembers.memberId)).where(eq(s.projectMembers.projectId, id)),
    db.select().from(s.projectMilestones).where(eq(s.projectMilestones.projectId, id)).orderBy(asc(s.projectMilestones.dueDate), asc(s.projectMilestones.position)),
  ]);
  const bomEdit = edit || can(actor.role, "bom.manage");
  const { createdAt: _c, updatedAt: _u, search: _s, ...editable } = p;
  void _c, void _u, void _s;
  const lead = can(actor.role, "projects.manage");

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        kicker={<Link href="/command/projects">← Projects</Link>}
        title={p.title}
        description={
          <span className="flex flex-wrap items-center gap-3">
            <StatusBadge status={p.status} />
            <span className="flex w-40 items-center gap-2">
              <Meter value={p.progress} className="flex-1" />
              <span className="font-mono text-xs">{p.progress}%</span>
            </span>
            {p.published ? <StatusBadge status="active" label="On website" /> : <span className="text-xs text-steel">Draft</span>}
            {fresh && <span className="text-ok">Created — add parts, people and milestones below.</span>}
          </span>
        }
        actions={
          p.published ? (
            <Link href={`/projects/${p.slug}`} target="_blank" className="btn btn-sm">
              <span>View on site ↗</span>
            </Link>
          ) : undefined
        }
      />
      <div className="grid gap-6 lg:grid-cols-[1fr_22rem]">
        <div className="flex min-w-0 flex-col gap-6">
          <Panel title="Bill of materials" kicker="Costs against budget">
            <BomEditor projectId={p.id} title={p.title} budget={p.budget ? Number(p.budget) : 0} canEdit={bomEdit} items={bom.map((b) => ({ id: b.id, part: b.part, quantity: b.quantity, unitPrice: Number(b.unitPrice), vendor: b.vendor, url: b.url, status: b.status, notes: b.notes }))} />
          </Panel>
          {edit ? (
            <Panel title="Project details">
              <EntityForm
                action={saveProject}
                value={{ ...editable, budget: p.budget ? Number(p.budget) : null }}
                fields={projectFields({ ...o, heroUrl: thumbUrl(row.hero, 960), lead, full: true })}
                submitLabel="Save project"
                onDelete={lead ? deleteProject.bind(null, p.id) : undefined}
                deleteLabel="Delete project"
              />
            </Panel>
          ) : (
            <Panel title="Summary">
              <p className="text-sm leading-relaxed text-mist">{p.summary || "—"}</p>
            </Panel>
          )}
        </div>
        <div className="flex flex-col gap-6">
          <Panel title="Team" kicker={`${team.length} people`}>
            <ProjectTeam projectId={p.id} team={team} members={o.members} canEdit={edit} />
          </Panel>
          <Panel title="Milestones">
            <Milestones projectId={p.id} canEdit={edit} items={milestones.map((m) => ({ id: m.id, title: m.title, dueDate: m.dueDate, done: !!m.completedAt }))} />
          </Panel>
        </div>
      </div>
    </div>
  );
}
