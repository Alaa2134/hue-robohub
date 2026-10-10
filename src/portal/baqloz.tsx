"use client";
/**
 * Baqloz (the site's mascot) inside the BuildX App. On the home screen he tells each person what's on
 * them right now — most urgent first — and takes them there with one tap. On the other team screens he
 * waits in the corner with the count, and if something was forgotten (a task past its deadline, a
 * meeting taking attendance now, a new warning, a task sent back) he pops up once in a while to remind
 * them. The team's list comes from staff_reminders (20261010100000_baqloz_reminders.sql); the
 * students' from their tasks, quizzes and schedule. The 2D stills are the site's mascot posters.
 */
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { BASE_PATH, SUPABASE_KEY, SUPABASE_URL, fmt, rpc, sb, studentRpcOffline, studentStore } from "./core";
import { useSchedule } from "./schedule";
import { useStudentTasks } from "./tasks";
import { Button, Input, Sheet, go, useAsync } from "./ui";

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

const URGENT = new Set(["overdue", "meeting_open", "warning", "redo", "loan_overdue"]);
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
    case "loan_overdue":
      return `${t} اللي استلفتها من المخزن كان ميعادها ${when(r.at)} 📦 رجّعها لأمين المخزن عشان غيرك محتاجها.`;
    case "loan_due":
      return `متنساش ترجّع ${t} للمخزن، ${when(r.at)} على الميعاد 📦`;
    case "store_request":
      return `فيه ${r.count && r.count > 1 ? `${r.count} طلبات استعارة` : "طلب استعارة"} من المخزن مستني ردك 📦`;
    case "low_stock":
      return r.count && r.count > 1 ? `${r.count} حاجات في المخزن قرّبت تخلص 📉 محتاجين نجيب تاني.` : `${t} قرّبت تخلص من المخزن 📉 محتاجين نجيب تاني.`;
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
export function BaqlozCoach({ first, items, who = "staff" }: { first: string; items: Reminder[] | null; who?: Who }) {
  const [hidden, setHidden] = useState<Set<string>>(new Set());
  const [chat, setChat] = useState(false);
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
          <SpeakButton text={r ? lineFor(r, first) : `${greeting(first)}. ${cheer}`} />
        </p>
        {!r && (
          <div className="mt-3">
            <Button size="sm" variant="ghost" onClick={() => setChat(true)}>
              اسأل بقلظ 💬
            </Button>
          </div>
        )}
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
            <Button size="sm" variant="ghost" onClick={() => setChat(true)}>
              اسأل بقلظ 💬
            </Button>
          </div>
        )}
      </div>
      {chat && <BaqlozChat who={who} first={first} items={items} onClose={() => setChat(false)} />}
    </section>
  );
}

/* ─── On every other team screen ────────────────────────────────────────── */

/** Baqloz in the corner: the count, the full list, and a pop-up when something urgent was forgotten. */
export function BaqlozBuddy({ first, path }: { first: string; path: string }) {
  const { list, refresh } = useStaffReminders();
  const [open, setOpen] = useState(false);
  const [nudge, setNudge] = useState<Reminder | null>(null);
  const [chat, setChat] = useState(false);
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
          <Button variant="ghost" onClick={() => (setOpen(false), setChat(true))}>
            اسأل بقلظ 💬
          </Button>
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
      {chat && <BaqlozChat who="staff" first={first} items={list} onClose={() => setChat(false)} />}
    </>
  );
}

/* ─── Students ──────────────────────────────────────────────────────────── */

type Quiz = { id: string; title: string; closesAt: string | null; state: "open" | "upcoming" | "closed" | "done"; inProgress: string | null };

/** The student's home: tasks not handed in, open quizzes, today's session. */
export function StudentBaqloz({ first, quizzes }: { first: string; quizzes: Quiz[] | undefined }) {
  const tasks = useStudentTasks();
  const schedule = useSchedule();
  const loans = useStudentLoans();
  const items = useMemo<Reminder[] | null>(() => {
    if (!tasks.data && !schedule.data && !quizzes) return null;
    const out: (Reminder & { rank: number })[] = [];
    for (const l of loans.data ?? []) {
      if (l.status !== "out" || !l.dueAt) continue;
      const ms = new Date(l.dueAt).getTime() - Date.now();
      if (ms > 2 * 86_400_000) continue;
      out.push({
        kind: ms < 0 ? "loan_overdue" : "loan_due",
        id: l.id,
        to: "/me",
        rank: ms < 0 ? 1 : 3,
        line: ms < 0 ? `«${l.item}» اللي استلفتها من المخزن ميعادها فات ${when(l.dueAt)} 📦 رجّعها في أقرب سيشن.` : `متنساش ترجّع «${l.item}» للمخزن، ${when(l.dueAt)} على الميعاد 📦`,
      });
    }
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
  }, [tasks.data, schedule.data, quizzes, first, loans.data]);
  return <BaqlozCoach first={first} items={items} who="student" />;
}

