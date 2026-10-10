"use client";
/**
 * Baqloz (the site's mascot) inside the BuildX App. On the home screen he tells each person what's on
 * them right now — most urgent first — and takes them there with one tap. On the other team screens he
 * waits in the corner with the count, and if something was forgotten (a task past its deadline, a
 * meeting taking attendance now, a new warning, a task sent back) he pops up once in a while to remind
 * them. The team's list comes from staff_reminders (20261010100000_baqloz_reminders.sql); the
 * students' from their tasks, quizzes and schedule. The 2D stills are the site's mascot posters.
 */
import { useCallback, useEffect, useMemo, useState } from "react";
import { cn } from "@/lib/cn";
import { BASE_PATH, fmt, rpc } from "./core";
import { useSchedule } from "./schedule";
import { useStudentTasks } from "./tasks";
import { Button, Sheet, go } from "./ui";

const POSTER = `${BASE_PATH}/mascot/poster.webp`;
const POSTER_WAVE = `${BASE_PATH}/mascot/poster-wave.webp`;

export type Reminder = {
  kind: string;
  to: string;
  id?: string;
  title?: string;
  at?: string;
  count?: number;
  name?: string;
  request?: "extension" | "excuse";
  place?: string | null;
  sector?: string;
  /** A line written by the caller (home cards, students). */
  line?: string;
};

const URGENT = new Set(["overdue", "meeting_open", "warning", "redo"]);
const keyOf = (r: Reminder) => `${r.kind}:${r.id ?? ""}`;

/** "فات من ساعتين" / "فاضل 3 ساعات" / "بكرة 6:00 م" */
function when(at?: string) {
  if (!at) return "";
  const ms = new Date(at).getTime() - Date.now();
  const abs = Math.abs(ms);
  const h = Math.round(abs / 3_600_000);
  const d = Math.round(abs / 86_400_000);
  const span = abs < 3_600_000 ? `${Math.max(1, Math.round(abs / 60_000))} دقيقة` : h < 24 ? (h === 1 ? "ساعة" : h === 2 ? "ساعتين" : `${h} ساعات`) : d === 1 ? "يوم" : d === 2 ? "يومين" : `${d} أيام`;
  return ms >= 0 ? `فاضل ${span}` : `من ${span}`;
}

/** What Baqloz says about one thing. */
export function lineFor(r: Reminder, first: string): string {
  if (r.line) return r.line;
  const t = r.title ? `«${r.title}»` : "";
  switch (r.kind) {
    case "overdue":
      return `يا ${first}، ${t} فات ميعادها ${when(r.at)} 😬 لسه تقدر تسلّمها… تعالى أوديك.`;
    case "redo":
      return `الهيد رجّعلك ${t} محتاجة تعديل بسيط ✍️ نخلّصها سوا؟`;
    case "due_soon":
      return `فاكر ${t}؟ ${when(r.at)} على الميعاد ⏰ يلا نخلّصها قبل ما تفوت.`;
    case "not_started":
      return `${t} لسه مابدأتش فيها… أول خطوة أسهل حاجة، يلا 💪`;
    case "warning":
      return `جالك إنذار جديد 😕 تعالى نشوفه سوا، ولو عندك ظرف تقدر تتظلّم.`;
    case "meeting_open":
      return `الاجتماع ${t} شغال دلوقتي! سجّل حضورك بالكود قبل ما يتقفل 📍`;
    case "meeting":
      return `عندك اجتماع ${t} ${r.at ? `${fmt.day(r.at) === fmt.day(new Date()) ? "النهارده" : fmt.day(r.at)} الساعة ${fmt.time(r.at)}` : ""}${r.place ? ` في ${r.place}` : ""} 📅 متنساش.`;
    case "review":
      return `فيه ${r.count && r.count > 1 ? `${r.count} تسليمات` : "تسليم"} في ${t} مستني مراجعتك 👀`;
    case "request":
      return `${r.name ?? "حد من السيكتور"} طالب ${r.request === "excuse" ? "عذر" : "مد ميعاد"} في ${t}. رد عليه 🙏`;
    case "appeal":
      return `فيه ${r.count && r.count > 1 ? `${r.count} تظلّمات` : "تظلّم"} مستني قرارك ⚖️`;
    case "unread":
      return `عندك ${r.count && r.count > 1 ? `${r.count} إشعارات` : "إشعار"} ماقريتهوش 🔔`;
    default:
      return r.title ?? "";
  }
}

