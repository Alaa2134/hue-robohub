"use client";
/**
 * Team points (XP), levels and badges. Everything is worked out in the database from what people
 * already do (20261011100000_team_xp.sql): tasks on time and approved, meetings, returning what
 * they borrow, member of the month — minus missed deadlines, absences and warnings.
 */
import { useState } from "react";
import { cn } from "@/lib/cn";
import { rpc } from "./core";
import { Badge, Card, Chip, Empty, ErrorBox, Icon, List, Loading, Row, TopBar, go, useAsync, type IconKey } from "./ui";

type Level = { level: number; name: string; from: number; next: number | null };
export type Xp = {
  staff_id: string;
  name: string;
  xp: number;
  month: number;
  rank: number;
  level: Level;
  badges: string[];
  parts: { tasks: number; meetings: number; store: number; awards: number; warnings: number } | null;
  stats: { on_time: number; late: number; approved: number; missed: number; present: number; meeting_late: number; absent: number; warnings: number; awards: number; returned: number; streak: number } | null;
};
type BoardRow = { staff_id: string; name: string; title: string | null; xp: number; month: number; level: Level; badges: string[]; me: boolean };

export const BADGES: { key: string; icon: string; name: string; how: string }[] = [
  { key: "first_task", icon: "🚀", name: "أول تسليم", how: "سلّم أول تاسك ليك" },
  { key: "on_time_10", icon: "⏰", name: "10 في الميعاد", how: "سلّم 10 تاسكات في ميعادها" },
  { key: "streak_5", icon: "🔥", name: "5 ورا بعض", how: "5 تسليمات ورا بعض من غير تأخير" },
  { key: "approved_25", icon: "✅", name: "25 اتقبلوا", how: "25 تاسك يتقبلوا من الهيد" },
  { key: "meetings_10", icon: "📅", name: "10 اجتماعات", how: "احضر 10 اجتماعات" },
  { key: "member_of_month", icon: "🏆", name: "عضو الشهر", how: "اتختار عضو الشهر" },
  { key: "clean_90", icon: "🛡️", name: "90 يوم نضيف", how: "90 يوم في الفريق من غير إنذار" },
  { key: "store_trust", icon: "📦", name: "أمين على العُهدة", how: "رجّع 5 حاجات للمخزن في ميعادها" },
];

const RULES: [string, string][] = [
  ["تسليم في الميعاد", "+30"],
  ["تسليم متأخر", "+10"],
  ["الهيد قبل التاسك", "+15"],
  ["حضور اجتماع", "+15"],
  ["حضور متأخر", "+5"],
  ["ترجيع حاجة للمخزن في ميعادها", "+5"],
  ["عضو الشهر", "+200"],
  ["فات ميعاد تاسك من غير تسليم", "−20"],
  ["غياب عن اجتماع", "−10"],
  ["إنذار", "−40"],
];

/** How far through this level, 0–100. */
const progress = (x: Pick<Xp, "xp" | "level">) => (x.level.next ? Math.min(100, Math.round(((x.xp - x.level.from) / (x.level.next - x.level.from)) * 100)) : 100);

function LevelBar({ x }: { x: Pick<Xp, "xp" | "level"> }) {
  return (
    <div>
      <div className="h-2.5 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={progress(x)} aria-valuemin={0} aria-valuemax={100} aria-label="التقدم للمستوى الجاي">
        <div className="h-full rounded-full bg-gradient-to-l from-gold to-volt transition-all" style={{ width: `${progress(x)}%` }} />
      </div>
      <p className="mt-1 text-xs text-fog">{x.level.next ? `فاضل ${x.level.next - x.xp} نقطة على ليفل ${x.level.level + 1}` : "وصلت لأعلى ليفل 👑"}</p>
    </div>
  );
}

function LevelMedal({ level, size = "md" }: { level: number; size?: "md" | "lg" }) {
  return (
    <span className={cn("flex shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-gold/40 to-volt/30 font-bold text-white", size === "lg" ? "size-16 text-2xl" : "size-11 text-lg")}>
      {level}
    </span>
  );
}

/** Home: my level and how far to the next. */
export function XpHomeCard() {
  const { data } = useAsync(() => rpc<Xp>("staff_xp").catch(() => null), []);
  if (!data?.level) return null;
  return (
    <button type="button" onClick={() => go("/staff/xp")} data-testid="xp-card" className="mt-4 flex w-full items-center gap-4 rounded-3xl border border-gold/30 bg-gold/[0.05] p-4 text-start transition active:scale-[0.99]">
      <LevelMedal level={data.level.level} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center justify-between gap-2">
          <span className="truncate font-semibold text-chalk">{data.level.name}</span>
          <span className="shrink-0 font-mono text-sm text-gold">{data.xp} XP</span>
        </span>
        <span className="mt-2 block">
          <LevelBar x={data} />
        </span>
      </span>
    </button>
  );
}

