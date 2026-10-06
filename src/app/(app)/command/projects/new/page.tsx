import type { Metadata } from "next";
import Link from "next/link";
import { EntityForm } from "@/components/command/entity-form";
import { projectFields } from "@/components/command/project-fields";
import { PageHeader } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { saveProject } from "@/server/actions/projects";
import { projectOptions } from "@/server/queries/projects-admin";

export const metadata: Metadata = { title: "New project" };

export default async function NewProject() {
  await requirePage("projects.manage");
  const o = await projectOptions();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker={<Link href="/command/projects">← Projects</Link>} title="New project" description="Start with the essentials — BOM, team, milestones and the case study come next." />
      <EntityForm action={saveProject} value={{ status: "idea", progress: 0 }} fields={projectFields({ ...o, lead: true, full: false })} submitLabel="Create project" cancelHref="/command/projects" />
    </div>
  );
}