const CHEERS = ["مفيش حاجة عليك دلوقتي 🎉 روق وخد كوباية شاي ☕", "كله تمام! أنا فخور بيك 💙", "خلّصت كل اللي عليك… إيه الحلاوة دي 😎", "ولا حاجة متأخرة! كمّل كده يا بطل 🚀"];

function greeting(first: string) {
  const h = new Date().getHours();
  return `${h < 12 ? "صباح الفل" : h < 18 ? "أهلًا" : "مساء الفل"} يا ${first}`;
}

/* ─── Snoozing and nudges (this device only) ───────────────────────────── */

const SNOOZE = "bx-baqloz-snooze";
const NUDGED = "bx-baqloz-nudged";
function readMap(key: string): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, number>;
  } catch {
    return {};
  }
}
function writeMap(key: string, map: Record<string, number>) {
  try {
    const now = Date.now();
    localStorage.setItem(key, JSON.stringify(Object.fromEntries(Object.entries(map).filter(([, v]) => v > now - 7 * 86_400_000))));
  } catch {
    /* private mode */
  }
}
const snoozed = (r: Reminder) => (readMap(SNOOZE)[keyOf(r)] ?? 0) > Date.now();

/* ─── The team's list ───────────────────────────────────────────────────── */

let cache: { at: number; list: Reminder[] } | null = null;

/** The team member's reminders (kept for a minute so moving between screens doesn't reload them). */
export function useStaffReminders() {
  const [list, setList] = useState<Reminder[] | null>(cache?.list ?? null);
  const load = useCallback(async (force = false) => {
    if (!force && cache && Date.now() - cache.at < 60_000) return setList(cache.list);
    try {
      const r = (await rpc<Reminder[]>("staff_reminders")) ?? [];
      cache = { at: Date.now(), list: r };
      setList(r);
    } catch {
      setList((v) => v ?? []);
    }
  }, []);
  useEffect(() => {
    void load();
    const t = setInterval(() => load(true), 5 * 60_000);
    return () => clearInterval(t);
  }, [load]);
  return { list, refresh: load };
}

/* ─── On the home screen ────────────────────────────────────────────────── */

