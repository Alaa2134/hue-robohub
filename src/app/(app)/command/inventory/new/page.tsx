import type { Metadata } from "next";
import Link from "next/link";
import { EntityForm } from "@/components/command/entity-form";
import { inventoryFields } from "@/components/command/inventory-fields";
import { PageHeader } from "@/components/command/ui";
import { requirePage } from "@/server/auth/guard";
import { saveInventoryItem } from "@/server/actions/inventory";
import { inventoryOptions } from "@/server/queries/inventory-admin";

export const metadata: Metadata = { title: "Add inventory item" };

export default async function NewItem() {
  await requirePage("inventory.manage");
  const o = await inventoryOptions();
  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader kicker={<Link href="/command/inventory">← Inventory</Link>} title="Add item" />
      <EntityForm action={saveInventoryItem} value={{ category: "Microcontrollers", condition: "new", quantity: 1, minQuantity: 0 }} fields={inventoryFields(o.projects, o.members)} submitLabel="Add item" cancelHref="/command/inventory" />
    </div>
  );
}
