"use client";
/** Team accounts, my account, activity log and attendance reports. */
import { useMemo, useState, type FormEvent } from "react";
import { cn } from "@/lib/cn";
import { APP_PATH, AREAS, POSITIONS, publicOrigin, ROLE_LABEL, can, downloadCsv, errorText, fmt, must, rpc, sb, tempPassword, type Area, type AttStatus, type Role, type StaffRow, type Student } from "./core";
import { DeleteAccountCard } from "./account-deletion";
import { BiometricToggle } from "./biometric";
import { GroupSelect, groupsOf, useStudents } from "./staff-data";
import {
  Avatar,
  Badge,
  Button,
  Card,
  Empty,
  ErrorBox,
  Field,
  Icon,
  Input,
  List,
  Loading,
  Ring,
  Row,
  Section,
  Select,
  Sheet,
  Stat,
  Toggle,
  TopBar,
  confirmDialog,
  copyText,
  toast,
  useAsync,
} from "./ui";

export async function staffAdmin(body: Record<string, unknown>) {
  const { data, error } = await sb().functions.invoke("staff-admin", { body });
  if (error) {
    let code = "";
    try {
      code = ((await (error as { context?: Response }).context?.json()) as { error?: string })?.error ?? "";
    } catch {
      /* not JSON */
    }
    throw new Error(code || error.message);
  }
  return data as { ok: boolean; id?: string };
}

const ADMIN_ERRORS: Record<string, string> = {
  exists: "هذا البريد عضو في الفريق بالفعل.",
  forbidden: "ليست لديك صلاحية لهذا الإجراء.",
  invalid: "راجع البيانات: بريد صحيح وكلمة مرور 10 حروف على الأقل.",
  unauthorized: "انتهت جلسة الدخول. سجّل الدخول من جديد.",
};
const adminError = (e: unknown) => ADMIN_ERRORS[(e as Error)?.message] ?? errorText(e);

export type Credentials = { name: string; email: string; password: string };

export function TeamScreen({ me }: { me: StaffRow }) {
  const { data, error, loading, reload } = useAsync(async () => must(await sb().from("staff").select("*").order("created_at")) as StaffRow[], []);
  const [adding, setAdding] = useState(false);
  const [open, setOpen] = useState<StaffRow | null>(null);
  const [creds, setCreds] = useState<Credentials | null>(null);
  const canManage = me.role === "owner" || me.role === "admin";

  return (
    <>
      <TopBar
        title="الفريق"
        sub="حسابات فريق التدريب وصلاحياتهم"
        back="/staff/more"
        actions={
          canManage && (
            <Button size="sm" variant="primary" icon="plus" onClick={() => setAdding(true)}>
              عضو
            </Button>
          )
        }
      />
      <Card className="mb-4 grid gap-1 text-xs leading-relaxed text-fog">
        <p>
          <b className="text-mist">المالك:</b> كل شيء، ومنها إدارة الفريق. <b className="text-mist">المشرف:</b> كل شيء ما عدا تعديل المالك والمشرفين.{" "}
          <b className="text-mist">المدرّب:</b> الحضور والطلاب والمحتوى والكويزات.
        </p>
      </Card>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : (
        <List>
          {(data ?? []).map((s) => (
            <Row key={s.user_id} onClick={canManage ? () => setOpen(s) : undefined}>
              <div className="flex items-center gap-3">
                <Avatar name={s.full_name || s.email} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-semibold text-chalk">
                    {s.full_name || "—"} {s.user_id === me.user_id && <span className="text-xs font-normal text-fog">(أنت)</span>}
                  </p>
                  <p className="truncate font-mono text-xs text-fog" dir="ltr">
                    {s.email}
                  </p>
                  {(s.title || (s.role === "lead" && s.permissions)) && (
                    <p className="mt-0.5 truncate text-xs text-mist">
                      {s.title}
                      {s.title && s.role === "lead" && s.permissions ? " · " : ""}
                      {s.role === "lead" && s.permissions ? AREAS.filter((a) => can(s, a.key)).map((a) => a.label).join("، ") || "بدون صلاحيات" : ""}
                    </p>
                  )}
                </div>
                {!s.active && <Badge tone="danger">موقوف</Badge>}
                <Badge tone={s.role === "owner" ? "volt" : s.role === "admin" ? "info" : "muted"}>{ROLE_LABEL[s.role]}</Badge>
              </div>
            </Row>
          ))}
        </List>
      )}
      <AddMember open={adding} me={me} onClose={() => setAdding(false)} onCreated={(c) => (setCreds(c), reload())} />
      <MemberSheet member={open} me={me} onClose={() => setOpen(null)} onChanged={reload} onCredentials={setCreds} />
      <CredentialsSheet creds={creds} onClose={() => setCreds(null)} />
    </>
  );
}

