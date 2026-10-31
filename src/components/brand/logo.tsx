import { BADGE, WORDMARK } from "./logo-paths";
import { cn } from "@/lib/cn";
import { BASE_PATH } from "@/lib/deploy";

/** The BuildX Robotics badge. `large` loads the 512 px file (for marks bigger than about 80 px). */
export function Mark({ className, title = "BuildX Robotics", style, large = false }: { className?: string; title?: string; style?: React.CSSProperties; large?: boolean }) {
  return (
    <img
      src={`${BASE_PATH}/brand/logo-badge-${large ? 512 : 160}.png`}
      width={BADGE.width}
      height={BADGE.height}
      alt={title}
      decoding="async"
      draggable={false}
      className={cn("shrink-0 select-none", className)}
      style={style}
    />
  );
}

/** BuildX HUE wordmark: BUILD white, X electric blue, HUE sky blue. */
export function Wordmark({ className, tone = "color" }: { className?: string; tone?: "color" | "white" | "black" | "ghost" }) {
  const glyphs = [...WORDMARK.build, ...WORDMARK.x, ...WORDMARK.hue];
  if (tone === "ghost") {
    // Oversized decorative wordmark: gradient fill that dissolves downward.
    return (
      <svg viewBox={`0 0 ${Math.ceil(WORDMARK.width)} ${WORDMARK.height}`} className={cn("shrink-0", className)} aria-hidden>
        <defs>
          <linearGradient id="wm-ghost" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="#9fb0c9" stopOpacity="0.16" />
            <stop offset="0.85" stopColor="#9fb0c9" stopOpacity="0.015" />
          </linearGradient>
        </defs>
        <g fill="url(#wm-ghost)">
          {glyphs.map((g, i) => (
            <path key={i} fillRule="evenodd" transform={`translate(${g.x} 0)`} d={g.d} />
          ))}
        </g>
      </svg>
    );
  }
  // The colour wordmark follows the theme's ink (white on dark themes, near-black on the light one).
  const main = tone === "black" ? "#05070A" : tone === "color" ? "var(--color-chalk, #F2F5F8)" : "#F2F5F8";
  const x = tone === "color" ? "#2F7BFF" : main;
  const hue = tone === "color" ? "#38B6FF" : main;
  return (
    <svg viewBox={`0 0 ${Math.ceil(WORDMARK.width)} ${WORDMARK.height}`} className={cn("shrink-0", className)} role="img" aria-label="BuildX HUE">
      <g style={{ fill: main }}>
        {WORDMARK.build.map((g, i) => (
          <path key={i} fillRule="evenodd" transform={`translate(${g.x} 0)`} d={g.d} />
        ))}
      </g>
      <g fill={x}>
        {WORDMARK.x.map((g, i) => (
          <path key={i} fillRule="evenodd" transform={`translate(${g.x} 0)`} d={g.d} />
        ))}
      </g>
      <g fill={hue}>
        {WORDMARK.hue.map((g, i) => (
          <path key={i} fillRule="evenodd" transform={`translate(${g.x} 0)`} d={g.d} />
        ))}
      </g>
    </svg>
  );
}

/** Header lockup: mark + wordmark + slogan. `size` scales the whole unit. */
export function Lockup({ className, compact = false, size = "md" }: { className?: string; compact?: boolean; size?: "sm" | "md" | "lg" }) {
  const mark = size === "lg" ? "h-14" : size === "sm" ? "h-8" : "h-10";
  const word = size === "lg" ? "h-[1.2rem]" : size === "sm" ? "h-[0.8rem]" : "h-[0.92rem]";
  return (
    <span className={cn("flex items-center gap-3", className)} dir="ltr">
      <Mark className={cn(mark, "w-auto")} />
      <span className="flex flex-col gap-1.5">
        <Wordmark className={cn(word, "w-auto")} />
        {!compact && <span className="t-eyebrow !text-[0.52rem] !tracking-[0.32em] text-fog">Build · Innovate · Compete</span>}
      </span>
    </span>
  );
}
