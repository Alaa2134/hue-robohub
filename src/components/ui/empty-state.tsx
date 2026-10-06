import type { ReactNode } from "react";
import { Icon, type IconName } from "@/components/brand/icons";
import { cn } from "@/lib/cn";

/** Honest, designed empty state — never fake data. */
export function EmptyState({ icon = "signal", title, body, action, className }: { icon?: IconName; title: string; body?: string; action?: ReactNode; className?: string }) {
  return (
    <div className={cn("relative overflow-hidden rounded-2xl border border-dashed border-[var(--line-2)] px-6 py-14 text-center sm:px-10", className)}>
      <div aria-hidden className="grid-lines mask-radial absolute inset-0 opacity-30" />
      <div className="relative mx-auto flex max-w-md flex-col items-center">
        <span className="flex size-14 items-center justify-center rounded-2xl border border-[var(--line-2)] bg-panel/60 text-cyan">
          <Icon name={icon} size={24} />
        </span>
        <p className="t-title mt-5 text-xl text-chalk">{title}</p>
        {body && <p className="mt-2 text-pretty text-sm leading-relaxed text-mist">{body}</p>}
        {action && <div className="mt-6">{action}</div>}
      </div>
    </div>
  );
}
