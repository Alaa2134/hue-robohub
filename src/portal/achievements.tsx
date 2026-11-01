"use client";
/**
 * Student achievements: tiered medals (bronze, silver, gold, diamond) on 13 tracks, worked out in the
 * database from the student's own records (see 20261101200000_student_achievements.sql). A new tier
 * is celebrated once (full-screen, then marked seen); tapping a medal shows its tiers and progress.
 */
import { useId, useState } from "react";
import { cn } from "@/lib/cn";
import { fmt, rpc, studentRpc } from "./core";
import { Button, Section, Sheet, useAsync } from "./ui";

export type Track = {
  key: string;
  value: number;
  tier: number;
  next: number | null;
  th: number[];
  earned?: { tier: number; at: string }[];
};
type Mine = { items: Track[]; fresh: { key: string; tier: number }[] };

/** Name, emoji and how a value reads, per track (the database has the thresholds). */
export const TRACKS: Record<string, { ar: string; emoji: string; unit: (n: number) => string }> = {
  attend: { ar: "الحضور", emoji: "🎯", unit: (n) => `حضرت ${n} سيشن` },
  streak: { ar: "سلسلة الحضور", emoji: "🔥", unit: (n) => `${n} سيشن ورا بعض` },
  quiz: { ar: "الكويزات", emoji: "🧠", unit: (n) => `حليت ${n} كويز` },
  perfect: { ar: "الدرجة النهائية", emoji: "💯", unit: (n) => `${n} كويز بالدرجة النهائية` },
  tasks: { ar: "التاسكات", emoji: "🛠️", unit: (n) => `${n} تاسك متصحّح` },
  reader: { ar: "المذاكرة", emoji: "📚", unit: (n) => `فتحت ${n} محاضرة` },
  events: { ar: "الفعاليات", emoji: "🎟️", unit: (n) => `حضرت ${n} فعالية` },
  certs: { ar: "الشهادات", emoji: "🎓", unit: (n) => `${n} شهادة` },
  lab: { ar: "تحديات اللاب", emoji: "🔌", unit: (n) => `عدّيت ${n} تحدي في اللاب` },
  maker: { ar: "صانع", emoji: "🤖", unit: (n) => `${n} مشروع اتنشر على الموقع` },
  star: { ar: "نجم الفريق", emoji: "⭐", unit: (n) => `${n} نقطة تقدير من الفريق` },
  points: { ar: "النقاط", emoji: "🏆", unit: (n) => `${n} نقطة` },
  course: { ar: "خلّص الكورس", emoji: "🏁", unit: (n) => `${n}% من الكورس` },
};

export const TIER_NAMES = ["", "برونزي", "فضي", "ذهبي", "ماسي"] as const;

/** Colors per look: rim (light → dark), face, glow. 0 = locked. */
const LOOKS = [
  { rim: ["#4a5670", "#222b40"], face: ["#1b2337", "#121828"], glow: "#7d8aa8" },
  { rim: ["#ffc08a", "#8a4719"], face: ["#5a2e12", "#2e170a"], glow: "#ff9a52" },
  { rim: ["#ffffff", "#8593a8"], face: ["#46536a", "#232b3a"], glow: "#dbe6f5" },
  { rim: ["#fff1a6", "#b9770c"], face: ["#6b4507", "#36230a"], glow: "#ffd34d" },
  { rim: ["#d6fbff", "#6a5cff"], face: ["#253a8a", "#160f45"], glow: "#8ef3ff" },
] as const;

/** A track with one threshold (finishing the course) is one gold medal. */
export const lookOf = (t: Pick<Track, "tier" | "th">) => (t.th.length === 1 ? (t.tier ? 3 : 0) : t.tier);

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
        {TRACKS[k]?.emoji ?? "🏅"}
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

function progress(t: Track) {
  if (!t.next) return 1;
  const prev = [...t.th].reverse().find((x) => x <= t.value) ?? 0;
  return Math.max(0, Math.min(1, (t.value - prev) / Math.max(1, t.next - prev)));
}