/** Baqloz on the home screen: one thing at a time, with "take me there", "later" and "next". */
export function BaqlozCoach({ first, items }: { first: string; items: Reminder[] | null }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [i, setI] = useState(0);
  const list = useMemo(() => (items ?? []).filter((r) => !snoozed(r) && !hidden.has(keyOf(r))), [items, hidden]);
  if (!items) return null;
  const r = list[Math.min(i, Math.max(0, list.length - 1))];
  const later = () => {
    if (!r) return;
    const map = readMap(SNOOZE);
    map[keyOf(r)] = Date.now() + 3 * 3_600_000;
    writeMap(SNOOZE, map);
    setHidden(new Set([...hidden, keyOf(r)]));
  };
  const cheer = CHEERS[new Date().getDate() % CHEERS.length];
  return (
    <section className="mt-5 flex items-end gap-3" aria-label="بقلظ" data-testid="baqloz-coach">
      <img src={r ? POSTER : POSTER_WAVE} alt="" width={72} height={96} className="h-24 w-[4.5rem] shrink-0 object-contain object-bottom drop-shadow-[0_10px_20px_rgb(0_0_0/0.4)]" />
      <div className="relative min-w-0 flex-1 rounded-2xl border border-[var(--line-2)] bg-[rgb(9_22_54/0.94)] p-4 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.8)]">
        <span aria-hidden className="absolute -start-1.5 bottom-6 size-3 rotate-45 border-b border-s border-[var(--line-2)] bg-[rgb(9_22_54/0.94)]" />
        <p className="flex items-center justify-between text-xs font-bold text-cyan">
          <span>بقلظ</span>
          {list.length > 1 && (
            <span className="font-normal text-fog">
              {Math.min(i, list.length - 1) + 1} من {list.length}
            </span>
          )}
        </p>
        <p className="mt-1 text-[15px] leading-relaxed text-chalk" role="status" aria-live="polite" data-testid="baqloz-line">
          {r ? lineFor(r, first) : `${greeting(first)} 👋 ${cheer}`}
        </p>
        {r && (
          <div className="mt-3 flex flex-wrap gap-2">
            <Button size="sm" variant="primary" onClick={() => go(r.to)}>
              ودّيني ←
            </Button>
            <Button size="sm" variant="ghost" onClick={later}>
              فكّرني بعدين
            </Button>
            {list.length > 1 && (
              <Button size="sm" variant="ghost" onClick={() => setI((x) => (x + 1) % list.length)}>
                اللي بعده
              </Button>
            )}
          </div>
        )}
      </div>
    </section>
  );
}

/* ─── On every other team screen ────────────────────────────────────────── */

