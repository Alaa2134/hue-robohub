import type { ReactNode } from "react";
import { cn } from "@/lib/cn";

/** Standard page band: generous rhythm, max width, optional alternate background. */
export function Band({ children, className, alt, id, tight }: { children: ReactNode; className?: string; alt?: boolean; id?: string; tight?: boolean }) {
  return (
    <section id={id} className={cn(alt && "border-y border-[var(--line)] bg-abyss", className)}>
      <div className={cn("mx-auto max-w-[1680px] px-5 sm:px-8", tight ? "py-16 lg:py-24" : "py-20 lg:py-32")}>{children}</div>
    </section>
  );
}