function MedalCard({ t, onOpen }: { t: Track; onOpen: () => void }) {
  const meta = TRACKS[t.key];
  const look = lookOf(t);
  return (
    <button
      type="button"
      onClick={onOpen}
      className="group flex flex-col items-center gap-1 rounded-2xl border border-[var(--line)] p-2.5 text-center transition hover:border-[var(--line-2)] hover:bg-white/[0.03]"
      data-testid={`medal-${t.key}`}
    >
      <Medal k={t.key} look={look} size={58} className="transition-transform group-hover:-translate-y-0.5" />
      <span className="text-[12.5px] font-semibold leading-tight text-chalk">{meta?.ar ?? t.key}</span>
      <span className="text-[10.5px] text-fog">
        {look ? TIER_NAMES[look] : t.next ? <bdi dir="ltr">{`${t.value} / ${t.next}`}</bdi> : "مقفولة"}
      </span>
      {t.next && (
        <span className="mt-0.5 h-1 w-full overflow-hidden rounded-full bg-white/[0.07]">
          <span
            className="block h-full rounded-full bg-gradient-to-l from-volt to-cyan"
            style={{ width: `${Math.round(progress(t) * 100)}%` }}
          />
        </span>
      )}
    </button>
  );
}

function MedalSheet({ t, onClose }: { t: Track | null; onClose: () => void }) {
  if (!t) return null;
  const meta = TRACKS[t.key];
  const single = t.th.length === 1;
  return (
    <Sheet open onClose={onClose} title={meta?.ar ?? t.key}>
      <div className="grid gap-4">
        <div className="flex flex-col items-center gap-2">
          <Medal k={t.key} look={lookOf(t)} size={120} shine />
          <p className="text-sm text-mist">{meta?.unit(t.value)}</p>
          {t.next && <p className="text-xs text-fog">فاضلك {t.next - t.value} للمستوى اللي بعده</p>}
        </div>
        <ol className="grid gap-2">
          {t.th.map((need, i) => {
            const tier = i + 1;
            const look = single ? 3 : tier;
            const got = t.tier >= tier;
            const at = t.earned?.find((e) => e.tier === tier)?.at;
            return (
              <li
                key={tier}
                className={cn(
                  "flex items-center gap-3 rounded-xl border px-3 py-2",
                  got ? "border-[var(--line-2)] bg-white/[0.03]" : "border-[var(--line)] opacity-70",
                )}
              >
                <Medal k={t.key} look={got ? look : 0} size={34} />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold text-chalk">
                    {single ? "خلّصت الكورس كله" : TIER_NAMES[tier]}
                  </p>
                  <p className="text-xs text-fog">{meta?.unit(need)}</p>
                </div>
                <span className="text-xs text-fog">
                  {got ? (
                    at ? (
                      fmt.short(at)
                    ) : (
                      "✓"
                    )
                  ) : (
                    <bdi dir="ltr">{`${Math.min(t.value, need)} / ${need}`}</bdi>
                  )}
                </span>
              </li>
            );
          })}
        </ol>
      </div>
    </Sheet>
  );
}

const CONFETTI = ["#ffd34d", "#38dcff", "#ff7a45", "#a78bfa", "#34d399", "#f472b6"];

/** Full-screen «مبروك» for tiers not celebrated yet. */
function Celebrate({
  fresh,
  onDone,
}: {
  fresh: { key: string; tier: number; look: number }[];
  onDone: () => void;
}) {
  const [i, setI] = useState(0);
  const f = fresh[i]!;
  const last = i === fresh.length - 1;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="شارة جديدة"
      className="fixed inset-0 z-[80] flex items-center justify-center bg-void/85 px-6 backdrop-blur-md"
      data-testid="badge-celebrate"
    >
      <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
        {Array.from({ length: 36 }, (_, n) => (
          <span
            key={`${i}-${n}`}
            className="bx-confetti absolute top-[-5%] block h-3 w-1.5 rounded-sm"
            style={{
              left: `${(n * 37) % 100}%`,
              background: CONFETTI[n % CONFETTI.length],
              animationDelay: `${(n % 9) * 0.12}s`,
              animationDuration: `${2.2 + (n % 5) * 0.35}s`,
            }}
          />
        ))}
      </div>
      <div className="relative grid w-full max-w-sm justify-items-center gap-3 text-center">
        <p className="t-eyebrow text-[0.7rem] text-gold">
          شارة جديدة {fresh.length > 1 ? `· ${i + 1} من ${fresh.length}` : ""}
        </p>
        <Medal key={i} k={f.key} look={f.look} size={170} shine className="bx-medal-pop" />
        <h2 className="text-2xl font-bold text-chalk">مبروك! 🎉</h2>
        <p className="text-[15px] text-mist">
          خدت «{TRACKS[f.key]?.ar}» {TIER_NAMES[f.look]}
        </p>
        <Button
          variant="primary"
          size="lg"
          block
          onClick={() => (last ? onDone() : setI(i + 1))}
          data-testid="badge-next"
        >
          {last ? "تمام" : "اللي بعدها"}
        </Button>
      </div>
    </div>
  );
}

