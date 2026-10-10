"use client";
/**
 * Sectors and team tasks. The team is split into sectors, each with heads and members. A head gives
 * the members of their sector tasks with a deadline (they get a notification), members start and hand
 * them in, and the head approves, sends back or excuses. A task not handed in by its deadline gives the
 * member a warning automatically; heads can give one by hand. The owner (and anyone given the
 * "sectors" area) oversees every sector and can cancel a warning. Everything goes through the
 * staff_* functions in 20261009210000_sector_tasks.sql and the migrations after it.
 */
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { errorText, fmt, fromLocalInput, rpc, safeName, sb, toLocalInput, uid, uploadObject, type StaffRow } from "./core";
import { MeetingsScreen } from "./team-meetings";
import { Avatar, Badge, Button, Card, Chip, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, Section, Select, Sheet, Stat, Textarea, Toggle, TopBar, confirmDialog, go, toast, useAsync } from "./ui";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type Member = { staff_id: string; name: string; title: string | null; is_head: boolean; assigned?: number; on_time?: number; late?: number; missed?: number; open?: number; warnings?: number };
type Sector = { id: string; name: string; description: string; color: string; archived: boolean; is_head: boolean; leads: boolean; open_tasks: number; to_review: number; overdue: number; warnings: number; members: Member[] };
type SectorsData = { oversees: boolean; sectors: Sector[]; staff: { user_id: string; name: string; title: string | null }[] };
type State = "todo" | "doing" | "submitted" | "approved" | "redo";
type TaskFile = { path: string; name: string; size: number };
type Assignee = {
  staff_id: string;
  name: string;
  state: State;
  note: string | null;
  link: string | null;
  submitted_at: string | null;
  late: boolean;
  feedback: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  missed_at: string | null;
  excused: boolean;
  /** This member's own deadline after an approved extension. */
  due_at: string | null;
  checked: string[];
  files: TaskFile[];
};
type Priority = "low" | "normal" | "high" | "urgent";
type Repeat = "none" | "weekly" | "biweekly" | "monthly";
type CheckItem = { id: string; text: string };
type TaskRequest = { id: string; staff_id: string; name: string; kind: "extension" | "excuse"; reason: string; new_due: string | null; status: "pending" | "approved" | "rejected"; note: string | null; decided_by_name: string | null; created_at: string };
type TaskComment = { id: string; staff_id: string; name: string; body: string; created_at: string };
type Task = {
  id: string;
  sector_id: string;
  sector_name: string;
  sector_color: string;
  title: string;
  description: string;
  link: string | null;
  priority: Priority;
  due_at: string;
  warn_on_miss: boolean;
  status: "open" | "closed" | "cancelled";
  created_by_name: string | null;
  created_at: string;
  checklist: CheckItem[];
  repeat: Repeat;
  assignees: Assignee[];
  requests: TaskRequest[];
  comments: TaskComment[];
  leads?: boolean;
};
type Template = { id: string; sector_id: string | null; title: string; description: string; link: string | null; priority: Priority; checklist: CheckItem[]; days: number };
type Warning = {
  id: string;
  staff_id: string;
  name: string;
  sector_id: string | null;
  sector_name: string | null;
  task_id: string | null;
  task_title: string | null;
  kind: "missed" | "manual";
  reason: string;
  issued_by_name: string | null;
  created_at: string;
  seen_at: string | null;
  cancelled_at: string | null;
  cancelled_by_name: string | null;
  cancel_note: string | null;
  appeal: string | null;
  appeal_at: string | null;
  appeal_status: "pending" | "accepted" | "rejected" | null;
  appeal_note: string | null;
};
export type TeamSummary = {
  open: number;
  overdue: number;
  due_soon: number;
  warnings_unseen: number;
  warnings_active: number;
  sectors: number;
  heads: number;
  to_review: number;
  requests: number;
  appeals: number;
  unread: number;
  oversees: boolean;
};

type Tone = "ok" | "warn" | "danger" | "info" | "muted" | "volt";

export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  low: { label: "مش مستعجل", tone: "muted" },
  normal: { label: "عادي", tone: "info" },
  high: { label: "مهم", tone: "warn" },
  urgent: { label: "عاجل", tone: "danger" },
};
const REPEAT: Record<Repeat, string> = { none: "مرة واحدة", weekly: "كل أسبوع", biweekly: "كل أسبوعين", monthly: "كل شهر" };

const MESSAGES: Record<string, string> = {
  not_member: "فيه حد مختار مش عضو في السيكتور ده.",
  due_in_past: "آخر ميعاد لازم يكون بعد دلوقتي.",
  no_assignees: "اختار عضو واحد على الأقل.",
  "not yourself": "مينفعش تدي نفسك إنذار.",
  "not allowed": "ليست لديك صلاحية لهذا الإجراء.",
  pending: "عندك طلب لسه مستني رد.",
  bad_due: "الميعاد الجديد لازم يكون بعد الميعاد الحالي (وفي حدود شهرين).",
  not_yours: "التاسك ده مش مفتوح ليك.",
  "bad files": "الملفات دي مش مسموحة.",
};
const why = (e: unknown) => MESSAGES[(e as { message?: string })?.message ?? ""] ?? errorText(e);

const past = (d: string) => new Date(d).getTime() < Date.now();
/** A member's deadline: their own after an extension, or the task's. */
const dueOf = (t: Pick<Task, "due_at">, a?: Pick<Assignee, "due_at"> | null) => a?.due_at ?? t.due_at;

/** "فاضل يومين" / "فات من 3 ساعات". */
export function dueText(d: string) {
  const ms = new Date(d).getTime() - Date.now();
  const abs = Math.abs(ms);
  const h = Math.round(abs / 3_600_000);
  const days = Math.round(abs / 86_400_000);
  const span = abs < 3_600_000 ? `${Math.max(1, Math.round(abs / 60_000))} دقيقة` : h < 24 ? (h === 1 ? "ساعة" : h === 2 ? "ساعتين" : `${h} ساعات`) : days === 1 ? "يوم" : days === 2 ? "يومين" : `${days} أيام`;
  return ms >= 0 ? `فاضل ${span}` : `فات من ${span}`;
}

/** How one person stands on a task. */
export function assigneeState(a: Pick<Assignee, "state" | "late" | "excused" | "submitted_at" | "due_at">, due: string, status: Task["status"]): { label: string; tone: Tone } {
  if (status === "cancelled") return { label: "اتلغى", tone: "muted" };
  if (a.excused) return { label: "معفي", tone: "muted" };
  if (a.state === "approved") return { label: a.late ? "اتقبل (متأخر)" : "اتقبل ✓", tone: "ok" };
  if (a.state === "submitted") return { label: a.late ? "اتسلّم متأخر" : "اتسلّم", tone: "info" };
  if (a.state === "redo") return { label: "محتاج تعديل", tone: "warn" };
  if (past(a.due_at ?? due)) return { label: "فات الميعاد", tone: "danger" };
  return a.state === "doing" ? { label: "شغال عليه", tone: "volt" } : { label: "مطلوب", tone: "muted" };
}

export const teamSummary = () => rpc<TeamSummary>("staff_my_summary");

const openFile = async (f: TaskFile) => {
  const { data, error } = await sb().storage.from("team-tasks").createSignedUrl(f.path, 600, { download: f.name });
  if (error || !data) return toast(errorText(error), "error");
  window.open(data.signedUrl, "_blank", "noopener");
};

function FileList({ files }: { files: TaskFile[] }) {
  if (!files.length) return null;
  return (
    <div className="grid gap-1">
      {files.map((f) => (
        <button key={f.path} type="button" onClick={() => openFile(f)} className="flex items-center gap-2 text-start text-sm text-cyan">
          <Icon name="file" size={15} />
          <span className="truncate">{f.name}</span>
          <span className="shrink-0 text-xs text-fog">{fmt.size(f.size)}</span>
        </button>
      ))}
    </div>
  );
}

