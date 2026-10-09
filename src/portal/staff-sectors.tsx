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
import { errorText, fmt, fromLocalInput, rpc, toLocalInput, type StaffRow } from "./core";
import { Avatar, Badge, Button, Card, Chip, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, Section, Select, Sheet, Stat, Textarea, Toggle, TopBar, confirmDialog, go, toast, useAsync } from "./ui";

/* ─── Types ─────────────────────────────────────────────────────────────── */

type Member = { staff_id: string; name: string; title: string | null; is_head: boolean; assigned?: number; on_time?: number; late?: number; missed?: number; open?: number; warnings?: number };
type Sector = { id: string; name: string; description: string; color: string; archived: boolean; is_head: boolean; leads: boolean; open_tasks: number; to_review: number; overdue: number; warnings: number; members: Member[] };
type SectorsData = { oversees: boolean; sectors: Sector[]; staff: { user_id: string; name: string; title: string | null }[] };
type State = "todo" | "doing" | "submitted" | "approved" | "redo";
type Assignee = { staff_id: string; name: string; state: State; note: string | null; link: string | null; submitted_at: string | null; late: boolean; feedback: string | null; reviewed_by_name: string | null; reviewed_at: string | null; missed_at: string | null; excused: boolean };
type Priority = "low" | "normal" | "high" | "urgent";
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
  assignees: Assignee[];
  leads?: boolean;
};
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
};
export type TeamSummary = { open: number; overdue: number; due_soon: number; warnings_unseen: number; warnings_active: number; sectors: number; heads: number; to_review: number; oversees: boolean };

type Tone = "ok" | "warn" | "danger" | "info" | "muted" | "volt";

export const PRIORITY: Record<Priority, { label: string; tone: Tone }> = {
  low: { label: "مش مستعجل", tone: "muted" },
  normal: { label: "عادي", tone: "info" },
  high: { label: "مهم", tone: "warn" },
  urgent: { label: "عاجل", tone: "danger" },
};

const MESSAGES: Record<string, string> = {
  not_member: "فيه حد مختار مش عضو في السيكتور ده.",
  due_in_past: "آخر ميعاد لازم يكون بعد دلوقتي.",
  no_assignees: "اختار عضو واحد على الأقل.",
  "not yourself": "مينفعش تدي نفسك إنذار.",
  "not allowed": "ليست لديك صلاحية لهذا الإجراء.",
};
const why = (e: unknown) => MESSAGES[(e as { message?: string })?.message ?? ""] ?? errorText(e);

const past = (d: string) => new Date(d).getTime() < Date.now();

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
export function assigneeState(a: Pick<Assignee, "state" | "late" | "excused" | "submitted_at">, due: string, status: Task["status"]): { label: string; tone: Tone } {
  if (status === "cancelled") return { label: "اتلغى", tone: "muted" };
  if (a.excused) return { label: "معفي", tone: "muted" };
  if (a.state === "approved") return { label: a.late ? "اتقبل (متأخر)" : "اتقبل ✓", tone: "ok" };
  if (a.state === "submitted") return { label: a.late ? "اتسلّم متأخر" : "اتسلّم", tone: "info" };
  if (a.state === "redo") return { label: "محتاج تعديل", tone: "warn" };
  if (past(due)) return { label: "فات الميعاد", tone: "danger" };
  return a.state === "doing" ? { label: "شغال عليه", tone: "volt" } : { label: "مطلوب", tone: "muted" };
}

export const teamSummary = () => rpc<TeamSummary>("staff_my_summary");

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
    </>
  );
}

/* ─── My tasks ──────────────────────────────────────────────────────────── */

