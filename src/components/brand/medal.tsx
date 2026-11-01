"use client";
/**
 * An achievement medal (src/portal/achievements.tsx, the public Skill Passport): a hexagon with a metal
 * rim per tier (bronze, silver, gold, diamond), a deep face, the track's emoji, the tier's stars, and
 * ribbons for gold and diamond. Locked medals are grey with a padlock.
 */
import { useId } from "react";
import { cn } from "@/lib/cn";

export const TRACK_EMOJI: Record<string, string> = {
  attend: "🎯",
  streak: "🔥",
  quiz: "🧠",
  perfect: "💯",
  tasks: "🛠️",
  reader: "📚",
  events: "🎟️",
  certs: "🎓",
  lab: "🔌",
  maker: "🤖",
  star: "⭐",
  points: "🏆",
  course: "🏁",
};
export const TRACK_NAMES: Record<string, { ar: string; en: string }> = {
  attend: { ar: "الحضور", en: "Attendance" },
  streak: { ar: "سلسلة الحضور", en: "Attendance streak" },
  quiz: { ar: "الكويزات", en: "Quizzes" },
  perfect: { ar: "الدرجة النهائية", en: "Full marks" },
  tasks: { ar: "التاسكات", en: "Tasks" },
  reader: { ar: "المذاكرة", en: "Studying" },
  events: { ar: "الفعاليات", en: "Events" },
  certs: { ar: "الشهادات", en: "Certificates" },
  lab: { ar: "تحديات اللاب", en: "Lab challenges" },
  maker: { ar: "صانع", en: "Maker" },
  star: { ar: "نجم الفريق", en: "Team star" },
  points: { ar: "النقاط", en: "Points" },
  course: { ar: "خلّص الكورس", en: "Course finisher" },
};
export const TIER_LABELS = {
  ar: ["", "برونزي", "فضي", "ذهبي", "ماسي"],
  en: ["", "Bronze", "Silver", "Gold", "Diamond"],
} as const;

/** Colors per look: rim (light → dark), face, glow. 0 = locked. */
const LOOKS = [
  { rim: ["#4a5670", "#222b40"], face: ["#1b2337", "#121828"], glow: "#7d8aa8" },
  { rim: ["#ffc08a", "#8a4719"], face: ["#5a2e12", "#2e170a"], glow: "#ff9a52" },
  { rim: ["#ffffff", "#8593a8"], face: ["#46536a", "#232b3a"], glow: "#dbe6f5" },
  { rim: ["#fff1a6", "#b9770c"], face: ["#6b4507", "#36230a"], glow: "#ffd34d" },
  { rim: ["#d6fbff", "#6a5cff"], face: ["#253a8a", "#160f45"], glow: "#8ef3ff" },
] as const;

/** A track with one threshold (finishing the course) is one gold medal. */
export const lookOf = (t: { tier: number; th: number[] }) => (t.th.length === 1 ? (t.tier ? 3 : 0) : t.tier);

const HEX = (r: number, cx = 50, cy = 50) =>
  Array.from({ length: 6 }, (_, i) => {
    const a = (Math.PI / 3) * i - Math.PI / 2;
    return `${(cx + r * Math.cos(a)).toFixed(2)},${(cy + r * Math.sin(a)).toFixed(2)}`;
  }).join(" ");

/** The medal itself: a hexagon with a metal rim, a deep face, the track's emoji and the tier's stars. */
export function Medal({
  k,
  look,
  size = 76,
  shine = false,
  className,
}: {
  k: string;
  look: number;
  size?: number;
  shine?: boolean;
  className?: string;
}) {
  const id = useId().replace(/:/g, "");
  const L = LOOKS[look] ?? LOOKS[0];
  const locked = look === 0;
  const stars = Math.min(look, 4);
  return (
    <svg
      viewBox="0 0 100 112"
      width={size}
      height={size * 1.12}
      className={cn("bx-medal", shine && "bx-medal-shine", className)}
      aria-hidden
      data-look={look}
    >
      <defs>
        <linearGradient id={`r${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor={L.rim[0]} />
          <stop offset="0.55" stopColor={L.rim[1]} />
          <stop offset="1" stopColor={L.rim[0]} stopOpacity="0.85" />
        </linearGradient>
        <radialGradient id={`f${id}`} cx="0.5" cy="0.35" r="0.75">
          <stop offset="0" stopColor={L.face[0]} />
          <stop offset="1" stopColor={L.face[1]} />
        </radialGradient>
        <linearGradient id={`s${id}`} x1="0" y1="0" x2="1" y2="0">
          <stop offset="0" stopColor="#fff" stopOpacity="0" />
          <stop offset="0.5" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="1" stopColor="#fff" stopOpacity="0" />
        </linearGradient>
        <clipPath id={`c${id}`}>
          <polygon points={HEX(46)} />
        </clipPath>
        <filter id={`g${id}`} x="-30%" y="-30%" width="160%" height="160%">
          <feGaussianBlur stdDeviation="4" />
        </filter>
      </defs>
      {/* Ribbon tails for gold and diamond. */}
      {look >= 3 && (
        <g opacity="0.95">
          <path d="M30 78 L22 108 L33 101 L40 110 L44 82 Z" fill={L.rim[1]} />
          <path d="M70 78 L78 108 L67 101 L60 110 L56 82 Z" fill={L.rim[1]} />
        </g>
      )}
      {!locked && <polygon points={HEX(44)} fill={L.glow} opacity="0.35" filter={`url(#g${id})`} />}
      <polygon points={HEX(46)} fill={`url(#r${id})`} />
      <polygon
        points={HEX(39)}
        fill={`url(#f${id})`}
        stroke={L.rim[0]}
        strokeOpacity="0.35"
        strokeWidth="1"
      />
      {/* Light falling on the top half of the face. */}
      <path
        d="M50 11 L83.8 30.5 L83.8 44 Q50 34 16.2 44 L16.2 30.5 Z"
        fill="#fff"
        opacity={locked ? 0.03 : 0.08}
        clipPath={`url(#c${id})`}
      />
      <text
        x="50"
        y="58"
        textAnchor="middle"
        dominantBaseline="middle"
        fontSize="30"
        style={{ filter: locked ? "grayscale(1) opacity(.35)" : undefined }}
      >
        {TRACK_EMOJI[k] ?? "🏅"}
      </text>
      {locked && (
        <g transform="translate(50 80)" fill="none" stroke="#8b97b3" strokeWidth="2.2" strokeLinecap="round">
          <rect x="-6" y="-2" width="12" height="9" rx="2" fill="#2a3450" />
          <path d="M-3.5 -2 v-3 a3.5 3.5 0 0 1 7 0 v3" />
        </g>
      )}
      {stars > 0 && (
        <g fill={L.rim[0]} stroke={L.rim[1]} strokeWidth="0.6">
          {Array.from({ length: stars }, (_, i) => {
            const x = 50 + (i - (stars - 1) / 2) * 9;
            return (
              <path
                key={i}
                transform={`translate(${x} 80) scale(0.32)`}
                d="M0-12 3.5-3.7 12.4-3.7 5.2 1.6 7.9 10.2 0 5 -7.9 10.2 -5.2 1.6 -12.4-3.7 -3.5-3.7Z"
              />
            );
          })}
        </g>
      )}
      {shine && !locked && (
        <g clipPath={`url(#c${id})`}>
          <rect
            className="bx-medal-sweep"
            x="-60"
            y="0"
            width="40"
            height="112"
            fill={`url(#s${id})`}
            transform="skewX(-20)"
          />
        </g>
      )}
    </svg>
  );
}