/** /staff/xp — my points, badges and the team table. */
export function XpScreen() {
  const mine = useAsync(() => rpc<Xp>("staff_xp"), []);
  const board = useAsync(() => rpc<BoardRow[]>("staff_xp_board", { p_sector: null }), []);
  const [by, setBy] = useState<"month" | "xp">("month");
  const x = mine.data;
  const rows = [...(board.data ?? [])].sort((a, b) => b[by] - a[by] || a.name.localeCompare(b.name));
  const parts: { key: keyof NonNullable<Xp["parts"]>; label: string; icon: IconKey }[] = [
    { key: "tasks", label: "التاسكات", icon: "flag" },
    { key: "meetings", label: "الاجتماعات", icon: "calendar" },
    { key: "store", label: "المخزن", icon: "box" },
    { key: "awards", label: "عضو الشهر", icon: "award" },
    { key: "warnings", label: "الإنذارات", icon: "alert" },
  ];
  return (
    <>
      <TopBar title="نقطي ومستواي" sub="بتكسب نقط من شغلك في الفريق: تسليم، حضور، التزام" back="/staff" />
      {mine.loading && !x ? (
        <Loading />
      ) : mine.error ? (
        <ErrorBox error={mine.error} retry={mine.reload} />
      ) : x ? (
        <>
          <Card className="grid gap-4 border-gold/30 bg-gold/[0.05]">
            <div className="flex items-center gap-4">
              <LevelMedal level={x.level.level} size="lg" />
              <div className="min-w-0 flex-1">
                <p className="text-xs text-fog">ليفل {x.level.level}</p>
                <p className="truncate text-xl font-bold text-chalk">{x.level.name}</p>
                <p className="font-mono text-sm text-gold">
                  {x.xp} XP · الشهر ده {x.month >= 0 ? `+${x.month}` : x.month}
                </p>
              </div>
              <Badge tone="volt">#{x.rank}</Badge>
            </div>
            <LevelBar x={x} />
            {x.parts && (
              <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
                {parts.map((p) => (
                  <div key={p.key} className="rounded-xl border border-[var(--line)] px-3 py-2">
                    <p className="flex items-center gap-1.5 text-xs text-fog">
                      <Icon name={p.icon} size={14} /> {p.label}
                    </p>
                    <p className={cn("font-mono text-lg", x.parts![p.key] < 0 ? "text-[#ff9aa5]" : "text-chalk")}>{x.parts![p.key]}</p>
                  </div>
                ))}
              </div>
            )}
            {x.stats && !!x.stats.streak && <p className="text-sm text-mist">🔥 أطول سلسلة تسليم في الميعاد: {x.stats.streak}</p>}
          </Card>

          <p className="mb-2 mt-6 font-semibold text-chalk">الأوسمة ({x.badges.length} من {BADGES.length})</p>
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            {BADGES.map((b) => {
              const has = x.badges.includes(b.key);
              return (
                <div key={b.key} data-testid={`badge-${b.key}`} data-earned={has} className={cn("rounded-2xl border p-3 text-center", has ? "border-gold/40 bg-gold/[0.06]" : "border-[var(--line)] opacity-50 grayscale")}>
                  <p className="text-2xl">{b.icon}</p>
                  <p className="mt-1 text-sm font-semibold text-chalk">{b.name}</p>
                  <p className="text-[11px] text-fog">{b.how}</p>
                </div>
              );
            })}
          </div>
        </>
      ) : null}

      <div className="mb-3 mt-6 flex items-center justify-between gap-2">
        <p className="font-semibold text-chalk">ترتيب الفريق</p>
        <div className="flex gap-2">
          <Chip active={by === "month"} onClick={() => setBy("month")}>
            الشهر ده
          </Chip>
          <Chip active={by === "xp"} onClick={() => setBy("xp")}>
            من الأول
          </Chip>
        </div>
      </div>
      {board.loading && !board.data ? (
        <Loading />
      ) : board.error ? (
        <ErrorBox error={board.error} retry={board.reload} />
      ) : !rows.length ? (
        <Empty icon="star" title="لسه مفيش ترتيب" />
      ) : (
        <List>
          {rows.map((r, i) => (
            <Row key={r.staff_id}>
              <div data-testid="xp-row" className={cn("flex items-center gap-3", r.me && "font-semibold")}>
                <span className="w-7 shrink-0 text-center font-mono text-fog">{i < 3 && r[by] > 0 ? ["🥇", "🥈", "🥉"][i] : i + 1}</span>
                <LevelMedal level={r.level.level} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-chalk">
                    {r.name} {r.me && <span className="text-xs text-cyan">(انت)</span>}
                  </p>
                  <p className="truncate text-xs text-fog">
                    {r.level.name}
                    {r.badges.length ? ` · ${r.badges.map((k) => BADGES.find((b) => b.key === k)?.icon ?? "").join("")}` : ""}
                  </p>
                </div>
                <span className="shrink-0 font-mono text-chalk">{r[by]}</span>
              </div>
            </Row>
          ))}
        </List>
      )}

      <Card className="mt-6 grid gap-1.5">
        <p className="mb-1 font-semibold text-chalk">إزاي بتكسب نقط؟</p>
        {RULES.map(([what, pts]) => (
          <p key={what} className="flex justify-between gap-2 text-sm">
            <span className="text-mist">{what}</span>
            <span className={cn("font-mono", pts.startsWith("+") ? "text-[#7cf0c6]" : "text-[#ff9aa5]")}>{pts}</span>
          </p>
        ))}
      </Card>
    </>
  );
}
