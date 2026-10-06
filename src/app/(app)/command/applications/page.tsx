import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Icon } from "@/components/brand/icons";
import { FilterSelect } from "@/components/command/filters";
import { DataTable, EmptyPanel, PageHeader, StatusBadge, Tabs, Toolbar, humanize, relTime, type Column } from "@/components/command/ui";
import { formatZoned } from "@/lib/zoned";
import { requirePage } from "@/server/auth/guard";
import { APPLICATION_STATUSES, applicationCounts, listApplications, trackOptions } from "@/server/queries/applications-admin";

export const metadata: Metadata = { title: "Applications" };

type Row = Awaited<ReturnType<typeof listApplications>>[number];
type Search = { q?: string; status?: string; track?: string; id?: string; deleted?: string };

export default async function ApplicationsPage({ searchParams }: { searchParams: Promise<Search> }) {
  await requirePage("applications.view");
  const sp = await searchParams;
  if (sp.id && /^[0-9a-f-]{36}$/i.test(sp.id)) redirect(`/command/applications/${sp.id}`);
  const [rows, counts, tracks] = await Promise.all([listApplications(sp), applicationCounts(), trackOptions()]);
  const tab = (status?: string) => {
    const p = new URLSearchParams();
    if (status) p.set("status", status);
    if (sp.q) p.set("q", sp.q);
    if (sp.track) p.set("track", sp.track);
    const s = p.toString();
    return `/command/applications${s ? `?${s}` : ""}`;
  };
  const awaiting = (counts.by.pending ?? 0) + (counts.by.interview ?? 0);

  const columns: Column<Row>[] = [
    {
      key: "name",
      label: "Applicant",
      render: (a) => (
        <span className="min-w-0">
          <span className="block truncate">{a.fullName}</span>
          <span className="block truncate text-xs font-normal text-fog">{a.email}</span>
        </span>
      ),
    },
    { key: "track", label: "Track", render: (a) => (a.track ? <span title={a.trackName ?? ""} className="font-mono text-xs text-cyan">{a.track}</span> : "—") },
    { key: "year", label: "Year", align: "center", render: (a) => <span className="font-mono text-xs">{a.academicYear}</span> },
    { key: "status", label: "Status", render: (a) => <StatusBadge status={a.status} /> },
    { key: "interview", label: "Interview", render: (a) => (a.interviewAt ? <span className="text-xs">{formatZoned(a.interviewAt)}</span> : <span className="text-steel">—</span>) },
    { key: "score", label: "Score", align: "center", render: (a) => (a.score === null ? <span className="text-steel">—</span> : <span className="font-mono text-xs text-chalk">{a.score}/10</span>) },
    { key: "submitted", label: "Submitted", align: "end", render: (a) => <span className="font-mono text-xs text-fog">{relTime(a.createdAt)}</span> },
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        kicker="Recruitment"
        title="Applications"
        description={
          <>
            {counts.total} received · <span className="text-cyan">{awaiting} waiting for a decision</span>. Applications come from the Join page; applicants&apos; contact details stay inside the Command Center.
          </>
        }
        actions={
          <Link href="/join" target="_blank" className="btn btn-sm">
            <Icon name="external" size={14} />
            <span>Open join page</span>
          </Link>
        }
      />
      {sp.deleted && (
        <p role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/[0.07] px-4 py-3 text-sm text-[#bdf5dc]">
          <Icon name="check" size={16} /> Application deleted.
        </p>
      )}
      <Tabs current={tab(sp.status)} items={[{ href: tab(), label: "All", count: counts.total }, ...APPLICATION_STATUSES.map((s) => ({ href: tab(s), label: humanize(s), count: counts.by[s] ?? 0 }))]} />
      <Toolbar q={sp.q} placeholder="Search name, email or phone…">
        {sp.status && <input type="hidden" name="status" value={sp.status} />}
        <FilterSelect name="track" defaultValue={sp.track ?? ""} aria-label="Track">
          <option value="">All tracks</option>
          {tracks.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </FilterSelect>
      </Toolbar>
      <DataTable
        columns={columns}
        rows={rows}
        rowKey={(a) => a.id}
        rowHref={(a) => `/command/applications/${a.id}`}
        caption="Applications"
        empty={
          <EmptyPanel
            icon="users"
            title={sp.q || sp.status || sp.track ? "No applications match" : "No applications yet"}
            body={sp.q || sp.status || sp.track ? "Try another tab or clear the search." : "When students apply on the Join page, they land here with status Pending. Make sure recruitment is open in Website settings."}
          />
        }
      />
    </div>
  );
}
