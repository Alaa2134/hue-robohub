"use client";
/**
 * BuildX App → forms: build a form for the website (team tryouts, membership renewal, volunteers,
 * surveys…), open and close it by hand or on a schedule, cap the answers, and read the responses
 * (status, notes, WhatsApp, Excel).
 */
import { useEffect, useMemo, useState } from "react";
import { coreTeams } from "@/content/core-content";
import type { FieldType, FileAccept, FormField } from "@/components/forms/site-forms";
import { MediaError, mediaErrorText, prepareMedia } from "@/lib/client-media";
import { SUPABASE_URL } from "@/lib/supabase-public";
import { whatsappLink } from "@/lib/contact";
import { can, isFull, fmt, must, removeObjects, rpc, safeName, sb, today, uid, uploadObject, type StaffRow } from "./core";
import { sendOnWhatsApp } from "./wa-handoff";
import { downloadXlsx } from "./xlsx";
import { DelegationCard, DelegationSettings, ExpoRegister, MessageQueue, memberId, type Delegation } from "./expo-delegation";
import { AttendanceSettings, PassLinkRow, attendanceProblem, passLink, statusLink, type Attendance } from "./form-attendance";
import { SendQrButton } from "./wa-qr-send";
import { nameToEnglish } from "@/lib/translit";
import { FormPdfSheet } from "./form-pdf";
import { Badge, Button, Card, Chip, Empty, ErrorBox, Field, Icon, Input, List, Loading, Row, Section, Select, Sheet, Textarea, Toggle, TopBar, confirmDialog, copyText, go, toast, useAsync } from "./ui";

const SITE = "https://buildxhue.com";

type Form = {
  id: string;
  slug: string;
  title_ar: string;
  title_en: string | null;
  intro_ar: string | null;
  intro_en: string | null;
  success_ar: string | null;
  success_en: string | null;
  fields: FormField[];
  team: string | null;
  open: boolean;
  opens_at: string | null;
  closes_at: string | null;
  max_responses: number | null;
  listed: boolean;
  archived: boolean;
  accepted_ar: string | null;
  accepted_url: string | null;
  /** When the event happens; WhatsApp messages use it when the form has no QR-attendance session. */
  event_at?: string | null;
  delegation: Delegation | null;
  attendance: Attendance | null;
  capacity: number | null;
  background_path: string | null;
  background_kind: "image" | "video" | null;
  /** A fee for the form: the amount in EGP and how to pay, shown on the site. */
  payment?: Payment | null;
  created_at: string;
};
type Payment = { on: boolean; amount: number | null; note_ar?: string | null; note_en?: string | null };
type PaidMethod = "cash" | "vodafone_cash" | "instapay" | "bank" | "other";
const METHODS: { k: PaidMethod; ar: string }[] = [
  { k: "cash", ar: "كاش" },
  { k: "vodafone_cash", ar: "فودافون كاش" },
  { k: "instapay", ar: "إنستاباي" },
  { k: "bank", ar: "تحويل بنكي" },
  { k: "other", ar: "حاجة تانية" },
];
const methodAr = (k: string | null) => METHODS.find((m) => m.k === k)?.ar ?? "";
const egp = (n: number | null | undefined) => `${(n ?? 0).toLocaleString("ar-EG")} ج`;
type Response = {
  id: string;
  form_id: string;
  ref: string;
  answers: Record<string, string | string[]>;
  name: string | null;
  phone: string | null;
  email: string | null;
  locale: string;
  status: "new" | "accepted" | "rejected" | "waiting";
  note: string | null;
  external_done_at: string | null;
  member_no: number | null;
  accepted_at: string | null;
  checked_in_at: string | null;
  messaged_at: string | null;
  pass: string | null;
  paid_at: string | null;
  paid_amount: number | null;
  paid_method: PaidMethod | null;
  /** The name in English the team checked (for English lists). */
  name_en?: string | null;
  /** Groups the team put this person in after the form (a slot, a team, "on the bus"…). */
  tags?: string[];
  created_at: string;
};
/** Who else this person is: their other forms, membership, and join application. */
type Links = Record<string, { forms?: { title: string; status: Response["status"]; at: string }[]; member?: { code: string; active: boolean }; application?: { status: string; at: string } }>;

const TYPES: { k: FieldType; ar: string }[] = [
  { k: "name", ar: "الاسم" },
  { k: "phone", ar: "موبايل" },
  { k: "email", ar: "إيميل" },
  { k: "text", ar: "نص قصير" },
  { k: "textarea", ar: "نص طويل" },
  { k: "select", ar: "اختيار واحد" },
  { k: "multi", ar: "اختيارات متعددة" },
  { k: "number", ar: "رقم" },
  { k: "date", ar: "تاريخ" },
  { k: "url", ar: "رابط" },
  { k: "checkbox", ar: "موافقة (صح)" },
  { k: "member", ar: "رقم عضوية الكميونيتي" },
  { k: "file", ar: "ملف (صورة / PDF / فيديو)" },
];
const ACCEPTS: { k: FileAccept; ar: string }[] = [
  { k: "image", ar: "صورة" },
  { k: "pdf", ar: "PDF" },
  { k: "video", ar: "فيديو" },
  { k: "any", ar: "أي واحد منهم" },
];
const typeAr = (k: string) => TYPES.find((x) => x.k === k)?.ar ?? k;
const RESP: Record<Response["status"], { ar: string; tone: "info" | "ok" | "danger" | "warn" }> = {
  new: { ar: "جديد", tone: "info" },
  accepted: { ar: "مقبول", tone: "ok" },
  waiting: { ar: "قايمة انتظار", tone: "warn" },
  rejected: { ar: "مرفوض", tone: "danger" },
};

const fid = () => Math.random().toString(36).slice(2, 8);
const f = (type: FieldType, label_ar: string, label_en: string, required = true, options?: string[]): FormField => ({ id: fid(), type, label_ar, label_en, required, ...(options ? { options: options.map((ar) => ({ ar })) } : {}) });
const YEARS = ["أولى", "تانية", "تالتة", "رابعة", "خامسة", "خريج"];

const TEMPLATES: { k: string; ar: string; title: string; intro: string; team?: boolean; attendance?: () => Attendance; fields: () => FormField[] }[] = [
  {
    k: "tryout",
    ar: "اختبارات فريق مسابقة",
    title: "اختبارات فريق",
    intro: "عايز تبقى في الفريق؟ املأ الفورم وهنتواصل معاك بميعاد الاختبار.",
    team: true,
    fields: () => [
      f("name", "الاسم بالكامل", "Full name"),
      f("phone", "رقم الموبايل (واتساب)", "Mobile (WhatsApp)"),
      f("email", "الإيميل", "Email", false),
      f("select", "السنة الدراسية", "Academic year", true, YEARS),
      f("multi", "تقدر تساعد في إيه؟", "What can you help with?", true, ["ميكانيكا وتصميم", "إلكترونيات", "برمجة", "تحكم وحساسات", "إدارة وتنظيم"]),
      f("textarea", "احكيلنا عن خبرتك أو مشروع عملته", "Tell us about your experience or a project", false),
      f("select", "تقدر تحضر كام ساعة في الأسبوع؟", "Hours per week", true, ["أقل من 5", "5–10", "أكتر من 10"]),
      f("checkbox", "موافق إن الفريق يتواصل معايا", "I agree to be contacted by the team"),
    ],
  },
  {
    k: "renewal",
    ar: "تجديد عضوية",
    title: "تجديد العضوية",
    intro: "جدّد عضويتك في BuildX HUE للموسم الجديد.",
    fields: () => [f("name", "الاسم بالكامل", "Full name"), f("phone", "رقم الموبايل", "Mobile"), f("text", "كود الطالب في التطبيق", "Student code", false), f("select", "التراك", "Track", true, ["روبوتكس", "ذكاء اصطناعي", "سوفتوير", "IoT", "تصميم 3D", "ميديا", "بيزنس"]), f("select", "السنة الدراسية", "Academic year", true, YEARS), f("checkbox", "مكمّل معاكم الموسم ده", "I'm staying for this season")],
  },
  {
    k: "volunteer",
    ar: "متطوعين لإيفنت",
    title: "متطوعين",
    intro: "محتاجين إيدين تساعدنا في الإيفنت الجاي 🙌",
    fields: () => [f("name", "الاسم", "Name"), f("phone", "رقم الموبايل", "Mobile"), f("multi", "تحب تساعد في إيه؟", "Where would you like to help?", true, ["التنظيم والاستقبال", "التصوير والميديا", "الدعم التقني", "التسجيل والـ QR"]), f("multi", "الأيام المتاحة", "Available days", false, ["السبت", "الأحد", "الاتنين", "التلات", "الأربع", "الخميس"])],
  },
  {
    k: "survey",
    ar: "استبيان / رأي",
    title: "رأيك يهمنا",
    intro: "قولنا رأيك عشان نخلي BuildX أحسن.",
    fields: () => [f("select", "تقييمك العام", "Overall rating", true, ["⭐️⭐️⭐️⭐️⭐️ ممتاز", "⭐️⭐️⭐️⭐️ كويس جداً", "⭐️⭐️⭐️ كويس", "⭐️⭐️ محتاج تحسين", "⭐️ مش راضي"]), f("textarea", "إيه أكتر حاجة عجبتك؟", "What did you like most?", false), f("textarea", "إيه اللي نحسنه؟", "What should we improve?", false), f("name", "اسمك", "Your name", false)],
  },
  {
    k: "attend",
    ar: "كورس أو ورشة بحضور QR",
    title: "التسجيل في الكورس",
    intro: "سجّل وهيطلعلك QR احفظه على موبايلك، وبيه بنسجّل حضورك كل محاضرة.",
    attendance: () => ({ on: true, sessions: [1, 2, 3].map((n) => ({ id: `s_${fid()}`, name: `محاضرة ${n}`, at: null, only: null })) }),
    fields: () => [f("name", "الاسم بالكامل", "Full name"), f("phone", "رقم الموبايل (واتساب)", "Mobile (WhatsApp)"), f("select", "السنة الدراسية", "Academic year", true, YEARS)],
  },
  { k: "blank", ar: "فورم فاضي", title: "فورم جديد", intro: "", fields: () => [f("name", "الاسم", "Name"), f("phone", "رقم الموبايل", "Mobile")] },
];