/** The achievements section (student points screen) with the celebration for new tiers. */
export function MyAchievements() {
  const { data } = useAsync(() => studentRpc<Mine>("student_achievements"), []);
  const [open, setOpen] = useState<Track | null>(null);
  const [celebrated, setCelebrated] = useState(false);
  if (!data) return null;
  const earned = data.items.reduce((n, t) => n + t.tier, 0);
  const total = data.items.reduce((n, t) => n + t.th.length, 0);
  const fresh = data.fresh.map((f) => ({
    ...f,
    look: lookOf({ tier: f.tier, th: data.items.find((t) => t.key === f.key)?.th ?? [1, 2, 3, 4] }),
  }));
  return (
    <>
      <Section title={`الشارات (${earned} من ${total})`}>
        <div className="grid grid-cols-3 gap-2 sm:grid-cols-5" data-testid="achievements">
          {data.items.map((t) => (
            <MedalCard key={t.key} t={t} onOpen={() => setOpen(t)} />
          ))}
        </div>
        <p className="mt-2 text-xs leading-relaxed text-fog">
          كل شارة ليها ٤ مستويات: برونزي، فضي، ذهبي، ماسي. بتتحسب لوحدها من حضورك وكويزاتك وتاسكاتك وشغلك.
        </p>
      </Section>
      <MedalSheet t={open} onClose={() => setOpen(null)} />
      {!celebrated && fresh.length > 0 && (
        <Celebrate
          fresh={fresh}
          onDone={() => {
            setCelebrated(true);
            studentRpc("student_achievements_seen").catch(() => undefined);
          }}
        />
      )}
    </>
  );
}

/** Small strip for the student home: the top medals, and the celebration if something is new. */
export function AchievementsStrip() {
  const { data } = useAsync(() => studentRpc<Mine>("student_achievements"), []);
  const [celebrated, setCelebrated] = useState(false);
  if (!data) return null;
  const got = data.items.filter((t) => t.tier > 0).sort((a, b) => lookOf(b) - lookOf(a));
  const nextUp = data.items.filter((t) => t.next).sort((a, b) => progress(b) - progress(a))[0];
  const fresh = data.fresh.map((f) => ({
    ...f,
    look: lookOf({ tier: f.tier, th: data.items.find((t) => t.key === f.key)?.th ?? [1, 2, 3, 4] }),
  }));
  return (
    <>
      <a
        href="#/me/points"
        className="mt-3 flex items-center gap-3 rounded-3xl border border-[var(--line)] bg-panel/60 p-4"
        data-testid="achievements-strip"
      >
        <div className="flex -space-x-3 space-x-reverse">
          {(got.length ? got.slice(0, 4) : data.items.slice(0, 3)).map((t) => (
            <Medal key={t.key} k={t.key} look={lookOf(t)} size={38} />
          ))}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-chalk">{got.length ? `${got.length} شارة` : "شاراتك"}</p>
          {nextUp && (
            <p className="truncate text-xs text-fog">
              الجاية: {TRACKS[nextUp.key]?.ar} (<bdi dir="ltr">{`${nextUp.value} / ${nextUp.next}`}</bdi>)
            </p>
          )}
        </div>
      </a>
      {!celebrated && fresh.length > 0 && (
        <Celebrate
          fresh={fresh}
          onDone={() => {
            setCelebrated(true);
            studentRpc("student_achievements_seen").catch(() => undefined);
          }}
        />
      )}
    </>
  );
}

/** Staff: one student's medals (student sheet). */
export function StaffAchievements({ id }: { id: string }) {
  const { data } = useAsync(() => rpc<Track[]>("staff_student_achievements", { p_id: id }), [id]);
  if (!data) return null;
  const got = data.filter((t) => t.tier > 0);
  return (
    <div className="mt-4 rounded-2xl border border-[var(--line)] p-3" data-testid="staff-achievements">
      <p className="mb-2 text-xs text-fog">
        الشارات ({got.length ? `${got.length} من ${data.length}` : "لسه مفيش"})
      </p>
      <div className="flex flex-wrap gap-1.5">
        {data.map((t) => (
          <span
            key={t.key}
            title={`${TRACKS[t.key]?.ar ?? t.key}${t.tier ? ` · ${TIER_NAMES[lookOf(t)]}` : ""}`}
          >
            <Medal k={t.key} look={lookOf(t)} size={30} />
          </span>
        ))}
      </div>
    </div>
  );
}
