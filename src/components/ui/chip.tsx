import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

export function Chip({ children, accent, className, active }: { children: ReactNode; accent?: string; className?: string; active?: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs backdrop-blur",
        active ? "border-cyan/60 bg-cyan/10 text-chalk" : "border-[var(--line-2)] bg-void/40 text-mist",
        className,
      )}
      style={accent ? { borderColor: `color-mix(in oklab, ${accent} 50%, transparent)`, color: accent } : undefined}
    >
      {children}
    </span>
  );
}