/** Is the form taking answers right now (same rule as the database)? */
function liveState(x: Form, count: number) {
  const now = Date.now();
  if (x.archived) return { ar: "أرشيف", tone: "muted" as const };
  if (!x.open) return { ar: "مقفول", tone: "danger" as const };
  if (x.opens_at && new Date(x.opens_at).getTime() > now) return { ar: "هيفتح لوحده", tone: "warn" as const };
  if (x.closes_at && new Date(x.closes_at).getTime() <= now) return { ar: "قفل (الميعاد خلص)", tone: "danger" as const };
  if (x.max_responses && count >= x.max_responses) return { ar: "قفل (العدد كمل)", tone: "danger" as const };
  return { ar: "مفتوح", tone: "ok" as const };
}

const formLink = (slug: string) => (slug === "robotex-2026" ? `${SITE}/ar/robotex/` : `${SITE}/ar/form/?f=${encodeURIComponent(slug)}`);

export function FormsScreen() {
  const { data, error, loading, reload } = useAsync(async () => (await sb().from("forms").select("*, form_responses(count)").order("created_at", { ascending: false }).then(must)) as (Form & { form_responses: { count: number }[] })[], []);
  const [creating, setCreating] = useState(false);
  const [showArchived, setShowArchived] = useState(false);
  const list = (data ?? []).filter((x) => x.archived === showArchived);
  return (
    <>
      <TopBar title="الفورمات" sub="فورمات الموقع اللي بتتفتح وتتقفل" back="/staff/more" actions={<Button size="sm" variant="primary" icon="plus" onClick={() => setCreating(true)}>فورم جديد</Button>} />
      <div className="mt-3 flex gap-2">
        <Chip active={!showArchived} onClick={() => setShowArchived(false)}>
          الحالية
        </Chip>
        <Chip active={showArchived} onClick={() => setShowArchived(true)}>
          الأرشيف
        </Chip>
      </div>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !list.length ? (
        <Empty icon="list" title="مفيش فورمات لسه" body="اعمل فورم لاختبارات فريق، تجديد عضوية، متطوعين أو استبيان، وافتحه وقفله من هنا." action={<Button variant="primary" icon="plus" onClick={() => setCreating(true)}>فورم جديد</Button>} />
      ) : (
        <List className="mt-4">
          {list.map((x) => {
            const n = x.form_responses?.[0]?.count ?? 0;
            const st = liveState(x, n);
            return (
              <Row key={x.id} onClick={() => go(`/staff/forms/${x.id}`)}>
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-semibold text-chalk">{x.title_ar}</p>
                    <p className="mt-0.5 text-xs text-fog">
                      {n} رد{x.max_responses ? ` من ${x.max_responses}` : ""}
                      {x.closes_at ? ` · بيقفل ${fmt.dateTime(x.closes_at)}` : ""}
                      {x.team ? ` · ${coreTeams.find((t) => t.slug === x.team)?.nameAr ?? x.team}` : ""}
                    </p>
                  </div>
                  <Badge tone={st.tone}>{st.ar}</Badge>
                </div>
              </Row>
            );
          })}
        </List>
      )}
      <NewFormSheet open={creating} onClose={() => setCreating(false)} />
    </>
  );
}

function NewFormSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [busy, setBusy] = useState("");
  const create = async (k: string) => {
    const t = TEMPLATES.find((x) => x.k === k)!;
    setBusy(k);
    try {
      const slug = `${k}-${Date.now().toString(36).slice(-5)}`;
      const row = (await sb().from("forms").insert({ slug, title_ar: t.title, intro_ar: t.intro || null, fields: t.fields(), attendance: t.attendance?.() ?? null, open: false }).select("id").single().then(must)) as { id: string };
      onClose();
      go(`/staff/forms/${row.id}`);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy("");
    }
  };
  return (
    <Sheet open={open} onClose={onClose} title="فورم جديد">
      <p className="mb-3 text-sm text-mist">ابدأ من قالب وعدّل عليه براحتك. الفورم بيتعمل مقفول لحد ما تفتحه.</p>
      <div className="grid gap-2">
        {TEMPLATES.map((t) => (
          <Button key={t.k} block loading={busy === t.k} disabled={!!busy} onClick={() => create(t.k)} className="justify-start">
            {t.ar}
          </Button>
        ))}
      </div>
    </Sheet>
  );
}

const toLocal = (iso: string | null) => (iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "");
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

/** A picture or a short silent video behind the form on the website; compressed here before it is uploaded. */
function FormBackground({ form, onChange }: { form: Form; onChange: (p: Partial<Form>) => void }) {
  const [state, setState] = useState<{ text: string; busy: boolean }>({ text: "", busy: false });
  const url = form.background_path ? `${SUPABASE_URL}/storage/v1/object/public/form-media/${form.background_path.split("/").map(encodeURIComponent).join("/")}` : "";
  const pick = async (file: File | undefined) => {
    if (!file) return;
    setState({ text: "بنجهّز الملف وبنضغطه…", busy: true });
    try {
      const p = await prepareMedia(file, { accept: ["image", "video"], profile: "background", onProgress: (v) => setState({ text: `بنضغط الفيديو… ${Math.round(v * 100)}%`, busy: true }) });
      const path = `b/${uid()}/${safeName(p.file.name)}`;
      setState({ text: "بنرفع…", busy: true });
      await uploadObject(path, p.file, p.file.type, (v) => setState({ text: `بنرفع… ${Math.round(v * 100)}%`, busy: true }), "form-media");
      if (form.background_path) await removeObjects([form.background_path], "form-media").catch(() => undefined);
      onChange({ background_path: path, background_kind: p.kind === "video" ? "video" : "image" });
      setState({ text: `اترفع (${(p.before / 1_048_576).toFixed(1)} MB ← ${(p.after / 1_048_576).toFixed(1)} MB). اضغط «حفظ» عشان يظهر على الموقع.`, busy: false });
    } catch (e) {
      setState({ text: e instanceof MediaError ? mediaErrorText(e) : "الرفع فشل، جرّب تاني", busy: false });
    }
  };
  return (
    <Card className="grid gap-3">
      <p className="text-xs text-fog">صورة أو فيديو قصير (لحد 30 ثانية، من غير صوت) بيظهروا ورا الأسئلة على الموقع. بيتضغطوا قبل الرفع.</p>
      {url && (
        <div className="relative overflow-hidden rounded-xl border border-[var(--line)]">
          {form.background_kind === "video" ? <video src={url} muted loop autoPlay playsInline className="h-40 w-full object-cover" /> : <img src={url} alt="" className="h-40 w-full object-cover" />}
        </div>
      )}
      <input
        type="file"
        accept="image/*,video/*"
        disabled={state.busy}
        data-testid="form-bg-input"
        onChange={(e) => {
          void pick(e.target.files?.[0]);
          e.target.value = "";
        }}
        className="block w-full text-sm text-mist file:me-3 file:rounded-lg file:border-0 file:bg-volt/25 file:px-3 file:py-2 file:text-sm file:font-semibold file:text-chalk"
      />
      {state.text && (
        <p role="status" className="text-sm text-mist" data-testid="form-bg-status">
          {state.text}
        </p>
      )}
      {form.background_path && (
        <Button size="sm" variant="danger" icon="trash" disabled={state.busy} onClick={() => onChange({ background_path: null, background_kind: null })}>
          شيل الخلفية
        </Button>
      )}
    </Card>
  );
}