/** /staff/mytasks — the tasks given to me and my warnings. */
export function MyTasksScreen() {
  const { data, error, loading, reload } = useAsync(async () => {
    const [tasks, warnings] = await Promise.all([rpc<Task[]>("staff_my_tasks"), rpc<Warning[]>("staff_warnings", { p_scope: "mine" })]);
    return { tasks: tasks ?? [], warnings: warnings ?? [] };
  }, []);
  const [tab, setTab] = useState<"open" | "sent" | "done">("open");
  const [open, setOpen] = useState<Task | null>(null);
  const unseen = data?.warnings.filter((w) => !w.seen_at && !w.cancelled_at).length ?? 0;
  useEffect(() => {
    if (unseen) rpc("staff_warnings_seen").catch(() => undefined);
  }, [unseen]);

  const mine = (t: Task) => t.assignees[0];
  const groups = useMemo(() => {
    const list = data?.tasks ?? [];
    const isOpen = (t: Task) => t.status === "open" && ["todo", "doing", "redo"].includes(mine(t)?.state ?? "");
    return {
      open: list.filter(isOpen),
      sent: list.filter((t) => t.status === "open" && mine(t)?.state === "submitted"),
      done: list.filter((t) => !isOpen(t) && !(t.status === "open" && mine(t)?.state === "submitted")).reverse(),
    };
  }, [data]);
  const active = data?.warnings.filter((w) => !w.cancelled_at) ?? [];

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
                <span className="text-xs font-normal text-fog">(آخر 90 يوم)</span>
              </p>
              {active.slice(0, 5).map((w) => (
                <div key={w.id} className="rounded-xl border border-[var(--line)] px-3 py-2 text-sm">
                  <p className="text-mist">{w.reason}</p>
                  <p className="mt-1 text-xs text-fog">
                    {fmt.dateTime(w.created_at)} · {w.kind === "missed" ? "تلقائي" : `من ${w.issued_by_name ?? "الهيد"}`}
                    {w.sector_name ? ` · ${w.sector_name}` : ""}
                  </p>
                </div>
              ))}
              {active.length >= 3 && <p className="text-xs text-[#ff9aa5]">3 إنذارات بتوصل للمؤسس. لو فيه ظرف، كلّم الهيد بتاعك.</p>}
            </Card>
          )}
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
          ) : (
            <List>
              {groups[tab].map((t) => {
                const s = assigneeState(mine(t), t.due_at, t.status);
                return (
                  <Row key={t.id} onClick={() => setOpen(t)}>
                    <div className="flex items-center gap-3">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: t.sector_color }} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-chalk">{t.title}</p>
                        <p className="truncate text-xs text-fog">
                          {t.sector_name} · {fmt.dateTime(t.due_at)}
                          {t.status === "open" && ` · ${dueText(t.due_at)}`}
                        </p>
                      </div>
                      {t.priority === "urgent" || t.priority === "high" ? <Badge tone={PRIORITY[t.priority].tone}>{PRIORITY[t.priority].label}</Badge> : null}
                      <Badge tone={s.tone}>{s.label}</Badge>
                    </div>
                  </Row>
                );
              })}
            </List>
          )}
        </>
      )}
      {open && (
        <MyTaskSheet
          task={open}
          onClose={() => setOpen(null)}
          onDone={() => {
            setOpen(null);
            reload();
          }}
        />
      )}
    </>
  );
}

