import type { Metadata } from "next";
import Link from "next/link";
import { and, asc, eq, ilike, lte, or, sql, type SQL } from "drizzle-orm";
import { Icon } from "@/components/brand/icons";
import { FilterSelect } from "@/components/command/filters";
import { StockStepper } from "@/components/command/inventory-ui";
import { INVENTORY_CATEGORIES } from "@/components/command/inventory-fields";
import { DataTable, EmptyPanel, Kpi, PageHeader, StatusBadge, Toolbar, money, type Column } from "@/components/command/ui";
import { can } from "@/lib/permissions";
import { requirePage } from "@/server/auth/guard";
import { db, schema as s } from "@/server/db";

export const metadata: Metadata = { title: "Inventory" };

export default async function InventoryPage({ searchParams }: { searchParams: Promise<{ q?: string; category?: string; low?: string; added?: string; deleted?: string }> }) {
  const actor = await requirePage("inventory.view");
  const sp = await searchParams;
  const manage = can(actor.role, "inventory.manage");
  const where: SQL[] = [];
  if (sp.q) where.push(or(ilike(s.inventoryItems.name, `%${sp.q}%`), ilike(s.inventoryItems.sku, `%${sp.q}%`), ilike(s.inventoryItems.location, `%${sp.q}%`))!);
  if (sp.category) where.push(eq(s.inventoryItems.category, sp.category));
  if (sp.low) where.push(and(sql`${s.inventoryItems.minQuantity} > 0`, lte(s.inventoryItems.quantity, s.inventoryItems.minQuantity))!);
  const [rows, [tot]] = await Promise.all([
    db
      .select({ i: s.inventoryItems, project: s.projects.title, member: s.members.fullName })
      .from(s.inventoryItems)
      .leftJoin(s.projects, eq(s.projects.id, s.inventoryItems.projectId))
      .leftJoin(s.members, eq(s.members.id, s.inventoryItems.memberId))
      .where(where.length ? and(...where) : undefined)
      .orderBy(asc(s.inventoryItems.category), asc(s.inventoryItems.name))
      .limit(1000),
    db
      .select({
        items: sql<number>`count(*)`.mapWith(Number),
        units: sql<number>`coalesce(sum(${s.inventoryItems.quantity}),0)`.mapWith(Number),
        value: sql<number>`coalesce(sum(${s.inventoryItems.quantity} * coalesce(${s.inventoryItems.unitCost},0)),0)`.mapWith(Number),
        low: sql<number>`count(*) filter (where ${s.inventoryItems.minQuantity} > 0 and ${s.inventoryItems.quantity} <= ${s.inventoryItems.minQuantity})`.mapWith(Number),
        out: sql<number>`count(*) filter (where ${s.inventoryItems.memberId} is not null)`.mapWith(Number),
      })
      .from(s.inventoryItems),
  ]);
  type Row = (typeof rows)[number];
  const cols: Column<Row>[] = [
    {
      key: "name",
      label: "Item",
      render: ({ i }) => (
        <span className="min-w-0">
          <span className="block truncate">{i.name}</span>
          <span className="block truncate text-xs font-normal text-fog">{[i.category, i.sku, i.location].filter(Boolean).join(" · ")}</span>
        </span>
      ),
    },
    { key: "qty", label: "Stock", align: "center", render: ({ i }) => <StockStepper id={i.id} quantity={i.quantity} min={i.minQuantity} canEdit={manage} /> },
    { key: "min", label: "Min", align: "center", render: ({ i }) => <span className="font-mono text-xs text-fog">{i.minQuantity || "—"}</span> },
    { key: "cost", label: "Unit", align: "end", render: ({ i }) => <span className="font-mono text-xs">{i.unitCost ? money(i.unitCost) : "—"}</span> },
    { key: "cond", label: "Condition", render: ({ i }) => <StatusBadge status={i.condition} tone={i.condition === "damaged" ? "danger" : i.condition === "worn" ? "warn" : i.condition === "retired" ? "neutral" : "ok"} /> },
    { key: "where", label: "With", render: (r) => <span className="text-xs">{r.member ?? (r.project ? `Reserved · ${r.project}` : "Lab")}</span> },
  ];

  return (
    <div className="mx-auto max-w-[1500px]">
      <PageHeader
        kicker="Engineering"
        title="Inventory"
        description="Every board, sensor, motor and tool in the lab — with restock alerts, reservations and who has what."
        actions={
          manage && (
            <Link href="/command/inventory/new" className="btn btn-primary btn-sm">
              <span aria-hidden className="btn-sheen" />
              <Icon name="plus" size={15} />
              <span>Add item</span>
            </Link>
          )
        }
      />
      {(sp.added || sp.deleted) && <p className="mb-5 rounded-xl border border-ok/30 bg-ok/[0.07] px-4 py-3 text-sm text-[#bdf5dc]">{sp.added ? "Item added." : "Item deleted."}</p>}
      <div className="mb-6 grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Kpi label="Items" value={tot?.items ?? 0} sub={`${tot?.units ?? 0} units`} icon="layers" />
        <Kpi label="Stock value" value={money(tot?.value ?? 0)} icon="gauge" />
        <Kpi label="Low stock" value={tot?.low ?? 0} tone={(tot?.low ?? 0) > 0 ? "warn" : "default"} href="/command/inventory?low=1" icon="signal" />
        <Kpi label="Checked out" value={tot?.out ?? 0} icon="users" />
      </div>
      <Toolbar q={sp.q} placeholder="Search name, SKU or location…">
        <FilterSelect name="category" defaultValue={sp.category ?? ""} aria-label="Category">
          <option value="">All categories</option>
          {INVENTORY_CATEGORIES.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </FilterSelect>
        <FilterSelect name="low" defaultValue={sp.low ?? ""} aria-label="Stock level">
          <option value="">Any stock level</option>
          <option value="1">Low stock only</option>
        </FilterSelect>
      </Toolbar>
      <DataTable columns={cols} rows={rows} rowKey={(r) => r.i.id} rowHref={manage ? (r) => `/command/inventory/${r.i.id}` : undefined} caption="Inventory" empty={<EmptyPanel icon="layers" title={sp.q || sp.category || sp.low ? "No matching items" : "Inventory is empty"} body="Add parts as they arrive — restock thresholds feed the low-stock alert on the Overview." />} />
    </div>
  );
}