/** What this student borrowed from the team's store (20261011090500_inventory_functions.sql). */
export type StudentLoan = { id: string; item: string; unit: string; quantity: number; dueAt: string | null; status: "out" | "returned" | "lost" | "consumed"; lentAt: string; returnedAt: string | null };
export const useStudentLoans = () => useAsync(() => studentRpcOffline<StudentLoan[]>("student_inventory").catch(() => [] as StudentLoan[]), []);

/* ─── "Ask Baqloz": the chat ────────────────────────────────────────────── */

export type Who = "staff" | "student";
type Msg = { role: "user" | "bot"; text: string; to?: string; label?: string; local?: boolean };

/** Same letters whatever way they were typed (hamza, taa marbuta, diacritics). */
const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[ً-ْـ]/g, "")
    .replace(/[إأآ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .trim();

const SUGGEST: Record<Who, string[]> = {
  staff: ["ورايا إيه النهارده؟", "نقطي كام؟", "معايا إيه من المخزن؟", "إزاي أطلب مد ميعاد؟"],
  student: ["ورايا إيه؟", "إزاي أسلّم التاسك؟", "معايا إيه من المخزن؟", "نقطي فين؟"],
};

const has = (q: string, re: RegExp) => re.test(q);

/** What Baqloz answers on the phone itself (instant, free); null = ask the AI. */
async function localAnswer(question: string, who: Who, first: string, items: Reminder[] | null): Promise<Msg | null> {
  const q = norm(question);
  const list = (items ?? []).filter((r) => r.kind !== "unread");
  const bot = (text: string, to?: string, label = "ودّيني ←"): Msg => ({ role: "bot", text, to, label: to ? label : undefined, local: true });

  if (has(q, /(شكرا|تسلم|ميرسي|thank|حبيبي)/)) return bot(`العفو يا ${first} 💙 أنا موجود لو احتجت حاجة.`);
  if (has(q, /(انت مين|مين انت|اسمك|بتعمل ايه)/)) return bot("أنا بقلظ 🤖 بفكّرك باللي عليك وأوديك له، وأجاوبك عن تاسكاتك واجتماعاتك ونقطك والمخزن. اسألني!");
  if (has(q, /(ورايا|عليا|علي ايه|اعمل ايه|المطلوب|مهامي|ايه الجديد|فاتني|ناسي|نسيت)/) || q === "تاسكاتي") {
    if (!list.length) return bot(`مفيش حاجة عليك دلوقتي يا ${first} 🎉 كمّل كده.`);
    const lines = list.slice(0, 3).map((r) => `• ${lineFor(r, first)}`);
    return bot(`عليك ${list.length === 1 ? "حاجة واحدة" : list.length === 2 ? "حاجتين" : `${list.length} حاجات`}، أهمهم:\n${lines.join("\n")}`, list[0].to);
  }
  if (has(q, /(نقط|نقاط|ليفل|مستواي|مستوايا|مستوي|xp|ترتيبي|اوسمه|وسام|بادج)/)) {
    if (who === "student") return bot("نقطك وترتيبك وأوسمتك كلها في صفحة النقاط ⭐", "/me/points");
    const x = await rpc<{ xp: number; rank: number; month: number; level: { level: number; name: string; next: number | null } }>("staff_xp").catch(() => null);
    if (!x?.level) return bot("نقطك ومستواك في صفحة «نقطي ومستواي» ⭐", "/staff/xp");
    return bot(
      `انت ليفل ${x.level.level} (${x.level.name}) ومعاك ${x.xp} نقطة، ومركزك #${x.rank} في الفريق.${x.level.next ? ` فاضل ${x.level.next - x.xp} على الليفل الجاي` : " وصلت لأعلى ليفل 👑"}. أسرع طريقة: سلّم في الميعاد (+30) واحضر الاجتماعات (+15) 💪`,
      "/staff/xp",
    );
  }
  if (has(q, /(مخزن|استلف|استعار|سلفه|قطعه|قطع|اردوينو|عهده|ارجع|رجع)/)) {
    if (who === "student") {
      const loans = await studentRpcOffline<StudentLoan[]>("student_inventory").catch(() => [] as StudentLoan[]);
      const out = (loans ?? []).filter((l) => l.status === "out");
      if (!out.length) return bot("مفيش حاجة معاك من المخزن 👌 لو محتاج قطعة لمشروعك اطلبها من المدرب.");
      return bot(`معاك من المخزن:\n${out.map((l) => `• ${l.item} × ${l.quantity}${l.dueAt ? ` (ترجع ${fmt.day(l.dueAt)})` : ""}`).join("\n")}\nرجّعهم في ميعادهم للمدرب 🙏`);
    }
    const store = await rpc<{ loans: { staff_id: string | null; status: string; item_name: string; quantity: number; due_at: string | null }[] }>("staff_inventory").catch(() => null);
    const uid = (await sb().auth.getSession()).data.session?.user.id;
    const out = (store?.loans ?? []).filter((l) => l.staff_id === uid && l.status === "out");
    return bot(
      out.length
        ? `معاك من المخزن:\n${out.map((l) => `• ${l.item_name} × ${l.quantity}${l.due_at ? ` (ترجع ${fmt.day(l.due_at)})` : ""}`).join("\n")}`
        : "مفيش حاجة معاك من المخزن 👌 لو محتاج قطعة، افتح المخزن واضغط «اطلب استعارة» على اللي محتاجه.",
      "/staff/inventory",
      "افتح المخزن",
    );
  }
  if (who === "staff" && has(q, /(اجتماع|ميتنج|meeting)/)) {
    const m = list.filter((r) => r.kind === "meeting" || r.kind === "meeting_open");
    return m.length ? bot(m.map((r) => `• ${lineFor(r, first)}`).join("\n"), m[0].to) : bot("مفيش اجتماعات عليك في الـ 24 ساعة الجاية 📅", "/staff/meetings", "الاجتماعات");
  }
  if (who === "staff" && has(q, /(انذار|تظلم)/))
    return bot("الإنذارات بتظهر في «تاسكاتي». لو عندك ظرف، افتح الإنذار واضغط «تظلّم» واكتب السبب، والمؤسس بيرد عليك ⚖️", "/staff/mytasks");
  if (has(q, /(مد |مد الميعاد|اجل|تاجيل|عذر|مش هلحق|مش هقدر|وقت زياده)/))
    return who === "staff"
      ? bot("افتح التاسك من «تاسكاتي» واضغط «اطلب مد الميعاد» (أو «عذر») واكتب السبب. لو الهيد وافق، الميعاد الجديد بيبقى ميعادك ومفيش إنذار ⏰", "/staff/mytasks")
      : bot("كلّم المدرب بتاعك قبل الميعاد. ولو التاسك بيقبل التأخير هتقدر تسلّمه متأخر من صفحة التاسكات.", "/me/tasks");
  if (has(q, /(اسلم|تسليم|ارفع|ابعت التاسك|اسلمه)/))
    return who === "staff"
      ? bot("افتح التاسك من «تاسكاتي»، اكتب ملاحظة أو لينك وارفع الملفات، واضغط «سلّم» 📤", "/staff/mytasks")
      : bot("افتح التاسك من صفحة التاسكات، اكتب إجابتك أو لينك وارفع الصور/الملفات، واضغط تسليم 📤", "/me/tasks");
  if (has(q, /(حضور|اسجل|كود)/))
    return who === "staff"
      ? bot("لما الاجتماع يبدأ، افتحه من «الاجتماعات» واكتب الكود اللي الهيد بيعرضه، أو امسح الـ QR 📍", "/staff/meetings")
      : bot("سجّل حضورك من الرئيسية: امسح الـ QR اللي المدرب بيعرضه في السيشن 📍", "/me");
  if (has(q, /^(اهلا|هاي|هلو|السلام|ازيك|صباح|مساء|hi|hello)/)) return bot(`${greeting(first)} 👋 اسألني مثلاً: ورايا إيه؟`);
  return null;
}

const AI_OFF = "bx-baqloz-app-ai-off";
const PATH_RE = /\[\[(\/(?:staff|me)(?:\/[\w-]+)*)\]\]/;

/** The AI (Edge Function bakloz-app). It checks who's asking and their limits itself. */
async function aiAnswer(question: string, history: Msg[], who: Who): Promise<Msg | "busy" | null> {
  try {
    if (sessionStorage.getItem(AI_OFF)) return null;
  } catch {
    /* fine */
  }
  const token = who === "student" ? studentStore.get()?.token : undefined;
  const session = who === "staff" ? (await sb().auth.getSession()).data.session : null;
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), 16_000);
  try {
    const res = await fetch(`${SUPABASE_URL}/functions/v1/bakloz-app`, {
      method: "POST",
      signal: ctl.signal,
      headers: { "Content-Type": "application/json", apikey: SUPABASE_KEY, Authorization: `Bearer ${session?.access_token ?? SUPABASE_KEY}` },
      body: JSON.stringify({ question, token, history: history.slice(-6).map((m) => ({ role: m.role, text: m.text })) }),
    });
    const body = (await res.json().catch(() => ({}))) as { text?: string | null; disabled?: boolean; error?: string };
    if (body.disabled) {
      try {
        sessionStorage.setItem(AI_OFF, "1");
      } catch {
        /* fine */
      }
      return null;
    }
    if (res.status === 429) return "busy";
    if (!res.ok || typeof body.text !== "string" || !body.text.trim()) return null;
    const m = body.text.match(PATH_RE);
    return { role: "bot", text: body.text.replace(PATH_RE, "").trim(), to: m?.[1], label: m ? "ودّيني ←" : undefined };
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/** Reads a line out loud with the phone's own voice (Egyptian Arabic when it has one). */
export function speak(text: string) {
  const s = typeof window !== "undefined" ? window.speechSynthesis : undefined;
  if (!s) return;
  s.cancel();
  const u = new SpeechSynthesisUtterance(text.replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}\u{FE0F}«»•←]/gu, " "));
  u.lang = "ar-EG";
  const v = s.getVoices().find((x) => x.lang === "ar-EG") ?? s.getVoices().find((x) => x.lang.startsWith("ar"));
  if (v) u.voice = v;
  s.speak(u);
}