export function FormEditor({ id, me }: { id: string; me: StaffRow }) {
  const { data, error, loading, reload, set } = useAsync(async () => {
    const [form, count] = await Promise.all([
      sb().from("forms").select("*").eq("id", id).single().then(must) as Promise<Form>,
      sb().from("form_responses").select("id", { count: "exact", head: true }).eq("form_id", id),
    ]);
    return { form, count: count.count ?? 0 };
  }, [id]);
  const [busy, setBusy] = useState(false);
  const [dirty, setDirty] = useState(false);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  const x = data.form;
  const edit = (p: Partial<Form>) => {
    set({ ...data, form: { ...x, ...p } });
    setDirty(true);
  };
  const save = async (p: Partial<Form> = {}, msg = "اتحفظ") => {
    const next = { ...x, ...p };
    if (!/^[a-z0-9][a-z0-9-]{1,48}$/.test(next.slug)) return toast("الرابط المختصر: حروف إنجليزي صغيرة وأرقام و - بس", "error");
    if (next.title_ar.trim().length < 2) return toast("اكتب عنوان الفورم", "error");
    if (next.accepted_url && !/^https:\/\/\S+$/.test(next.accepted_url)) return toast("لينك ما بعد القبول لازم يبدأ بـ https://", "error");
    if (next.delegation?.register_url && !/^https:\/\/\S+$/.test(next.delegation.register_url)) return toast("لينك تسجيل الزوار لازم يبدأ بـ https://", "error");
    if (next.payment?.on && !(Number(next.payment.amount) > 0)) return toast("اكتب مبلغ الدفع", "error");
    const attendIssue = attendanceProblem(next.attendance);
    if (attendIssue) return toast(attendIssue, "error");
    for (const fl of next.fields) {
      if (!fl.label_ar.trim()) return toast("في سؤال من غير عنوان", "error");
      if ((fl.type === "select" || fl.type === "multi") && !(fl.options ?? []).length) return toast(`السؤال «${fl.label_ar}» محتاج اختيارات`, "error");
    }
    setBusy(true);
    try {
      const { id: _id, created_at: _c, ...row } = next;
      await sb().from("forms").update(row).eq("id", x.id).then(must);
      set({ ...data, form: next });
      setDirty(false);
      toast(msg);
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  const st = liveState(x, data.count);
  const fields = x.fields;
  const setField = (i: number, p: Partial<FormField>) => edit({ fields: fields.map((fl, j) => (j === i ? { ...fl, ...p } : fl)) });
  const move = (i: number, d: number) => {
    const j = i + d;
    if (j < 0 || j >= fields.length) return;
    const next = [...fields];
    [next[i], next[j]] = [next[j], next[i]];
    edit({ fields: next });
  };

  return (
    <>
      <TopBar title={x.title_ar} sub={<Badge tone={st.tone}>{st.ar}</Badge>} back="/staff/forms" actions={<Button size="sm" variant="primary" loading={busy} disabled={!dirty} onClick={() => save()}>حفظ</Button>} />

      <Card className={`mt-4 grid gap-3 ${st.tone === "ok" ? "border-ok/30" : ""}`}>
        <Toggle checked={x.open} disabled={busy} onChange={(v) => save({ open: v }, v ? "الفورم اتفتح على الموقع" : "الفورم اتقفل")} label={x.open ? "الفورم مفتوح" : "الفورم مقفول"} hint="بيتغيّر على الموقع على طول. الميعاد والعدد تحت بيقفلوه لوحده." />
        <div className="grid gap-3 sm:grid-cols-3">
          <Field label="يفتح لوحده في" hint="اختياري">
            <Input type="datetime-local" value={toLocal(x.opens_at)} onChange={(e) => edit({ opens_at: fromLocal(e.target.value) })} />
          </Field>
          <Field label="يقفل لوحده في" hint="اختياري">
            <Input type="datetime-local" value={toLocal(x.closes_at)} onChange={(e) => edit({ closes_at: fromLocal(e.target.value) })} />
          </Field>
          <Field label="أقصى عدد ردود" hint="اختياري">
            <Input type="number" min={1} inputMode="numeric" value={x.max_responses ?? ""} onChange={(e) => edit({ max_responses: e.target.value ? Math.max(1, Number(e.target.value)) : null })} />
          </Field>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" icon="copy" onClick={() => copyText(formLink(x.slug), "اتنسخ رابط الفورم")}>
            انسخ الرابط
          </Button>
          <a href={formLink(x.slug)} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line-2)] px-3 text-sm text-chalk">
            <Icon name="link" size={16} />
            افتحه
          </a>
          <Button size="sm" icon="list" onClick={() => go(`/staff/forms/${x.id}/responses`)}>
            الردود ({data.count})
          </Button>
        </div>
      </Card>

      <Section title="بيانات الفورم">
        <Card className="grid gap-3">
          <Field label="العنوان (عربي)">
            <Input value={x.title_ar} maxLength={160} onChange={(e) => edit({ title_ar: e.target.value })} />
          </Field>
          <Field label="Title (English)" hint="اختياري — لو فاضي بيظهر العربي">
            <Input dir="ltr" value={x.title_en ?? ""} maxLength={160} onChange={(e) => edit({ title_en: e.target.value || null })} />
          </Field>
          <Field label="مقدمة (عربي)">
            <Textarea rows={3} maxLength={2000} value={x.intro_ar ?? ""} onChange={(e) => edit({ intro_ar: e.target.value || null })} />
          </Field>
          <Field label="Intro (English)">
            <Textarea dir="ltr" rows={2} maxLength={2000} value={x.intro_en ?? ""} onChange={(e) => edit({ intro_en: e.target.value || null })} />
          </Field>
          <Field label="رسالة بعد الإرسال" hint="مثلاً: هنكلمك على واتساب بميعاد الاختبار">
            <Input maxLength={600} value={x.success_ar ?? ""} onChange={(e) => edit({ success_ar: e.target.value || null })} />
          </Field>
          <div className="grid gap-3 sm:grid-cols-2">
            <Field label="الرابط المختصر" hint={<span dir="ltr">{`/form/?f=${x.slug}`}</span>}>
              <Input dir="ltr" value={x.slug} maxLength={49} onChange={(e) => edit({ slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, "-") })} />
            </Field>
            <Field label="فريق مسابقة" hint="صفحة الفريق هيظهر فيها زرار «قدّم على الفريق» وهو مفتوح">
              <Select value={x.team ?? ""} onChange={(e) => edit({ team: e.target.value || null })}>
                <option value="">— مش لفريق —</option>
                {coreTeams.map((t) => (
                  <option key={t.slug} value={t.slug}>
                    {t.nameAr}
                  </option>
                ))}
              </Select>
            </Field>
          </div>
          <Toggle checked={x.listed} onChange={(v) => edit({ listed: v })} label="يظهر في صفحة «الفورمات المفتوحة»" hint="اقفلها لو عايز الفورم يوصل باللينك بس." />
        </Card>
      </Section>

      <Section title="خلفية الفورم">
        <FormBackground form={x} onChange={(p) => edit(p)} />
      </Section>

      <Section title="بعد القبول">
        <Card className="grid gap-3">
          <p className="text-xs text-fog">اللي بيتقبل بيشوف الرسالة دي واللينك لما يتابع طلبه بكود الطلب، ويقدر يقول إنه سجّل في اللينك (زي موقع تسجيل المعرض).</p>
          <Field label="رسالة للمقبولين">
            <Textarea rows={3} maxLength={1000} value={x.accepted_ar ?? ""} onChange={(e) => edit({ accepted_ar: e.target.value || null })} />
          </Field>
          <Field label="لينك الخطوة الجاية" hint="اختياري — مثلاً تسجيل الزوار في موقع المعرض">
            <Input dir="ltr" placeholder="https://" value={x.accepted_url ?? ""} maxLength={300} onChange={(e) => edit({ accepted_url: e.target.value.trim() || null })} />
          </Field>
          <Field label="ميعاد الفعالية" hint="اختياري — بيتكتب في رسالة القبول على واتساب. لو الفورم فيه «الحضور بالـ QR» بياخد أول موعد منه.">
            <Input type="datetime-local" data-testid="form-event-at" value={toLocal(x.event_at ?? null)} onChange={(e) => edit({ event_at: fromLocal(e.target.value) })} />
          </Field>
        </Card>
      </Section>

      <Section title="الدفع">
        <PaymentSettings value={x.payment ?? null} onChange={(payment) => edit({ payment })} />
      </Section>

      <Section title="الحضور بالـ QR">
        <AttendanceSettings value={x.attendance ?? null} fields={fields} onChange={(a) => edit({ attendance: a })} />
      </Section>

      <Section title="وفد (زيارة معرض أو فعالية)">
        <DelegationSettings
          delegation={x.delegation ?? null}
          capacity={x.capacity ?? null}
          dayOptions={(fields.find((q) => q.id === "day" && q.type === "select")?.options ?? []).map((o) => o.ar)}
          onChange={(p) => edit(p)}
        />
      </Section>

      <Section title={`الأسئلة (${fields.length})`}>
        <div className="grid gap-3">
          {fields.map((fl, i) => (
            <Card key={fl.id} className="grid gap-3">
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs text-fog">{i + 1}</span>
                <Select value={fl.type} onChange={(e) => setField(i, { type: e.target.value as FieldType, ...(["select", "multi"].includes(e.target.value) && !fl.options?.length ? { options: [{ ar: "اختيار 1" }, { ar: "اختيار 2" }] } : {}) })} className="max-w-44">
                  {TYPES.map((t) => (
                    <option key={t.k} value={t.k}>
                      {t.ar}
                    </option>
                  ))}
                </Select>
                <label className="ms-auto flex items-center gap-1.5 text-sm text-mist">
                  <input type="checkbox" className="size-4 accent-[#2b6dff]" checked={!!fl.required} onChange={(e) => setField(i, { required: e.target.checked })} />
                  مطلوب
                </label>
                <button type="button" aria-label="لفوق" onClick={() => move(i, -1)} className="rounded-lg p-1.5 text-fog hover:text-chalk">
                  ↑
                </button>
                <button type="button" aria-label="لتحت" onClick={() => move(i, 1)} className="rounded-lg p-1.5 text-fog hover:text-chalk">
                  ↓
                </button>
                <button type="button" aria-label="امسح السؤال" onClick={() => edit({ fields: fields.filter((_, j) => j !== i) })} className="rounded-lg p-1.5 text-[#ff9aa5]">
                  <Icon name="trash" size={16} />
                </button>
              </div>
              <div className="grid gap-2 sm:grid-cols-2">
                <Input placeholder="السؤال بالعربي" value={fl.label_ar} maxLength={200} onChange={(e) => setField(i, { label_ar: e.target.value })} />
                <Input dir="ltr" placeholder="Question (English, optional)" value={fl.label_en ?? ""} maxLength={200} onChange={(e) => setField(i, { label_en: e.target.value })} />
              </div>
              {(fl.type === "select" || fl.type === "multi") && (
                <Field label="الاختيارات" hint="كل اختيار في سطر">
                  <Textarea
                    rows={Math.min(8, Math.max(3, (fl.options ?? []).length + 1))}
                    value={(fl.options ?? []).map((o) => o.ar).join("\n")}
                    onChange={(e) => setField(i, { options: e.target.value.split("\n").map((s) => s.trimStart()).filter((s, k, all) => s || k === all.length - 1).map((ar) => ({ ar })) })}
                    onBlur={() => setField(i, { options: (fl.options ?? []).map((o) => ({ ar: o.ar.trim() })).filter((o) => o.ar) })}
                  />
                </Field>
              )}
              {fl.type === "file" && (
                <Field label="بيقبل إيه؟" hint="الصور والفيديو بتتضغط في متصفح الزائر قبل ما تتبعت. الـPDF لازم يكون أقل من 10 ميجا.">
                  <Select value={fl.accept ?? "image"} onChange={(e) => setField(i, { accept: e.target.value as FileAccept })}>
                    {ACCEPTS.map((o) => (
                      <option key={o.k} value={o.k}>
                        {o.ar}
                      </option>
                    ))}
                  </Select>
                </Field>
              )}
              <Input placeholder="توضيح تحت السؤال (اختياري)" value={fl.help_ar ?? ""} maxLength={300} onChange={(e) => setField(i, { help_ar: e.target.value })} />
            </Card>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              icon="plus"
              disabled={fields.length >= 40 || fields.some((q) => q.receipt)}
              onClick={() =>
                edit({
                  payment: { on: true, amount: x.payment?.amount ?? null, note_ar: x.payment?.note_ar ?? null, note_en: x.payment?.note_en ?? null },
                  fields: [...fields, { ...f("file", "صورة إيصال الدفع", "Payment receipt (photo)", true), accept: "image", receipt: true, help_ar: "حوّل المبلغ وارفع صورة الإيصال أو سكرين شوت التحويل." }],
                })
              }
              data-testid="add-receipt"
            >
              خانة دفع (إيصال)
            </Button>
            {(["name", "phone", "text", "textarea", "select", "multi", "checkbox", "member", "file"] as FieldType[]).map((k) => (
              <Button key={k} size="sm" icon="plus" disabled={fields.length >= 40} onClick={() => edit({ fields: [...fields, f(k, "", "", k !== "textarea", k === "select" || k === "multi" ? ["اختيار 1", "اختيار 2"] : undefined)] })}>
                {typeAr(k)}
              </Button>
            ))}
          </div>
          <p className="text-xs text-fog">الرد بيتحفظ مرة واحدة لكل رقم موبايل أو إيميل، والموقع بيراجع الإجابات قبل ما يقبلها. سؤال «رقم عضوية الكميونيتي» بيقبل الأعضاء المفعّلين بس، واللي مش عضو بيلاقي لينك يطلب انترفيو.</p>
        </div>
      </Section>

      <div className="mt-6 flex flex-wrap gap-2">
        <Button variant="primary" loading={busy} disabled={!dirty} onClick={() => save()}>
          حفظ التعديلات
        </Button>
        <Button
          onClick={async () => {
            if (!x.archived && !(await confirmDialog({ title: "تودّي الفورم للأرشيف؟", body: "هيتقفل ويختفي من الموقع، والردود هتفضل محفوظة.", ok: "أرشيف" }))) return;
            await save({ archived: !x.archived, open: false }, x.archived ? "رجع من الأرشيف" : "اتنقل للأرشيف");
          }}
        >
          {x.archived ? "رجّعه من الأرشيف" : "أرشيف"}
        </Button>
        {isFull(me) && (
          <Button
            variant="danger"
            icon="trash"
            onClick={async () => {
              if (!(await confirmDialog({ title: "مسح الفورم وكل ردوده؟", body: `${data.count} رد هيتمسحوا ومش هترجع.`, ok: "امسح", danger: true }))) return;
              try {
                await sb().from("forms").delete().eq("id", x.id).then(must);
                go("/staff/forms", true);
              } catch (e) {
                toast.error(e);
              }
            }}
          >
            مسح
          </Button>
        )}
      </div>
    </>
  );
}

/** Under a name in the list: their groups, and whether they're a member or applied elsewhere. */
function LinkBadges({ r, links }: { r: Response; links?: Links[string] }) {
  const tags = r.tags ?? [];
  const others = links?.forms?.length ?? 0;
  if (!tags.length && !others && !links?.member) return null;
  return (
    <div className="mt-1 flex flex-wrap gap-1" data-testid="link-badges">
      {tags.slice(0, 3).map((t) => (
        <span key={t} className="rounded-full bg-volt/20 px-2 py-0.5 text-[11px] text-chalk">
          {t}
        </span>
      ))}
      {tags.length > 3 && <span className="text-[11px] text-fog">+{tags.length - 3}</span>}
      {links?.member && <span className={`rounded-full px-2 py-0.5 text-[11px] ${links.member.active ? "bg-ok/20 text-ok" : "bg-white/10 text-fog"}`}>{links.member.active ? "عضو" : "عضو سابق"}</span>}
      {others > 0 && <span className="rounded-full bg-[#ff7a45]/20 px-2 py-0.5 text-[11px] text-[#ffb08a]">مقدّم على {others} فورم تاني</span>}
    </div>
  );
}

/** In a response: the person's other forms, membership and join application. */
function PersonLinks({ info }: { info?: Links[string] }) {
  if (!info) return null;
  return (
    <Card className="grid gap-2 border-[#ff7a45]/30" data-testid="person-links">
      <p className="text-sm font-semibold text-chalk">نفس الشخص في حاجات تانية</p>
      {info.member && (
        <p className="text-sm text-mist">
          {info.member.active ? "عضو في الكوميونيتي" : "كان عضو (العضوية خلصت)"} · كود <span dir="ltr" className="font-mono">{info.member.code}</span>
        </p>
      )}
      {info.application && <p className="text-sm text-mist">قدّم على الانضمام · {fmt.day(info.application.at)}</p>}
      {(info.forms ?? []).map((x, i) => (
        <div key={i} className="flex items-center justify-between gap-2 text-sm">
          <span className="min-w-0 truncate text-chalk">{x.title}</span>
          <span className="flex shrink-0 items-center gap-2 text-xs text-fog">
            {fmt.day(x.at)} <Badge tone={RESP[x.status]?.tone ?? "info"}>{RESP[x.status]?.ar ?? x.status}</Badge>
          </span>
        </div>
      ))}
    </Card>
  );
}

/** A response's groups: tap one to take it off, or type a new one. */
function GroupEditor({ r, groups, onChange }: { r: Response; groups: string[]; onChange: (tags: string[]) => void }) {
  const [name, setName] = useState("");
  const tags = r.tags ?? [];
  const add = (g: string) => {
    const t = g.trim().slice(0, 40);
    if (t && !tags.includes(t)) onChange([...tags, t]);
    setName("");
  };
  return (
    <Field label="المجموعات" hint="مثلاً: ورشة السبت، فريق 2، راكب الباص. بتفلتر بيها وتطلّع PDF لكل مجموعة.">
      <div className="grid gap-2" data-testid="group-editor">
        <div className="flex flex-wrap gap-2">
          {tags.map((t) => (
            <Chip key={t} active onClick={() => onChange(tags.filter((x) => x !== t))}>
              {t} ✕
            </Chip>
          ))}
          {groups
            .filter((g) => !tags.includes(g))
            .slice(0, 8)
            .map((g) => (
              <Chip key={g} onClick={() => add(g)}>
                + {g}
              </Chip>
            ))}
        </div>
        <div className="flex gap-2">
          <Input placeholder="مجموعة جديدة" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && add(name)} />
          <Button size="sm" disabled={!name.trim()} onClick={() => add(name)}>
            ضيف
          </Button>
        </div>
      </div>
    </Field>
  );
}

/** Put the ticked people in a group, or take them out of one. */
function GroupSheet({ count, groups, busy, onClose, onApply }: { count: number; groups: string[]; busy: boolean; onClose: () => void; onApply: (g: string, on: boolean) => Promise<void> }) {
  const [name, setName] = useState("");
  return (
    <Sheet open onClose={onClose} title={`مجموعة للمحددين (${count})`}>
      <div className="grid gap-3" data-testid="group-sheet">
        <Field label="اسم المجموعة" hint="اختار واحدة موجودة أو اكتب اسم جديد.">
          <Input value={name} maxLength={40} placeholder="مثلاً: ورشة السبت" onChange={(e) => setName(e.target.value)} />
        </Field>
        {groups.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {groups.map((g) => (
              <Chip key={g} active={name === g} onClick={() => setName(g)}>
                {g}
              </Chip>
            ))}
          </div>
        )}
        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" loading={busy} disabled={!name.trim()} onClick={() => void onApply(name, true)} data-testid="group-apply">
            حطّهم فيها
          </Button>
          <Button disabled={!name.trim() || busy} onClick={() => void onApply(name, false)}>
            شيلهم منها
          </Button>
        </div>
      </div>
    </Sheet>
  );
}