/** A task's conversation (members on it and its heads). */
function Comments({ task, onSent }: { task: Pick<Task, "id" | "comments">; onSent: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setBusy(true);
    try {
      await rpc("staff_task_comment", { p_task: task.id, p_body: text.trim() });
      setText("");
      onSent();
    } catch (e2) {
      toast(why(e2), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="grid gap-2">
      <p className="text-sm font-semibold text-chalk">💬 المناقشة {task.comments.length ? `(${task.comments.length})` : ""}</p>
      {task.comments.map((c) => (
        <div key={c.id} className="rounded-xl border border-[var(--line)] px-3 py-2">
          <p className="text-xs text-fog">
            {c.name} · {fmt.rel(c.created_at)}
          </p>
          <p className="mt-0.5 whitespace-pre-line text-sm text-mist">{c.body}</p>
        </div>
      ))}
      <form onSubmit={send} className="flex gap-2">
        <Input value={text} onChange={(e) => setText(e.target.value)} maxLength={1000} placeholder="اسأل أو وضّح…" aria-label="رسالة على التاسك" />
        <Button type="submit" icon="share" loading={busy} aria-label="ابعت">
          ابعت
        </Button>
      </form>
    </div>
  );
}

/* ─── Home ──────────────────────────────────────────────────────────────── */

/** Home: my open tasks, new warnings and (heads) hand-ins waiting for review. */
export function TeamTasksHome({ summary }: { summary: TeamSummary | null | undefined }) {
  if (!summary) return null;
  return (
    <>
      {!!summary.warnings_unseen && (
        <Card className="mt-4 flex items-center gap-3 border-danger/40 bg-danger/[0.08]" data-testid="home-warnings">
          <Icon name="alert" size={22} className="shrink-0 text-[#ff9aa5]" />
          <p className="flex-1 text-sm text-mist">{summary.warnings_unseen === 1 ? "جالك إنذار جديد." : `جالك ${summary.warnings_unseen} إنذارات جديدة.`}</p>
          <Button size="sm" onClick={() => go("/staff/mytasks")}>
            شوف
          </Button>
        </Card>
      )}
      {!!summary.open && (
        <button
          type="button"
          onClick={() => go("/staff/mytasks")}
          className={cn(
            "mt-4 flex w-full items-center gap-4 rounded-3xl border p-5 text-start transition active:scale-[0.99]",
            summary.overdue ? "border-danger/40 bg-danger/[0.06]" : "border-[var(--line-2)] bg-panel/70",
          )}
        >
          <span className={cn("flex size-12 shrink-0 items-center justify-center rounded-2xl", summary.overdue ? "bg-danger/15 text-[#ff9aa5]" : "bg-cyan/15 text-cyan")}>
            <Icon name="flag" size={24} />
          </span>
          <span className="min-w-0 flex-1">
            <span className="block font-semibold text-chalk">{summary.open === 1 ? "عليك تاسك" : `عليك ${summary.open} تاسكات`}</span>
            <span className="block text-xs text-fog">
              {summary.overdue ? `${summary.overdue} فات ميعادهم — سلّم بسرعة` : summary.due_soon ? `${summary.due_soon} فاضل عليهم أقل من يوم` : "من «تاسكاتي» تبدأ وتسلّم"}
            </span>
          </span>
          <Icon name="chevron" size={18} className="rotate-180 text-fog" />
        </button>
      )}
      {!!summary.to_review && (
        <Card className="mt-4 flex items-center gap-3 border-cyan/30 bg-cyan/[0.06]">
          <Icon name="check" size={22} className="shrink-0 text-cyan" />
          <p className="flex-1 text-sm text-mist">{summary.to_review === 1 ? "فيه تسليم مستني مراجعتك." : `فيه ${summary.to_review} تسليمات مستنية مراجعتك.`}</p>
          <Button size="sm" variant="primary" onClick={() => go("/staff/sectors")}>
            راجِع
          </Button>
        </Card>
      )}
      {!!summary.requests && (
        <Card className="mt-4 flex items-center gap-3 border-cyan/30 bg-cyan/[0.06]">
          <Icon name="clock" size={22} className="shrink-0 text-cyan" />
          <p className="flex-1 text-sm text-mist">{summary.requests === 1 ? "فيه طلب مد ميعاد أو عذر مستني ردك." : `فيه ${summary.requests} طلبات مد ميعاد أو عذر مستنية ردك.`}</p>
          <Button size="sm" onClick={() => go("/staff/sectors")}>
            افتح
          </Button>
        </Card>
      )}
      {!!summary.appeals && (
        <Card className="mt-4 flex items-center gap-3 border-warn/30 bg-warn/[0.06]">
          <Icon name="alert" size={22} className="shrink-0 text-warn" />
          <p className="flex-1 text-sm text-mist">{summary.appeals === 1 ? "فيه تظلّم من إنذار مستني قرارك." : `فيه ${summary.appeals} تظلّمات مستنية قرارك.`}</p>
          <Button size="sm" onClick={() => go("/staff/warnings")}>
            افتح
          </Button>
        </Card>
      )}
    </>
  );
}

/* ─── My tasks ──────────────────────────────────────────────────────────── */

const dayKey = (d: string) => new Date(d).toDateString();
function dayLabel(d: string) {
  if (past(d)) return "فات ميعادها";
  const t = new Date();
  const k = dayKey(d);
  if (k === t.toDateString()) return "النهارده";
  if (k === new Date(t.getTime() + 86_400_000).toDateString()) return "بكرة";
  return fmt.day(d);
}

/** /staff/mytasks — the tasks given to me (by day), and my warnings (with appeals). */
export function MyTasksScreen({ openId }: { openId?: string | null }) {
  const { data, error, loading, reload } = useAsync(async () => {
    const [tasks, warnings] = await Promise.all([rpc<Task[]>("staff_my_tasks"), rpc<Warning[]>("staff_warnings", { p_scope: "mine" })]);
    return { tasks: tasks ?? [], warnings: warnings ?? [] };
  }, []);
  const [tab, setTab] = useState<"open" | "sent" | "done">("open");
  const [open, setOpen] = useState<Task | null>(null);
  // Opened from Baqloz or a notification (#/staff/mytasks?t=<id>): straight to that task.
  const [opened, setOpened] = useState(false);
  useEffect(() => {
    if (!openId || opened || !data) return;
    setOpened(true);
    const t = data.tasks.find((x) => x.id === openId);
    if (t) setOpen(t);
  }, [openId, opened, data]);
  const [appeal, setAppeal] = useState<Warning | null>(null);
  const unseen = data?.warnings.filter((w) => !w.seen_at && !w.cancelled_at).length ?? 0;
  useEffect(() => {
    if (unseen) rpc("staff_warnings_seen").catch(() => undefined);
  }, [unseen]);

  const mine = (t: Task) => t.assignees[0];
  const groups = useMemo(() => {
    const list = data?.tasks ?? [];
    const isOpen = (t: Task) => t.status === "open" && ["todo", "doing", "redo"].includes(mine(t)?.state ?? "");
    const byDue = (a: Task, b: Task) => new Date(dueOf(a, mine(a))).getTime() - new Date(dueOf(b, mine(b))).getTime();
    return {
      open: list.filter(isOpen).sort(byDue),
      sent: list.filter((t) => t.status === "open" && mine(t)?.state === "submitted"),
      done: list.filter((t) => !isOpen(t) && !(t.status === "open" && mine(t)?.state === "submitted")).reverse(),
    };
  }, [data]);
  const active = data?.warnings.filter((w) => !w.cancelled_at) ?? [];
  const recentCancelled = data?.warnings.filter((w) => w.cancelled_at && w.appeal_status === "accepted").slice(0, 2) ?? [];

  const row = (t: Task) => {
    const a = mine(t);
    const s = assigneeState(a, t.due_at, t.status);
    const due = dueOf(t, a);
    const steps = t.checklist?.length ? `${a?.checked?.length ?? 0}/${t.checklist.length}` : null;
    return (
      <Row key={t.id} onClick={() => setOpen(t)}>
        <div className="flex items-center gap-3">
          <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.sector_color }} />
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-chalk">
              {t.repeat !== "none" && "🔁 "}
              {t.title}
            </p>
            <p className="truncate text-xs text-fog">
              {t.sector_name} · {fmt.time(due)}
              {t.status === "open" && ` · ${dueText(due)}`}
              {steps && ` · ${steps} خطوات`}
              {!!t.comments?.length && ` · 💬 ${t.comments.length}`}
            </p>
          </div>
          {(t.priority === "urgent" || t.priority === "high") && <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>}
          <Badge tone={s.tone}>{s.label}</Badge>
        </div>
      </Row>
    );
  };

  // The open tasks, day by day.
  const days = useMemo(() => {
    const out: { label: string; list: Task[] }[] = [];
    for (const t of groups.open) {
      const label = dayLabel(dueOf(t, mine(t)));
      const last = out[out.length - 1];
      if (last && last.label === label) last.list.push(t);
      else out.push({ label, list: [t] });
    }
    return out;
  }, [groups.open]);

  return (
    <>
      <TopBar title="تاسكاتي" sub="اللي الهيد بيديهولك، بمواعيدها" back="/staff/more" />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : (
        <>
          {!!active.length && (
            <Card className={cn("mb-4 grid gap-2", unseen ? "border-danger/40 bg-danger/[0.08]" : "border-warn/30 bg-warn/[0.05]")} data-testid="my-warnings">
              <p className="flex items-center gap-2 font-semibold text-chalk">
                <Icon name="alert" size={18} className="text-[#ff9aa5]" />
                {active.length === 1 ? "عندك إنذار" : `عندك ${active.length} إنذارات`}
              </p>
              {active.slice(0, 5).map((w) => (
                <div key={w.id} className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                  <p className="text-mist">{w.reason}</p>
                  <p className="mt-1 text-xs text-fog">
                    {fmt.dateTime(w.created_at)} · {w.kind === "missed" ? "تلقائي" : `من ${w.issued_by_name ?? "الهيد"}`}
                    {w.sector_name ? ` · ${w.sector_name}` : ""}
                  </p>
                  {w.appeal_status === "pending" ? (
                    <p className="mt-1 text-xs text-cyan">تظلّمك وصل وبيتراجع.</p>
                  ) : w.appeal_status === "rejected" ? (
                    <p className="mt-1 text-xs text-[#ffd08a]">التظلّم اترفض{w.appeal_note ? `: ${w.appeal_note}` : ""}</p>
                  ) : (
                    <button type="button" className="mt-1 text-xs text-cyan" onClick={() => setAppeal(w)}>
                      ليك حق تتظلّم ←
                    </button>
                  )}
                </div>
              ))}
            </Card>
          )}
          {recentCancelled.map((w) => (
            <Card key={w.id} className="mb-3 border-ok/30 bg-ok/[0.05] text-sm text-mist">
              ✅ اتقبل تظلّمك واتشال الإنذار{w.appeal_note ? `: ${w.appeal_note}` : ""}
            </Card>
          ))}
          <div className="mb-3 flex gap-2 overflow-x-auto">
            <Chip active={tab === "open"} onClick={() => setTab("open")} count={groups.open.length}>
              مطلوب
            </Chip>
            <Chip active={tab === "sent"} onClick={() => setTab("sent")} count={groups.sent.length}>
              مستني مراجعة
            </Chip>
            <Chip active={tab === "done"} onClick={() => setTab("done")} count={groups.done.length}>
              خلص
            </Chip>
          </div>
          {!groups[tab].length ? (
            <Empty
              icon="flag"
              title={tab === "open" ? "مفيش تاسكات عليك دلوقتي" : tab === "sent" ? "مفيش تسليمات مستنية" : "لسه مفيش تاسكات خلصت"}
              body={tab === "open" ? "لما الهيد يديك تاسك هيجيلك إشعار وهتلاقيه هنا." : undefined}
            />
          ) : tab === "open" ? (
            days.map((d) => (
              <Section key={d.label} title={d.label}>
                <List>{d.list.map(row)}</List>
              </Section>
            ))
          ) : (
            <List>{groups[tab].map(row)}</List>
          )}
        </>
      )}
      {open && (
        <MyTaskSheet
          initial={open}
          onClose={() => {
            setOpen(null);
            reload();
          }}
        />
      )}
      {appeal && <AppealSheet warning={appeal} onClose={() => setAppeal(null)} onDone={() => (setAppeal(null), reload())} />}
    </>
  );
}