function AddMember({ open, me, onClose, onCreated }: { open: boolean; me: StaffRow; onClose: () => void; onCreated: (c: Credentials) => void }) {
  const [form, setForm] = useState({ name: "", email: "", role: "lead" as Role, password: tempPassword() });
  const [busy, setBusy] = useState(false);
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      await staffAdmin({ action: "create", name: form.name.trim(), email: form.email.trim().toLowerCase(), role: form.role, password: form.password });
      onCreated({ name: form.name.trim(), email: form.email.trim().toLowerCase(), password: form.password });
      setForm({ name: "", email: "", role: "lead", password: tempPassword() });
      onClose();
    } catch (e2) {
      toast.error(adminError(e2));
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="إضافة عضو للفريق">
      <form onSubmit={submit} className="grid gap-4">
        <Field label="الاسم">
          <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} required maxLength={120} />
        </Field>
        <Field label="البريد الإلكتروني">
          <Input type="email" value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} required dir="ltr" />
        </Field>
        <Field label="الصلاحية">
          <Select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as Role })}>
            <option value="lead">{ROLE_LABEL.lead} — حضور، طلاب، محتوى، كويزات</option>
            {me.role === "owner" && <option value="admin">{ROLE_LABEL.admin} — كل شيء عدا إدارة المشرفين</option>}
          </Select>
        </Field>
        <Field label="كلمة مرور مؤقتة" hint="ابعتها للعضو، ويقدر يغيّرها من «حسابي».">
          <div className="flex gap-2">
            <Input value={form.password} onChange={(e) => setForm({ ...form, password: e.target.value })} required minLength={10} dir="ltr" className="font-mono" />
            <Button icon="refresh" onClick={() => setForm({ ...form, password: tempPassword() })} aria-label="كلمة مرور جديدة" />
          </div>
        </Field>
        <Button type="submit" variant="primary" size="lg" icon="plus" loading={busy} block>
          إضافة
        </Button>
      </form>
    </Sheet>
  );
}

/**
 * The owner sets each person's position (shown in the team list and on their home screen) and, for
 * trainers, exactly which areas they work in. The database enforces the same areas.
 */
