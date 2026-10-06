import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { EntityForm } from "@/components/command/entity-form";
import { inventoryFields } from "@/components/command/inventory-fields";
import { PageHeader } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { deleteInventoryItem, saveInventoryItem } from "@/server/actions/inventory";
import { db, schema as s } from "@/server/db";
import { isUuid } from "@/server/forms";
import { inventoryOptions } from "@/server/queries/inventory-admin";

export const metadata: Metadata = { title: "Inventory item" };

export default async function EditItem({ params }: { params: Promise<{ id: string }> }) {
  await requirePage("inventory.manage");
  const { id } = await params;
  if (!isUuid(id)) notFound();
  const [[i], o] = await Promise.all([db.select().from(s.inventoryItems).where(eq(s.inventoryItems.id, id)).limit(1), inventoryOptions()]);
  if (!i) notFound();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker={<Link href="/command/inventory">← Inventory</Link>} title={i.name} />
      <EntityForm
        action={saveInventoryItem}
        value={{ id: i.id, name: i.name, category: i.category, sku: i.sku, quantity: i.quantity, minQuantity: i.minQuantity, unitCost: i.unitCost ? Number(i.unitCost) : null, condition: i.condition, location: i.location, datasheetUrl: i.datasheetUrl, projectId: i.projectId, memberId: i.memberId, notes: i.notes }}
        fields={inventoryFields(o.projects, o.members)}
        submitLabel="Save item"
        onDelete={deleteInventoryItem.bind(null, i.id)}
      />
    </div>
  );
}
