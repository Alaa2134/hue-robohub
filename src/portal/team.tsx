"use client";
/**
 * The team side for the founder and everyone: the in-app notification centre (every notification is
 * also kept here, push or not), the founder's dashboard, the team rules the owner sets, and the member
 * of the month. See 20261010090000_team_inbox.sql … 20261010093500_team_awards.sql.
 */
import { useMemo, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { errorText, fmt, rpc, type StaffRow } from "./core";
import { Avatar, Badge, Button, Card, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, Section, Select, Sheet, Stat, Textarea, Toggle, TopBar, go, toast, useAsync } from "./ui";

/* ─── Notifications ─────────────────────────────────────────────────────── */

type Note = { id: string; title: string; body: string; url: string | null; created_at: string; read: boolean };

/** The app route inside a notification link ("/app/#/staff/mytasks" → "/staff/mytasks"). */
export const notePath = (url: string | null) => (url && url.includes("#") ? url.slice(url.indexOf("#") + 1) : null);

/** The bell on the home screen, with the unread count. */
export function BellButton({ unread }: { unread: number }) {
  return (
    <button
      type="button"
      onClick={() => go("/staff/notifications")}
      aria-label={unread ? `الإشعارات (${unread} جديدة)` : "الإشعارات"}
      className="relative flex size-11 items-center justify-center rounded-full text-mist transition hover:bg-white/5 hover:text-chalk"
    >
      <Icon name="bell" size={22} />
      {unread > 0 && (
        <span className="absolute end-1 top-1 min-w-5 rounded-full bg-danger px-1 text-center font-mono text-[11px] font-bold leading-5 text-white" data-testid="bell-count">
          {unread > 99 ? "99+" : unread}
        </span>
      )}
    </button>
  );
}

/** /staff/notifications */
export function NotificationsScreen() {
  const { data, error, loading, reload } = useAsync(() => rpc<{ unread: number; items: Note[] }>("staff_notifications"), []);
  const [busy, setBusy] = useState(false);
  const open = async (n: Note) => {
    if (!n.read) rpc("staff_notifications_read", { p_ids: [n.id] }).catch(() => undefined);
    const to = notePath(n.url);
    if (to) go(to);
    else reload();
  };
  const readAll = async () => {
    setBusy(true);
    try {
      await rpc("staff_notifications_read", { p_ids: null });
      reload();
    } catch (e) {
      toast(errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <TopBar
        title="الإشعارات"
        sub="كل اللي وصلك، حتى لو الإشعارات مقفولة على الموبايل"
        back="/staff"
        actions={
          !!data?.unread && (
            <Button size="sm" icon="check" loading={busy} onClick={readAll}>
              قريتها كلها
            </Button>
          )
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.items.length ? (
        <Empty icon="bell" title="مفيش إشعارات" body="التاسكات والإنذارات والاجتماعات وأي حاجة تخصك هتظهر هنا." />
      ) : (
        <List>
          {data.items.map((n) => (
            <Row key={n.id} onClick={() => open(n)} chevron={!!notePath(n.url)}>
              <div className="flex items-start gap-3">
                <span className={cn("mt-1.5 size-2.5 shrink-0 rounded-full", n.read ? "bg-transparent" : "bg-cyan")} />
                <div className="min-w-0 flex-1">
                  <p className={cn("text-[15px]", n.read ? "text-mist" : "font-semibold text-chalk")}>{n.title}</p>
                  {n.body && <p className="mt-0.5 line-clamp-2 text-sm text-fog">{n.body}</p>}
                  <p className="mt-1 text-xs text-fog">{fmt.rel(n.created_at)}</p>
                </div>
              </div>
            </Row>
          ))}
        </List>
      )}
    </>
  );
}

/* ─── Founder's dashboard ───────────────────────────────────────────────── */

type Rules = { warn_threshold: number; warn_window_days: number; remind_hours: number; grace_minutes: number; auto_warn: boolean; meeting_absence_warn: boolean; weekly_report: boolean; morning_brief?: boolean };
type Person = { staff_id: string; name: string; title: string | null; assigned: number; on_time: number; late: number; missed: number; warnings: number };
type Overview = {
  team: { members: number; in_sectors: number; heads: number; sectors: number };
  tasks: { given: number; on_time: number; late: number; missed: number; open: number; overdue: number; to_review: number };
  warnings: { active: number; appeals: number; requests: number };
  sectors: { id: string; name: string; color: string; members: number; given: number; done: number; on_time: number; missed: number; overdue: number; warnings: number }[];
  people: Person[];
  org: { students: number; applications_new: number; responses_new: number };
  rules: Rules;
};

const pct = (a: number, b: number) => (b ? Math.round((a / b) * 100) : null);

/** /staff/overview — the whole team at a glance (overseers). */
export function OverviewScreen({ me }: { me: StaffRow }) {
  const { data, error, loading, reload } = useAsync(() => rpc<Overview>("staff_overview"), []);
  const [rules, setRules] = useState(false);
  const top = useMemo(
    () =>
      (data?.people ?? [])
        .filter((p) => p.assigned >= 1)
        .map((p) => ({ ...p, rate: pct(p.on_time, p.assigned) ?? 0 }))
        .sort((a, b) => b.rate - a.rate || b.on_time - a.on_time)
        .slice(0, 5),
    [data],
  );
  const risk = (data?.people ?? []).filter((p) => p.warnings >= Math.max(1, (data?.rules.warn_threshold ?? 3) - 1) || p.missed >= 2);
  const idle = (data?.people ?? []).filter((p) => p.assigned === 0 && p.staff_id !== me.user_id);

  return (
    <>
      <TopBar
        title="لوحة المؤسس"
        sub="الفريق كله في شاشة واحدة · آخر 30 يوم"
        back="/staff"
        actions={
          <Button size="sm" icon="settings" onClick={() => setRules(true)}>
            قواعد الفريق
          </Button>
        }
      />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : data ? (
        <>
          {(!!data.warnings.appeals || !!data.warnings.requests || !!data.tasks.to_review) && (
            <Card className="mb-4 grid gap-2 border-cyan/30 bg-cyan/[0.05]">
              <p className="font-semibold text-chalk">مستني قرارك</p>
              {!!data.warnings.appeals && (
                <button type="button" className="flex items-center justify-between text-sm text-mist" onClick={() => go("/staff/warnings")}>
                  <span>تظلّمات من إنذارات</span>
                  <Badge tone="warn">{data.warnings.appeals}</Badge>
                </button>
              )}
              {!!data.warnings.requests && (
                <button type="button" className="flex items-center justify-between text-sm text-mist" onClick={() => go("/staff/sectors")}>
                  <span>طلبات مد ميعاد أو عذر</span>
                  <Badge tone="info">{data.warnings.requests}</Badge>
                </button>
              )}
              {!!data.tasks.to_review && (
                <button type="button" className="flex items-center justify-between text-sm text-mist" onClick={() => go("/staff/sectors")}>
                  <span>تسليمات مستنية مراجعة</span>
                  <Badge tone="info">{data.tasks.to_review}</Badge>
                </button>
              )}
            </Card>
          )}
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
            <Stat label="عضو في الفريق" value={data.team.members} icon="users" sub={`${data.team.in_sectors} في سيكتورات · ${data.team.heads} هيد`} />
            <Stat label="التزام بالمواعيد" value={pct(data.tasks.on_time, data.tasks.given) == null ? "—" : `${pct(data.tasks.on_time, data.tasks.given)}%`} icon="target" tone={(pct(data.tasks.on_time, data.tasks.given) ?? 100) < 60 ? "warn" : "ok"} sub={`${data.tasks.on_time} من ${data.tasks.given} تاسك`} />
            <Stat label="متأخرين دلوقتي" value={data.tasks.overdue} icon="clock" tone={data.tasks.overdue ? "danger" : undefined} sub={`${data.tasks.open} مفتوح`} />
            <Stat label="إنذار ساري" value={data.warnings.active} icon="alert" tone={data.warnings.active ? "warn" : undefined} sub={`في آخر ${data.rules.warn_window_days} يوم`} />
          </div>
          <div className="mt-2 grid grid-cols-3 gap-2">
            <Stat label="طالب نشط" value={data.org.students} icon="book" />
            <Stat label="طلب انضمام جديد" value={data.org.applications_new} icon="users" />
            <Stat label="رد فورم جديد" value={data.org.responses_new} icon="list" />
          </div>

          <Section title="السيكتورات">
            {!data.sectors.length ? (
              <Empty icon="users" title="مفيش سيكتورات" action={<Button onClick={() => go("/staff/sectors")}>اعمل سيكتور</Button>} />
            ) : (
              <List>
                {data.sectors.map((s) => {
                  const rate = pct(s.on_time, s.given);
                  return (
                    <Row key={s.id} onClick={() => go(`/staff/sectors/${s.id}`)}>
                      <div className="grid gap-2">
                        <div className="flex items-center gap-3">
                          <span className="size-3 shrink-0 rounded-full" style={{ background: s.color }} />
                          <span className="min-w-0 flex-1 truncate font-semibold text-chalk">{s.name}</span>
                          {!!s.overdue && <Badge tone="danger">{s.overdue} متأخر</Badge>}
                          {!!s.warnings && <Badge tone="warn">{s.warnings} إنذار</Badge>}
                        </div>
                        <div className="flex items-center gap-3 text-xs text-fog">
                          <span>{s.members} عضو</span>
                          <span>{s.given} تاسك</span>
                          <span>{s.done} خلص</span>
                          <span className="ms-auto font-mono text-mist">{rate == null ? "—" : `${rate}%`}</span>
                        </div>
                        <div className="h-1.5 overflow-hidden rounded-full bg-white/5">
                          <div className="h-full rounded-full" style={{ width: `${rate ?? 0}%`, background: s.color }} />
                        </div>
                      </div>
                    </Row>
                  );
                })}
              </List>
            )}
          </Section>

          {!!top.length && (
            <Section title="الأكتر التزامًا">
              <List>
                {top.map((p, i) => (
                  <Row key={p.staff_id} chevron={false}>
                    <div className="flex items-center gap-3">
                      <span className="w-5 text-center font-mono text-fog">{i + 1}</span>
                      <Avatar name={p.name} />
                      <span className="min-w-0 flex-1 truncate font-semibold text-chalk">{p.name}</span>
                      <span className="text-xs text-fog">
                        {p.on_time}/{p.assigned}
                      </span>
                      <Badge tone="ok">{p.rate}%</Badge>
                    </div>
                  </Row>
                ))}
              </List>
            </Section>
          )}

          {!!risk.length && (
            <Section title="محتاجين متابعة">
              <List>
                {risk.map((p) => (
                  <Row key={p.staff_id} chevron={false}>
                    <div className="flex items-center gap-3">
                      <Avatar name={p.name} />
                      <div className="min-w-0 flex-1">
                        <p className="truncate font-semibold text-chalk">{p.name}</p>
                        <p className="truncate text-xs text-fog">
                          {p.missed} فاته الميعاد · {p.late} متأخر من {p.assigned}
                        </p>
                      </div>
                      <Badge tone={p.warnings >= data.rules.warn_threshold ? "danger" : "warn"}>{p.warnings} إنذار</Badge>
                    </div>
                  </Row>
                ))}
              </List>
            </Section>
          )}

          {!!idle.length && (
            <Card className="mt-4 text-sm text-mist">
              <p className="font-semibold text-chalk">من غير تاسكات في آخر 30 يوم</p>
              <p className="mt-1 text-fog">{idle.map((p) => p.name).join("، ")}</p>
            </Card>
          )}

          <MonthAward />
        </>
      ) : null}
      {rules && data && (
        <RulesSheet
          rules={data.rules}
          onClose={() => setRules(false)}
          onSaved={() => {
            setRules(false);
            reload();
          }}
        />
      )}
    </>
  );
}

function RulesSheet({ rules, onClose, onSaved }: { rules: Rules; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState(rules);
  const [busy, setBusy] = useState(false);
  const num = (k: keyof Rules, min: number, max: number) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setF({ ...f, [k]: Math.min(max, Math.max(min, parseInt(e.target.value || "0", 10) || min)) });
  const save = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await rpc("staff_team_settings_save", { p: f });
      toast("اتحفظت قواعد الفريق");
      onSaved();
    } catch (e2) {
      toast(errorText(e2), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title="قواعد الفريق">
      <form onSubmit={save} className="grid gap-3">
        <Toggle checked={f.auto_warn} onChange={(v) => setF({ ...f, auto_warn: v })} label="إنذار تلقائي لما الميعاد يفوت" hint="لو قفلتها، اللي ماسلّمش بيجيله تنبيه بس." />
        <div className="grid grid-cols-2 gap-3">
          <Field label="فترة سماح بعد الميعاد (دقيقة)">
            <Input type="number" inputMode="numeric" value={f.grace_minutes} min={0} max={1440} onChange={num("grace_minutes", 0, 1440)} dir="ltr" />
          </Field>
          <Field label="التذكير قبل الميعاد (ساعة)">
            <Input type="number" inputMode="numeric" value={f.remind_hours} min={1} max={168} onChange={num("remind_hours", 1, 168)} dir="ltr" />
          </Field>
          <Field label="كام إنذار يوصلك تنبيه">
            <Input type="number" inputMode="numeric" value={f.warn_threshold} min={1} max={20} onChange={num("warn_threshold", 1, 20)} dir="ltr" />
          </Field>
          <Field label="الإنذارات بتتحسب في (يوم)">
            <Input type="number" inputMode="numeric" value={f.warn_window_days} min={7} max={365} onChange={num("warn_window_days", 7, 365)} dir="ltr" />
          </Field>
        </div>
        <Toggle checked={f.meeting_absence_warn} onChange={(v) => setF({ ...f, meeting_absence_warn: v })} label="إنذار للغياب عن اجتماع من غير عذر" />
        <Toggle checked={f.weekly_report} onChange={(v) => setF({ ...f, weekly_report: v })} label="تقرير أسبوعي يوم الأحد" hint="ليك وللهيدز: اتسلّم كام، اتأخر كام، والأنشط." />
        <Toggle checked={f.morning_brief ?? true} onChange={(v) => setF({ ...f, morning_brief: v })} label="رسالة الصبح من بقلظ" hint="كل يوم الصبح: كل عضو عليه حاجة بيجيله إشعار واحد فيه يومه (تاسكات، اجتماعات، مراجعات، المخزن)." />
        <Button type="submit" variant="primary" size="lg" block loading={busy}>
          حفظ القواعد
        </Button>
      </form>
    </Sheet>
  );
}

/* ─── Member of the month ───────────────────────────────────────────────── */

type Score = { staff_id: string; name: string; title: string | null; on_time: number; late: number; approved: number; missed: number; present: number; absent: number; warnings: number; score: number };
type Scores = { month: string; award: { staff_id: string; name: string; note: string | null; certificate_id: string | null } | null; people: Score[] };

const monthKey = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
const MONTHS = ["يناير", "فبراير", "مارس", "أبريل", "مايو", "يونيو", "يوليو", "أغسطس", "سبتمبر", "أكتوبر", "نوفمبر", "ديسمبر"];
const monthLabel = (key: string) => `${MONTHS[Number(key.slice(5, 7)) - 1]} ${key.slice(0, 4)}`;

/** In the founder's dashboard: this month's (or last month's) ranking and naming the winner. */
function MonthAward() {
  const now = new Date();
  const options = [monthKey(now), monthKey(new Date(now.getFullYear(), now.getMonth() - 1, 1))];
  const [month, setMonth] = useState(options[0]);
  const { data, error, loading, reload } = useAsync(() => rpc<Scores>("staff_month_scores", { p_month: month }), [month]);
  const [pick, setPick] = useState<Score | null>(null);
  return (
    <Section
      title="عضو الشهر 🏆"
      action={
        <Select value={month} onChange={(e) => setMonth(e.target.value)} aria-label="الشهر" className="h-9 w-auto py-0 text-sm">
          {options.map((m) => (
            <option key={m} value={m}>
              {monthLabel(m)}
            </option>
          ))}
        </Select>
      }
    >
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : data ? (
        <>
          {data.award && (
            <Card className="mb-3 flex items-center gap-3 border-gold/40 bg-gold/[0.07]">
              <Icon name="trophy" size={26} className="shrink-0 text-gold" />
              <div className="min-w-0 flex-1">
                <p className="font-semibold text-chalk">{data.award.name}</p>
                <p className="text-xs text-fog">{data.award.note || `عضو شهر ${monthLabel(data.month)}`}</p>
              </div>
              {data.award.certificate_id && <Badge tone="volt">بشهادة</Badge>}
            </Card>
          )}
          <p className="mb-2 text-xs text-fog">النقاط: في الميعاد ×3 · اتقبل ×2 · حضور اجتماع ×1 · متأخر ×1 · فاته الميعاد −3 · غياب −2 · إنذار −4</p>
          {!data.people.length ? (
            <Empty icon="star" title="مفيش أعضاء لسه" />
          ) : (
            <List>
              {data.people.slice(0, 8).map((p, i) => (
                <Row key={p.staff_id} chevron={false}>
                  <div className="flex items-center gap-3">
                    <span className="w-5 text-center font-mono text-fog">{i + 1}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold text-chalk">{p.name}</p>
                      <p className="truncate text-xs text-fog">
                        {p.on_time} في الميعاد · {p.approved} اتقبل · {p.present} اجتماع · {p.missed} فات · {p.warnings} إنذار
                      </p>
                    </div>
                    <span className={cn("font-mono text-lg font-bold", p.score >= 0 ? "text-chalk" : "text-[#ff9aa5]")}>{p.score}</span>
                    {!data.award && (
                      <Button size="sm" variant={i === 0 ? "primary" : "ghost"} onClick={() => setPick(p)} aria-label={`اختار ${p.name}`}>
                        اختار
                      </Button>
                    )}
                  </div>
                </Row>
              ))}
            </List>
          )}
        </>
      ) : null}
      {pick && (
        <AwardSheet
          month={month}
          person={pick}
          onClose={() => setPick(null)}
          onDone={() => {
            setPick(null);
            reload();
          }}
        />
      )}
    </Section>
  );
}

function AwardSheet({ month, person, onClose, onDone }: { month: string; person: Score; onClose: () => void; onDone: () => void }) {
  const [note, setNote] = useState("");
  const [cert, setCert] = useState(true);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    try {
      await rpc("staff_award_month", { p_month: month, p_staff: person.staff_id, p_note: note.trim(), p_certificate: cert });
      toast(`🏆 ${person.name} عضو شهر ${monthLabel(month)}`);
      onDone();
    } catch (e) {
      toast((e as { message?: string })?.message === "already" ? "الشهر ده اتختار عضوه خلاص" : errorText(e), "error");
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={`عضو شهر ${monthLabel(month)}`}>
      <div className="grid gap-3">
        <p className="text-mist">
          <b className="text-chalk">{person.name}</b> · {person.score} نقطة
        </p>
        <Field label="كلمة للفريق (اختياري)" hint="بتوصل الفريق كله في الإشعار.">
          <Textarea value={note} onChange={(e) => setNote(e.target.value)} maxLength={300} className="min-h-20" placeholder="التزام ومواعيد ومبادرة 👏" />
        </Field>
        <Toggle checked={cert} onChange={setCert} label="شهادة تقدير «عضو الشهر»" hint="بتتطلع من الشهادات وتقدر تطبعها أو تتحقق منها بالـ QR." />
        <Button variant="primary" size="lg" icon="trophy" loading={busy} onClick={save} block>
          أعلن عضو الشهر
        </Button>
      </div>
    </Sheet>
  );
}

/** Home: the latest member of the month, for everyone. */
export function AwardBanner({ award }: { award: { name: string; month: string; note: string | null } | null | undefined }) {
  if (!award) return null;
  return (
    <Card className="mt-4 flex items-center gap-3 border-gold/40 bg-gold/[0.07]" data-testid="award-banner">
      <Icon name="trophy" size={24} className="shrink-0 text-gold" />
      <div className="min-w-0 flex-1">
        <p className="text-xs text-fog">عضو شهر {monthLabel(award.month.slice(0, 10))}</p>
        <p className="font-semibold text-chalk">{award.name} 🏆</p>
        {award.note && <p className="truncate text-xs text-mist">{award.note}</p>}
      </div>
    </Card>
  );
}
