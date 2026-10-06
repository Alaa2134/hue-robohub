"use client";
import { useOptimistic, useTransition } from "react";
import { cn } from "@/lib/cn";
import { adjustStock } from "@/server/actions/inventory";

export function StockStepper({ id, quantity, min, canEdit }: { id: string; quantity: number; min: number; canEdit: boolean }) {
  const [pending, start] = useTransition();
  const [q, setQ] = useOptimistic(quantity);
  const low = q <= min && min > 0;
  const step = (d: number) =>
    start(async () => {
      setQ(Math.max(0, q + d));
      await adjustStock(id, d);
    });
  return (
    <span className="relative z-10 inline-flex items-center gap-1.5">
      {canEdit && (
        <button type="button" aria-label="Decrease" disabled={pending || q <= 0} onClick={() => step(-1)} className="flex size-6 items-center justify-center rounded border border-[var(--line-2)] text-fog hover:text-chalk disabled:opacity-40">
          −
        </button>
      )}
      <span className={cn("min-w-8 text-center font-mono text-sm", low ? "text-warn" : q === 0 ? "text-danger" : "text-chalk")}>{q}</span>
      {canEdit && (
        <button type="button" aria-label="Increase" disabled={pending} onClick={() => step(1)} className="flex size-6 items-center justify-center rounded border border-[var(--line-2)] text-fog hover:text-chalk">
          +
        </button>
      )}
    </span>
  );
}
