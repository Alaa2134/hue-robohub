import { fitLongestWord } from "@/lib/fit-text";
import Link from "next/link";
import type { ReactNode } from "react";
import { Picture } from "@/components/media/picture";
import { MaskText } from "@/components/motion/reveal";
import { cn } from "@/lib/cn";
import type { LibraryEntry } from "@/lib/media-library";
import type { PublicImage } from "@/lib/types";

export type Crumb = { label: string; href?: string };

/**
 * Cinematic page header used by every secondary page: full-bleed render, graded for type,
 * indexed eyebrow, masked display title, optional lead, actions and a HUD meta row.
 */
export function PageHero({
  eyebrow,
  title,
  body,
  image,
  accent = "var(--color-cyan)",
  crumbs,
  actions,
  meta,
  size = "lg",
  focal,
  children,
}: {
  eyebrow: string;
  title: string;
  body?: ReactNode;
  image?: LibraryEntry | PublicImage | null;
  accent?: string;
  crumbs?: Crumb[];
  actions?: ReactNode;
  meta?: { label: string; value: ReactNode }[];
  size?: "md" | "lg";
  focal?: [number, number];
  children?: ReactNode;
}) {
  return (
    <section className={cn("relative isolate flex overflow-hidden bg-void", size === "lg" ? "min-h-[min(100svh,58rem)] lg:min-h-[44rem]" : "min-h-[30rem] lg:min-h-[34rem]")}>
      {image && (
        <div aria-hidden className="absolute inset-0 -z-10">
          <Picture image={image} sizes="100vw" priority decorative focal={focal} className="h-full w-full animate-[hero-settle_2.4s_var(--ease-out-expo)_both]" />
          <div className="absolute inset-0 bg-gradient-to-r from-void via-void/75 to-void/5 rtl:bg-gradient-to-l" />
          <div className="absolute inset-0 bg-gradient-to-t from-void via-void/10 to-void/60" />
          <div className="grain absolute inset-0 overflow-hidden" />
        </div>
      )}
      {!image && <div aria-hidden className="grid-lines mask-radial absolute inset-0 -z-10 opacity-40" />}
      <div className="mx-auto flex w-full max-w-[1680px] flex-col justify-end px-5 pb-12 pt-28 sm:px-8 lg:pb-16 lg:pt-36">
        {crumbs && crumbs.length > 0 && (
          <nav aria-label="Breadcrumb" className="enter mb-8" style={{ ["--d" as string]: "100ms" }}>
            <ol className="flex flex-wrap items-center gap-2 font-mono text-[0.68rem] uppercase tracking-[0.18em] text-fog">
              {crumbs.map((c, i) => (
                <li key={i} className="flex items-center gap-2">
                  {i > 0 && <span aria-hidden className="text-steel">/</span>}
                  {c.href ? (
                    <Link href={c.href} className="transition-colors hover:text-chalk">
                      {c.label}
                    </Link>
                  ) : (
                    <span aria-current="page" className="text-mist">
                      {c.label}
                    </span>
                  )}
                </li>
              ))}
            </ol>
          </nav>
        )}
        <p className="enter t-eyebrow mb-5 flex items-center gap-3" style={{ color: accent, ["--d" as string]: "200ms" }}>
          <span className="h-px w-8" style={{ background: accent }} />
          {eyebrow}
        </p>
        <h1 className="t-display max-w-5xl text-[clamp(2.15rem,7.4vw,6.6rem)] text-chalk" style={fitLongestWord(title, "clamp(2.15rem,7.4vw,6.6rem)", "100vw - 2.5rem")}>
          <MaskText text={title} delay={250} />
        </h1>
        {body && (
          <div className="enter mt-6 max-w-2xl text-pretty text-base leading-relaxed text-mist sm:text-lg" style={{ ["--d" as string]: "500ms" }}>
            {body}
          </div>
        )}
        {actions && (
          <div className="enter mt-9 flex flex-wrap gap-3" style={{ ["--d" as string]: "650ms" }}>
            {actions}
          </div>
        )}
        {meta && meta.length > 0 && (
          <dl className="enter mt-12 grid grid-cols-2 gap-px overflow-hidden rounded-xl border border-[var(--line)] bg-[var(--line)] sm:grid-cols-4" style={{ ["--d" as string]: "800ms" }}>
            {meta.map((m) => (
              <div key={m.label} className="bg-void/70 px-3.5 py-4 backdrop-blur sm:px-5">
                <dt className="t-eyebrow text-[0.58rem] text-fog">{m.label}</dt>
                <dd className="t-headline mt-1.5 text-xl text-chalk">{m.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {children}
      </div>
    </section>
  );
}
