"use client";
import { useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Client-side filter chips over a server-rendered list (keeps pages static and instant). */
export function FilterGrid({ filters, items, className, allLabel, empty }: { filters: { key: string; label: string }[]; items: { key: string; tags: string[]; node: ReactNode }[]; className?: string; allLabel: string; empty?: ReactNode }) {
  const [active, setActive] = useState("all");
  const shown = useMemo(() => (active === "all" ? items : items.filter((i) => i.tags.includes(active))), [active, items]);
  return (
    <>
      {filters.length > 1 && (
        <div role="toolbar" aria-label="Filter" className="rail -mx-5 mb-8 gap-2 px-5 sm:mx-0 sm:flex-wrap sm:px-0">
          {[{ key: "all", label: allLabel }, ...filters].map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={active === f.key}
              onClick={() => setActive(f.key)}
              className={cn("h-10 shrink-0 rounded-full border px-4 text-sm transition-colors", active === f.key ? "border-cyan/60 bg-cyan/10 text-chalk" : "border-[var(--line-2)] text-mist hover:text-chalk")}
            >
              {f.label}
            </button>
          ))}
        </div>
      )}
      {shown.length ? (
        <div className={className}>
          {shown.map((i) => (
            <div key={i.key}>{i.node}</div>
          ))}
        </div>
      ) : (
        empty
      )}
    </>
  );
}
