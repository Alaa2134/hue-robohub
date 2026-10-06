import { MARK_PATHS, WORDMARK } from "./logo-paths";
import { cn } from "@/lib/cn";

/** BuildX X mark (flat). `tone` = color (white + blue axis) | white | black | chrome. */
export function Mark({ className, tone = "color", title = "BuildX HUE", style }: { className?: string; tone?: "color" | "white" | "black" | "chrome"; title?: string; style?: React.CSSProperties }) {
  const id = "mk-chrome";
  const fill = tone === "black" ? "#05070A" : tone === "chrome" ? `url(#${id})` : "#F2F5F8";
  const axis = tone === "color" || tone === "chrome" ? "#2B6DFF" : fill;
  return (
    <svg viewBox={`0 0 ${MARK_PATHS.width} 100`} className={cn("shrink-0", className)} style={style} role="img" aria-label={title}>
      {tone === "chrome" && (
        <defs>
          <linearGradient id={id} x1="0" y1="0" x2="0.25" y2="1">
            <stop offset="0" stopColor="#ffffff" />
            <stop offset="0.42" stopColor="#c9d6e8" />
            <stop offset="0.52" stopColor="#7d8ea8" />
            <stop offset="0.66" stopColor="#e5edf8" />
            <stop offset="1" stopColor="#a9b8cc" />
          </linearGradient>
        </defs>
      )}
      <path fillRule="evenodd" fill={fill} d={MARK_PATHS.body} />
      <path fill={axis} d={MARK_PATHS.axis} />
    </svg>
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
  const main = tone === "black" ? "#05070A" : "#F2F5F8";
  const x = tone === "color" ? "#2F7BFF" : main;
  const hue = tone === "color" ? "#38B6FF" : main;
  return (
    <svg viewBox={`0 0 ${Math.ceil(WORDMARK.width)} ${WORDMARK.height}`} className={cn("shrink-0", className)} role="img" aria-label="BuildX HUE">
      <g fill={main}>
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
  const mark = size === "lg" ? "h-11" : size === "sm" ? "h-7" : "h-8";
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