/** Baqloz in the corner: the count, the full list, and a pop-up when something urgent was forgotten. */
export function BaqlozBuddy({ first, path }: { first: string; path: string }) {
  const { list, refresh } = useStaffReminders();
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState<Reminder | null>(null);
  const items = (list ?? []).filter((r) => !snoozed(r));
  const urgent = items.filter((r) => URGENT.has(r.kind));

  // Each route change: refresh (cached for a minute) and maybe remind of one forgotten thing.
  useEffect(() => {
    void refresh();
  }, [path, refresh]);
  useEffect(() => {
    if (!urgent.length) return;
    const map = readMap(NUDGED);
    const due = urgent.find((r) => (map[keyOf(r)] ?? 0) < Date.now() - 4 * 3_600_000 && !path.startsWith(r.to.split("?")[0]));
    if (!due) return;
    const t = setTimeout(() => {
      setNudge(due);
      map[keyOf(due)] = Date.now();
      writeMap(NUDGED, map);
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [path, list]);

  if (!items.length && !nudge) return null;
  return (
    <>
      <div className="pointer-events-none fixed bottom-[calc(5.5rem+env(safe-area-inset-bottom))] start-3 z-40 flex items-end gap-2">
        <button
          type="button"
          onClick={() => (setNudge(null), setOpen(true))}
          className="pointer-events-auto relative size-14 shrink-0 overflow-hidden rounded-full border border-[var(--line-2)] bg-panel shadow-[0_12px_30px_-10px_rgb(0_0_0/0.8)] transition active:scale-95"
          aria-label={`بقلظ: عندك ${items.length} ${items.length === 1 ? "حاجة" : "حاجات"}`}
          data-testid="baqloz-buddy"
        >
          <img src={POSTER} alt="" className="size-full object-cover object-[50%_25%]" />
          <span className={cn("absolute -end-0.5 -top-0.5 min-w-5 rounded-full px-1 text-center font-mono text-[11px] font-bold leading-5 text-white", urgent.length ? "bg-danger" : "bg-volt")}>{items.length}</span>
        </button>
        {nudge && (
          <div className="pointer-events-auto mb-2 max-w-[17rem] rounded-2xl border border-[var(--line-2)] bg-[rgb(9_22_54/0.97)] p-3 shadow-[0_18px_40px_-20px_rgb(0_0_0/0.9)]" role="status" data-testid="baqloz-nudge">
            <p className="text-xs font-bold text-cyan">بقلظ</p>
            <p className="mt-1 text-sm leading-relaxed text-chalk">استنى! {lineFor(nudge, first)}</p>
            <div className="mt-2 flex gap-2">
              <Button size="sm" variant="primary" onClick={() => (setNudge(null), go(nudge.to))}>
                ودّيني ←
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setNudge(null)}>
                ماشي
              </Button>
            </div>
          </div>
        )}
      </div>
      <Sheet open={open} onClose={() => setOpen(false)} title="بقلظ بيفكّرك 💙">
        <div className="grid gap-2">
          {items.map((r) => (
            <button
              key={keyOf(r)}
              type="button"
              onClick={() => (setOpen(false), go(r.to))}
              className={cn("flex items-center gap-3 rounded-2xl border px-3 py-3 text-start transition hover:border-cyan/40", URGENT.has(r.kind) ? "border-danger/40 bg-danger/[0.06]" : "border-[var(--line)]")}
            >
              <span className="min-w-0 flex-1 text-sm leading-relaxed text-chalk">{lineFor(r, first)}</span>
              <span className="shrink-0 text-xs text-cyan">ودّيني ←</span>
            </button>
          ))}
        </div>
      </Sheet>
    </>
  );
}

/* ─── Students ──────────────────────────────────────────────────────────── */

type Quiz = { id: string; title: string; closesAt: string | null; state: "open" | "upcoming" | "closed" | "done"; inProgress: string | null };

/** The student's home: tasks not handed in, open quizzes, today's session. */
export function StudentBaqloz({ first, quizzes }: { first: string; quizzes: Quiz[] | undefined }) {
  const tasks = useStudentTasks();
  const schedule = useSchedule();
  const items = useMemo<Reminder[] | null>(() => {
    if (!tasks.data && !schedule.data && !quizzes) return null;
    const out: (Reminder & { rank: number })[] = [];
    for (const t of tasks.data ?? []) {
      if (t.submission) continue;
      const late = !!t.dueAt && new Date(t.dueAt).getTime() < Date.now();
      if (late && !t.allowLate) continue;
      const soon = !!t.dueAt && new Date(t.dueAt).getTime() < Date.now() + 2 * 86_400_000;
      out.push({
        kind: late ? "overdue" : "task",
        id: t.id,
        to: `/me/tasks/${t.id}`,
        rank: late ? 1 : soon ? 2 : 5,
        line: late
          ? `يا ${first}، تاسك «${t.title}» فات ميعاده 😬 لسه تقدر تسلّمه متأخر… تعالى أوديك.`
          : t.dueAt
            ? `متنساش تاسك «${t.title}» — ${when(t.dueAt)} على الميعاد ⏰`
            : `عندك تاسك «${t.title}» لسه ماسلّمتهوش 📤`,
      });
    }
    for (const q of quizzes ?? []) {
      if (q.state !== "open") continue;
      out.push({
        kind: "quiz",
        id: q.id,
        to: `/me/quiz/${q.id}`,
        rank: q.inProgress ? 1 : 3,
        line: q.inProgress ? `إنت سايب كويز «${q.title}» في النص! كمّله 🧠` : `كويز «${q.title}» مفتوح${q.closesAt ? ` (بيقفل ${when(q.closesAt).replace("فاضل", "بعد")})` : ""}. ورّيني شطارتك 🧠`,
      });
    }
    const next = (schedule.data ?? []).find((s) => {
      const t = new Date(s.startsAt).getTime();
      return t > Date.now() - 30 * 60_000 && t < Date.now() + 12 * 3_600_000;
    });
    if (next)
      out.push({
        kind: "session",
        id: next.id,
        to: "/me/schedule",
        rank: 2,
        line: `النهارده عندك «${next.title}» الساعة ${fmt.time(next.startsAt)}${next.location ? ` في ${next.location}` : ""} 📍 متتأخرش!`,
      });
    return out.sort((a, b) => a.rank - b.rank);
  }, [tasks.data, schedule.data, quizzes, first]);
  return <BaqlozCoach first={first} items={items} />;
}
