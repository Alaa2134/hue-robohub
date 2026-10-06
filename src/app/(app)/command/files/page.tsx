import type { Metadata } from "next";
import { and, desc, eq, ilike, like, type SQL } from "drizzle-orm";
import { FilterSelect } from "@/components/command/filters";
import { FileActions, FileUploader } from "@/components/command/files-ui";
import { DataTable, EmptyPanel, PageHeader, Panel, Toolbar, relTime, type Column } from "@/components/command/ui";
import { can } from "@/lib/permissions";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "Files" };

const FOLDERS = ["Datasheets", "CAD", "Reports", "Presentations", "Competition rules", "Templates", "Other"] as const;
const size = (b: number) => (b > 1048576 ? `${(b / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(b / 1024))} KB`);

export default async function FilesPage({ searchParams }: { searchParams: Promise<{ q?: string; folder?: string }> }) {
  const actor = await requirePage("files.view");
  const sp = await searchParams;
  const manage = can(actor.role, "files.manage");
  const where: SQL[] = [eq(s.mediaAssets.visibility, "private"), like(s.mediaAssets.folder, "files/%")];
  if (sp.folder && (FOLDERS as readonly string[]).includes(sp.folder)) where.push(eq(s.mediaAssets.folder, `files/${sp.folder}`));
  if (sp.q) where.push(ilike(s.mediaAssets.filename, `%${sp.q}%`));
  const rows = await db
    .select({ id: s.mediaAssets.id, name: s.mediaAssets.filename, folder: s.mediaAssets.folder, bytes: s.mediaAssets.bytes, at: s.mediaAssets.createdAt, by: s.users.name })
    .from(s.mediaAssets)
    .leftJoin(s.users, eq(s.users.id, s.mediaAssets.uploadedBy))
    .where(and(...where))
    .orderBy(desc(s.mediaAssets.createdAt))
    .limit(500);
  type R = (typeof rows)[number];
  const cols: Column<R>[] = [
    { key: "name", label: "File", render: (r) => <span className="min-w-0"><span className="block truncate text-chalk">{r.name}</span><span className="block text-xs text-fog">{r.folder?.replace("files/", "")}</span></span> },
    { key: "size", label: "Size", align: "end", render: (r) => <span className="font-mono text-xs">{size(r.bytes)}</span> },
    { key: "by", label: "Uploaded", render: (r) => <span className="text-xs">{r.by ?? "—"} · {relTime(r.at)}</span> },
    { key: "act", label: "", align: "end", render: (r) => <FileActions id={r.id} name={r.name} canDelete={manage} /> },
  ];
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader kicker="Media" title="Files" description="Private team documents — datasheets, CAD, reports and rulebooks. Never public; every download uses a link that expires in 10 minutes." />
      {manage && (
        <Panel title="Upload" className="mb-6">
          <FileUploader folders={FOLDERS} />
        </Panel>
      )}
      <Toolbar q={sp.q} placeholder="Search files…">
        <FilterSelect name="folder" defaultValue={sp.folder ?? ""} aria-label="Folder">
          <option value="">All folders</option>
          {FOLDERS.map((f) => (
            <option key={f}>{f}</option>
          ))}
        </FilterSelect>
      </Toolbar>
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.id} caption="Files" empty={<EmptyPanel icon="book" title="No files yet" body={manage ? "Upload datasheets, CAD and reports — they stay private to the team." : undefined} />} />
    </div>
  );
}
