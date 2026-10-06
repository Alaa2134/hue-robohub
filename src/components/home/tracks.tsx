"use client";
import Link from "next/link";
import { useState } from "react";
import { Icon, TRACK_ICON } from "@/components/brand/icons";
import { Picture } from "@/components/media/picture";
import { cn } from "@/lib/cn";
import type { LibraryEntry } from "@/lib/media-library";

export type TrackPanel = {
  slug: string;
  href: string;
  code: string;
  name: string;
  tagline: string;
  tech: string[];
  accent: string;
  image: LibraryEntry | null;
  stats: string[];
};

/** Desktop: expanding panels (one machine, five disciplines). Phones: a snap rail of tall cards. */
export function TrackPanels({ tracks, cta }: { tracks: TrackPanel[]; cta: string }) {
  const [active, setActive] = useState(0);
  return (
    <>
      <div className="hidden h-[clamp(34rem,72vh,44rem)] gap-2 lg:flex" onPointerLeave={() => undefined}>
        {tracks.map((tr, i) => {
          const on = i === active;
          return (
            <Link
              key={tr.slug}
              href={tr.href}
              onPointerEnter={() => setActive(i)}
              onFocus={() => setActive(i)}
              className={cn(
                "group frame relative min-w-0 overflow-hidden !rounded-[18px] transition-[flex-grow] duration-[900ms] ease-[var(--ease-out-expo)]",
                on ? "grow-[4.4]" : "grow",
              )}
              style={{ flexBasis: 0, ["--edge" as string]: on ? 0.6 : 0, ["--a" as string]: tr.accent }}
            >
              {tr.image && (
                <Picture
                  image={tr.image}
                  sizes="60vw"
                  decorative
                  className={cn("absolute inset-0 h-full w-full transition-[transform,filter] duration-[1400ms] ease-[var(--ease-out-expo)]", on ? "scale-100 brightness-100" : "scale-110 brightness-[0.45] saturate-50")}
                />
              )}
              <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/40 to-transparent" />
              <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${tr.accent}, transparent)` }} />
              <div aria-hidden className="absolute inset-0 opacity-0 transition-opacity duration-700 group-hover:opacity-100" style={{ background: `radial-gradient(70% 60% at 30% 100%, color-mix(in oklab, ${tr.accent} 22%, transparent), transparent)` }} />

              {/* Collapsed label */}
              <div className={cn("absolute inset-0 flex flex-col items-center justify-between py-7 transition-opacity duration-500", on ? "opacity-0" : "opacity-100")}>
                <span className="t-data text-[0.7rem]" style={{ color: tr.accent }}>
                  {tr.code}
                </span>
                <span className="t-headline text-xl text-chalk [writing-mode:vertical-rl] rotate-180 whitespace-nowrap rtl:rotate-0">{tr.name}</span>
                <span className="flex size-10 items-center justify-center rounded-full border border-[var(--line-2)] text-mist">
                  <Icon name={TRACK_ICON[tr.slug] ?? "robot"} size={18} />
                </span>
              </div>

              {/* Expanded content */}
              <div className={cn("absolute inset-x-0 bottom-0 p-8 transition-[opacity,transform] duration-700 xl:p-10", on ? "translate-y-0 opacity-100 delay-200" : "pointer-events-none translate-y-6 opacity-0")}>
                <div className="flex items-center gap-3">
                  <span className="flex size-11 items-center justify-center rounded-lg border bg-void/50 backdrop-blur" style={{ borderColor: `color-mix(in oklab, ${tr.accent} 55%, transparent)`, color: tr.accent }}>
                    <Icon name={TRACK_ICON[tr.slug] ?? "robot"} size={20} />
                  </span>
                  <span className="t-data text-xs" style={{ color: tr.accent }}>
                    {String(i + 1).padStart(2, "0")} · {tr.code}
                  </span>
                </div>
                <h3 className="t-display mt-5 text-[clamp(2rem,3.4vw,3.4rem)] text-chalk">{tr.name}</h3>
                <p className="mt-3 max-w-md text-lg text-frost">{tr.tagline}</p>
                <ul className="mt-5 flex max-w-xl flex-wrap gap-1.5">
                  {tr.tech.slice(0, 6).map((x) => (
                    <li key={x} className="rounded-full border border-[var(--line-2)] bg-void/50 px-3 py-1 text-xs text-mist backdrop-blur">
                      {x}
                    </li>
                  ))}
                </ul>
                <div className="mt-7 flex items-center justify-between gap-6">
                  <span className="btn btn-sm">
                    <span>{cta}</span>
                    <Icon name="arrow" size={15} className="btn-arrow" />
                  </span>
                  {tr.stats.length > 0 && <span className="t-data text-[0.65rem] text-fog">{tr.stats.join(" · ")}</span>}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <div className="rail -mx-5 gap-3 px-5 pb-2 sm:-mx-8 sm:px-8 lg:hidden">
        {tracks.map((tr, i) => (
          <Link key={tr.slug} href={tr.href} className="frame relative flex aspect-[3/4.2] w-[78vw] max-w-[22rem] flex-col justify-end overflow-hidden !rounded-[18px] p-6">
            {tr.image && <Picture image={tr.image} sizes="80vw" decorative className="absolute inset-0 h-full w-full" />}
            <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-void via-void/55 to-transparent" />
            <div aria-hidden className="absolute inset-x-0 top-0 h-[3px]" style={{ background: `linear-gradient(90deg, ${tr.accent}, transparent)` }} />
            <div className="relative">
              <span className="t-data text-xs" style={{ color: tr.accent }}>
                {String(i + 1).padStart(2, "0")} · {tr.code}
              </span>
              <h3 className="t-display mt-2 text-[2rem] text-chalk">{tr.name}</h3>
              <p className="mt-2 text-sm text-frost">{tr.tagline}</p>
              <p className="mt-4 line-clamp-1 text-xs text-mist">{tr.tech.slice(0, 4).join(" · ")}</p>
            </div>
          </Link>
        ))}
      </div>
    </>
  );
}
