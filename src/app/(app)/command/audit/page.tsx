import type { Metadata } from "next";
import Link from "next/link";
import { and, desc, ilike, lt, or, type SQL } from "drizzle-orm";
import { FilterSelect } from "@/components/command/filters";
import { EmptyPanel, PageHeader, Toolbar } from "@/components/command/ui";
import { formatZoned } from "@/lib/zoned";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "Audit log" };

const AREAS = ["auth", "account", "member", "application", "settings", "project", "bom", "event", "attendance", "album", "gallery", "competition", "achievement", "sponsor", "video", "team", "inventory", "message", "file"];
const PAGE = 100;

/** Append-only security and change history. Read-only by design. */
export default async function AuditPage({ searchParams }: { searchParams: Promise<{ q?: string; area?: string; before?: string }> }) {
  await requirePage("audit.view");
  const sp = await searchParams;
  const where: SQL[] = [];
  if (sp.area && AREAS.includes(sp.area)) where.push(ilike(s.auditLogs.action, `${sp.area}.%`));
  if (sp.q) where.push(or(ilike(s.auditLogs.actorLabel, `%${sp.q}%`), ilike(s.auditLogs.summary, `%${sp.q}%`), ilike(s.auditLogs.action, `%${sp.q}%`))!);
  if (sp.before && /^\d+$/.test(sp.before)) where.push(lt(s.auditLogs.id, Number(sp.before)));
  const rows = await db
    .select({ id: s.auditLogs.id, at: s.auditLogs.createdAt, actor: s.auditLogs.actorLabel, action: s.auditLogs.action, summary: s.auditLogs.summary, targetType: s.auditLogs.targetType, ip: s.auditLogs.ip, requestId: s.auditLogs.requestId })
    .from(s.auditLogs)
    .where(where.length ? and(...where) : undefined)
    .orderBy(desc(s.auditLogs.id))
    .limit(PAGE);
  const next = rows.length === PAGE ? rows[rows.length - 1]!.id : null;
  const qs = (extra: Record<string, string>) => `/command/audit?${new URLSearchParams({ ...(sp.q ? { q: sp.q } : {}), ...(sp.area ? { area: sp.area } : {}), ...extra })}`;

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader kicker="Security" title="Audit log" description="Who changed what, and when — sign-ins, role changes, publishing and deletions. Entries can't be edited or removed from here." />
      <Toolbar q={sp.q} placeholder="Search person, action or item…">
        <FilterSelect name="area" defaultValue={sp.area ?? ""} aria-label="Area">
          <option value="">All areas</option>
          {AREAS.map((a) => (
            <option key={a} value={a}>
              {a[0]!.toUpperCase() + a.slice(1)}
            </option>
          ))}
        </FilterSelect>
      </Toolbar>
      {!rows.length ? (
        <EmptyPanel icon="shield" title="No entries" />
      ) : (
        <ol className="overflow-hidden rounded-2xl border border-[var(--line)]">
          {rows.map((r) => (
            <li key={r.id} className="grid gap-1 border-b border-[var(--line)] px-4 py-2.5 text-sm last:border-0 sm:grid-cols-[9.5rem_1fr_auto] sm:items-center sm:gap-4">
              <span className="font-mono text-[0.68rem] text-fog">{formatZoned(r.at)}</span>
              <span className="min-w-0">
                <span className="font-mono text-xs text-cyan">{r.action}</span>
                {r.summary && <span className="ms-2 text-mist">{r.summary}</span>}
                <span className="block truncate text-xs text-fog">{r.actor}</span>
              </span>
              <span className="truncate font-mono text-[0.62rem] text-steel" title={r.requestId ?? undefined}>
                {r.ip ?? ""}
              </span>
            </li>
          ))}
        </ol>
      )}
      {next && (
        <div className="mt-4 flex justify-center">
          <Link href={qs({ before: String(next) })} className="btn btn-sm">
            <span>Older entries</span>
          </Link>
        </div>
      )}
    </div>
  );
}