/** Paid / not yet, how much was collected and what's still owed. */
function PaymentSummary({ form, responses }: { form: Form; responses: Response[] }) {
  const live = responses.filter((r) => r.status !== "rejected");
  const paid = live.filter((r) => r.paid_at);
  const collected = paid.reduce((a, r) => a + Number(r.paid_amount ?? 0), 0);
  const owed = (live.length - paid.length) * Number(form.payment?.amount ?? 0);
  return (
    <Card className="mt-3 grid grid-cols-3 gap-2 text-center" data-testid="payment-summary">
      <div>
        <p className="text-2xl font-bold text-ok">{paid.length}</p>
        <p className="text-xs text-fog">دفعوا</p>
      </div>
      <div>
        <p className="text-2xl font-bold text-warn">{live.length - paid.length}</p>
        <p className="text-xs text-fog">لسه</p>
      </div>
      <div>
        <p className="text-lg font-bold text-chalk">{egp(collected)}</p>
        <p className="text-xs text-fog">اتجمع{owed > 0 ? ` · فاضل ${egp(owed)}` : ""}</p>
      </div>
    </Card>
  );
}

/** One response: paid or not, by which method, and the amount (defaults to the form's fee). */
function PaidControl({ r, amount, onMark, onAmount }: { r: Response; amount: number | null; onMark: (paid: boolean, method: PaidMethod) => void; onAmount: (n: number) => void }) {
  return (
    <Card className={`grid gap-3 ${r.paid_at ? "border-ok/40" : "border-warn/40"}`} data-testid="paid-control">
      <Toggle checked={!!r.paid_at} onChange={(v) => onMark(v, r.paid_method ?? "cash")} label={r.paid_at ? `دفع ${egp(r.paid_amount ?? amount)}` : `لسه مدفعش (${egp(amount)})`} hint={r.paid_at ? `اتعلّم ${fmt.dateTime(r.paid_at)}${r.paid_method ? ` · ${methodAr(r.paid_method)}` : ""}` : "علّمه لما الفلوس توصل."} />
      {r.paid_at && (
        <div className="grid grid-cols-2 gap-2">
          <Field label="طريقة الدفع">
            <Select value={r.paid_method ?? "cash"} onChange={(e) => onMark(true, e.target.value as PaidMethod)}>
              {METHODS.map((m) => (
                <option key={m.k} value={m.k}>
                  {m.ar}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="المبلغ اللي اتدفع">
            <Input type="number" min={0} inputMode="numeric" defaultValue={r.paid_amount ?? amount ?? ""} onBlur={(e) => e.target.value && Number(e.target.value) !== Number(r.paid_amount) && onAmount(Math.max(0, Number(e.target.value)))} />
          </Field>
        </div>
      )}
    </Card>
  );
}

/** Does the form ask for a fee, how much, and how to pay (shown on the form and the status page). */
function PaymentSettings({ value, onChange }: { value: Payment | null; onChange: (p: Payment | null) => void }) {
  const v = value ?? { on: false, amount: null };
  const set = (p: Partial<Payment>) => onChange({ ...v, ...p });
  return (
    <Card className="grid gap-3">
      <Toggle checked={v.on} onChange={(on) => set({ on })} label={v.on ? "الفورم ده بفلوس" : "الفورم ده مجاني"} hint="لما يبقى بفلوس، الموقع بيعرض المبلغ وطريقة الدفع، وتقدر تعلّم في الردود مين دفع ومين لسه." />
      {v.on && (
        <>
          <Field label="المبلغ (جنيه)">
            <Input type="number" min={1} inputMode="numeric" value={v.amount ?? ""} onChange={(e) => set({ amount: e.target.value ? Math.max(0, Number(e.target.value)) : null })} data-testid="payment-amount" />
          </Field>
          <Field label="إزاي يدفع" hint="مثلاً: فودافون كاش على 010… أو كاش مع المسؤول. بيظهر في الفورم وفي صفحة متابعة الطلب.">
            <Textarea rows={2} maxLength={600} value={v.note_ar ?? ""} onChange={(e) => set({ note_ar: e.target.value || null })} />
          </Field>
          <Field label="How to pay (English)" hint="اختياري">
            <Textarea dir="ltr" rows={2} maxLength={600} value={v.note_en ?? ""} onChange={(e) => set({ note_en: e.target.value || null })} />
          </Field>
        </>
      )}
    </Card>
  );
}

/**
 * An attached file, shown right in the response (photos as a picture, videos playable, PDFs as a link)
 * through a short-lived private link, only for whoever may read the responses. Tapping a photo opens it
 * full size; the link is ready before the tap, so phones don't block it as a pop-up.
 */
function FileAnswer({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    sb()
      .storage.from("form-files")
      .createSignedUrl(path, 3600)
      .then(({ data, error }) => {
        if (!live) return;
        if (error || !data) setFailed(true);
        else setUrl(data.signedUrl);
      });
    return () => {
      live = false;
    };
  }, [path]);
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  if (failed) return <p className="text-sm text-[#ff9aa5]">الملف مش متاح (ممكن يكون اتمسح أو ملكش صلاحية تشوفه).</p>;
  if (!url) return <div className="h-40 w-full max-w-xs animate-pulse rounded-xl bg-white/5" aria-label="بيحمّل الملف" />;
  if (["jpg", "jpeg", "png", "webp"].includes(ext))
    return (
      <a href={url} target="_blank" rel="noopener noreferrer" className="block w-fit" data-testid="file-image">
        <img src={url} alt="الصورة المرفقة" className="max-h-72 max-w-full rounded-xl border border-[var(--line-2)] object-contain" loading="lazy" />
        <span className="mt-1 block text-xs text-cyan">اضغط عشان تفتحها بالحجم الكامل</span>
      </a>
    );
  if (["mp4", "webm"].includes(ext)) return <video src={url} controls playsInline className="max-h-72 w-full max-w-sm rounded-xl border border-[var(--line-2)]" />;
  return (
    <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex h-9 items-center gap-1.5 rounded-xl border border-[var(--line-2)] px-3 text-sm text-chalk">
      <Icon name="external" size={16} />
      فتح الملف (PDF)
    </a>
  );
}

/** Add someone by hand, or correct a response's answers (uploaded files stay as sent). */
function ResponseEditor({ form, r, onClose, onSaved }: { form: Form; r: Response | null; onClose: () => void; onSaved: (r: Response, isNew: boolean) => void }) {
  const [a, setA] = useState<Record<string, string | string[]>>(() => ({ ...(r?.answers ?? {}) }));
  const [status, setStatus] = useState<Response["status"]>(r?.status ?? "accepted");
  const [busy, setBusy] = useState(false);
  const fields = form.fields.filter((fl) => fl.type !== "file");
  const str = (id: string) => (typeof a[id] === "string" ? (a[id] as string) : "");
  const save = async () => {
    if (!fields.some((fl) => (fl.type === "name" || fl.type === "phone") && str(fl.id).trim())) return toast("اكتب الاسم أو رقم الموبايل على الأقل", "error");
    setBusy(true);
    try {
      const out = await rpc<{ ok: boolean; error?: string; response?: Response }>("staff_form_response_save", { p_form: form.id, p_response: r?.id ?? null, p_answers: a, p_status: r ? null : status });
      if (!out.ok || !out.response) throw new Error(out.error ?? "save_failed");
      onSaved(out.response, !r);
      toast(r ? "اتعدّلت البيانات" : `اتضاف (كود ${out.response.ref})`);
      onClose();
    } catch (e) {
      toast.error(e);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet open onClose={onClose} title={r ? `تعديل بيانات ${r.name ?? r.ref}` : "إضافة حد بإيدك"}>
      <div className="grid gap-3" data-testid="response-editor">
        {!r && <p className="text-xs text-fog">للي سجّل بالتليفون أو جه من غير ما يملا الفورم. الملفات (صور وPDF) مش بتترفع من هنا.</p>}
        {fields.map((fl) => (
          <Field key={fl.id} label={fl.label_ar}>
            {fl.type === "textarea" ? (
              <Textarea rows={3} maxLength={4000} value={str(fl.id)} onChange={(e) => setA({ ...a, [fl.id]: e.target.value })} />
            ) : fl.type === "select" ? (
              <Select value={str(fl.id)} onChange={(e) => setA({ ...a, [fl.id]: e.target.value })}>
                <option value="">—</option>
                {(fl.options ?? []).map((o) => (
                  <option key={o.ar} value={o.ar}>
                    {o.ar}
                  </option>
                ))}
              </Select>
            ) : fl.type === "multi" ? (
              <div className="flex flex-wrap gap-2">
                {(fl.options ?? []).map((o) => {
                  const list = Array.isArray(a[fl.id]) ? (a[fl.id] as string[]) : [];
                  const on = list.includes(o.ar);
                  return (
                    <Chip key={o.ar} active={on} onClick={() => setA({ ...a, [fl.id]: on ? list.filter((x) => x !== o.ar) : [...list, o.ar] })}>
                      {o.ar}
                    </Chip>
                  );
                })}
              </div>
            ) : fl.type === "checkbox" ? (
              <Toggle checked={!!str(fl.id)} onChange={(v) => setA({ ...a, [fl.id]: v ? "نعم" : "" })} label={str(fl.id) ? "نعم" : "لا"} />
            ) : (
              <Input
                dir={["phone", "email", "url", "number", "member"].includes(fl.type) ? "ltr" : undefined}
                type={fl.type === "date" ? "date" : fl.type === "email" ? "email" : "text"}
                inputMode={fl.type === "phone" || fl.type === "number" ? "tel" : undefined}
                maxLength={500}
                value={str(fl.id)}
                onChange={(e) => setA({ ...a, [fl.id]: e.target.value })}
              />
            )}
          </Field>
        ))}
        {!r && (
          <Field label="الحالة">
            <Select value={status} onChange={(e) => setStatus(e.target.value as Response["status"])}>
              {(Object.keys(RESP) as Response["status"][]).map((k) => (
                <option key={k} value={k}>
                  {RESP[k].ar}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <Button variant="primary" loading={busy} onClick={() => void save()} data-testid="response-save">
          {r ? "احفظ التعديل" : "أضف"}
        </Button>
      </div>
    </Sheet>
  );
}

export function FormResponses({ id, me }: { id: string; me?: StaffRow }) {
  const { data, error, loading, reload, set } = useAsync(async () => {
    const [form, responses] = await Promise.all([
      sb().from("forms").select("*").eq("id", id).single().then(must) as Promise<Form>,
      sb().from("form_responses").select("*").eq("form_id", id).order("created_at", { ascending: false }).limit(5000).then(must) as Promise<Response[]>,
    ]);
    return { form, responses };
  }, [id]);
  const links = useAsync(async () => ((await rpc<Links>("staff_form_links", { p_form: id }).catch(() => ({}))) ?? {}) as Links, [id]);
  const [filter, setFilter] = useState<"all" | Response["status"]>("all");
  const [group, setGroup] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [grouping, setGrouping] = useState(false);
  const [payFilter, setPayFilter] = useState<"all" | "paid" | "unpaid">("all");
  const [open, setOpen] = useState<Response | null>(null);
  const [pick, setPick] = useState<Set<string> | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [queue, setQueue] = useState(false);
  const [editing, setEditing] = useState<Response | "new" | null>(null);
  const [pdfOpen, setPdfOpen] = useState(false);
  const list = useMemo(
    () => {
      const needle = q.trim().toLowerCase();
      return (data?.responses ?? []).filter(
        (r) =>
          (filter === "all" || r.status === filter) &&
          (payFilter === "all" || (payFilter === "paid") === !!r.paid_at) &&
          (!group || (r.tags ?? []).includes(group)) &&
          (!needle || [r.name, r.phone, r.email, r.ref, ...Object.values(r.answers).flat()].some((v) => typeof v === "string" && v.toLowerCase().includes(needle))),
      );
    },
    [data, filter, payFilter, group, q],
  );
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  const { form } = data;
  const show = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join("، ") : (v ?? ""));
  const regUrl = form.delegation?.register_url || null;
  const external = !!form.accepted_url || !!regUrl;
  const paying = !!form.payment?.on;
  // The name in English next to the answers: the checked spelling, or one spelled from the Arabic.
  const hasName = form.fields.some((fl) => fl.type === "name");
  const exportXlsx = (only?: Response["status"]) => {
    const rows = data.responses.filter((r) => !only || r.status === only).sort((a, b) => a.created_at.localeCompare(b.created_at));
    downloadXlsx(`buildx-${form.slug}${only ? `-${only}` : ""}-${today()}.xlsx`, [
      ["#", "كود الطلب", "التاريخ", "الحالة", ...(form.delegation ? ["رقم الوفد"] : []), ...(paying ? ["الدفع", "المبلغ", "طريقة الدفع", "وقت الدفع"] : []), ...(groups.length ? ["المجموعات"] : []), ...form.fields.map((fl) => fl.label_ar), ...(hasName ? ["الاسم بالإنجليزي"] : []), ...(external ? ["سجّل في اللينك"] : []), "ملاحظة"],
      ...rows.map((r, i) => [
        i + 1,
        r.ref,
        fmt.dateTime(r.created_at),
        RESP[r.status].ar,
        ...(form.delegation ? [r.status === "accepted" ? memberId(r.member_no) : ""] : []),
        ...(paying ? [r.paid_at ? "دفع ✓" : "لسه", r.paid_at ? Number(r.paid_amount ?? 0) : "", methodAr(r.paid_method), r.paid_at ? fmt.dateTime(r.paid_at) : ""] : []),
        ...(groups.length ? [(r.tags ?? []).join("، ")] : []),
        ...form.fields.map((fl) => (fl.type === "file" && r.answers[fl.id] ? "ملف مرفق (افتحه من التطبيق)" : show(r.answers[fl.id]))),
        ...(hasName ? [r.name_en || nameToEnglish(r.name).text] : []),
        ...(external ? [r.external_done_at ? "✓ " + fmt.dateTime(r.external_done_at) : ""] : []),
        r.note,
      ]),
    ], { sheet: only === "accepted" ? "المقبولين" : "الردود" });
  };
  /** Mark paid (with the form's amount and a method) or back to not paid. */
  const markPaid = (r: Response, paid: boolean, method: PaidMethod | null = r.paid_method ?? "cash", quiet = false) =>
    update(r, paid ? { paid_at: r.paid_at ?? new Date().toISOString(), paid_method: method, paid_amount: r.paid_amount ?? form.payment?.amount ?? null } : { paid_at: null, paid_method: null, paid_amount: null }, quiet);
  /** Delete responses for good (admins only, like the database rule). Their uploaded files stay, so a
   * response restored from the activity log keeps its photos. */
  const remove = async (rs: Response[]) => {
    if (!rs.length) return false;
    const one = rs.length === 1;
    if (!(await confirmDialog({ title: one ? `تحذف ${rs[0].name ?? rs[0].ref}؟` : `تحذف ${rs.length} متقدّم؟`, body: "الرد هيتشال من الفورم والقوايم والكشوفات. لو حصل غلط، الأدمن يقدر يرجّعه من «سجل النشاط».", ok: "احذف", danger: true }))) return false;
    try {
      // Ask for the deleted ids back: a delete the database refuses removes nothing without an error.
      const del = ((await sb().from("form_responses").delete().in("id", rs.map((r) => r.id)).select("id").then(must)) ?? []) as { id: string }[];
      if (!del.length) throw new Error("مالكش صلاحية تحذف ردود (للأدمن بس).");
      const gone = new Set(del.map((r) => r.id));
      set((d) => {
        const cur = d ?? data;
        return { ...cur, responses: cur.responses.filter((x) => !gone.has(x.id)) };
      });
      setOpen((o) => (o && gone.has(o.id) ? null : o));
      setPick(null);
      toast(one ? "اتحذف" : `اتحذف ${gone.size}`);
      return true;
    } catch (e) {
      toast.error(e);
      return false;
    }
  };
  /** Every group used in this form, the biggest first. */
  const groups = Object.entries(
    data.responses.flatMap((r) => r.tags ?? []).reduce<Record<string, number>>((m, g) => ((m[g] = (m[g] ?? 0) + 1), m), {}),
  ).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  /** Put people in a group (or take them out), a few requests at a time. */
  const setGroupFor = async (rs: Response[], g: string, on: boolean) => {
    const name = g.trim().slice(0, 40);
    if (!name) return;
    const todo = rs.filter((r) => (r.tags ?? []).includes(name) !== on);
    setBulkBusy(true);
    let done = 0;
    for (let i = 0; i < todo.length; i += 8)
      done += (await Promise.all(todo.slice(i, i + 8).map((r) => update(r, { tags: on ? [...(r.tags ?? []), name] : (r.tags ?? []).filter((t) => t !== name) }, true)))).filter(Boolean).length;
    setBulkBusy(false);
    toast(on ? `${done} في «${name}»` : `${done} اتشالوا من «${name}»`);
  };
  const bulkPaid = async (paid: boolean) => {
    if (!pick?.size) return;
    const rows = data.responses.filter((r) => pick.has(r.id) && !!r.paid_at !== paid);
    setBulkBusy(true);
    let done = 0;
    for (const r of rows) if (await markPaid(r, paid, "cash", true)) done++;
    setBulkBusy(false);
    setPick(null);
    toast(paid ? `اتعلّم «دفع» على ${done}` : `اتشال الدفع من ${done}`);
  };
  const acceptMessage = (r: Response) =>
    form.delegation
      ? `أهلاً ${(r.name ?? "").split(/\s+/)[0]} 🎉\nاتقبلت واتسجّلت في وفد BuildX HUE لـ «${form.title_ar}».\nرقمك في الوفد: ${memberId(r.member_no)}${r.answers.day ? `\nيومك: ${r.answers.day}` : ""}\n${form.delegation.meet_ar ? `${form.delegation.meet_ar}\n` : ""}مش محتاج تسجّل في أي موقع، إحنا بنسجّلك وبنبعت الكشف لإدارة المعرض${form.delegation.register_url ? "، والبادج بيوصلك على إيميلك" : ""}.\nتصريحك من هنا (كود ${r.ref}): ${statusLink(form.slug, r.ref)}\nفريق BuildX HUE`
      : `أهلاً ${(r.name ?? "").split(/\s+/)[0]} 🎉\nاتقبلت في «${form.title_ar}».\n${form.accepted_url ? `سجّل في الرابط ده: ${form.accepted_url}\n` : ""}وتابع طلبك من هنا (كود ${r.ref}): ${statusLink(form.slug, r.ref)}\nفريق BuildX HUE`;
  const update = async (r: Response, p: Partial<Response>, quiet = false): Promise<Response | "full" | null> => {
    try {
      const saved = (await sb().from("form_responses").update(p).eq("id", r.id).select("*").single().then(must)) as Response | null;
      const next = { ...r, ...p, ...(saved ?? {}) };
      if (!quiet && p.status === "accepted" && form.delegation && next.status === "waiting") toast("الوفد كامل، فاتحط في قايمة الانتظار وهيدخل لوحده أول ما مكان يفضى.", "info");
      else if (!quiet && p.status === "accepted" && form.delegation && next.member_no) toast(`اتسجّل في الوفد برقم ${memberId(next.member_no)}`);
      set((d) => { const cur = d ?? data; return { ...cur, responses: cur.responses.map((x) => (x.id === r.id ? next : x)) }; });
      setOpen((o) => (o?.id === r.id ? next : o));
      return next;
    } catch (e) {
      const full = /delegation_full/.test((e as { message?: string })?.message ?? "");
      if (!quiet) {
        if (full) toast("الوفد كامل. زوّد العدد من إعدادات الفورم الأول.", "error");
        else toast.error(e);
      }
      return full ? "full" : null;
    }
  };
  /** Several at once (in order, so delegation numbers follow the list); stops when the delegation is full. */
  const bulk = async (status: Response["status"]) => {
    if (!pick?.size) return;
    const rows = data.responses.filter((r) => pick.has(r.id) && r.status !== status).sort((a, b) => a.created_at.localeCompare(b.created_at));
    setBulkBusy(true);
    let done = 0;
    let full = false;
    for (const r of rows) {
      const res = await update(r, { status }, true);
      if (res === "full") {
        full = true;
        break;
      }
      if (res) done++;
    }
    setBulkBusy(false);
    setPick(null);
    toast(`${RESP[status].ar}: ${done}${full ? ` · الوفد كمل، فاضل ${rows.length - done} مااتقبلوش` : ""}`, full ? "error" : undefined);
  };
  const togglePick = (r: Response) =>
    setPick((p) => {
      const n = new Set(p ?? []);
      if (n.has(r.id)) n.delete(r.id);
      else n.add(r.id);
      return n;
    });
  const count = (s: Response["status"]) => data.responses.filter((r) => r.status === s).length;
  /** Each person's own {link} (their QR, or their status page) and {code} in a WhatsApp message. */
  const waVars = (r: Response) => ({
    code: r.ref,
    link: form.attendance?.on && r.pass ? passLink(r.pass) : statusLink(form.slug, r.ref),
    ...(r.pass ? { pass: r.pass.toLowerCase() } : {}),
  });
  const first = form.fields.find((fl) => fl.type !== "name" && fl.type !== "phone" && fl.type !== "email" && fl.type !== "checkbox");
  return (
    <>
      <TopBar title={`ردود: ${form.title_ar}`} sub={`${data.responses.length} رد`} back={`/staff/forms/${id}`} actions={
          <div className="flex gap-2">
            <Button size="sm" icon="plus" onClick={() => setEditing("new")} data-testid="response-add">
              إضافة
            </Button>
            <Button size="sm" icon="download" disabled={!data.responses.length} onClick={() => setPdfOpen(true)} data-testid="form-pdf-open">
              PDF
            </Button>
            <Button size="sm" icon="download" disabled={!data.responses.length} onClick={() => exportXlsx()}>
              Excel
            </Button>
          </div>
        }
      />
      {form.delegation && (
        <DelegationCard
          form={form}
          responses={data.responses}
          actions={
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" icon="bell" disabled={!count("accepted")} onClick={() => setQueue(true)}>
                رسايل القبول ({data.responses.filter((r) => r.status === "accepted" && !r.messaged_at).length})
              </Button>
              <Button size="sm" icon="scan" disabled={!count("accepted")} onClick={() => go(`/staff/forms/${id}/checkin`)}>
                حضور يوم الزيارة
              </Button>
            </div>
          }
        />
      )}
      {form.attendance?.on && (
        <Card className="mt-3 flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm text-mist">كل واحد سجّل معاه QR للحضور. امسحه عند الدخول وشوف مين غاب.</p>
          {me && can(me, "whatsapp") && count("accepted") > 0 && <SendQrButton kind="form" id={id} />}
          <Button size="sm" variant="primary" icon="scan" onClick={() => go(`/staff/forms/${id}/attendance`)} data-testid="open-attendance">
            الحضور بالـ QR
          </Button>
        </Card>
      )}
      {queue && (
        <MessageQueue
          responses={data.responses}
          message={(r) => acceptMessage(r as Response)}
          phoneLink={(phone, text) => whatsappLink(phone, text)}
          onSent={(r) => void update(r as Response, { messaged_at: new Date().toISOString() }, true)}
          onClose={() => setQueue(false)}
        />
      )}
      {count("accepted") > 0 && !form.delegation && (
        <Card className="mt-3 flex flex-wrap items-center gap-2">
          <p className="flex-1 text-sm text-mist">
            {count("accepted")} مقبول{external ? ` · ${data.responses.filter((r) => r.status === "accepted" && r.external_done_at).length} سجّلوا في اللينك` : ""}
          </p>
          <Button size="sm" icon="download" onClick={() => exportXlsx("accepted")}>
            Excel المقبولين
          </Button>
        </Card>
      )}
      {paying && <PaymentSummary form={form} responses={data.responses} />}
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")} count={data.responses.length}>
          الكل
        </Chip>
        {(Object.keys(RESP) as Response["status"][]).map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)} count={count(s)}>
            {RESP[s].ar}
          </Chip>
        ))}
        {paying && (
          <>
            <Chip active={payFilter === "paid"} onClick={() => setPayFilter((v) => (v === "paid" ? "all" : "paid"))} count={data.responses.filter((r) => r.paid_at).length}>
              دفعوا
            </Chip>
            <Chip active={payFilter === "unpaid"} onClick={() => setPayFilter((v) => (v === "unpaid" ? "all" : "unpaid"))} count={data.responses.filter((r) => !r.paid_at && r.status !== "rejected").length}>
              لسه مدفعوش
            </Chip>
          </>
        )}
        <Chip active={!!pick} onClick={() => setPick((p) => (p ? null : new Set()))}>
          {pick ? "إلغاء التحديد" : "تحديد أكتر من واحد"}
        </Chip>
      </div>
      <div className="mt-3 grid gap-2">
        <Input type="search" placeholder="دوّر بالاسم أو الموبايل أو أي إجابة…" value={q} onChange={(e) => setQ(e.target.value)} data-testid="responses-search" />
        {groups.length > 0 && (
          <div className="flex flex-wrap items-center gap-2" data-testid="group-chips">
            <span className="text-xs text-fog">المجموعات:</span>
            {groups.map(([g, n]) => (
              <Chip key={g} active={group === g} onClick={() => setGroup((x) => (x === g ? null : g))} count={n}>
                {g}
              </Chip>
            ))}
          </div>
        )}
      </div>
      {pick && (
        <Card className="sticky top-2 z-20 mt-3 grid gap-2 border-cyan/40" data-testid="bulk-bar">
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm text-chalk">اتحدد {pick.size}</p>
            <Button size="sm" variant="ghost" onClick={() => setPick(new Set(list.map((r) => r.id)))}>
              حدد كل اللي ظاهرين ({list.length})
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <Button size="sm" variant="primary" disabled={!pick.size} loading={bulkBusy} onClick={() => void bulk("accepted")}>
              اقبل
            </Button>
            <Button size="sm" disabled={!pick.size || bulkBusy} onClick={() => void bulk("waiting")}>
              انتظار
            </Button>
            <Button size="sm" variant="danger" disabled={!pick.size || bulkBusy} onClick={() => void bulk("rejected")}>
              ارفض
            </Button>
          </div>
          <Button size="sm" icon="users" disabled={!pick.size || bulkBusy} onClick={() => setGrouping(true)} data-testid="bulk-group">
            حطّهم في مجموعة…
          </Button>
          <div className="grid grid-cols-2 gap-2">
            <Button size="sm" icon="download" disabled={!pick.size} onClick={() => setPdfOpen(true)}>
              PDF للمحددين
            </Button>
            {me && isFull(me) && (
              <Button size="sm" variant="danger" icon="trash" disabled={!pick.size || bulkBusy} onClick={() => void remove(data.responses.filter((r) => pick.has(r.id)))} data-testid="bulk-delete">
                احذف المحددين
              </Button>
            )}
          </div>
          {paying && (
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" disabled={!pick.size || bulkBusy} onClick={() => void bulkPaid(true)} data-testid="bulk-paid">
                علّمهم دفعوا
              </Button>
              <Button size="sm" variant="ghost" disabled={!pick.size || bulkBusy} onClick={() => void bulkPaid(false)}>
                شيل الدفع
              </Button>
            </div>
          )}
          {me && can(me, "whatsapp") && (
            <Button
              size="sm"
              icon="chat"
              disabled={!pick.size}
              onClick={() =>
                sendOnWhatsApp(
                  data.responses.filter((r) => pick.has(r.id)).map((r) => ({ ...r, vars: waVars(r) })),
                  { label: `المختارين من «${data.form.title_ar}» (${pick.size})`, context: data.form.delegation ? `expo:${id}` : `form:${id}` },
                )
              }
            >
              واتساب للمختارين ({pick.size})
            </Button>
          )}
        </Card>
      )}
      {!list.length ? (
        <Empty icon="list" title="مفيش ردود هنا" body="أول ما حد يملا الفورم على الموقع، رده بيظهر هنا." />
      ) : (
        <List className="mt-4 lg:grid lg:grid-cols-2 lg:gap-px lg:divide-y-0 lg:bg-[var(--line)]">
          {list.map((r) => (
            <Row key={r.id} className="lg:bg-[#0b1838]" onClick={() => (pick ? togglePick(r) : setOpen(r))}>
              <div className="flex items-center gap-3">
                {pick && <input type="checkbox" readOnly checked={pick.has(r.id)} className="size-4 shrink-0 accent-[#2f7bff]" aria-label={`تحديد ${r.name ?? r.ref}`} />}
                <div className="min-w-0 flex-1">
                  <p className="truncate font-semibold text-chalk">{r.name || r.phone || r.email || "—"}</p>
                  <p className="truncate text-xs text-fog">
                    <span dir="ltr" className="font-mono">{r.ref}</span> · {fmt.rel(r.created_at)}
                    {external && r.external_done_at ? " · سجّل ✓" : ""}
                    {form.delegation && r.status === "accepted" && r.member_no ? ` · ${memberId(r.member_no)}` : ""}
                    {first && r.answers[first.id] ? ` · ${show(r.answers[first.id])}` : ""}
                  </p>
                  <LinkBadges r={r} links={links.data?.[r.id]} />
                </div>
                {paying && r.status !== "rejected" && <Badge tone={r.paid_at ? "ok" : "warn"}>{r.paid_at ? "دفع" : "مدفعش"}</Badge>}
                <Badge tone={RESP[r.status].tone}>{RESP[r.status].ar}</Badge>
              </div>
            </Row>
          ))}
        </List>
      )}
      {grouping && pick && (
        <GroupSheet
          count={pick.size}
          groups={groups.map(([g]) => g)}
          busy={bulkBusy}
          onClose={() => setGrouping(false)}
          onApply={async (g, on) => {
            await setGroupFor(data.responses.filter((r) => pick.has(r.id)), g, on);
            setGrouping(false);
            setPick(null);
          }}
        />
      )}
      {pdfOpen && (
        <FormPdfSheet
          formId={form.id}
          title={form.title_ar}
          titleEn={form.title_en}
          onNamesSaved={(names) =>
            set((d) => {
              const cur = d ?? data;
              return { ...cur, responses: cur.responses.map((r) => (names[r.id] !== undefined ? { ...r, name_en: names[r.id] || null } : r)) };
            })
          }
          slug={form.slug}
          fields={form.fields}
          paying={paying}
          groups={groups.map(([g]) => g)}
          all={data.responses}
          shown={list}
          picked={pick ? data.responses.filter((r) => pick.has(r.id)) : []}
          onClose={() => setPdfOpen(false)}
        />
      )}
      {editing && (
        <ResponseEditor
          form={form}
          r={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
          onSaved={(saved, isNew) => {
            set((d) => {
              const cur = d ?? data;
              return { ...cur, responses: isNew ? [saved, ...cur.responses] : cur.responses.map((x) => (x.id === saved.id ? saved : x)) };
            });
            setOpen((o) => (o?.id === saved.id ? saved : o));
          }}
        />
      )}
      {open && (
        <Sheet open onClose={() => setOpen(null)} title={open.name || "رد"}>
          <div className="grid gap-4">
            <p className="text-xs text-fog">
              <span dir="ltr" className="font-mono">{open.ref}</span> · {fmt.dateTime(open.created_at)}
              {form.delegation && open.status === "accepted" && open.member_no ? (
                <>
                  {" · "}
                  <span className="font-semibold text-ok">في الوفد {memberId(open.member_no)}</span>
                </>
              ) : null}
            </p>
            <dl className="grid gap-3">
              {form.fields.map((fl) => (
                <div key={fl.id}>
                  <dt className="text-xs text-fog">{fl.label_ar}</dt>
                  <dd className="whitespace-pre-line text-chalk">
                    {fl.type === "file" && open.answers[fl.id] ? (
                      <FileAnswer path={String(open.answers[fl.id])} />
                    ) : ["phone", "email", "url", "number", "member"].includes(fl.type) ? (
                      <span dir="ltr">{show(open.answers[fl.id]) || "—"}</span>
                    ) : (
                      show(open.answers[fl.id]) || "—"
                    )}
                  </dd>
                </div>
              ))}
            </dl>
            <div className="grid grid-cols-2 gap-2">
              <Button size="sm" icon="edit" onClick={() => setEditing(open)} data-testid="response-edit">
                تعديل البيانات
              </Button>
              {me && isFull(me) && (
                <Button size="sm" variant="danger" icon="trash" onClick={() => void remove([open])} data-testid="response-delete">
                  حذف المتقدّم
                </Button>
              )}
            </div>
            {whatsappLink(open.phone) &&
              (open.status === "accepted" ? (
                <a href={whatsappLink(open.phone, acceptMessage(open))!} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center rounded-xl bg-[#1fa855] font-semibold text-white">
                  ابعتله رسالة القبول على واتساب
                </a>
              ) : (
                <a href={whatsappLink(open.phone, `أهلاً ${(open.name ?? "").split(/\s+/)[0]}، معاك فريق BuildX HUE بخصوص «${form.title_ar}».`)!} target="_blank" rel="noopener noreferrer" className="inline-flex h-11 items-center justify-center rounded-xl bg-[#1fa855] font-semibold text-white">
                  كلّمه على واتساب
                </a>
              ))}
            <GroupEditor r={open} groups={groups.map(([g]) => g)} onChange={(tags) => void update(open, { tags })} />
            <PersonLinks info={links.data?.[open.id]} />
            {form.attendance?.on && open.pass && <PassLinkRow pass={open.pass} phone={open.phone} name={open.name} title={form.title_ar} />}
            {open.status === "accepted" && (
              <Button size="sm" icon="copy" onClick={() => copyText(acceptMessage(open), "اتنسخت رسالة القبول")}>
                انسخ رسالة القبول
              </Button>
            )}
            <div className="flex flex-wrap gap-2">
              {(Object.keys(RESP) as Response["status"][]).map((s) => (
                <Chip key={s} active={open.status === s} onClick={() => update(open, { status: s })}>
                  {RESP[s].ar}
                </Chip>
              ))}
            </div>
            {paying && <PaidControl r={open} amount={form.payment?.amount ?? null} onMark={(paid, method) => markPaid(open, paid, method)} onAmount={(n) => update(open, { paid_amount: n })} />}
            {regUrl && open.status === "accepted" && <ExpoRegister url={regUrl} r={open} onMark={(v) => update(open, { external_done_at: v ? new Date().toISOString() : null })} />}
            {external && !regUrl && open.status === "accepted" && (
              <Toggle
                checked={!!open.external_done_at}
                onChange={(v) => update(open, { external_done_at: v ? new Date().toISOString() : null })}
                label="سجّل في اللينك (موقع المعرض)"
                hint={open.external_done_at ? `من ${fmt.dateTime(open.external_done_at)}` : "بيتعلّم لوحده لما الطالب يضغط «سجّلت» من صفحة متابعة الطلب."}
              />
            )}
            <Field label="ملاحظة داخلية">
              <Textarea rows={3} maxLength={2000} defaultValue={open.note ?? ""} onBlur={(e) => e.target.value !== (open.note ?? "") && update(open, { note: e.target.value })} />
            </Field>
          </div>
        </Sheet>
      )}
    </>
  );
}