function PositionEditor({ member: m, busy, onSave }: { member: StaffRow; busy: boolean; onSave: (patch: Partial<StaffRow>) => void }) {
  const [title, setTitle] = useState(m.title ?? "");
  const [areas, setAreas] = useState<Area[]>(m.permissions ?? AREAS.map((a) => a.key));
  const lead = m.role === "lead";
  const pickTitle = (t: string) => {
    setTitle(t);
    const p = POSITIONS.find((x) => x.title === t);
    if (p && lead) setAreas(p.areas);
  };
  const toggle = (a: Area) => setAreas((list) => (list.includes(a) ? list.filter((x) => x !== a) : [...list, a]));
  const changed = title.trim() !== (m.title ?? "") || (lead && [...areas].sort().join() !== [...(m.permissions ?? AREAS.map((a) => a.key))].sort().join());
  return (
    <Card className="grid gap-3">
      <Field label="المنصب" hint="بيظهر في قائمة الفريق وعلى الصفحة الرئيسية بتاعته. اختيار منصب بيقترح صلاحياته.">
        <Input value={title} onChange={(e) => pickTitle(e.target.value)} list="bx-positions" maxLength={80} placeholder="مثلاً: مسؤول الإعلام والتصميم" />
        <datalist id="bx-positions">
          {POSITIONS.map((p) => (
            <option key={p.title} value={p.title} />
          ))}
        </datalist>
      </Field>
      {lead ? (
        <fieldset className="grid gap-1.5">
          <legend className="mb-1 text-sm font-semibold text-chalk">الصلاحيات: يقدر يشتغل في</legend>
          {AREAS.map((a) => (
            <label key={a.key} className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--line)] px-3 py-2.5 transition hover:border-cyan/40">
              <input type="checkbox" checked={areas.includes(a.key)} onChange={() => toggle(a.key)} className="mt-1 size-4 accent-[#2f7bff]" />
              <span className="min-w-0">
                <span className="block text-sm font-semibold text-chalk">{a.label}</span>
                <span className="block text-xs text-fog">{a.hint}</span>
              </span>
            </label>
          ))}
          <p className="text-xs text-fog">البورتفوليو بتاعه، حسابه، والتحقق بخطوتين مفتوحين لكل الفريق دايمًا.</p>
        </fieldset>
      ) : (
        <p className="text-xs text-fog">{ROLE_LABEL[m.role]}: كل الصلاحيات. الصلاحيات المحددة للمدرّبين بس.</p>
      )}
      <Button
        variant="primary"
        disabled={!changed}
        loading={busy}
        onClick={() => onSave({ title: title.trim() || null, ...(lead ? { permissions: areas.length === AREAS.length ? null : areas } : {}) })}
      >
        احفظ المنصب والصلاحيات
      </Button>
    </Card>
  );
}

