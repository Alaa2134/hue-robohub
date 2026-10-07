"use client";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Icon, TEAM_ICON } from "@/components/brand/icons";
import { Picture } from "@/components/media/picture";
import { cn } from "@/lib/cn";
import type { LibraryEntry } from "@/lib/media-library";

export type GarageTeam = {
  slug: string;
  href: string;
  code: string;
  name: string;
  tagline: string;
  summary: string;
  accent: string;
  image: LibraryEntry | null;
  specs: { label: string; value: string }[];
  members: number;
};

const CYCLE = 7000;

/**
 * "Built to compete" garage: broadcast-style team selector with livery colours, auto-cycling while
 * on screen (paused on hover/focus, off for reduced motion), keyboard operable as a tab list.
 */
export function Garage({ teams, labels }: { teams: GarageTeam[]; labels: { specs: string; open: string; members: string } }) {
  const [active, setActive] = useState(0);
  const [auto, setAuto] = useState(true);
  const [visible, setVisible] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const tabs = useRef<(HTMLButtonElement | null)[]>([]);
  const n = teams.length;
  const team = teams[active]!;

  useEffect(() => {
    const el = root.current;
    if (!el) return;
    if (matchMedia("(prefers-reduced-motion: reduce)").matches) setAuto(false);
    const io = new IntersectionObserver(([e]) => setVisible(!!e?.isIntersecting), { threshold: 0.35 });
    io.observe(el);
    return () => io.disconnect();
  }, []);

  useEffect(() => {
    if (!auto || !visible) return;
    const id = window.setTimeout(() => setActive((a) => (a + 1) % n), CYCLE);
    return () => window.clearTimeout(id);
  }, [auto, visible, active, n]);

  const select = (i: number, focus = false) => {
    setAuto(false);
    setActive(i);
    if (focus) tabs.current[i]?.focus();
  };

  return (
    <div ref={root} className="grid gap-6 lg:grid-cols-12 lg:gap-8" onPointerEnter={() => setAuto(false)}>
      {/* Selector */}
      <div role="tablist" aria-orientation="vertical" className="rail -mx-5 gap-2 px-5 sm:-mx-8 sm:px-8 lg:mx-0 lg:flex lg:flex-col lg:overflow-visible lg:px-0 lg:col-span-4">
        {teams.map((t, i) => {
          const on = i === active;
          return (
            <button
              key={t.slug}
              ref={(el) => {
                tabs.current[i] = el;
              }}
              role="tab"
              id={`garage-tab-${t.slug}`}
              aria-selected={on}
              aria-controls="garage-panel"
              tabIndex={on ? 0 : -1}
              onClick={() => select(i)}
              onKeyDown={(e) => {
                if (e.key === "ArrowDown" || e.key === "ArrowRight") {
                  e.preventDefault();
                  select((i + 1) % n, true);
                } else if (e.key === "ArrowUp" || e.key === "ArrowLeft") {
                  e.preventDefault();
                  select((i - 1 + n) % n, true);
                }
              }}
              className={cn(
                "group relative flex w-[15.5rem] shrink-0 items-center gap-4 overflow-hidden px-5 py-4 text-start transition-colors duration-500 lg:w-full",
                on ? "bg-panel" : "bg-deep/60 hover:bg-panel/70",
              )}
              style={{ ["--a" as string]: t.accent }}
            >
              <span aria-hidden className="absolute inset-y-0 start-0 w-[3px] transition-[width] duration-500" style={{ background: t.accent, width: on ? 5 : 3 }} />
              <span aria-hidden className="absolute inset-0 opacity-0 transition-opacity duration-500 group-aria-selected:opacity-100" style={{ background: `linear-gradient(100deg, color-mix(in oklab, ${t.accent} 16%, transparent), transparent 60%)` }} />
              <span className="t-display relative w-12 shrink-0 text-[2rem] leading-none [transform:skewX(-10deg)]" style={{ color: on ? t.accent : "transparent", WebkitTextStroke: on ? undefined : `1px color-mix(in oklab, ${t.accent} 60%, transparent)` }} dir="ltr">
                {String(i + 1).padStart(2, "0")}
              </span>
              <span className="relative min-w-0 flex-1">
                <span className={cn("t-headline block truncate text-lg transition-colors", on ? "text-chalk" : "text-mist group-hover:text-frost")}>{t.name}</span>
                <span className="block truncate text-xs text-fog">{t.tagline}</span>
              </span>
              <Icon name={TEAM_ICON[t.slug] ?? "robot"} size={20} className="relative shrink-0" style={{ color: on ? t.accent : undefined }} />
              {on && auto && visible && <span aria-hidden key={`p${active}`} className="garage-progress absolute bottom-0 start-0 h-[2px]" style={{ background: t.accent, animationDuration: `${CYCLE}ms` }} />}
            </button>
          );
        })}
      </div>

      {/* Stage */}
      <div id="garage-panel" role="tabpanel" aria-labelledby={`garage-tab-${team.slug}`} className="relative lg:col-span-8">
        <div className="chamfer-tr relative aspect-[4/5] overflow-hidden bg-deep sm:aspect-[16/10] lg:aspect-auto lg:h-full lg:min-h-[36rem]" style={{ ["--c" as string]: "34px" }}>
          {teams.map((t, i) =>
            t.image ? (
              <div key={t.slug} aria-hidden className={cn("absolute inset-0 transition-[opacity,transform] duration-[1100ms] ease-[var(--ease-out-expo)]", i === active ? "scale-100 opacity-100" : "scale-[1.06] opacity-0")}>
                <Picture image={t.image} sizes="(min-width:1024px) 62vw, 100vw" decorative className="h-full w-full" />
              </div>
            ) : null,
          )}
          <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/30 to-transparent" />
          <div aria-hidden className="absolute inset-0 bg-gradient-to-r from-void/70 via-transparent to-transparent rtl:bg-gradient-to-l" />
          <div aria-hidden className="livery absolute -end-10 top-0 h-full w-40 opacity-80" style={{ ["--a" as string]: team.accent }} />

          <div className="absolute inset-0 flex flex-col justify-between p-5 sm:p-8 lg:p-10">
            <div className="flex items-start justify-between gap-4">
              <span className="t-eyebrow rounded-sm px-2 py-1 text-[0.6rem] text-void" style={{ background: team.accent }}>
                {team.code} · Team {String(active + 1).padStart(2, "0")}
              </span>
              {team.members > 0 && (
                <span className="t-data rounded-sm border border-[var(--line-2)] bg-void/50 px-2 py-1 text-[0.65rem] text-mist backdrop-blur">
                  {team.members} {labels.members}
                </span>
              )}
            </div>
            <div key={team.slug} className="max-w-xl">
              <p className="enter t-eyebrow" style={{ color: team.accent }}>
                {team.tagline}
              </p>
              <h3 className="enter t-display mt-3 text-[clamp(2.6rem,6.4vw,5.6rem)] text-chalk [transform:skewX(-8deg)] origin-bottom-left" style={{ ["--d" as string]: "80ms" }}>
                {team.name}
              </h3>
              <p className="enter mt-3 max-w-md text-pretty text-sm text-frost sm:text-base" style={{ ["--d" as string]: "160ms" }}>
                {team.summary}
              </p>
              {team.specs.length > 0 && (
                <dl className="enter mt-6 hidden grid-cols-2 gap-px overflow-hidden rounded-md border border-[var(--line)] bg-[var(--line)] sm:grid" style={{ ["--d" as string]: "240ms" }} aria-label={labels.specs}>
                  {team.specs.slice(0, 4).map((s) => (
                    <div key={s.label} className="bg-void/70 px-4 py-3 backdrop-blur">
                      <dt className="t-eyebrow text-[0.56rem] text-fog">{s.label}</dt>
                      <dd className="mt-1 text-sm text-chalk">{s.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
              <Link href={team.href} className="enter btn btn-sm mt-6" style={{ ["--d" as string]: "320ms" }}>
                <span>
                  {labels.open}
                  <span className="sr-only"> — {team.name}</span>
                </span>
                <Icon name="arrow" size={15} className="btn-arrow" />
              </Link>
            </div>
          </div>
          <span aria-hidden className="t-display pointer-events-none absolute -bottom-6 end-4 text-[clamp(7rem,16vw,15rem)] leading-none text-transparent [transform:skewX(-10deg)] [-webkit-text-stroke:1px_rgb(255_255_255/0.08)]" dir="ltr">
            {String(active + 1).padStart(2, "0")}
          </span>
        </div>
      </div>
    </div>
  );
}
