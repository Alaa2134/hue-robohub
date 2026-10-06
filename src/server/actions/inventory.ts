"use server";

import { eq, sql } from "drizzle-orm";
import { redirect } from "next/navigation";
import { z } from "zod";
import { runAction, type ActionResult } from "../action";
import { audit } from "../audit";
import { AppError } from "../auth/errors";
import { assertCan } from "../auth/guard";
import { db, schema as s } from "../db";
import { formFields, isUuid, zf } from "../forms";

const itemSchema = z.object({
  name: zf.text(160),
  category: zf.text(60),
  sku: zf.opt(60),
  quantity: zf.int(0, 1_000_000, 0),
  minQuantity: zf.int(0, 1_000_000, 0),
  unitCost: z
    .string()
    .optional()
    .transform((v) => (v ? String(Number(v)) : null))
    .refine((v) => v === null || (Number.isFinite(Number(v)) && Number(v) >= 0), "Enter a cost"),
  location: zf.opt(120),
  condition: z.enum(["new", "good", "worn", "damaged", "retired"]),
  datasheetUrl: zf.url,
  projectId: zf.uuid,
  memberId: zf.uuid,
  notes: zf.opt(2000),
});

export async function saveInventoryItem(_prev: unknown, form: FormData): Promise<ActionResult<{ id: string }>> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "inventory.manage");
    const id = form.get("id");
    const input = itemSchema.parse(formFields(form));
    if (isUuid(id)) {
      const [it] = await db.update(s.inventoryItems).set(input).where(eq(s.inventoryItems.id, id)).returning({ id: s.inventoryItems.id });
      if (!it) throw new AppError("NOT_FOUND", "Item not found.");
      await audit(actor, { action: "inventory.updated", targetType: "inventory", targetId: id, summary: input.name }, req);
      return { id, created: false };
    }
    const [it] = await db.insert(s.inventoryItems).values(input).returning({ id: s.inventoryItems.id });
    await audit(actor, { action: "inventory.created", targetType: "inventory", targetId: it!.id, summary: input.name }, req);
    return { id: it!.id, created: true };
  });
  if (res.ok && res.data.created) redirect("/command/inventory?added=1");
  return res.ok ? { ok: true, data: { id: res.data.id } } : res;
}

/** +/- stock from the list without opening the item. Never goes below zero. */
export async function adjustStock(id: string, delta: number): Promise<ActionResult<{ quantity: number }>> {
  return runAction(async ({ actor }) => {
    assertCan(actor, "inventory.manage");
    if (!isUuid(id) || !Number.isInteger(delta) || Math.abs(delta) > 10000) throw new AppError("BAD_REQUEST", "Invalid request.");
    const [it] = await db
      .update(s.inventoryItems)
      .set({ quantity: sql`greatest(0, ${s.inventoryItems.quantity} + ${delta})` })
      .where(eq(s.inventoryItems.id, id))
      .returning({ quantity: s.inventoryItems.quantity });
    if (!it) throw new AppError("NOT_FOUND", "Item not found.");
    return it;
  });
}

export async function deleteInventoryItem(id: string): Promise<ActionResult> {
  const res = await runAction(async ({ actor, req }) => {
    assertCan(actor, "inventory.manage");
    const [it] = await db.delete(s.inventoryItems).where(eq(s.inventoryItems.id, id)).returning({ name: s.inventoryItems.name });
    if (!it) throw new AppError("NOT_FOUND", "Item not found.");
    await audit(actor, { action: "inventory.deleted", targetType: "inventory", targetId: id, summary: it.name }, req);
  });
  if (res.ok) redirect("/command/inventory?deleted=1");
  return res;
}
