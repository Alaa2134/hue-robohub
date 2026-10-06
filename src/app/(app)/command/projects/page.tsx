import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/brand/icons";
import { PROJECT_STATUSES } from "@/components/command/project-fields";
import { DataTable, EmptyPanel, Meter, PageHeader, StatusBadge, Tabs, money, type Column } from "@/components/command/ui";
import { can } from "@/lib/permissions";
import { requirePage } from "@/server/auth/guard";
import { listProjects, projectCounts } from "@/server/queries/projects-admin";

export const metadata: Metadata = { title: "Projects" };
type Row = Awaited<ReturnType<typeof listProjects>>[number];

export default async function ProjectsAdmin({ searchParams }: { searchParams: Promise<{ status?: string; deleted?: string }> }) {
  const actor = await requirePage("projects.view");
  const { status, deleted } = await searchParams;
  const valid = PROJECT_STATUSES.some((s) => s.value === status) ? status : undefined;
  const [rows, counts] = await Promise.all([listProjects(valid), projectCounts()]);
  const active = Object.entries(counts).filter(([k]) => k !== "archived").reduce((a, [, n]) => a + n, 0);
  const cols: Column<Row>[] = [
    {
      key: "title",
      label: "Project",
      render: (p) => (
        <span className="flex items-center gap-2.5">
          {p.teamAccent && <span className="h-8 w-1 shrink-0 rounded-full" style={{ background: p.teamAccent }} />}
          <span className="min-w-0">
            <span className="block truncate">{p.title}</span>
            <span className="block truncate text-xs font-normal text-fog">{[p.track, p.team, p.manager && `PM ${p.manager}`].filter(Boolean).join(" · ") || "—"}</span>
          </span>
        </span>
      ),
    },
    { key: "status", label: "Stage", render: (p) => <StatusBadge status={p.status} /> },
    {
      key: "progress",
      label: "Progress",
      className: "w-40",
      render: (p) => (
        <span className="flex items-center gap-2">
          <Meter value={p.progress} className="flex-1" />
          <span className="w-8 text-end font-mono text-xs">{p.progress}%</span>
        </span>
      ),
    },
    { key: "bom", label: "BOM / budget", align: "end", render: (p) => <span className={p.budget > 0 && p.bomTotal > p.budget ? "font-mono text-xs text-danger" : "font-mono text-xs"}>{money(p.bomTotal)}{p.budget > 0 ? ` / ${money(p.budget)}` : ""}</span> },
    { key: "site", label: "Website", render: (p) => (p.published ? <StatusBadge status="active" label={p.featured ? "Featured" : "Live"} tone={p.featured ? "gold" : "ok"} /> : <span className="text-xs text-steel">Draft</span>) },
  ];
  const tab = (s?: string) => `/command/projects${s ? `?status=${s}` : ""}`;

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        kicker="Engineering"
        title="Projects"
        description="From idea to competition-ready — with case studies for the website, BOM costs against budget, team and milestones."
        actions={
          can(actor.role, "projects.manage") && (
            <Link href="/command/projects/new" className="btn btn-primary btn-sm">
              <span aria-hidden className="btn-sheen" />
              <Icon name="plus" size={15} />
              <span>New project</span>
            </Link>
          )
        }
      />
      {deleted && <p className="mb-5 rounded-xl border border-ok/30 bg-ok/[0.07] px-4 py-3 text-sm text-[#bdf5dc]">Project deleted.</p>}
      <Tabs current={tab(valid)} items={[{ href: tab(), label: "Active", count: active }, ...PROJECT_STATUSES.map((s) => ({ href: tab(s.value), label: s.label, count: counts[s.value] ?? 0 }))]} />
      <DataTable columns={cols} rows={rows} rowKey={(p) => p.id} rowHref={(p) => `/command/projects/${p.id}`} caption="Projects" empty={<EmptyPanel icon="cpu" title="No projects here" body="Create a project to track its stage, BOM and case study." />} />
    </div>
  );
}