function MyTaskSheet({ task: t, onClose, onDone }: { task: Task; onClose: () => void; onDone: () => void }) {
  const me = t.assignees[0];
  const s = assigneeState(me, t.due_at, t.status);
  const [note, setNote] = useState(me?.note ?? "");
  const [link, setLink] = useState(me?.link ?? "");
  const [busy, setBusy] = useState(false);
  const canSubmit = t.status === "open" && me && me.state !== "approved";

  const start = async () => {
    setBusy(true);
    try {
      await rpc("staff_task_start", { p_task: t.id });
      toast("بالتوفيق 💪");
      onDone();
    } catch (e) {
      toast(why(e), "error");
    } finally {
      setBusy(false);
    }
  };
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!note.trim() && !link.trim()) return toast("اكتب اللي عملته أو حط لينك", "error");
    if (link.trim() && !/^https:\/\/\S+$/i.test(link.trim())) return toast("اللينك لازم يبدأ بـ https://", "error");
    setBusy(true);
    try {
      const r = await rpc<{ ok: boolean; late?: boolean; error?: string }>("staff_task_submit", { p_task: t.id, p_note: note.trim(), p_link: link.trim() });
      if (!r.ok) return toast(r.error === "closed" ? "التاسك ده اتقفل" : "مقدرناش نسلّمه", "error");
      toast(r.late ? "اتسلّم (متأخر)" : "اتسلّم ✓ الهيد هيراجعه");
      onDone();
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
          <span className="text-xs text-fog">
            {t.sector_name}
            {t.created_by_name ? ` · من ${t.created_by_name}` : ""}
          </span>
        </div>
        <Card className="grid gap-1">
          <p className="text-xs text-fog">آخر ميعاد</p>
          <p className="font-semibold text-chalk">
            {fmt.full(t.due_at)} · {fmt.time(t.due_at)}
          </p>
          {t.status === "open" && <p className={cn("text-sm", past(t.due_at) ? "text-[#ff9aa5]" : "text-mist")}>{dueText(t.due_at)}</p>}
          {t.warn_on_miss && t.status === "open" && !me?.submitted_at && <p className="text-xs text-fog">لو ماسلّمتش في الميعاد بيجيلك إنذار تلقائي.</p>}
        </Card>
        {t.description && <p className="whitespace-pre-line leading-relaxed text-mist">{t.description}</p>}
        {t.link && (
          <a href={t.link} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 text-sm text-cyan">
            <Icon name="link" size={16} />
            لينك التاسك
          </a>
        )}
        {me?.feedback && (
          <Card className={cn("text-sm", me.state === "redo" ? "border-warn/40 bg-warn/[0.06]" : "border-ok/30 bg-ok/[0.05]")}>
            <p className="text-xs text-fog">ملاحظة {me.reviewed_by_name ?? "الهيد"}</p>
            <p className="mt-1 text-mist">{me.feedback}</p>
          </Card>
        )}
        {me?.state === "todo" && t.status === "open" && (
          <Button icon="play" onClick={start} loading={busy}>
            بدأت فيه
          </Button>
        )}
        {canSubmit && (
          <form onSubmit={submit} className="grid gap-3 border-t border-[var(--line)] pt-3">
            <p className="font-semibold text-chalk">{me.state === "submitted" ? "عدّل التسليم" : me.state === "redo" ? "سلّم تاني بعد التعديل" : "سلّم التاسك"}</p>
            {past(t.due_at) && !me.submitted_at && <p className="text-xs text-[#ffd08a]">الميعاد فات، هيتسجّل إنه متأخر.</p>}
            <Field label="عملت إيه">
              <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={2000} className="min-h-24" placeholder="اكتب باختصار اللي خلّصته" />
            </Field>
            <Field label="لينك (درايف، كانڤا، جيت هب…)" hint="اختياري لو كتبت فوق.">
              <Input value={link} onChange={(e) => setLink(e.target.value)} dir="ltr" placeholder="https://" maxLength={300} />
            </Field>
            <Button type="submit" variant="primary" size="lg" icon="upload" loading={busy} block>
              {me.state === "submitted" ? "حدّث التسليم" : "سلّم"}
            </Button>
          </form>
        )}
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
export function SectorScreen({ id, me }: { id: string; me: StaffRow }) {
  const all = useSectors();
  const sector = all.data?.sectors.find((s) => s.id === id);
  const leads = !!sector?.leads;
  const extra = useAsync(async () => {
    if (!leads) return null;
    const [tasks, warnings] = await Promise.all([rpc<Task[]>("staff_sector_tasks", { p_sector: id }), rpc<Warning[]>("staff_warnings", { p_scope: "sector", p_sector: id })]);
    return { tasks: tasks ?? [], warnings: warnings ?? [] };
  }, [id, leads]);
  const [tab, setTab] = useState<"tasks" | "members" | "warnings">("tasks");
  const [newTask, setNewTask] = useState(false);
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
          <MembersList sector={sector} />
        </>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="تاسك مفتوح" value={sector.open_tasks} icon="flag" />
            <Stat label="فات ميعادهم" value={sector.overdue} icon="clock" tone={sector.overdue ? "danger" : undefined} />
            <Stat label="مستني مراجعة" value={sector.to_review} icon="check" tone={sector.to_review ? "info" : undefined} />
            <Stat label="إنذار (90 يوم)" value={sector.warnings} icon="alert" tone={sector.warnings ? "warn" : undefined} />
          </div>
          <div className="mb-3 flex gap-2 overflow-x-auto">
            <Chip active={tab === "tasks"} onClick={() => setTab("tasks")} count={tasks.filter((t) => t.status === "open").length}>
              التاسكات
            </Chip>
            <Chip active={tab === "members"} onClick={() => setTab("members")} count={sector.members.length}>
              الأعضاء
            </Chip>
            <Chip active={tab === "warnings"} onClick={() => setTab("warnings")} count={warnings.filter((w) => !w.cancelled_at).length}>
              الإنذارات
            </Chip>
          </div>
          {extra.loading && !extra.data ? (
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
              <TaskList tasks={tasks} />
            )
          ) : tab === "members" ? (
            <MembersList sector={sector} onWarn={(m) => setWarn(m)} me={me} />
          ) : (
            <WarningsList warnings={warnings} canCancel={!!all.data?.oversees} onChanged={reload} />
          )}
        </>
      )}
      {newTask && (
        <TaskSheet
          sector={sector}
          task={null}
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
              </div>
              {canCancel && !w.cancelled_at && (
                <Button size="sm" variant="ghost" onClick={() => setCancel(w)}>
                  إلغاء
                </Button>
              )}
            </div>
          </Row>
        ))}
      </List>
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

