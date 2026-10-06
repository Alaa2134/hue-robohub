import type { Motif } from "@/lib/worlds";

/** Decorative background motif for a track "world" (pure SVG patterns, no images). */
export function MotifBg({ motif, accent, className = "" }: { motif: Motif; accent: string; className?: string }) {
  const id = `motif-${motif}`;
  const a = accent;
  const pattern = {
    pcb: (
      <pattern id={id} width="120" height="120" patternUnits="userSpaceOnUse">
        <path d="M0 30h40l15 15h65M30 0v20l20 20v80M90 0v35l-15 15H0M120 90H80l-10 10v20" fill="none" stroke={a} strokeWidth="1" opacity=".5" />
        <circle cx="55" cy="45" r="3" fill="none" stroke={a} opacity=".7" />
        <circle cx="75" cy="50" r="3" fill="none" stroke={a} opacity=".7" />
        <circle cx="70" cy="100" r="2.5" fill={a} opacity=".6" />
      </pattern>
    ),
    rover: (
      <pattern id={id} width="90" height="40" patternUnits="userSpaceOnUse" patternTransform="rotate(-18)">
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={i} x={i * 15} y="6" width="8" height="10" rx="1.5" fill={a} opacity=".35" />
        ))}
        {[0, 1, 2, 3, 4, 5].map((i) => (
          <rect key={`b${i}`} x={i * 15 + 7} y="24" width="8" height="10" rx="1.5" fill={a} opacity=".35" />
        ))}
      </pattern>
    ),
    blueprint: (
      <pattern id={id} width="80" height="80" patternUnits="userSpaceOnUse">
        <path d="M80 0H0v80" fill="none" stroke={a} strokeWidth=".6" opacity=".45" />
        <path d="M40 0v80M0 40h80" fill="none" stroke={a} strokeWidth=".3" opacity=".3" />
        <circle cx="40" cy="40" r="14" fill="none" stroke={a} strokeWidth=".6" opacity=".35" />
      </pattern>
    ),
    pointcloud: (
      <pattern id={id} width="46" height="46" patternUnits="userSpaceOnUse">
        {[
          [5, 7], [17, 3], [29, 11], [41, 5], [9, 22], [23, 19], [35, 27], [3, 37], [15, 41], [27, 33], [43, 39],
        ].map(([x, y], i) => (
          <circle key={i} cx={x} cy={y} r={i % 3 ? 0.9 : 1.4} fill={a} opacity={i % 2 ? 0.55 : 0.85} />
        ))}
      </pattern>
    ),
    race: (
      <pattern id={id} width="60" height="60" patternUnits="userSpaceOnUse" patternTransform="rotate(-62)">
        <rect width="8" height="60" fill={a} opacity=".35" />
        <rect x="16" width="3" height="60" fill={a} opacity=".2" />
      </pattern>
    ),
  }[motif];
  return (
    <svg aria-hidden className={`pointer-events-none absolute inset-0 h-full w-full ${className}`}>
      <defs>{pattern}</defs>
      <rect width="100%" height="100%" fill={`url(#${id})`} />
    </svg>
  );
}
