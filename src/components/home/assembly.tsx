"use client";
import { useEffect, useRef, useState } from "react";
import { Icon, WEEK_ICON } from "@/components/brand/icons";
import { Picture } from "@/components/media/picture";
import { cn } from "@/lib/cn";
import type { LibraryEntry } from "@/lib/media-library";

export type AssemblyWeek = {
  week: number;
  title: string;
  summary: string;
  outcomes: string[];
  stage: string;
  parts: string[];
  image: LibraryEntry | null;
  final: boolean;
};

/**
 * Bootcamp signature: the robot assembles week by week as you scroll. Each week maps to a render of the
 * robot at that build stage; a single scroll progress value drives stage, timeline and build gauge.
 */
export function Assembly({ weeks, labels }: { weeks: AssemblyWeek[]; labels: { week: string; final: string; stage: string; built: string } }) {
  const root = useRef<HTMLElement>(null);
  const [active, setActive] = useState(0);
  const n = weeks.length;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    let raf = 0;
    const update = () => {
      const r = el.getBoundingClientRect();
      const span = r.height - window.innerHeight;
      const p = span > 0 ? Math.min(1, Math.max(0, -r.top / span)) : 0;
      el.style.setProperty("--p", p.toFixed(4));
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

  const w = weeks[active]!;
  const pct = Math.round(((active + 1) / n) * 100);
  const R = 34;
  const C = 2 * Math.PI * R;

  return (
    <section ref={root} aria-label={labels.stage} className="relative" style={{ height: `${n * 70 + 30}svh` }}>
      <div className="sticky top-0 flex h-[100svh] items-center overflow-hidden">
        <div className="mx-auto grid h-full w-full max-w-[1680px] grid-rows-[minmax(0,1fr)_auto] gap-4 px-5 pb-[calc(5rem+env(safe-area-inset-bottom))] pt-[4.5rem] sm:px-8 lg:grid-cols-12 lg:grid-rows-1 lg:items-center lg:gap-10 lg:pb-10 lg:pt-24">
          {/* Stage render */}
          <div className="relative h-full min-h-0 lg:order-2 lg:col-span-7 lg:h-[min(78vh,46rem)]">
            <div className={cn("frame relative h-full overflow-hidden !rounded-[20px]", w.final && "shadow-[0_0_80px_-20px_rgb(232_180_92/0.45)]")} style={{ ["--edge" as string]: w.final ? 1 : 0.3 }}>
              {weeks.map((x, i) =>
                x.image ? (
                  <div key={x.week} aria-hidden className={cn("absolute inset-0 transition-opacity duration-700", i === active ? "opacity-100" : "opacity-0")}>
                    <Picture image={x.image} sizes="(min-width:1024px) 58vw, 100vw" decorative className="h-full w-full" />
                  </div>
                ) : null,
              )}
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void/90 via-transparent to-void/30" />
              <div aria-hidden className="grid-lines absolute inset-0 opacity-25 mix-blend-overlay" />
              {/* HUD */}
              <div className="absolute inset-x-0 top-0 flex items-start justify-between gap-4 p-4 sm:p-6">
                <div className="t-data text-[0.65rem] text-mist" dir="ltr">
                  <p>
                    BX-T1 · {labels.stage} <span className="text-chalk">{String(active + 1).padStart(2, "0")}</span>/{String(n).padStart(2, "0")}
                  </p>
                  <p className={cn("mt-1 text-sm", w.final ? "text-gold" : "text-cyan")}>{w.stage.toUpperCase()}</p>
                </div>
                <div className="relative size-[4.6rem] shrink-0" aria-label={`${pct}% ${labels.built}`} role="img">
                  <svg viewBox="0 0 80 80" className="size-full -rotate-90">
                    <circle cx="40" cy="40" r={R} fill="none" stroke="rgb(120 160 230 / .18)" strokeWidth="3" />
                    <circle
                      cx="40"
                      cy="40"
                      r={R}
                      fill="none"
                      stroke={w.final ? "#e8b45c" : "url(#asm-g)"}
                      strokeWidth="3"
                      strokeLinecap="round"
                      strokeDasharray={C}
                      strokeDashoffset={C * (1 - pct / 100)}
                      className="transition-[stroke-dashoffset] duration-700 ease-[var(--ease-out-expo)]"
                    />
                    <defs>
                      <linearGradient id="asm-g" x1="0" x2="1">
                        <stop offset="0" stopColor="#2b6dff" />
                        <stop offset="1" stopColor="#38dcff" />
                      </linearGradient>
                    </defs>
                  </svg>
                  <span className="t-data absolute inset-0 flex flex-col items-center justify-center text-sm text-chalk" dir="ltr">
                    {pct}%<span className="text-[0.5rem] tracking-widest text-fog">{labels.built.toUpperCase()}</span>
                  </span>
                </div>
              </div>
              <ul className="absolute bottom-0 start-0 flex flex-wrap gap-1.5 p-4 sm:p-6">
                {w.parts.map((p, i) => (
                  <li
                    key={`${active}-${p}`}
                    className="enter flex items-center gap-1.5 rounded-full border border-[var(--line-2)] bg-void/70 px-3 py-1.5 text-xs text-frost backdrop-blur"
                    style={{ ["--d" as string]: `${i * 90}ms` }}
                  >
                    <Icon name="plus" size={12} className={w.final ? "text-gold" : "text-cyan"} />
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* Timeline */}
          <div className="min-h-0 lg:order-1 lg:col-span-5">
            <ol className="hidden space-y-1 lg:block">
              {weeks.map((x, i) => {
                const on = i === active;
                return (
                  <li key={x.week}>
                    <button
                      type="button"
                      onClick={() => jump(i)}
                      className={cn("group relative w-full overflow-hidden rounded-xl px-5 py-3.5 text-start transition-colors duration-500", on ? (x.final ? "bg-[rgb(232_180_92/0.1)]" : "bg-panel") : "hover:bg-panel/60")}
                    >
                      <span aria-hidden className={cn("absolute inset-y-3 start-0 w-[3px] rounded-full transition-opacity", on ? "opacity-100" : "opacity-0", x.final ? "bg-gold" : "bg-gradient-to-b from-volt to-cyan")} />
                      <span className="flex items-center gap-4">
                        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-lg border transition-colors", on ? (x.final ? "border-gold/60 text-gold" : "border-volt/60 text-cyan") : "border-[var(--line)] text-fog")}>
                          <Icon name={WEEK_ICON[i] ?? "robot"} size={19} />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className={cn("t-eyebrow block text-[0.58rem]", x.final ? "text-gold" : on ? "text-cyan" : "text-fog")}>{x.final ? labels.final : `${labels.week} ${String(x.week).padStart(2, "0")}`}</span>
                          <span className={cn("t-title block truncate text-[1.05rem] transition-colors", on ? "text-chalk" : "text-mist")}>{x.title}</span>
                        </span>
                      </span>
                      <span className={cn("grid transition-[grid-template-rows,opacity] duration-500", on ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0")}>
                        <span className="overflow-hidden">
                          <span className="block ps-14 pt-2 text-sm leading-relaxed text-mist">{x.summary}</span>
                        </span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ol>

            {/* Phone: current week card + dots */}
            <div className="lg:hidden">
              <p className={cn("t-eyebrow text-[0.6rem]", w.final ? "text-gold" : "text-cyan")}>{w.final ? labels.final : `${labels.week} ${String(w.week).padStart(2, "0")}`}</p>
              <p key={w.week} className="enter t-headline mt-1 text-[1.6rem] text-chalk">
                {w.title}
              </p>
              <p className="mt-1.5 line-clamp-2 text-sm text-mist">{w.summary}</p>
              <div className="mt-4 flex gap-1.5">
                {weeks.map((x, i) => (
                  <button key={x.week} type="button" onClick={() => jump(i)} aria-label={x.title} className="h-6 flex-1">
                    <span className={cn("block h-[3px] rounded-full transition-colors", i <= active ? (x.final && i === active ? "bg-gold" : "bg-cyan") : "bg-steel")} />
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