function TaskSheet({ sector, task, onClose, onSaved }: { sector: Pick<Sector, "id" | "name" | "members">; task: Task | null; onClose: () => void; onSaved: (id: string) => void }) {
  const inSector = sector.members;
  const [f, setF] = useState({
    title: task?.title ?? "",
    description: task?.description ?? "",
    link: task?.link ?? "",
    priority: (task?.priority ?? "normal") as Priority,
    due: toLocalInput(task?.due_at ?? new Date(Date.now() + 3 * 86_400_000)),
    warn: task?.warn_on_miss ?? true,
  });
  const [who, setWho] = useState<string[]>(task ? task.assignees.filter((a) => !a.excused).map((a) => a.staff_id) : []);
  const [busy, setBusy] = useState(false);
  const all = inSector.length > 0 && inSector.every((m) => who.includes(m.staff_id));
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
        <Toggle checked={f.warn} onChange={(v) => setF({ ...f, warn: v })} label="إنذار تلقائي لو ماسلّمش في الميعاد" hint="قبل الميعاد بيوم بيجيلهم تذكير. لو قفلتها، بيجيلهم تنبيه بس." />
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
      {t.status === "open" && (
        <Button variant="danger" className="mt-6" block onClick={cancel}>
          إلغاء التاسك
        </Button>
      )}
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
  const [filter, setFilter] = useState<"active" | "cancelled" | "all">("active");
  const recent = (w: Warning) => !w.cancelled_at && Date.now() - new Date(w.created_at).getTime() < 90 * 86_400_000;
  const shown = (data ?? []).filter((w) => (filter === "active" ? !w.cancelled_at : filter === "cancelled" ? !!w.cancelled_at : true));
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
          <div className="mb-3 flex gap-2">
            <Chip active={filter === "active"} onClick={() => setFilter("active")} count={(data ?? []).filter((w) => !w.cancelled_at).length}>
              سارية
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
