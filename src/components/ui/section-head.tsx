import type { ReactNode } from "react";
import { MaskText, Reveal } from "@/components/motion/reveal";
import { cn } from "@/lib/cn";

/** Section header: indexed eyebrow, masked display headline, optional body and action. */
export function SectionHead({
  index,
  eyebrow,
  title,
  body,
  action,
  className,
  size = "lg",
  accent = "var(--color-cyan)",
  id,
}: {
  index?: string;
  eyebrow: string;
  title: string;
  body?: ReactNode;
  action?: ReactNode;
  className?: string;
  size?: "md" | "lg" | "xl";
  accent?: string;
  id?: string;
}) {
  return (
    <header className={cn("grid gap-6 lg:grid-cols-12 lg:items-end", className)}>
      <div className="lg:col-span-8">
        <Reveal as="p" className="t-eyebrow mb-5 flex items-center gap-3 text-mist">
          {index && (
            <span className="t-data" style={{ color: accent }} dir="ltr">
              {index}
            </span>
          )}
          <span className="h-px w-8" style={{ background: accent }} />
          {eyebrow}
        </Reveal>
        <h2 id={id} className={cn("t-display text-chalk", size === "xl" ? "text-[clamp(2.6rem,7vw,6.4rem)]" : size === "lg" ? "text-[clamp(2.2rem,5.2vw,4.6rem)]" : "text-[clamp(1.8rem,3.6vw,3rem)]")}>
          <MaskText text={title} />
        </h2>
        {body && (
          <Reveal as="p" delay={120} className="mt-5 max-w-2xl text-pretty text-base leading-relaxed text-mist sm:text-lg">
            {body}
          </Reveal>
        )}
      </div>
      {action && (
        <Reveal delay={200} className="flex lg:col-span-4 lg:justify-end">
          {action}
        </Reveal>
      )}
    </header>
  );
}
