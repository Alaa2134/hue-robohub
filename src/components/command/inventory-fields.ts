import type { EntityField } from "./entity-form";

export const INVENTORY_CATEGORIES = ["Microcontrollers", "Sensors", "Motors & drivers", "Power & batteries", "Mechanical parts", "Tools", "Cables & connectors", "3D printing", "Consumables", "Other"];

export function inventoryFields(projects: { id: string; name: string }[], members: { id: string; name: string }[]): EntityField[] {
  return [
    { kind: "text", name: "name", label: "Item", required: true, maxLength: 160, placeholder: "e.g. Arduino Nano", wide: true },
    { kind: "select", name: "category", label: "Category", required: true, options: INVENTORY_CATEGORIES.map((c) => ({ value: c, label: c })) },
    { kind: "text", name: "sku", label: "SKU / part number", maxLength: 60 },
    { kind: "number", name: "quantity", label: "In stock", min: 0, required: true },
    { kind: "number", name: "minQuantity", label: "Restock when at or below", min: 0, hint: "0 = don't track" },
    { kind: "number", name: "unitCost", label: "Unit cost (EGP)", min: 0, step: "any" },
    { kind: "select", name: "condition", label: "Condition", required: true, options: ["new", "good", "worn", "damaged", "retired"].map((c) => ({ value: c, label: c[0]!.toUpperCase() + c.slice(1) })) },
    { kind: "text", name: "location", label: "Location", placeholder: "Cabinet B · drawer 3", maxLength: 120 },
    { kind: "url", name: "datasheetUrl", label: "Datasheet link" },
    { kind: "select", name: "projectId", label: "Reserved for project", options: projects.map((p) => ({ value: p.id, label: p.name })), empty: "—" },
    { kind: "select", name: "memberId", label: "Checked out to", options: members.map((m) => ({ value: m.id, label: m.name })), empty: "In the lab" },
    { kind: "textarea", name: "notes", label: "Notes", rows: 2 },
  ];
}
