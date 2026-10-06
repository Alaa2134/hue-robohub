"use client";
import type { ComponentProps } from "react";
import { cn } from "@/lib/cn";

/** Select that submits its GET filter form on change, so filters apply without a separate button. */
export function FilterSelect({ className, children, ...rest }: ComponentProps<"select">) {
  return (
    <select
      {...rest}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className={cn("h-10 rounded-lg border border-[var(--line-2)] bg-deep/70 px-3 text-sm text-mist outline-none focus:border-cyan/60", className)}
    >
      {children}
    </select>
  );
}
