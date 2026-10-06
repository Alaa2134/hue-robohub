"use client";
import { useEffect, useRef, useState } from "react";
import { Picture } from "@/components/media/picture";
import { cn } from "@/lib/cn";
import type { LibraryEntry } from "@/lib/media-library";

export type Chapter = { k: string; t: string; tag: string; image: LibraryEntry | null };

/**
 * The pinned "how a robot is born" sequence. One scroll-linked progress value drives everything:
 * the active chapter (image wipe + headline), the process rail and the counter.
 */
export function Story({ eyebrow, title, chapters }: { eyebrow: string; title: string; chapters: Chapter[] }) {
  const root = useRef<HTMLElement>(null);
  const fill = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);
  const n = chapters.length;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
      el.style.setProperty("--p", p.toFixed(4));
      if (fill.current) fill.current.style.transform = `scaleX(${p})`;
      setActive(Math.min(n - 1, Math.floor(p * n * 0.9999)));
    };
    const on = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(update);
    };
    update();
    window.addEventListener("scroll", on, { passive: true });
    window.addEventListener("resize", on);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("scroll", on);
      window.removeEventListener("resize", on);
    };
  }, [n]);

  const jump = (i: number) => {
    const el = root.current;
    if (!el) return;
    const span = el.offsetHeight - window.innerHeight;
    window.scrollTo({ top: el.offsetTop + (span * (i + 0.5)) / n, behavior: "smooth" });
  };

  return (
    <section id="story" ref={root} aria-labelledby="story-title" className="relative bg-void" style={{ height: `${n * 85 + 15}svh` }}>
      <div className="sticky top-0 h-[100svh] overflow-hidden">
        {/* Imagery */}
        <div aria-hidden className="absolute inset-0">
          {chapters.map((c, i) => (
            <div
              key={c.k}
              className={cn(
                "absolute inset-0 transition-[clip-path,opacity] duration-[1200ms] ease-[var(--ease-out-expo)]",
                i === active ? "opacity-100 [clip-path:inset(0_0_0_0)]" : i < active ? "opacity-0 [clip-path:inset(0_0_0_0)]" : "opacity-100 [clip-path:inset(100%_0_0_0)]",
              )}
            >
              {c.image && (
                <Picture
                  image={c.image}
                  sizes="100vw"
                  decorative
                  className={cn("h-full w-full transition-transform duration-[2400ms] ease-[var(--ease-out-expo)]", i === active ? "scale-100" : "scale-110")}
                />
              )}
            </div>
          ))}
          <div className="absolute inset-0 bg-gradient-to-r from-void via-void/75 to-void/10 rtl:bg-gradient-to-l" />
          <div className="absolute inset-0 bg-gradient-to-t from-void via-void/30 to-void/60" />
          <div className="grain absolute inset-0 overflow-hidden" />
        </div>

        <div className="relative mx-auto flex h-full max-w-[1680px] flex-col px-5 pb-[calc(5.5rem+env(safe-area-inset-bottom))] pt-24 sm:px-8 lg:pb-10 lg:pt-28">
          <div className="flex items-center justify-between gap-4">
            <p className="t-eyebrow flex items-center gap-3 text-cyan">
              <span className="h-px w-8 bg-cyan" />
              {eyebrow}
            </p>
            <p className="t-data text-xs text-fog" dir="ltr">
              <span className="text-chalk">{String(active + 1).padStart(2, "0")}</span> / {String(n).padStart(2, "0")}
            </p>
          </div>
          <h2 id="story-title" className="t-title mt-3 text-lg text-mist sm:text-xl">
            {title}
          </h2>

          {/* Chapter copy */}
          <div className="relative mt-auto min-h-[19rem] sm:min-h-[22rem] lg:mb-16 lg:min-h-[26rem]">
            {chapters.map((c, i) => (
              <article
                key={c.k}
                className={cn("absolute inset-x-0 bottom-0 transition-opacity duration-700", i === active ? "opacity-100" : "pointer-events-none opacity-0")}
                aria-current={i === active ? "step" : undefined}
              >
                <p aria-hidden className="t-display text-outline mb-1 text-[clamp(4.5rem,13vw,11rem)] leading-[0.8]" dir="ltr">
                  {String(i + 1).padStart(2, "0")}
                </p>
                <h3 className="overflow-hidden pb-[0.05em]">
                  <span
                    className={cn(
                      "t-display block text-[clamp(3rem,10.5vw,9.5rem)] text-chalk transition-transform duration-[1100ms] ease-[var(--ease-out-expo)]",
                      i === active ? "translate-y-0" : i < active ? "-translate-y-full" : "translate-y-full",
                    )}
                  >
                    {c.k}
                  </span>
                </h3>
                <div className={cn("mt-5 flex max-w-xl flex-col gap-4 transition-[opacity,transform] delay-150 duration-700", i === active ? "translate-y-0 opacity-100" : "translate-y-4 opacity-0")}>
                  <p className="text-pretty text-base leading-relaxed text-mist sm:text-lg">{c.t}</p>
                  <p className="t-eyebrow inline-flex w-fit items-center gap-2 rounded-full border border-[var(--line-2)] bg-void/40 px-3 py-1.5 text-[0.6rem] text-frost backdrop-blur">
                    <span className="size-1.5 rounded-full bg-cyan" />
                    {c.tag}
                  </p>
                </div>
              </article>
            ))}
          </div>

          {/* Process rail */}
          <nav aria-label={title} className="relative mt-8 lg:mt-0">
            <div className="absolute inset-x-0 top-[0.4rem] h-px bg-[var(--line-2)]" />
            <div ref={fill} className="absolute inset-x-0 top-[0.4rem] h-px origin-left bg-gradient-to-r from-volt to-cyan shadow-[0_0_8px_var(--color-cyan)] rtl:origin-right rtl:bg-gradient-to-l" style={{ transform: "scaleX(0)" }} />
            <ol className="relative grid" style={{ gridTemplateColumns: `repeat(${n}, minmax(0, 1fr))` }}>
              {chapters.map((c, i) => (
                <li key={c.k} className="flex justify-start">
                  <button type="button" onClick={() => jump(i)} className="group flex flex-col items-start gap-2.5 text-start" aria-label={c.k}>
                    <span
                      className={cn(
                        "block size-[0.8rem] rotate-45 border transition-all duration-500",
                        i < active && "border-volt bg-volt",
                        i === active && "scale-125 border-cyan bg-cyan shadow-[0_0_14px_var(--color-cyan)]",
                        i > active && "border-steel bg-void group-hover:border-mist",
                      )}
                    />
                    <span className={cn("t-eyebrow hidden text-[0.58rem] transition-colors md:block", i === active ? "text-chalk" : "text-fog group-hover:text-mist")}>{c.k}</span>
                  </button>
                </li>
              ))}
            </ol>
          </nav>
        </div>
      </div>
    </section>
  );
}