function AppealSheet({ warning, onClose, onDone }: { warning: Warning; onClose: () => void; onDone: () => void }) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (text.trim().length < 5) return toast("اشرح ظرفك في جملة على الأقل", "error");
    setBusy(true);
    try {
      await rpc("staff_warning_appeal", { p_id: warning.id, p_text: text.trim() });
      toast("وصل تظلّمك للمؤسس");
      onDone();
    } catch (e) {
      toast(why(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="تظلّم من إنذار">
      <div className="grid gap-3">
        <Card className="text-sm text-mist">{warning.reason}</Card>
        <Field label="ظرفك أو اعتراضك" hint="بيوصل للمؤسس، ولو اتقبل الإنذار بيتشال. التظلّم مرة واحدة لكل إنذار.">
          <Textarea value={text} onChange={(e) => setText(e.target.value)} maxLength={600} className="min-h-28" />
        </Field>
        <Button variant="primary" loading={busy} onClick={send} block>
          ابعت التظلّم
        </Button>
      </div>
    </Sheet>
  );
}

const MAX_FILES = 5;
const MAX_BYTES = 20 * 1024 * 1024;

function MyTaskSheet({ initial, onClose }: { initial: Task; onClose: () => void }) {
  const fresh = useAsync(() => rpc<Task>("staff_task", { p_id: initial.id }), [initial.id]);
  const t = fresh.data ?? initial;
  const me = t.assignees[0];
  const due = dueOf(t, me);
  const s = assigneeState(me, t.due_at, t.status);
  const [note, setNote] = useState(me?.note ?? "");
  const [link, setLink] = useState(me?.link ?? "");
  const [busy, setBusy] = useState(false);
  const [upload, setUpload] = useState<number | null>(null);
  const [asking, setAsking] = useState<"extension" | "excuse" | null>(null);
  const live = t.status === "open" && !!me && me.state !== "approved";
  const pending = t.requests?.find((r) => r.status === "pending");
  const lastDecided = t.requests?.find((r) => r.status !== "pending");

  const act = async (fn: () => Promise<unknown>, ok?: string) => {
    setBusy(true);
    try {
      await fn();
      if (ok) toast(ok);
      fresh.reload();
    } catch (e) {
      toast(why(e), "error");
    } finally {
      setBusy(false);
    }
  };
  // Ticks show at once; the server keeps them.
  const [ticks, setTicks] = useState<string[] | null>(null);
  const checked = ticks ?? me?.checked ?? [];
  const check = (item: string, done: boolean) => {
    setTicks(done ? [...new Set([...checked, item])] : checked.filter((x) => x !== item));
    rpc("staff_task_check", { p_task: t.id, p_item: item, p_done: done }).catch((e) => (setTicks(null), toast(why(e), "error")));
  };
  const addFiles = async (list: FileList | null) => {
    if (!list?.length || !me) return;
    const files = [...list];
    if (me.files.length + files.length > MAX_FILES) return toast(`أقصى حاجة ${MAX_FILES} ملفات`, "error");
    if (files.some((f) => f.size > MAX_BYTES)) return toast("الملف أكبر من 20 ميجا", "error");
    try {
      const added: TaskFile[] = [];
      for (const [i, f] of files.entries()) {
        const path = `${t.id}/${me.staff_id}/${uid().slice(0, 8)}-${safeName(f.name)}`;
        await uploadObject(path, f, f.type, (p) => setUpload((i + p) / files.length), "team-tasks");
        added.push({ path, name: f.name, size: f.size });
      }
      await rpc("staff_task_attach", { p_task: t.id, p_files: [...me.files, ...added] });
      toast("اترفعت الملفات");
      fresh.reload();
    } catch (e) {
      toast(/mime|type/i.test((e as Error)?.message ?? "") ? "نوع الملف ده مش مسموح (صور، PDF، أوفيس، zip، فيديو mp4)" : why(e), "error");
    } finally {
      setUpload(null);
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim() && !link.trim() && !me?.files.length) return toast("اكتب اللي عملته أو حط لينك أو ارفع ملف", "error");
    if (link.trim() && !/^https:\/\/\S+$/i.test(link.trim())) return toast("اللينك لازم يبدأ بـ https://", "error");
    setBusy(true);
    try {
      const r = await rpc<{ ok: boolean; late?: boolean; error?: string }>("staff_task_submit", { p_task: t.id, p_note: note.trim() || (me?.files.length ? `${me.files.length} ملف` : ""), p_link: link.trim() });
      if (!r.ok) return toast(r.error === "closed" ? "التاسك ده اتقفل" : "مقدرناش نسلّمه", "error");
      toast(r.late ? "اتسلّم (متأخر)" : "اتسلّم ✓ الهيد هيراجعه");
      onClose();
    } catch (e2) {
      toast(why(e2), "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={t.title}>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge tone={s.tone}>{s.label}</Badge>
          <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>
          {t.repeat !== "none" && <Badge tone="muted">🔁 {REPEAT[t.repeat]}</Badge>}
          <span className="text-xs text-fog">
            {t.sector_name}
            {t.created_by_name ? ` · من ${t.created_by_name}` : ""}
          </span>
        </div>
        <Card className="grid gap-1">
          <p className="text-xs text-fog">آخر ميعاد {me?.due_at ? "(اتمد ليك)" : ""}</p>
          <p className="font-semibold text-chalk">
            {fmt.full(due)} · {fmt.time(due)}
          </p>
          {t.status === "open" && <p className={cn("text-sm", past(due) ? "text-[#ff9aa5]" : "text-mist")}>{dueText(due)}</p>}
          {t.warn_on_miss && live && !me?.submitted_at && <p className="text-xs text-fog">لو ماسلّمتش في الميعاد بيجيلك إنذار تلقائي.</p>}
        </Card>
        {t.description && <p className="whitespace-pre-line leading-relaxed text-mist">{t.description}</p>}
        {t.link && (
          <a href={t.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-cyan">
            <Icon name="link" size={16} />
            لينك التاسك
          </a>
        )}
        {!!t.checklist?.length && (
          <div className="grid gap-1.5">
            <p className="text-sm font-semibold text-chalk">
              الخطوات <span className="font-normal text-fog">({checked.length}/{t.checklist.length})</span>
            </p>
            {t.checklist.map((c) => (
              <label key={c.id} className="flex cursor-pointer items-center gap-3 rounded-xl border border-[var(--line)] px-3 py-2">
                <input type="checkbox" checked={checked.includes(c.id)} disabled={!live} onChange={(e) => check(c.id, e.target.checked)} className="size-4 accent-[#2f7bff]" />
                <span className={cn("text-sm", checked.includes(c.id) ? "text-fog line-through" : "text-chalk")}>{c.text}</span>
              </label>
            ))}
          </div>
        )}
        {me?.feedback && (
          <Card className={cn("text-sm", me.state === "redo" ? "border-warn/40 bg-warn/[0.06]" : "border-ok/30 bg-ok/[0.05]")}>
            <p className="text-xs text-fog">ملاحظة {me.reviewed_by_name ?? "الهيد"}</p>
            <p className="mt-1 text-mist">{me.feedback}</p>
          </Card>
        )}
        {pending && (
          <Card className="border-cyan/30 bg-cyan/[0.05] text-sm text-mist">
            طلبت {pending.kind === "extension" ? `مد الميعاد لـ ${fmt.dateTime(pending.new_due!)}` : "عذر"} · مستني رد الهيد
          </Card>
        )}
        {!pending && lastDecided && (
          <p className={cn("text-xs", lastDecided.status === "approved" ? "text-[#7cf0c6]" : "text-[#ffd08a]")}>
            طلب {lastDecided.kind === "extension" ? "المد" : "العذر"} {lastDecided.status === "approved" ? "اتوافق عليه" : "اترفض"}
            {lastDecided.note ? `: ${lastDecided.note}` : ""}
          </p>
        )}
        {me?.state === "todo" && t.status === "open" && (
          <Button icon="play" onClick={() => act(() => rpc("staff_task_start", { p_task: t.id }), "بالتوفيق 💪")} loading={busy}>
            بدأت فيه
          </Button>
        )}
        {live && !pending && (
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" variant="ghost" icon="clock" onClick={() => setAsking("extension")}>
              اطلب مد الميعاد
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setAsking("excuse")}>
              اطلب عذر
            </Button>
          </div>
        )}
        {live && (
          <form onSubmit={submit} className="grid gap-3 border-t border-[var(--line)] pt-3">
            <p className="font-semibold text-chalk">{me.state === "submitted" ? "عدّل التسليم" : me.state === "redo" ? "سلّم تاني بعد التعديل" : "سلّم التاسك"}</p>
            {past(due) && !me.submitted_at && <p className="text-xs text-[#ffd08a]">الميعاد فات، هيتسجّل إنه متأخر.</p>}
            <Field label="عملت إيه">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className="min-h-24" placeholder="اكتب باختصار اللي خلّصته" />
            </Field>
            <Field label="لينك (درايف، كانڤا، جيت هب…)" hint="اختياري لو كتبت فوق أو رفعت ملف.">
              <Input value={link} onChange={(e) => setLink(e.target.value)} dir="ltr" placeholder="https://" maxLength={300} />
            </Field>
            <div className="grid gap-2">
              <FileList files={me.files} />
              {me.files.length < MAX_FILES && (
                <label className={cn("flex cursor-pointer items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--line-2)] px-3 py-3 text-sm text-mist", upload != null && "opacity-60")}>
                  <Icon name="upload" size={16} />
                  {upload != null ? `بيترفع… ${Math.round(upload * 100)}%` : "ارفع ملفات (صور، PDF، أوفيس، zip) · لحد 5"}
                  <input type="file" multiple className="sr-only" disabled={upload != null} onChange={(e) => (addFiles(e.target.files), (e.target.value = ""))} aria-label="ارفع ملفات التسليم" />
                </label>
              )}
            </div>
            <Button type="submit" variant="primary" size="lg" icon="upload" loading={busy} disabled={upload != null} block>
              {me.state === "submitted" ? "حدّث التسليم" : "سلّم"}
            </Button>
          </form>
        )}
        {!live && !!me?.files.length && <FileList files={me.files} />}
        <div className="border-t border-[var(--line)] pt-3">
          <Comments task={t} onSent={fresh.reload} />
        </div>
      </div>
      {asking && me && <RequestSheet task={t} due={due} kind={asking} onClose={() => setAsking(null)} onDone={() => (setAsking(null), fresh.reload())} />}
    </Sheet>
  );
}

function RequestSheet({ task, due, kind, onClose, onDone }: { task: Task; due: string; kind: "extension" | "excuse"; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState("");
  const [when, setWhen] = useState(toLocalInput(new Date(Math.max(Date.now(), new Date(due).getTime()) + 2 * 86_400_000)));
  const [busy, setBusy] = useState(false);
  const send = async () => {
    if (reason.trim().length < 2) return toast("اكتب السبب", "error");
    const newDue = kind === "extension" ? fromLocalInput(when) : null;
    if (kind === "extension" && !newDue) return toast("حدد الميعاد اللي محتاجه", "error");
    setBusy(true);
    try {
      await rpc("staff_task_request", { p_task: task.id, p_kind: kind, p_reason: reason.trim(), p_new_due: newDue });
      toast("وصل طلبك للهيد");
      onDone();
    } catch (e) {
      toast(why(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={kind === "extension" ? "طلب مد الميعاد" : "طلب عذر من التاسك"}>
      <div className="grid gap-3">
        <Field label="السبب">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-20" placeholder={kind === "extension" ? "عندي امتحان يوم…" : "مش هقدر أعمله لأن…"} />
        </Field>
        {kind === "extension" && (
          <Field label="محتاج لحد إمتى؟" hint="لو الهيد وافق، ده بيبقى ميعادك ومفيش إنذار على الميعاد القديم.">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        )}
        <Button variant="primary" loading={busy} onClick={send} block>
          ابعت الطلب
        </Button>
      </div>
    </Sheet>
  );
}

/* ─── Sectors ───────────────────────────────────────────────────────────── */

const useSectors = () => useAsync(() => rpc<SectorsData>("staff_sectors"), []);

/** /staff/sectors — the sectors I'm in (all of them when I oversee). */
export function SectorsScreen() {
  const { data, error, loading, reload } = useSectors();
  const [editing, setEditing] = useState<Sector | "new" | null>(null);
  const live = data?.sectors.filter((s) => !s.archived) ?? [];
  const archived = data?.sectors.filter((s) => s.archived) ?? [];
  const sum = (k: "open_tasks" | "overdue" | "to_review" | "warnings") => live.reduce((n, s) => n + (s[k] ?? 0), 0);

  return (
    <>
      <TopBar
        title="السيكتورات"
        sub={data?.oversees ? "كل السيكتورات وتاسكاتها وإنذاراتها" : "السيكتورات اللي انت فيها"}
        back="/staff/more"
        actions={
          data?.oversees && (
            <Button size="sm" variant="primary" icon="plus" onClick={() => setEditing("new")}>
              سيكتور
            </Button>
          )
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !live.length && !archived.length ? (
        <Empty
          icon="users"
          title={data?.oversees ? "مفيش سيكتورات لسه" : "انت مش في أي سيكتور لسه"}
          body={data?.oversees ? "اعمل سيكتور لكل جزء من الفريق (الميديا، الروبوتكس، التنظيم…)، وحدد الهيد والأعضاء." : "المالك بيضيفك لسيكتور، وبعدها التاسكات اللي الهيد بيديهالك هتظهر في «تاسكاتي»."}
          action={
            data?.oversees ? (
              <Button variant="primary" icon="plus" onClick={() => setEditing("new")}>
                سيكتور جديد
              </Button>
            ) : (
              <Button onClick={() => go("/staff/mytasks")}>تاسكاتي</Button>
            )
          }
        />
      ) : (
        <>
          {data?.oversees && (
            <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
              <Stat label="تاسك مفتوح" value={sum("open_tasks")} icon="flag" />
              <Stat label="فات ميعادهم" value={sum("overdue")} icon="clock" tone={sum("overdue") ? "danger" : undefined} />
              <Stat label="مستني مراجعة" value={sum("to_review")} icon="check" tone={sum("to_review") ? "info" : undefined} />
              <Stat label="إنذار (90 يوم)" value={sum("warnings")} icon="alert" tone={sum("warnings") ? "warn" : undefined} />
            </div>
          )}
          <List>
            {[...live, ...archived].map((s) => (
              <Row key={s.id} onClick={() => go(`/staff/sectors/${s.id}`)}>
                <div className="flex items-center gap-3">
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl text-lg font-bold text-white" style={{ background: s.color }}>
                    {s.name.trim()[0]}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-chalk">
                      {s.name} {s.archived && <span className="text-xs font-normal text-fog">(مؤرشف)</span>}
                    </p>
                    <p className="truncate text-xs text-fog">
                      {s.members.length} عضو · {s.members.filter((m) => m.is_head).map((m) => m.name).join("، ") || "من غير هيد"}
                    </p>
                  </div>
                  {s.is_head && <Badge tone="volt">هيد</Badge>}
                  {s.leads && !!s.to_review && <Badge tone="info">{s.to_review} مراجعة</Badge>}
                  {s.leads && !!s.overdue && <Badge tone="danger">{s.overdue} متأخر</Badge>}
                </div>
              </Row>
            ))}
          </List>
          {data?.oversees && (
            <Button className="mt-4" icon="alert" block onClick={() => go("/staff/warnings")}>
              إنذارات الفريق كله
            </Button>
          )}
        </>
      )}
      {editing && data && (
        <SectorSheet
          sector={editing === "new" ? null : editing}
          staff={data.staff}
          onClose={() => setEditing(null)}
          onSaved={(id) => {
            setEditing(null);
            if (editing === "new") go(`/staff/sectors/${id}`);
            else reload();
          }}
        />
      )}
    </>
  );
}

const COLORS = ["#2f7bff", "#ff7a45", "#22c55e", "#a855f7", "#eab308", "#ec4899", "#14b8a6", "#ef4444"];

function SectorSheet({ sector, staff, onClose, onSaved }: { sector: Sector | null; staff: SectorsData["staff"]; onClose: () => void; onSaved: (id: string) => void }) {
  const [f, setF] = useState({ name: sector?.name ?? "", description: sector?.description ?? "", color: sector?.color ?? COLORS[0], archived: sector?.archived ?? false });
  const [members, setMembers] = useState<Record<string, boolean>>(() => Object.fromEntries((sector?.members ?? []).map((m) => [m.staff_id, m.is_head])));
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const toggle = (id: string) =>
    setMembers((m) => {
      const next = { ...m };
      if (id in next) delete next[id];
      else next[id] = false;
      return next;
    });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (f.name.trim().length < 2) return toast("اكتب اسم السيكتور", "error");
    setBusy(true);
    try {
      const id = await rpc<string>("staff_sector_save", { p_id: sector?.id ?? null, p_name: f.name.trim(), p_description: f.description.trim(), p_color: f.color, p_archived: f.archived });
      await rpc("staff_sector_members", { p_sector: id, p_members: Object.entries(members).map(([staff_id, is_head]) => ({ staff_id, is_head })) });
      toast("اتحفظ السيكتور");
      onSaved(id);
    } catch (e2) {
      toast(/duplicate key|23505/.test((e2 as { message?: string; code?: string })?.message ?? "") || (e2 as { code?: string })?.code === "23505" ? "فيه سيكتور بنفس الاسم" : why(e2), "error");
    } finally {
      setBusy(false);
    }
  };
  const shown = staff.filter((s) => !q.trim() || s.name.includes(q.trim()) || (s.title ?? "").includes(q.trim()));
  const count = Object.keys(members).length;
  const heads = Object.values(members).filter(Boolean).length;
  return (
    <Sheet open onClose={onClose} title={sector ? `تعديل ${sector.name}` : "سيكتور جديد"} wide>
      <form onSubmit={save} className="grid gap-3">
        <Field label="اسم السيكتور">
          <Input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} maxLength={60} placeholder="مثلاً: الميديا والتصميم" />
        </Field>
        <Field label="وصف (اختياري)">
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={500} className="min-h-16" />
        </Field>
        <Field label="اللون">
          <div className="flex flex-wrap gap-2">
            {COLORS.map((c) => (
              <button key={c} type="button" aria-label={c} onClick={() => setF({ ...f, color: c })} className={cn("size-9 rounded-full border-2", f.color === c ? "border-white" : "border-transparent")} style={{ background: c }} />
            ))}
          </div>
        </Field>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm font-semibold text-chalk">
            الأعضاء والهيد <span className="font-normal text-fog">({count} عضو · {heads} هيد)</span>
          </legend>
          <p className="text-xs text-fog">علّم ✓ على أعضاء السيكتور، وفعّل «هيد» للي هيدي التاسكات ويتابع.</p>
          {staff.length > 8 && <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="دوّر بالاسم أو المنصب" />}
          {shown.map((s) => {
            const inIt = s.user_id in members;
            return (
              <div key={s.user_id} className={cn("flex items-center gap-3 rounded-xl border px-3 py-2", inIt ? "border-cyan/40 bg-cyan/[0.04]" : "border-[var(--line)]")}>
                <label className="flex min-w-0 flex-1 cursor-pointer items-center gap-3">
                  <input type="checkbox" checked={inIt} onChange={() => toggle(s.user_id)} className="size-4 accent-[#2f7bff]" aria-label={`عضو: ${s.name}`} />
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-chalk">{s.name}</span>
                    {s.title && <span className="block truncate text-xs text-fog">{s.title}</span>}
                  </span>
                </label>
                {inIt && (
                  <label className="flex shrink-0 cursor-pointer items-center gap-1.5 text-xs text-mist">
                    <input type="checkbox" checked={members[s.user_id]} onChange={(e) => setMembers({ ...members, [s.user_id]: e.target.checked })} className="size-4 accent-[#2f7bff]" aria-label={`هيد: ${s.name}`} />
                    هيد
                  </label>
                )}
              </div>
            );
          })}
        </fieldset>
        {sector && <Toggle checked={f.archived} onChange={(v) => setF({ ...f, archived: v })} label="أرشفة السيكتور" hint="بيختفي من عند الأعضاء، وتاسكاته وإنذاراته بتفضل في السجل." />}
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          حفظ
        </Button>
      </form>
    </Sheet>
  );
}

/** /staff/sectors/<id> — a sector's tasks, members and warnings. */
export function SectorScreen({ id, me, query }: { id: string; me: StaffRow; query?: URLSearchParams }) {
  const all = useSectors();
  const sector = all.data?.sectors.find((s) => s.id === id);
  const leads = !!sector?.leads;
  const extra = useAsync(async () => {
    if (!leads) return null;
    const [tasks, warnings] = await Promise.all([rpc<Task[]>("staff_sector_tasks", { p_sector: id }), rpc<Warning[]>("staff_warnings", { p_scope: "sector", p_sector: id })]);
    return { tasks: tasks ?? [], warnings: warnings ?? [] };
  }, [id, leads]);
  // A decision from a meeting's minutes arrives as ?task=<text>.
  const fromMeeting = query?.get("task") ?? null;
  const [tab, setTab] = useState<"tasks" | "meetings" | "members" | "warnings">("tasks");
  const [view, setView] = useState<"list" | "board">("list");
  const [newTask, setNewTask] = useState<boolean>(!!fromMeeting);
  const [editSector, setEditSector] = useState(false);
  const [warn, setWarn] = useState<Member | null>(null);
  const reload = () => (all.reload(), extra.reload());

  if (all.loading && !all.data) return <Loading />;
  if (all.error) return <ErrorBox error={all.error} retry={all.reload} />;
  if (!sector)
    return (
      <>
        <TopBar title="السيكتور" back="/staff/sectors" />
        <Empty icon="users" title="السيكتور ده مش موجود أو مش من سيكتوراتك" />
      </>
    );

  const tasks = extra.data?.tasks ?? [];
  const warnings = extra.data?.warnings ?? [];
  const requests = tasks.flatMap((t) => (t.requests ?? []).filter((r) => r.status === "pending").map((r) => ({ ...r, task: t })));
  return (
    <>
      <TopBar
        title={sector.name}
        sub={sector.description || `${sector.members.length} عضو`}
        back="/staff/sectors"
        actions={
          <div className="flex gap-2">
            {all.data?.oversees && (
              <Button size="sm" icon="edit" onClick={() => setEditSector(true)}>
                تعديل
              </Button>
            )}
            {leads && !sector.archived && (
              <Button size="sm" variant="primary" icon="plus" onClick={() => setNewTask(true)}>
                تاسك
              </Button>
            )}
          </div>
        }
      />
      {!leads ? (
        <>
          <Card className="mb-4 flex items-center gap-3">
            <Icon name="flag" size={20} className="text-cyan" />
            <p className="flex-1 text-sm text-mist">التاسكات اللي بتجيلك من السيكتور ده في «تاسكاتي».</p>
            <Button size="sm" onClick={() => go("/staff/mytasks")}>
              تاسكاتي
            </Button>
          </Card>
          <div className="mb-3 flex gap-2">
            <Chip active={tab !== "meetings"} onClick={() => setTab("tasks")}>
              الأعضاء
            </Chip>
            <Chip active={tab === "meetings"} onClick={() => setTab("meetings")}>
              الاجتماعات
            </Chip>
          </div>
          {tab === "meetings" ? <MeetingsScreen sectorId={sector.id} embedded /> : <MembersList sector={sector} />}
        </>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="تاسك مفتوح" value={sector.open_tasks} icon="flag" />
            <Stat label="فات ميعادهم" value={sector.overdue} icon="clock" tone={sector.overdue ? "danger" : undefined} />
            <Stat label="مستني مراجعة" value={sector.to_review} icon="check" tone={sector.to_review ? "info" : undefined} />
            <Stat label="إنذار ساري" value={sector.warnings} icon="alert" tone={sector.warnings ? "warn" : undefined} />
          </div>
          {!!requests.length && (
            <Card className="mb-4 grid gap-2 border-cyan/30 bg-cyan/[0.05]">
              <p className="font-semibold text-chalk">طلبات مستنية ردك</p>
              {requests.map((r) => (
                <button key={r.id} type="button" onClick={() => go(`/staff/sectors/${id}/${r.task.id}`)} className="flex items-center justify-between gap-2 text-start text-sm text-mist">
                  <span className="min-w-0 truncate">
                    {r.name} · {r.kind === "extension" ? "مد ميعاد" : "عذر"} · {r.task.title}
                  </span>
                  <Icon name="chevron" size={16} className="rotate-180 text-fog" />
                </button>
              ))}
            </Card>
          )}
          <div className="mb-3 flex gap-2 overflow-x-auto">
            <Chip active={tab === "tasks"} onClick={() => setTab("tasks")} count={tasks.filter((t) => t.status === "open").length}>
              التاسكات
            </Chip>
            <Chip active={tab === "meetings"} onClick={() => setTab("meetings")}>
              الاجتماعات
            </Chip>
            <Chip active={tab === "members"} onClick={() => setTab("members")} count={sector.members.length}>
              الأعضاء
            </Chip>
            <Chip active={tab === "warnings"} onClick={() => setTab("warnings")} count={warnings.filter((w) => !w.cancelled_at).length}>
              الإنذارات
            </Chip>
          </div>
          {tab === "meetings" ? (
            <MeetingsScreen sectorId={sector.id} embedded canCreate={!sector.archived} />
          ) : extra.loading && !extra.data ? (
            <Loading />
          ) : extra.error ? (
            <ErrorBox error={extra.error} retry={extra.reload} />
          ) : tab === "tasks" ? (
            !tasks.length ? (
              <Empty
                icon="flag"
                title="مفيش تاسكات لسه"
                body="ادي الأعضاء تاسك بميعاد: هيجيلهم إشعار، ولو ماسلّموش في الميعاد بياخدوا إنذار تلقائي."
                action={
                  <Button variant="primary" icon="plus" onClick={() => setNewTask(true)}>
                    تاسك جديد
                  </Button>
                }
              />
            ) : (
              <>
                <div className="mb-3 flex justify-end gap-2">
                  <Chip active={view === "list"} onClick={() => setView("list")}>
                    قائمة
                  </Chip>
                  <Chip active={view === "board"} onClick={() => setView("board")}>
                    لوحة
                  </Chip>
                </div>
                {view === "list" ? <TaskList tasks={tasks} /> : <TaskBoard tasks={tasks} />}
              </>
            )
          ) : tab === "members" ? (
            <MembersList sector={sector} onWarn={(m) => setWarn(m)} me={me} />
          ) : (
            <WarningsList warnings={warnings} canCancel={!!all.data?.oversees} onChanged={reload} />
          )}
        </>
      )}
      {newTask && leads && (
        <TaskSheet
          sector={sector}
          task={null}
          prefill={fromMeeting ? { title: fromMeeting.slice(0, 140), description: `من قرارات الاجتماع: ${fromMeeting}` } : undefined}
          onClose={() => setNewTask(false)}
          onSaved={(tid) => {
            setNewTask(false);
            go(`/staff/sectors/${id}/${tid}`);
          }}
        />
      )}
      {editSector && all.data && (
        <SectorSheet
          sector={sector}
          staff={all.data.staff}
          onClose={() => setEditSector(false)}
          onSaved={() => {
            setEditSector(false);
            reload();
          }}
        />
      )}
      {warn && <WarnSheet member={warn} sectorId={sector.id} onClose={() => setWarn(null)} onDone={() => (setWarn(null), reload())} />}
    </>
  );
}

/** The sector's tasks in three columns: in progress, waiting for review, done. */
function TaskBoard({ tasks }: { tasks: Task[] }) {
  const cols: { title: string; tone: Tone; list: Task[] }[] = [
    { title: "شغالين", tone: "volt", list: tasks.filter((t) => t.status === "open" && !t.assignees.some((a) => a.state === "submitted")) },
    { title: "مستني مراجعة", tone: "info", list: tasks.filter((t) => t.status === "open" && t.assignees.some((a) => a.state === "submitted")) },
    { title: "خلصت", tone: "ok", list: tasks.filter((t) => t.status === "closed") },
  ];
  return (
    <div className="grid gap-3 md:grid-cols-3" data-testid="task-board">
      {cols.map((c) => (
        <div key={c.title} className="grid content-start gap-2 rounded-2xl border border-[var(--line)] bg-panel/40 p-2">
          <p className="flex items-center justify-between px-1 text-sm font-semibold text-chalk">
            {c.title} <Badge tone={c.tone}>{c.list.length}</Badge>
          </p>
          {c.list.map((t) => {
            const live = t.assignees.filter((a) => !a.excused);
            const done = live.filter((a) => a.submitted_at || a.state === "approved").length;
            return (
              <button key={t.id} type="button" onClick={() => go(`/staff/sectors/${t.sector_id}/${t.id}`)} className="grid gap-1 rounded-xl border border-[var(--line)] bg-panel/80 p-3 text-start transition hover:border-cyan/40">
                <span className="text-sm font-semibold text-chalk">{t.title}</span>
                <span className="text-xs text-fog">
                  {fmt.short(t.due_at)} · {done}/{live.length}
                </span>
                <span className="h-1 overflow-hidden rounded-full bg-white/5">
                  <span className="block h-full rounded-full bg-cyan" style={{ width: `${live.length ? (done / live.length) * 100 : 0}%` }} />
                </span>
              </button>
            );
          })}
        </div>
      ))}
    </div>
  );
}

function TaskList({ tasks }: { tasks: Task[] }) {
  return (
    <List>
      {tasks.map((t) => {
        const live = t.assignees.filter((a) => !a.excused);
        const done = live.filter((a) => a.submitted_at || a.state === "approved").length;
        const review = live.filter((a) => a.state === "submitted").length;
        const late = t.status === "open" ? live.filter((a) => !a.submitted_at && a.state !== "approved" && past(t.due_at)).length : 0;
        return (
          <Row key={t.id} onClick={() => go(`/staff/sectors/${t.sector_id}/${t.id}`)}>
            <div className="flex items-center gap-3">
              <div className="min-w-0 flex-1">
                <p className={cn("truncate font-semibold", t.status === "cancelled" ? "text-fog line-through" : "text-chalk")}>{t.title}</p>
                <p className="truncate text-xs text-fog">
                  {fmt.dateTime(t.due_at)}
                  {t.status === "open" ? ` · ${dueText(t.due_at)}` : t.status === "closed" ? " · خلص" : " · اتلغى"} · سلّم {done}/{live.length}
                </p>
              </div>
              {(t.priority === "urgent" || t.priority === "high") && t.status === "open" && <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge>}
              {!!review && <Badge tone="info">{review} مراجعة</Badge>}
              {!!late && <Badge tone="danger">{late} متأخر</Badge>}
            </div>
          </Row>
        );
      })}
    </List>
  );
}

function MembersList({ sector, onWarn, me }: { sector: Sector; onWarn?: (m: Member) => void; me?: StaffRow }) {
  if (!sector.members.length) return <Empty icon="users" title="مفيش أعضاء في السيكتور ده" />;
  return (
    <List>
      {sector.members.map((m) => {
        const stats = m.assigned != null;
        const rate = stats && m.assigned ? Math.round(((m.on_time ?? 0) / m.assigned) * 100) : null;
        return (
          <Row key={m.staff_id} chevron={false}>
            <div className="flex items-center gap-3">
              <Avatar name={m.name} />
              <div className="min-w-0 flex-1">
                <p className="truncate font-semibold text-chalk">
                  {m.name} {m.is_head && <Badge tone="volt">هيد</Badge>}
                </p>
                {stats ? (
                  <p className="truncate text-xs text-fog">
                    {m.assigned} تاسك · {m.on_time} في الميعاد · {m.late} متأخر · {m.missed} فاتوا
                    {rate != null && ` · ${rate}% التزام`}
                  </p>
                ) : (
                  m.title && <p className="truncate text-xs text-fog">{m.title}</p>
                )}
              </div>
              {!!m.warnings && <Badge tone={m.warnings >= 3 ? "danger" : "warn"}>{m.warnings} إنذار</Badge>}
              {onWarn && me && m.staff_id !== me.user_id && (
                <Button size="sm" variant="ghost" icon="alert" onClick={() => onWarn(m)} aria-label={`إنذار لـ ${m.name}`}>
                  إنذار
                </Button>
              )}
            </div>
          </Row>
        );
      })}
    </List>
  );
}

function WarnSheet({ member, sectorId, taskId, taskTitle, onClose, onDone }: { member: { staff_id: string; name: string }; sectorId: string; taskId?: string; taskTitle?: string; onClose: () => void; onDone: () => void }) {
  const [reason, setReason] = useState(taskTitle ? `مسلّمش تاسك «${taskTitle}» زي المطلوب.` : "");
  const [busy, setBusy] = useState(false);
  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (reason.trim().length < 2) return toast("اكتب سبب الإنذار", "error");
    setBusy(true);
    try {
      await rpc("staff_warning_give", { p_staff: member.staff_id, p_reason: reason.trim(), p_sector: sectorId, p_task: taskId ?? null });
      toast(`اتبعت إنذار لـ ${member.name}`);
      onDone();
    } catch (e2) {
      toast(why(e2), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`إنذار لـ ${member.name}`}>
      <form onSubmit={save} className="grid gap-3">
        <Field label="السبب" hint="بيوصله إشعار بيه، وبيظهر للمؤسس. 3 إنذارات في 90 يوم بتنبّه المؤسس.">
          <Textarea value={reason} onChange={(e) => setReason(e.target.value)} maxLength={500} className="min-h-24" />
        </Field>
        <Button type="submit" variant="danger" size="lg" icon="alert" block loading={busy}>
          ابعت الإنذار
        </Button>
      </form>
    </Sheet>
  );
}

function WarningsList({ warnings, canCancel, onChanged, showSector }: { warnings: Warning[]; canCancel: boolean; onChanged: () => void; showSector?: boolean }) {
  const [cancel, setCancel] = useState<Warning | null>(null);
  const [appeal, setAppeal] = useState<{ w: Warning; accept: boolean } | null>(null);
  if (!warnings.length) return <Empty icon="check" title="مفيش إنذارات" body="كله ماشي في ميعاده 👏" />;
  return (
    <>
      <List>
        {warnings.map((w) => (
          <Row key={w.id} chevron={false}>
            <div className={cn("flex items-start gap-3", w.cancelled_at && "opacity-60")}>
              <Icon name="alert" size={18} className={cn("mt-0.5 shrink-0", w.cancelled_at ? "text-fog" : "text-[#ff9aa5]")} />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-chalk">
                  {w.name} {w.cancelled_at ? <Badge tone="muted">اتلغى</Badge> : <Badge tone={w.kind === "missed" ? "danger" : "warn"}>{w.kind === "missed" ? "تلقائي" : "يدوي"}</Badge>}
                </p>
                <p className="mt-0.5 text-sm text-mist">{w.reason}</p>
                <p className="mt-0.5 text-xs text-fog">
                  {fmt.dateTime(w.created_at)}
                  {w.issued_by_name ? ` · من ${w.issued_by_name}` : ""}
                  {showSector && w.sector_name ? ` · ${w.sector_name}` : ""}
                  {w.cancelled_at ? ` · لغاه ${w.cancelled_by_name ?? ""}${w.cancel_note ? `: ${w.cancel_note}` : ""}` : ""}
                </p>
                {w.appeal && (
                  <div className={cn("mt-2 rounded-xl border px-3 py-2 text-sm", w.appeal_status === "pending" ? "border-cyan/40 bg-cyan/[0.05]" : "border-[var(--line)]")}>
                    <p className="text-xs text-fog">
                      تظلّم · {w.appeal_status === "pending" ? "مستني قرار" : w.appeal_status === "accepted" ? "اتقبل" : "اترفض"}
                    </p>
                    <p className="mt-0.5 text-mist">{w.appeal}</p>
                    {canCancel && w.appeal_status === "pending" && (
                      <div className="mt-2 flex gap-2">
                        <Button size="sm" variant="primary" icon="check" onClick={() => setAppeal({ w, accept: true })}>
                          اقبل التظلّم
                        </Button>
                        <Button size="sm" onClick={() => setAppeal({ w, accept: false })}>
                          ارفض
                        </Button>
                      </div>
                    )}
                  </div>
                )}
              </div>
              {canCancel && !w.cancelled_at && w.appeal_status !== "pending" && (
                <Button size="sm" variant="ghost" onClick={() => setCancel(w)}>
                  إلغاء
                </Button>
              )}
            </div>
          </Row>
        ))}
      </List>
      {appeal && (
        <AppealDecide
          warning={appeal.w}
          accept={appeal.accept}
          onClose={() => setAppeal(null)}
          onDone={() => {
            setAppeal(null);
            onChanged();
          }}
        />
      )}
      {cancel && (
        <CancelWarning
          warning={cancel}
          onClose={() => setCancel(null)}
          onDone={() => {
            setCancel(null);
            onChanged();
          }}
        />
      )}
    </>
  );
}

function AppealDecide({ warning, accept, onClose, onDone }: { warning: Warning; accept: boolean; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await rpc("staff_warning_appeal_decide", { p_id: warning.id, p_accept: accept, p_note: note.trim() });
      toast(accept ? "اتقبل التظلّم واتشال الإنذار" : "اترفض التظلّم");
      onDone();
    } catch (e) {
      toast(why(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`${accept ? "قبول" : "رفض"} تظلّم ${warning.name}`}>
      <div className="grid gap-3">
        <p className="text-sm text-mist">{warning.appeal}</p>
        <Field label="ردك (بيوصله)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        <Button variant={accept ? "primary" : "danger"} loading={busy} onClick={save} block>
          {accept ? "اقبل واشيل الإنذار" : "ارفض التظلّم"}
        </Button>
      </div>
    </Sheet>
  );
}

function CancelWarning({ warning, onClose, onDone }: { warning: Warning; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const go2 = async () => {
    setBusy(true);
    try {
      await rpc("staff_warning_cancel", { p_id: warning.id, p_note: note.trim() });
      toast("اتلغى الإنذار");
      onDone();
    } catch (e) {
      toast(why(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`إلغاء إنذار ${warning.name}`}>
      <div className="grid gap-3">
        <p className="text-sm text-mist">{warning.reason}</p>
        <Field label="ليه؟ (بيوصله)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} placeholder="مثلاً: كان عنده ظرف وبلّغ" />
        </Field>
        <Button variant="primary" onClick={go2} loading={busy} block>
          إلغاء الإنذار
        </Button>
      </div>
    </Sheet>
  );
}

/* ─── A task (heads) ────────────────────────────────────────────────────── */

function TaskSheet({
  sector,
  task,
  prefill,
  onClose,
  onSaved,
}: {
  sector: Pick<Sector, "id" | "name" | "members">;
  task: Task | null;
  prefill?: { title: string; description: string };
  onClose: () => void;
  onSaved: (id: string) => void;
}) {
  const inSector = sector.members;
  const [f, setF] = useState({
    title: task?.title ?? prefill?.title ?? "",
    description: task?.description ?? prefill?.description ?? "",
    link: task?.link ?? "",
    priority: (task?.priority ?? "normal") as Priority,
    due: toLocalInput(task?.due_at ?? new Date(Date.now() + 3 * 86_400_000)),
    warn: task?.warn_on_miss ?? true,
    repeat: (task?.repeat ?? "none") as Repeat,
  });
  const [steps, setSteps] = useState<CheckItem[]>(task?.checklist ?? []);
  const [step, setStep] = useState("");
  const [asTemplate, setAsTemplate] = useState(false);
  const [who, setWho] = useState<string[]>(task ? task.assignees.filter((a) => !a.excused).map((a) => a.staff_id) : []);
  const [busy, setBusy] = useState(false);
  const templates = useAsync(() => (task ? Promise.resolve([] as Template[]) : rpc<Template[]>("staff_task_templates", { p_sector: sector.id })), [sector.id, !!task]);
  const all = inSector.length > 0 && inSector.every((m) => who.includes(m.staff_id));

  const applyTemplate = (id: string) => {
    const x = templates.data?.find((t) => t.id === id);
    if (!x) return;
    setF((v) => ({ ...v, title: x.title, description: x.description, link: x.link ?? "", priority: x.priority, due: toLocalInput(new Date(Date.now() + Math.max(x.days, 0) * 86_400_000 + 3_600_000)) }));
    setSteps(x.checklist ?? []);
  };
  const addStep = () => {
    if (!step.trim() || steps.length >= 20) return;
    setSteps([...steps, { id: uid().slice(0, 8), text: step.trim().slice(0, 200) }]);
    setStep("");
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (f.title.trim().length < 2) return toast("اكتب عنوان التاسك", "error");
    if (!who.length) return toast("اختار عضو واحد على الأقل", "error");
    const due = fromLocalInput(f.due);
    if (!due) return toast("حدد آخر ميعاد", "error");
    if (!task && new Date(due).getTime() < Date.now()) return toast("آخر ميعاد لازم يكون بعد دلوقتي", "error");
    if (f.link.trim() && !/^https:\/\/\S+$/i.test(f.link.trim())) return toast("اللينك لازم يبدأ بـ https://", "error");
    setBusy(true);
    try {
      const id = await rpc<string>("staff_task_save", {
        p_id: task?.id ?? null,
        p_sector: sector.id,
        p_title: f.title.trim(),
        p_description: f.description.trim(),
        p_link: f.link.trim(),
        p_priority: f.priority,
        p_due: due,
        p_assignees: who,
        p_warn: f.warn,
      });
      if (steps.length || f.repeat !== "none" || task) await rpc("staff_task_extras", { p_task: id, p_checklist: steps, p_repeat: f.repeat });
      if (asTemplate) {
        const days = Math.max(0, Math.round((new Date(due).getTime() - Date.now()) / 86_400_000));
        await rpc("staff_task_template_save", { p_id: null, p_sector: sector.id, p: { title: f.title.trim(), description: f.description.trim(), link: f.link.trim(), priority: f.priority, checklist: steps, days } }).catch(() => toast("التاسك اتبعت بس القالب ماتحفظش", "error"));
      }
      toast(task ? "اتحفظ التاسك" : `اتبعت التاسك لـ ${who.length === 1 ? "عضو" : `${who.length} أعضاء`} 🚀`);
      onSaved(id);
    } catch (e2) {
      toast(why(e2), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={task ? "تعديل التاسك" : `تاسك جديد · ${sector.name}`} wide>
      <form onSubmit={save} className="grid gap-3">
        {!task && !!templates.data?.length && (
          <Field label="من قالب جاهز (اختياري)">
            <Select defaultValue="" onChange={(e) => applyTemplate(e.target.value)}>
              <option value="">— من غير قالب —</option>
              {templates.data.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.title}
                  {t.sector_id ? "" : " (للفريق كله)"}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Field label="العنوان">
          <Input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} maxLength={140} placeholder="مثلاً: تصميم بوست الإعلان عن الورشة" />
        </Field>
        <Field label="المطلوب بالتفصيل (اختياري)">
          <Textarea value={f.description} onChange={(e) => setF({ ...f, description: e.target.value })} maxLength={4000} className="min-h-24" />
        </Field>
        <Field label="لينك مرجع (اختياري)">
          <Input value={f.link} onChange={(e) => setF({ ...f, link: e.target.value })} dir="ltr" placeholder="https://" maxLength={300} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="آخر ميعاد">
            <Input type="datetime-local" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} required />
          </Field>
          <Field label="الأولوية">
            <Select value={f.priority} onChange={(e) => setF({ ...f, priority: e.target.value as Priority })}>
              {(Object.keys(PRIORITY) as Priority[]).map((p) => (
                <option key={p} value={p}>
                  {PRIORITY[p].label}
                </option>
              ))}
            </Select>
          </Field>
        </div>
        <Field label="بيتكرر؟" hint="لما الميعاد يعدّي، نفس التاسك بيتبعت تاني لنفس الأعضاء بميعاد جديد.">
          <Select value={f.repeat} onChange={(e) => setF({ ...f, repeat: e.target.value as Repeat })}>
            {(Object.keys(REPEAT) as Repeat[]).map((r) => (
              <option key={r} value={r}>
                {REPEAT[r]}
              </option>
            ))}
          </Select>
        </Field>
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm font-semibold text-chalk">خطوات (اختياري)</legend>
          {steps.map((c, i) => (
            <div key={c.id} className="flex items-center gap-2 rounded-xl border border-[var(--line)] px-3 py-2 text-sm text-chalk">
              <span className="font-mono text-fog">{i + 1}</span>
              <span className="min-w-0 flex-1">{c.text}</span>
              <button type="button" className="text-xs text-fog hover:text-[#ff9aa5]" onClick={() => setSteps(steps.filter((x) => x.id !== c.id))} aria-label={`شيل ${c.text}`}>
                ✕
              </button>
            </div>
          ))}
          {steps.length < 20 && (
            <div className="flex gap-2">
              <Input value={step} onChange={(e) => setStep(e.target.value)} onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addStep())} maxLength={200} placeholder="خطوة: مثلاً اجمع الصور" aria-label="خطوة جديدة" />
              <Button icon="plus" onClick={addStep} aria-label="ضيف الخطوة">
                ضيف
              </Button>
            </div>
          )}
        </fieldset>
        <fieldset className="grid gap-1.5">
          <div className="flex items-center justify-between">
            <legend className="text-sm font-semibold text-chalk">لمين؟</legend>
            <button type="button" className="text-xs text-cyan" onClick={() => setWho(all ? [] : inSector.map((m) => m.staff_id))}>
              {all ? "شيل الكل" : "كل السيكتور"}
            </button>
          </div>
          {inSector.map((m) => (
            <label key={m.staff_id} className={cn("flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-2", who.includes(m.staff_id) ? "border-cyan/40 bg-cyan/[0.04]" : "border-[var(--line)]")}>
              <input
                type="checkbox"
                checked={who.includes(m.staff_id)}
                onChange={() => setWho((w) => (w.includes(m.staff_id) ? w.filter((x) => x !== m.staff_id) : [...w, m.staff_id]))}
                className="size-4 accent-[#2f7bff]"
              />
              <span className="min-w-0 flex-1 truncate text-sm text-chalk">{m.name}</span>
              {m.is_head && <Badge tone="volt">هيد</Badge>}
            </label>
          ))}
          {task && <p className="text-xs text-fog">اللي تشيله من التاسك بيتسجّل «معفي» وميجيلوش إنذار.</p>}
        </fieldset>
        <Toggle checked={f.warn} onChange={(v) => setF({ ...f, warn: v })} label="إنذار تلقائي لو ماسلّمش في الميعاد" hint="قبل الميعاد بيجيلهم تذكير. لو قفلتها، بيجيلهم تنبيه بس." />
        {!task && <Toggle checked={asTemplate} onChange={setAsTemplate} label="احفظه كقالب للسيكتور" hint="المرة الجاية تختاره من «من قالب جاهز»." />}
        <Button type="submit" variant="primary" size="lg" icon={task ? undefined : "upload"} block loading={busy}>
          {task ? "حفظ" : "ابعت التاسك"}
        </Button>
      </form>
    </Sheet>
  );
}

/** /staff/sectors/<sector>/<task> — who handed in, review, excuse, warn. */
export function TeamTaskScreen({ sectorId, id, me }: { sectorId: string; id: string; me: StaffRow }) {
  const { data, error, loading, reload } = useAsync(() => rpc<Task>("staff_task", { p_id: id }), [id]);
  const sectors = useSectors();
  const sector = sectors.data?.sectors.find((s) => s.id === sectorId);
  const [editing, setEditing] = useState(false);
  const [review, setReview] = useState<Assignee | null>(null);
  const [warn, setWarn] = useState<Assignee | null>(null);
  const [decide, setDecide] = useState<{ r: TaskRequest; approve: boolean } | null>(null);
  const back = `/staff/sectors/${sectorId}`;

  if (loading && !data) return <Loading />;
  if (error || !data)
    return (
      <>
        <TopBar title="التاسك" back={back} />
        <ErrorBox error={error ?? "مش موجود"} retry={reload} />
      </>
    );
  const t = data;
  if (!t.leads)
    return (
      <>
        <TopBar title={t.title} back="/staff/mytasks" />
        <Empty icon="flag" title="التاسك ده عليك" body="تسلّمه من «تاسكاتي»." action={<Button onClick={() => go("/staff/mytasks")}>تاسكاتي</Button>} />
      </>
    );
  const live = t.assignees.filter((a) => !a.excused);
  const cancel = async () => {
    if (!(await confirmDialog({ title: "إلغاء التاسك؟", body: "هيوصل الأعضاء إن التاسك اتلغى. بيفضل في السجل.", ok: "إلغاء التاسك", danger: true }))) return;
    try {
      await rpc("staff_task_cancel", { p_id: t.id });
      toast("اتلغى التاسك");
      reload();
    } catch (e) {
      toast(why(e), "error");
    }
  };
  return (
    <>
      <TopBar
        title={t.title}
        sub={`${t.sector_name} · ${fmt.dateTime(t.due_at)}`}
        back={back}
        actions={
          t.status !== "cancelled" &&
          sector && (
            <Button size="sm" icon="edit" onClick={() => setEditing(true)}>
              تعديل
            </Button>
          )
        }
      />
      <div className="mb-4 grid grid-cols-3 gap-2">
        <Stat label="سلّموا" value={`${live.filter((a) => a.submitted_at || a.state === "approved").length}/${live.length}`} icon="upload" />
        <Stat label="اتقبلوا" value={live.filter((a) => a.state === "approved").length} icon="check" tone="ok" />
        <Stat label={t.status === "open" ? dueText(t.due_at) : t.status === "closed" ? "خلص" : "اتلغى"} value={PRIORITY[t.priority].label} icon="clock" tone={t.status === "open" && past(t.due_at) ? "danger" : undefined} />
      </div>
      {(t.description || t.link) && (
        <Card className="mb-4 grid gap-2">
          {t.description && <p className="whitespace-pre-line text-sm leading-relaxed text-mist">{t.description}</p>}
          {t.link && (
            <a href={t.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-cyan">
              <Icon name="link" size={16} />
              {t.link}
            </a>
          )}
        </Card>
      )}
      {t.repeat !== "none" && <p className="mb-3 text-sm text-mist">🔁 بيتكرر {REPEAT[t.repeat]}</p>}
      {t.requests.some((r) => r.status === "pending") && (
        <Section title="طلبات مستنية ردك">
          <List>
            {t.requests
              .filter((r) => r.status === "pending")
              .map((r) => (
                <Row key={r.id} chevron={false}>
                  <div className="grid gap-2">
                    <p className="text-sm text-chalk">
                      <b>{r.name}</b> {r.kind === "extension" ? `طالب مد الميعاد لـ ${fmt.dateTime(r.new_due!)}` : "طالب عذر من التاسك"}
                    </p>
                    <p className="text-sm text-mist">{r.reason}</p>
                    <div className="flex gap-2">
                      <Button size="sm" variant="primary" icon="check" onClick={() => setDecide({ r, approve: true })}>
                        وافق
                      </Button>
                      <Button size="sm" onClick={() => setDecide({ r, approve: false })}>
                        ارفض
                      </Button>
                    </div>
                  </div>
                </Row>
              ))}
          </List>
        </Section>
      )}
      <Section title="الأعضاء">
        <List>
          {t.assignees.map((a) => {
            const s = assigneeState(a, t.due_at, t.status);
            return (
              <Row key={a.staff_id} chevron={false}>
                <div className="grid gap-2">
                  <div className="flex items-center gap-3">
                    <Avatar name={a.name} />
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-chalk">{a.name}</p>
                      <p className="truncate text-xs text-fog">{a.submitted_at ? `سلّم ${fmt.rel(a.submitted_at)}` : a.missed_at ? "ماسلّمش في الميعاد" : "لسه ماسلّمش"}</p>
                    </div>
                    <Badge tone={s.tone}>{s.label}</Badge>
                  </div>
                  {(a.note || a.link) && (
                    <div className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                      {a.note && <p className="whitespace-pre-line text-mist">{a.note}</p>}
                      {a.link && (
                        <a href={a.link} target="_blank" rel="noopener noreferrer" className="mt-1 flex items-center gap-1.5 text-cyan" dir="ltr">
                          <Icon name="link" size={14} />
                          <span className="truncate">{a.link}</span>
                        </a>
                      )}
                    </div>
                  )}
                  {(a.due_at || !!t.checklist.length) && (
                    <p className="text-xs text-fog">
                      {a.due_at && `ميعاده اتمد لـ ${fmt.dateTime(a.due_at)}`}
                      {a.due_at && !!t.checklist.length && " · "}
                      {!!t.checklist.length && `الخطوات ${a.checked.length}/${t.checklist.length}`}
                    </p>
                  )}
                  <FileList files={a.files} />
                  {a.feedback && <p className="text-xs text-fog">ملاحظتك: {a.feedback}</p>}
                  {t.status !== "cancelled" && !a.excused && (
                    <div className="flex flex-wrap gap-2">
                      {a.state !== "approved" && (
                        <Button size="sm" variant={a.state === "submitted" ? "primary" : "secondary"} icon="check" onClick={() => setReview(a)}>
                          {a.state === "submitted" ? "راجِع" : "قرار"}
                        </Button>
                      )}
                      {a.staff_id !== me.user_id && (
                        <Button size="sm" variant="ghost" icon="alert" onClick={() => setWarn(a)}>
                          إنذار
                        </Button>
                      )}
                    </div>
                  )}
                </div>
              </Row>
            );
          })}
        </List>
      </Section>
      <Card className="mt-4">
        <Comments task={t} onSent={reload} />
      </Card>
      {t.status === "open" && (
        <Button variant="danger" className="mt-6" block onClick={cancel}>
          إلغاء التاسك
        </Button>
      )}
      {decide && <DecideSheet task={t} request={decide.r} approve={decide.approve} onClose={() => setDecide(null)} onDone={() => (setDecide(null), reload())} />}
      {editing && sector && (
        <TaskSheet
          sector={sector}
          task={t}
          onClose={() => setEditing(false)}
          onSaved={() => {
            setEditing(false);
            reload();
          }}
        />
      )}
      {review && <ReviewSheet task={t} assignee={review} onClose={() => setReview(null)} onDone={() => (setReview(null), reload())} />}
      {warn && <WarnSheet member={warn} sectorId={t.sector_id} taskId={t.id} taskTitle={t.title} onClose={() => setWarn(null)} onDone={() => setWarn(null)} />}
    </>
  );
}

function DecideSheet({ task, request: r, approve, onClose, onDone }: { task: Task; request: TaskRequest; approve: boolean; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [when, setWhen] = useState(toLocalInput(r.new_due ?? null));
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await rpc("staff_task_request_decide", { p_id: r.id, p_approve: approve, p_note: note.trim(), p_new_due: approve && r.kind === "extension" ? fromLocalInput(when) : null });
      toast(approve ? "اتوافق ✓ ووصله" : "اترفض ووصله");
      onDone();
    } catch (e) {
      toast(why(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`${approve ? "موافقة" : "رفض"}: ${r.name}`}>
      <div className="grid gap-3">
        <p className="text-sm text-mist">
          {task.title} · {r.reason}
        </p>
        {approve && r.kind === "extension" && (
          <Field label="الميعاد الجديد ليه" hint="تقدر تعدّله عن اللي طلبه.">
            <Input type="datetime-local" value={when} onChange={(e) => setWhen(e.target.value)} />
          </Field>
        )}
        {approve && r.kind === "excuse" && <p className="text-xs text-fog">هيتسجّل معفي من التاسك من غير إنذار.</p>}
        <Field label="ملاحظة (بتوصله، اختياري)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} />
        </Field>
        <Button variant={approve ? "primary" : "danger"} loading={busy} onClick={save} block>
          {approve ? "وافق" : "ارفض"}
        </Button>
      </div>
    </Sheet>
  );
}

function ReviewSheet({ task, assignee: a, onClose, onDone }: { task: Task; assignee: Assignee; onClose: () => void; onDone: () => void }) {
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const decide = async (decision: "approved" | "redo" | "excused") => {
    if (decision === "redo" && !feedback.trim()) return toast("اكتب المطلوب يتعدّل إيه", "error");
    setBusy(decision);
    try {
      await rpc("staff_task_review", { p_task: task.id, p_staff: a.staff_id, p_decision: decision, p_feedback: feedback.trim() });
      toast(decision === "approved" ? "اتقبل ✓" : decision === "redo" ? "اترجع للتعديل" : "اتعفى من التاسك");
      onDone();
    } catch (e) {
      toast(why(e), "error");
    } finally {
      setBusy(null);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`${a.name} · ${task.title}`}>
      <div className="grid gap-3">
        {a.submitted_at ? (
          <p className="text-sm text-fog">
            سلّم {fmt.dateTime(a.submitted_at)}
            {a.late ? " (متأخر)" : ""}
          </p>
        ) : (
          <p className="text-sm text-fog">لسه ماسلّمش. تقدر تقبله لو خلّصه برّه التطبيق، أو تعفيه.</p>
        )}
        <Field label="ملاحظة (بتوصله)">
          <Textarea value={feedback} onChange={(e) => setFeedback(e.target.value)} maxLength={1000} className="min-h-20" placeholder="شغل حلو / محتاج تعدّل…" />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" icon="check" loading={busy === "approved"} onClick={() => decide("approved")}>
            اقبل
          </Button>
          <Button icon="refresh" loading={busy === "redo"} onClick={() => decide("redo")}>
            رجّعه يعدّل
          </Button>
        </div>
        <Button variant="ghost" loading={busy === "excused"} onClick={() => decide("excused")}>
          إعفاء من التاسك (من غير إنذار)
        </Button>
      </div>
    </Sheet>
  );
}

/* ─── Everyone's warnings (overseers) ───────────────────────────────────── */

/** /staff/warnings — every warning in the team, who has the most, and cancelling. */
export function WarningsScreen() {
  const { data, error, loading, reload } = useAsync(() => rpc<Warning[]>("staff_warnings", { p_scope: "all" }), []);
  const [filter, setFilter] = useState<"active" | "appeals" | "cancelled" | "all">("active");
  const recent = (w: Warning) => !w.cancelled_at && Date.now() - new Date(w.created_at).getTime() < 90 * 86_400_000;
  const shown = (data ?? []).filter((w) => (filter === "active" ? !w.cancelled_at : filter === "appeals" ? w.appeal_status === "pending" : filter === "cancelled" ? !!w.cancelled_at : true));
  const top = useMemo(() => {
    const by = new Map<string, { name: string; n: number }>();
    for (const w of data ?? []) if (recent(w)) by.set(w.staff_id, { name: w.name, n: (by.get(w.staff_id)?.n ?? 0) + 1 });
    return [...by.values()].sort((a, b) => b.n - a.n).slice(0, 5);
  }, [data]);
  return (
    <>
      <TopBar title="إنذارات الفريق" sub="من كل السيكتورات، وتقدر تلغي أي إنذار" back="/staff/sectors" />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : (
        <>
          {!!top.length && (
            <Card className="mb-4 grid gap-2">
              <p className="text-sm font-semibold text-chalk">الأكتر إنذارات (آخر 90 يوم)</p>
              {top.map((x) => (
                <div key={x.name} className="flex items-center justify-between text-sm">
                  <span className="text-mist">{x.name}</span>
                  <Badge tone={x.n >= 3 ? "danger" : "warn"}>{x.n}</Badge>
                </div>
              ))}
            </Card>
          )}
          <div className="mb-3 flex gap-2 overflow-x-auto">
            <Chip active={filter === "active"} onClick={() => setFilter("active")} count={(data ?? []).filter((w) => !w.cancelled_at).length}>
              سارية
            </Chip>
            <Chip active={filter === "appeals"} onClick={() => setFilter("appeals")} count={(data ?? []).filter((w) => w.appeal_status === "pending").length}>
              تظلّمات
            </Chip>
            <Chip active={filter === "cancelled"} onClick={() => setFilter("cancelled")}>
              ملغية
            </Chip>
            <Chip active={filter === "all"} onClick={() => setFilter("all")}>
              الكل
            </Chip>
          </div>
          <WarningsList warnings={shown} canCancel onChanged={reload} showSector />
        </>
      )}
    </>
  );
}
