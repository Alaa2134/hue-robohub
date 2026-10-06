import type { Metadata } from "next";
import { count, gte, sql } from "drizzle-orm";
import { Icon } from "@/components/brand/icons";
import { Kpi, PageHeader, Panel } from "@/components/command/ui";
import { can, type Permission } from "@/lib/permissions";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "Reports" };

const EXPORTS: { kind: string; label: string; body: string; perm: Permission }[] = [
  { kind: "members", label: "Members", body: "Roster with ranks, teams and private contact details.", perm: "members.view_private" },
  { kind: "applications", label: "Applications", body: "Every application with status, interview and score.", perm: "applications.view" },
  { kind: "attendance", label: "Attendance", body: "Every check-in and mark, per session and member.", perm: "attendance.view" },
  { kind: "inventory", label: "Inventory", body: "Stock, value and condition of every item.", perm: "inventory.view" },
  { kind: "bom", label: "BOM — all projects", body: "Every part across projects with costs and status.", perm: "projects.view" },
];

export default async function ReportsPage() {
  const actor = await requirePage("reports.view");
  const since = new Date(Date.now() - 30 * 86400_000);
  const [[apps], [att], [tasks], [spend]] = await Promise.all([
    db.select({ n: count() }).from(s.applications).where(gte(s.applications.createdAt, since)),
    db.select({ n: count() }).from(s.attendance).where(gte(s.attendance.recordedAt, since)),
    db.select({ n: count() }).from(s.tasks).where(gte(s.tasks.completedAt, since)),
    db.select({ v: sql<number>`coalesce(sum(${s.bomItems.quantity} * ${s.bomItems.unitPrice}) filter (where ${s.bomItems.status} in ('received','installed')), 0)`.mapWith(Number) }).from(s.bomItems),
  ]);
  return (
    <div className="mx-auto max-w-5xl">
      <PageHeader kicker="Organisation" title="Reports" description="Last-30-day activity and spreadsheet exports. Exports are logged in the audit trail." />
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Applications · 30d" value={apps?.n ?? 0} icon="rocket" />
        <Kpi label="Check-ins · 30d" value={att?.n ?? 0} icon="qr" />
        <Kpi label="Tasks done · 30d" value={tasks?.n ?? 0} icon="check" />
        <Kpi label="Parts spend (total)" value={new Intl.NumberFormat("en-EG", { maximumFractionDigits: 0 }).format(spend?.v ?? 0)} unit="EGP" icon="gauge" />
      </div>
      <Panel title="Exports" kicker="CSV · opens in Excel / Google Sheets">
        <ul className="grid gap-3 sm:grid-cols-2">
          {EXPORTS.filter((e) => can(actor.role, e.perm)).map((e) => (
            <li key={e.kind} className="flex items-center justify-between gap-4 rounded-xl border border-[var(--line)] bg-deep/40 p-4">
              <span>
                <span className="block font-medium text-chalk">{e.label}</span>
                <span className="block text-xs text-fog">{e.body}</span>
              </span>
              <a href={`/api/command/export/${e.kind}`} className="btn btn-sm shrink-0">
                <Icon name="arrow" size={14} className="rotate-90" />
                <span>CSV</span>
              </a>
            </li>
          ))}
        </ul>
      </Panel>
    </div>
  );
}