function MemberSheet({ member: m, me, onClose, onChanged, onCredentials }: { member: StaffRow | null; me: StaffRow; onClose: () => void; onChanged: () => void; onCredentials: (c: Credentials) => void }) {
  const [busy, setBusy] = useState(false);
  if (!m) return null;
  const self = m.user_id === me.user_id;
  const owner = me.role === "owner";
  const canReset = self || (owner ? m.role !== "owner" : m.role === "lead");

  const update = async (patch: Partial<StaffRow>) => {
    setBusy(true);
    try {
      must(await sb().from("staff").update(patch).eq("user_id", m.user_id).select());
      toast("تم الحفظ");
      onChanged();
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const reset = async () => {
    const password = tempPassword();
    setBusy(true);
    try {
      await staffAdmin({ action: "set_password", userId: m.user_id, password });
      onCredentials({ name: m.full_name, email: m.email, password });
      onClose();
    } catch (e) {
      toast.error(adminError(e));
    } finally {
      setBusy(false);
    }
  };
  const remove = async () => {
    if (!(await confirmDialog({ title: `حذف حساب ${m.full_name || m.email}؟`, body: "لن يستطيع الدخول مرة أخرى. سجلات الحضور والمحتوى تبقى كما هي.", ok: "حذف الحساب", danger: true }))) return;
    setBusy(true);
    try {
      await staffAdmin({ action: "delete", userId: m.user_id });
      toast("تم حذف الحساب");
      onChanged();
      onClose();
    } catch (e) {
      toast.error(adminError(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Sheet open onClose={onClose} title={m.full_name || m.email}>
      <div className="grid gap-3">
        <p className="font-mono text-sm text-fog" dir="ltr">
          {m.email}
        </p>
        {owner && !self && (
          <Field label="الصلاحية">
            <Select value={m.role} onChange={(e) => update({ role: e.target.value as Role })} disabled={busy}>
              <option value="lead">{ROLE_LABEL.lead}</option>
              <option value="admin">{ROLE_LABEL.admin}</option>
              <option value="owner">{ROLE_LABEL.owner}</option>
            </Select>
          </Field>
        )}
        {owner && <PositionEditor member={m} busy={busy} onSave={update} />}
        {owner && !self && <Toggle checked={m.active} onChange={(active) => update({ active })} label="الحساب نشط" hint="إيقاف الحساب يمنع الدخول فورًا." disabled={busy} />}
        {canReset && (
          <Button icon="key" onClick={reset} loading={busy} block>
            كلمة مرور مؤقتة جديدة
          </Button>
        )}
        {owner && !self && (
          <Button variant="danger" icon="trash" onClick={remove} disabled={busy} block>
            حذف الحساب
          </Button>
        )}
      </div>
    </Sheet>
  );
}

export function CredentialsSheet({ creds, onClose }: { creds: Credentials | null; onClose: () => void }) {
  if (!creds) return null;
  const url = `${publicOrigin()}${APP_PATH}#/login`;
  const msg = `أهلاً ${creds.name}\nحسابك على تطبيق BuildX HUE:\nالبريد: ${creds.email}\nكلمة المرور المؤقتة: ${creds.password}\n${url}\nغيّر كلمة المرور من «حسابي» بعد أول دخول.`;
  return (
    <Sheet open onClose={onClose} title="بيانات الدخول">
      <div className="grid gap-3">
        <p className="flex items-start gap-2 rounded-xl border border-warn/30 bg-warn/[0.07] px-3 py-2.5 text-sm text-[#ffd08a]">
          <Icon name="alert" size={18} className="mt-0.5 shrink-0" />
          كلمة المرور تظهر مرة واحدة. ابعتها للعضو بشكل خاص.
        </p>
        <Card className="grid gap-1 font-mono text-sm" dir="ltr">
          <span className="text-fog">{creds.email}</span>
          <span className="text-lg font-bold text-cyan">{creds.password}</span>
        </Card>
        <Button icon="copy" onClick={() => copyText(msg)} block>
          نسخ الرسالة
        </Button>
        <a href={`https://wa.me/?text=${encodeURIComponent(msg)}`} target="_blank" rel="noreferrer" className="inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-[#1fae5b] font-semibold text-white">
          <Icon name="share" size={18} />
          إرسال على واتساب
        </a>
      </div>
    </Sheet>
  );
}

export function AccountScreen({ me, onProfile }: { me: StaffRow; onProfile: (s: StaffRow) => void }) {
  const [name, setName] = useState(me.full_name);
  const [pw, setPw] = useState({ a: "", b: "" });
  const [busy, setBusy] = useState<"name" | "pw" | null>(null);

  const saveName = async (e: FormEvent) => {
    e.preventDefault();
    setBusy("name");
    try {
      const row = must(await sb().from("staff").update({ full_name: name.trim() }).eq("user_id", me.user_id).select().single()) as StaffRow;
      onProfile(row);
      toast("تم الحفظ");
    } catch (e2) {
      toast.error(e2);
    } finally {
      setBusy(null);
    }
  };
  const savePw = async (e: FormEvent) => {
    e.preventDefault();
    if (pw.a.length < 10) return toast("كلمة المرور يجب ألا تقل عن 10 حروف.", "error");
    if (pw.a !== pw.b) return toast("كلمتا المرور غير متطابقتين.", "error");
    setBusy("pw");
    const { error } = await sb().auth.updateUser({ password: pw.a });
    setBusy(null);
    if (error) toast.error(error);
    else {
      setPw({ a: "", b: "" });
      toast("تم تغيير كلمة المرور");
    }
  };

  return (
    <>
      <TopBar title="حسابي" sub={`${me.email} · ${ROLE_LABEL[me.role]}`} back="/staff/more" />
      <Card>
        <form onSubmit={saveName} className="grid gap-3">
          <Field label="اسمك">
            <Input value={name} onChange={(e) => setName(e.target.value)} maxLength={120} />
          </Field>
          <Button type="submit" icon="check" loading={busy === "name"}>
            حفظ الاسم
          </Button>
        </form>
      </Card>
      <Card className="mt-4">
        <form onSubmit={savePw} className="grid gap-3">
          <Field label="كلمة مرور جديدة" hint="10 حروف على الأقل.">
            <Input type="password" value={pw.a} onChange={(e) => setPw({ ...pw, a: e.target.value })} autoComplete="new-password" dir="ltr" />
          </Field>
          <Field label="تأكيد كلمة المرور">
            <Input type="password" value={pw.b} onChange={(e) => setPw({ ...pw, b: e.target.value })} autoComplete="new-password" dir="ltr" />
          </Field>
          <Button type="submit" icon="key" loading={busy === "pw"}>
            تغيير كلمة المرور
          </Button>
        </form>
      </Card>
      <div className="mt-4">
        <BiometricToggle />
      </div>
      <Button variant="danger" icon="logout" className="mt-6" block onClick={() => sb().auth.signOut()}>
        تسجيل الخروج
      </Button>
      {me.role !== "owner" && <DeleteAccountCard kind="staff" />}
    </>
  );
}

type AuditRow = { id: number; at: string; actor_email: string | null; action: string; entity: string; detail: Record<string, unknown> };
const ACTION_LABEL: Record<string, string> = {
  insert: "أضاف",
  update: "عدّل",
  delete: "حذف",
  set_pins: "أنشأ رموز دخول",
  bootstrap: "أنشأ حساب المالك",
  staff_create: "أضاف عضوًا للفريق",
  staff_password: "غيّر كلمة مرور عضو",
  staff_delete: "حذف عضوًا من الفريق",
};
const ENTITY_LABEL: Record<string, string> = { students: "طالب", staff: "عضو فريق", attendance_sessions: "جلسة حضور", materials: "محتوى", quizzes: "كويز" };

export function AuditScreen() {
  const { data, error, loading, reload } = useAsync(async () => must(await sb().from("audit_log").select("*").order("at", { ascending: false }).limit(200)) as AuditRow[], []);
  return (
    <>
      <TopBar title="سجل النشاط" sub="آخر 200 إجراء مهم" back="/staff/more" />
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data?.length ? (
        <Empty icon="list" title="لا يوجد نشاط بعد" />
      ) : (
        <List>
          {data.map((a) => (
            <div key={a.id} className="px-4 py-3">
              <p className="text-sm text-chalk">
                {ACTION_LABEL[a.action] ?? a.action} {a.action === "set_pins" ? `(${String(a.detail?.count ?? "")})` : ENTITY_LABEL[a.entity] ?? a.entity}
                {typeof a.detail?.name === "string" && a.detail.name ? `: ${a.detail.name}` : ""}
              </p>
              <p className="text-xs text-fog">
                <span dir="ltr">{a.actor_email ?? "النظام"}</span> · {fmt.dateTime(a.at)}
              </p>
            </div>
          ))}
        </List>
      )}
    </>
  );
}

/* ─── Attendance report ────────────────────────────────────────────────── */

type AttData = { now: string; sessions: { id: string; title: string; group: string; startsAt: string; closed: boolean }[]; records: [string, string, AttStatus][] };

function studentStats(s: Student, data: AttData, recs: Map<string, AttStatus>) {
  const c = { present: 0, late: 0, excused: 0, absent: 0, total: 0 };
  const created = new Date(s.createdAt).getTime() - 86_400_000;
  const stale = new Date(data.now).getTime() - 12 * 3_600_000;
  for (const sess of data.sessions) {
    const st = recs.get(`${sess.id}:${s.id}`);
    const relevant = st || ((sess.group === "" || sess.group === s.group) && new Date(sess.startsAt).getTime() >= created && (sess.closed || new Date(sess.startsAt).getTime() < stale));
    if (!relevant) continue;
    c.total++;
    c[st ?? "absent"]++;
  }
  const rate = c.total ? ((c.present + c.late + c.excused) / c.total) * 100 : 100;
  return { ...c, rate };
}

export function ReportsScreen() {
  const students = useStudents();
  const groups = useMemo(() => groupsOf(students.list), [students.list]);
  const [group, setGroup] = useState("");
  const { data, error, loading, reload } = useAsync(() => rpc<AttData>("staff_attendance_data", { p_group: group || null }), [group]);

  const rows = useMemo(() => {
    if (!data || !students.list) return [];
    const recs = new Map(data.records.map(([sess, st, status]) => [`${sess}:${st}`, status]));
    return students.list
      .filter((s) => s.active && (!group || s.group === group))
      .map((s) => ({ s, ...studentStats(s, data, recs) }))
      .sort((a, b) => a.rate - b.rate || a.s.name.localeCompare(b.s.name, "ar"));
  }, [data, students.list, group]);

  const avg = rows.length ? rows.reduce((a, r) => a + r.rate, 0) / rows.length : 0;
  const sessions = data?.sessions.filter((s) => !group || s.group === "" || s.group === group) ?? [];

  const exportSummary = () =>
    downloadCsv(`attendance-report-${group || "all"}.csv`, [
      ["الاسم", "رقم الطالب", "المجموعة", "حاضر", "متأخر", "بعذر", "غائب", "الجلسات", "نسبة الحضور"],
      ...rows.map((r) => [r.s.name, r.s.code, r.s.group, r.present, r.late, r.excused, r.absent, r.total, `${Math.round(r.rate)}%`]),
    ]);

  const exportSheet = () => {
    if (!data) return;
    const recs = new Map(data.records.map(([sess, st, status]) => [`${sess}:${st}`, status]));
    const short: Record<AttStatus, string> = { present: "ح", late: "م", excused: "ع", absent: "غ" };
    downloadCsv(`attendance-sheet-${group || "all"}.csv`, [
      ["الاسم", "رقم الطالب", ...sessions.map((s) => `${s.title} ${s.startsAt.slice(0, 10)}`)],
      ...rows.map((r) => [r.s.name, r.s.code, ...sessions.map((sess) => short[recs.get(`${sess.id}:${r.s.id}`) ?? "absent"])]),
      [],
      ["ح = حاضر، م = متأخر، ع = بعذر، غ = غائب"],
    ]);
  };

  return (
    <>
      <TopBar title="تقارير الحضور" sub="نسبة حضور كل طالب" back="/staff/more" />
      <div className="grid gap-3">
        <GroupSelect value={group} onChange={setGroup} groups={groups} />
        <div className="grid grid-cols-3 gap-2">
          <Stat label="الطلاب" value={rows.length} />
          <Stat label="الجلسات" value={sessions.length} />
          <Stat label="متوسط الحضور" value={fmt.pct(avg)} tone={avg >= 75 ? "ok" : "warn"} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Button icon="download" onClick={exportSummary} disabled={!rows.length}>
            ملخص Excel
          </Button>
          <Button icon="download" onClick={exportSheet} disabled={!rows.length}>
            كشف كامل
          </Button>
        </div>
      </div>
      <Section title="الطلاب (الأقل حضورًا أولًا)">
        {(loading && !data) || (students.loading && !students.list) ? (
          <Loading />
        ) : error ? (
          <ErrorBox error={error} retry={reload} />
        ) : !rows.length ? (
          <Empty icon="chart" title="لا توجد بيانات بعد" />
        ) : (
          <List>
            {rows.map((r) => (
              <div key={r.s.id} className="flex items-center gap-3 px-4 py-3">
                <Ring value={r.rate} size={46} stroke={5} />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-[15px] font-medium text-chalk">{r.s.name}</p>
                  <p className="truncate text-xs text-fog">
                    حاضر {r.present} · متأخر {r.late} · بعذر {r.excused} · <span className={cn(r.absent && "text-[#ff8794]")}>غائب {r.absent}</span>
                  </p>
                </div>
              </div>
            ))}
          </List>
        )}
      </Section>
    </>
  );
}