function SpeakButton({ text }: { text: string }) {
  const [ok, setOk] = useState(false);
  useEffect(() => setOk(typeof window !== "undefined" && "speechSynthesis" in window), []);
  if (!ok) return null;
  return (
    <button type="button" onClick={() => speak(text)} aria-label="اسمعها" className="ms-1.5 inline-flex align-middle text-fog transition hover:text-cyan">
      🔊
    </button>
  );
}

/** "Ask Baqloz": answers on the phone what it can, and asks the AI the rest. */
export function BaqlozChat({ who, first, items, onClose }: { who: Who; first: string; items: Reminder[] | null; onClose: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([{ role: "bot", text: `${greeting(first)} 👋 أنا بقلظ. اسألني عن اللي عليك، نقطك، الاجتماعات أو المخزن.`, local: true }]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const end = useRef<HTMLDivElement>(null);
  useEffect(() => end.current?.scrollIntoView?.({ block: "end" }), [msgs, busy]);

  const send = async (raw: string) => {
    const q = raw.trim().slice(0, 400);
    if (!q || busy) return;
    const history = msgs;
    setMsgs((m) => [...m, { role: "user", text: q }]);
    setText("");
    setBusy(true);
    try {
      const local = await localAnswer(q, who, first, items);
      const ans = local ?? (await aiAnswer(q, history, who));
      const reply: Msg =
        ans === "busy"
          ? { role: "bot", text: "سألتني كتير النهارده 😅 جرّب تاني بعد شوية، أو اسألني حاجة من دول:" }
          : (ans ?? { role: "bot", text: "مش متأكد إني فاهمك 🤔 جرّب تسألني حاجة زي:" });
      setMsgs((m) => [...m, reply]);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void send(text);
  };
  const last = msgs[msgs.length - 1];
  const showSuggest = msgs.length === 1 || (last.role === "bot" && /جرّب/.test(last.text));

  return (
    <Sheet open onClose={onClose} title="اسأل بقلظ 💬">
      <div className="grid gap-3" data-testid="baqloz-chat">
        <div className="grid max-h-[50vh] gap-2 overflow-y-auto pe-1">
          {msgs.map((m, i) => (
            <div key={i} className={cn("flex items-end gap-2", m.role === "user" && "flex-row-reverse")}>
              {m.role === "bot" && <img src={POSTER} alt="" className="size-8 shrink-0 rounded-full object-cover object-[50%_25%]" />}
              <div
                data-testid={m.role === "bot" ? "chat-bot" : "chat-me"}
                className={cn("max-w-[85%] whitespace-pre-line rounded-2xl px-3 py-2 text-sm leading-relaxed", m.role === "bot" ? "border border-[var(--line-2)] bg-[rgb(9_22_54/0.94)] text-chalk" : "bg-volt/25 text-chalk")}
              >
                {m.text}
                {m.role === "bot" && <SpeakButton text={m.text} />}
                {m.to && (
                  <div className="mt-2">
                    <Button size="sm" variant="primary" onClick={() => (onClose(), go(m.to!))}>
                      {m.label ?? "ودّيني ←"}
                    </Button>
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && <p className="animate-pulse text-xs text-fog">بقلظ بيفكّر…</p>}
          <div ref={end} />
        </div>
        {showSuggest && (
          <div className="flex flex-wrap gap-2">
            {SUGGEST[who].map((s) => (
              <button key={s} type="button" onClick={() => void send(s)} className="rounded-full border border-cyan/30 px-3 py-1.5 text-xs text-ice transition hover:bg-cyan/10">
                {s}
              </button>
            ))}
          </div>
        )}
        <form onSubmit={submit} className="flex gap-2">
          <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={400} placeholder="اكتب سؤالك…" aria-label="سؤالك لبقلظ" className="flex-1" />
          <Button type="submit" variant="primary" loading={busy} disabled={!text.trim()}>
            ابعت
          </Button>
        </form>
      </div>
    </Sheet>
  );
}
