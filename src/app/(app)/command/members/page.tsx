import type { Metadata } from "next";
import Link from "next/link";
import { Icon } from "@/components/brand/icons";
import { FilterSelect } from "@/components/command/filters";
import { PublicToggle } from "@/components/command/member-public-toggle";
import { DataTable, EmptyPanel, PageHeader, StatusBadge, Toolbar, relTime, type Column } from "@/components/command/ui";
import { Monogram } from "@/components/people/member-card";
import { cn } from "@/lib/cn";
import { DEPARTMENT_LABEL, RANK_LABEL } from "@/lib/members";
import { can } from "@/lib/permissions";
import type { Department, MemberRank } from "@/lib/types";
import { requirePage } from "@/server/auth/guard";
import { listMembers, memberCounts } from "@/server/queries/members-admin";

export const metadata: Metadata = { title: "Members" };

type Row = Awaited<ReturnType<typeof listMembers>>[number];
type Search = { q?: string; status?: string; visibility?: string; department?: string; view?: string; deleted?: string };

function qs(sp: Search, patch: Partial<Search>) {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries({ ...sp, ...patch })) if (v && k !== "deleted") p.set(k, v);
  const s = p.toString();
  return `/command/members${s ? `?${s}` : ""}`;
}

export default async function MembersPage({ searchParams }: { searchParams: Promise<Search> }) {
  const actor = await requirePage("members.view");
  const sp = await searchParams;
  const manage = can(actor.role, "members.manage");
  const view = sp.view === "data" ? "data" : "grid";
  const [rows, totals] = await Promise.all([listMembers(sp), memberCounts()]);
  const filtered = !!(sp.q || sp.status || sp.visibility || sp.department);
  const href = (m: Row) => (manage ? `/command/members/${m.id}` : m.publicProfile ? `/team/${m.slug}` : undefined);

  const columns: Column<Row>[] = [
    {
      key: "name",
      label: "Member",
      render: (m) => (
        <span className="flex items-center gap-3">
          <Avatar m={m} className="size-9 rounded-lg" />
          <span className="min-w-0">
            <span className="block truncate">{m.fullName}</span>
            <span className="block truncate text-xs font-normal text-fog">{m.title ?? RANK_LABEL[m.rank as MemberRank]}</span>
          </span>
        </span>
      ),
    },
    { key: "rank", label: "Rank", render: (m) => RANK_LABEL[m.rank as MemberRank] },
    { key: "dept", label: "Department", render: (m) => (m.department ? DEPARTMENT_LABEL[m.department as Department] : "—") },
    { key: "track", label: "Track", render: (m) => (m.track ? <span className="font-mono text-xs text-cyan">{m.track}</span> : "—") },
    {
      key: "team",
      label: "Team",
      render: (m) =>
        m.team ? (
          <span className="flex items-center gap-2">
            <span className="size-2 rounded-full" style={{ background: m.teamAccent ?? "#2b6dff" }} />
            {m.team}
          </span>
        ) : (
          "—"
        ),
    },
    { key: "status", label: "Status", render: (m) => <StatusBadge status={m.status} /> },
    { key: "public", label: "Website", render: (m) => (manage ? <PublicToggle id={m.id} value={m.publicProfile} name={m.fullName} /> : <StatusBadge status={m.publicProfile ? "active" : "inactive"} label={m.publicProfile ? "Public" : "Private"} />) },
    { key: "updated", label: "Updated", align: "end", render: (m) => <span className="font-mono text-xs text-fog">{relTime(m.updatedAt)}</span> },
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        kicker="People"
        title="Members"
        description={
          <>
            {totals.total} on the roster · <span className="text-ok">{totals.public} public</span> on the website · {totals.active} active
            {manage && totals.noPhoto > 0 && <> · {totals.noPhoto} without a photo</>}
          </>
        }
        actions={
          manage && (
            <Link href="/command/members/new" className="btn btn-primary btn-sm">
              <span aria-hidden className="btn-sheen" />
              <Icon name="plus" size={15} />
              <span>Add member</span>
            </Link>
          )
        }
      />

      {sp.deleted && (
        <p role="status" className="mb-5 flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/[0.07] px-4 py-3 text-sm text-[#bdf5dc]">
          <Icon name="check" size={16} /> Member deleted and removed from the website.
        </p>
      )}

      <Toolbar q={sp.q} placeholder="Search name or title…">
        <input type="hidden" name="view" value={view} />
        <FilterSelect name="visibility" defaultValue={sp.visibility ?? ""} aria-label="Website visibility">
          <option value="">Public + private</option>
          <option value="public">Public only</option>
          <option value="private">Private only</option>
        </FilterSelect>
        <FilterSelect name="status" defaultValue={sp.status ?? ""} aria-label="Status">
          <option value="">Any status</option>
          <option value="active">Active</option>
          <option value="inactive">Inactive</option>
          <option value="alumni">Alumni</option>
        </FilterSelect>
        <FilterSelect name="department" defaultValue={sp.department ?? ""} aria-label="Department">
          <option value="">All departments</option>
          {Object.entries(DEPARTMENT_LABEL).map(([v, l]) => (
            <option key={v} value={v}>
              {l}
            </option>
          ))}
        </FilterSelect>
        <div className="flex rounded-lg border border-[var(--line-2)] p-0.5" role="group" aria-label="View">
          {(["grid", "data"] as const).map((v) => (
            <Link key={v} href={qs(sp, { view: v })} aria-current={view === v ? "true" : undefined} className={cn("flex h-8 items-center gap-1.5 rounded-md px-3 text-xs uppercase tracking-[0.08em]", view === v ? "bg-panel text-chalk" : "text-fog hover:text-mist")}>
              <Icon name={v === "grid" ? "grid" : "layers"} size={13} />
              {v}
            </Link>
          ))}
        </div>
      </Toolbar>

      {!rows.length ? (
        <EmptyPanel
          icon="users"
          title={filtered ? "No members match these filters" : "No members yet"}
          body={filtered ? "Try clearing the search or filters." : "Add your first member — upload a photo, position it, switch PUBLIC PROFILE on and publish. They appear on the website instantly."}
          action={
            filtered ? (
              <Link href={qs({}, { view })} className="btn btn-sm">
                <span>Clear filters</span>
              </Link>
            ) : (
              manage && (
                <Link href="/command/members/new" className="btn btn-primary btn-sm">
                  <span aria-hidden className="btn-sheen" />
                  <Icon name="plus" size={15} />
                  <span>Add member</span>
                </Link>
              )
            )
          }
        />
      ) : view === "data" ? (
        <DataTable columns={columns} rows={rows} rowKey={(m) => m.id} rowHref={manage ? (m) => `/command/members/${m.id}` : undefined} caption="Members" />
      ) : (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 2xl:grid-cols-6">
          {rows.map((m) => {
            const to = href(m);
            return (
              <li key={m.id} className="group relative overflow-hidden rounded-2xl border border-[var(--line)] bg-deep/60 transition-colors hover:border-[var(--line-2)]">
                <div className="relative aspect-[4/5] overflow-hidden">
                  <Avatar m={m} className="absolute inset-0 size-full" />
                  <div aria-hidden className="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-abyss via-abyss/40 to-transparent" />
                  {m.teamAccent && <span aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: m.teamAccent }} />}
                  <div className="absolute start-2.5 top-2.5 flex gap-1.5">
                    {m.status !== "active" && <StatusBadge status={m.status} />}
                    {m.track && <span className="rounded-full border border-cyan/30 bg-abyss/70 px-2 py-0.5 font-mono text-[0.6rem] text-cyan backdrop-blur">{m.track}</span>}
                  </div>
                </div>
                <div className="flex items-end justify-between gap-2 p-3.5 pt-0">
                  <div className="relative -mt-10 min-w-0">
                    {to ? (
                      <Link href={to} className="block truncate font-display text-[0.95rem] font-semibold text-chalk after:absolute after:inset-0 hover:text-cyan">
                        {m.fullName}
                      </Link>
                    ) : (
                      <p className="truncate font-display text-[0.95rem] font-semibold text-chalk">{m.fullName}</p>
                    )}
                    <p className="truncate text-xs text-fog">{m.title ?? RANK_LABEL[m.rank as MemberRank]}</p>
                    <div className="mt-3">{manage ? <PublicToggle id={m.id} value={m.publicProfile} name={m.fullName} /> : <StatusBadge status={m.publicProfile ? "active" : "inactive"} label={m.publicProfile ? "Public" : "Private"} />}</div>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {rows.length >= 500 && <p className="mt-4 text-xs text-fog">Showing the first 500 — refine the search to narrow down.</p>}
    </div>
  );
}

function Avatar({ m, className }: { m: Row; className?: string }) {
  return m.photoUrl ? (
    <img src={m.photoUrl} alt="" loading="lazy" decoding="async" className={cn("object-cover", className)} />
  ) : (
    <Monogram name={m.fullName} accent={m.teamAccent ?? undefined} className={className} />
  );
}
