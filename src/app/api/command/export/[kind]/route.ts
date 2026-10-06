import { asc, desc, eq } from "drizzle-orm";
import { can, type Permission } from "@/lib/permissions";
import { audit } from "@/server/audit";
import { getActor } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";
import { requestContext } from "@/server/observability/request";

/** CSV exports for spreadsheets (Excel-friendly UTF-8 with BOM so Arabic renders). Permission-checked per dataset. */
const EXPORTS: Record<string, { perm: Permission; title: string; rows: () => Promise<(string | number | null)[][]> }> = {
  members: {
    perm: "members.view_private",
    title: "members",
    rows: async () => {
      const r = await db
        .select({ m: s.members, track: s.tracks.name, team: s.competitionTeams.name })
        .from(s.members)
        .leftJoin(s.tracks, eq(s.tracks.id, s.members.trackId))
        .leftJoin(s.competitionTeams, eq(s.competitionTeams.id, s.members.teamId))
        .orderBy(asc(s.members.fullName));
      return [["Name", "Name (AR)", "Rank", "Department", "Title", "Track", "Team", "Year", "Status", "Public profile", "Phone", "Private email", "Joined"], ...r.map(({ m, track, team }) => [m.fullName, m.fullNameAr, m.rank, m.department, m.title, track, team, m.academicYear, m.status, m.publicProfile ? "yes" : "no", m.phone, m.privateEmail, m.joinedAt])];
    },
  },
  applications: {
    perm: "applications.view",
    title: "applications",
    rows: async () => {
      const r = await db.select({ a: s.applications, track: s.tracks.name }).from(s.applications).leftJoin(s.tracks, eq(s.tracks.id, s.applications.trackId)).orderBy(desc(s.applications.createdAt));
      return [["Submitted", "Name", "Email", "Phone", "Year", "Track", "Status", "Interview", "Score", "Skills", "Availability"], ...r.map(({ a, track }) => [a.createdAt.toISOString().slice(0, 16).replace("T", " "), a.fullName, a.email, a.phone, a.academicYear, track, a.status, a.interviewAt?.toISOString().slice(0, 16).replace("T", " ") ?? "", a.score, a.skills.join("; "), a.availability])];
    },
  },
  attendance: {
    perm: "attendance.view",
    title: "attendance",
    rows: async () => {
      const r = await db
        .select({ event: s.events.title, at: s.events.startsAt, member: s.members.fullName, status: s.attendance.status, method: s.attendance.method })
        .from(s.attendance)
        .innerJoin(s.events, eq(s.events.id, s.attendance.eventId))
        .innerJoin(s.members, eq(s.members.id, s.attendance.memberId))
        .orderBy(desc(s.events.startsAt), asc(s.members.fullName));
      return [["Session", "Date", "Member", "Status", "Method"], ...r.map((x) => [x.event, x.at.toISOString().slice(0, 10), x.member, x.status, x.method])];
    },
  },
  inventory: {
    perm: "inventory.view",
    title: "inventory",
    rows: async () => {
      const r = await db.select().from(s.inventoryItems).orderBy(asc(s.inventoryItems.category), asc(s.inventoryItems.name));
      return [["Item", "Category", "SKU", "Qty", "Min", "Unit cost (EGP)", "Value (EGP)", "Condition", "Location"], ...r.map((i) => [i.name, i.category, i.sku, i.quantity, i.minQuantity, i.unitCost, i.unitCost ? (Number(i.unitCost) * i.quantity).toFixed(2) : "", i.condition, i.location])];
    },
  },
  bom: {
    perm: "projects.view",
    title: "bom-all-projects",
    rows: async () => {
      const r = await db.select({ b: s.bomItems, project: s.projects.title }).from(s.bomItems).innerJoin(s.projects, eq(s.projects.id, s.bomItems.projectId)).orderBy(asc(s.projects.title), asc(s.bomItems.createdAt));
      return [["Project", "Part", "Qty", "Unit (EGP)", "Total (EGP)", "Vendor", "Status", "Link"], ...r.map(({ b, project }) => [project, b.part, b.quantity, b.unitPrice, (Number(b.unitPrice) * b.quantity).toFixed(2), b.vendor, b.status, b.url])];
    },
  },
};

const cell = (v: string | number | null | undefined) => {
  const t = v === null || v === undefined ? "" : String(v);
  // Neutralise spreadsheet formula injection.
  const safe = /^[=+\-@\t\r]/.test(t) ? `'${t}` : t;
  return `"${safe.replace(/"/g, '""')}"`;
};

export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  const { kind } = await params;
  const spec = EXPORTS[kind];
  if (!spec) return new Response("Not found", { status: 404 });
  const actor = await getActor();
  if (!actor) return new Response("Unauthorized", { status: 401 });
  if (!can(actor.role, spec.perm)) return new Response("Forbidden", { status: 403 });
  const rows = await spec.rows();
  await audit(actor, { action: "report.exported", targetType: "report", targetId: kind, summary: `${rows.length - 1} rows` }, await requestContext());
  const csv = "﻿" + rows.map((r) => r.map(cell).join(",")).join("\r\n");
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="robohub-${spec.title}-${new Date().toISOString().slice(0, 10)}.csv"`,
      "Cache-Control": "private, no-store",
    },
  });
}
