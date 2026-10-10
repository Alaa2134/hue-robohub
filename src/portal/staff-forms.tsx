"use client";
/**
 * BuildX App → forms: build a form for the website (team tryouts, membership renewal, volunteers,
 * surveys…), open and close it by hand or on a schedule, cap the answers, and read the responses
 * (status, notes, WhatsApp, Excel).
 */
import { useMemo, useState } from "react";
import { coreTeams } from "@/content/core-content";
import type { FieldType, FormField } from "@/components/forms/site-forms";
import { whatsappLink } from "@/lib/contact";
import { isFull, fmt, must, sb, today, type StaffRow } from "./core";
import { downloadXlsx } from "./xlsx";
import { DelegationCard, DelegationSettings, ExpoRegister, MessageQueue, memberId, type Delegation } from "./expo-delegation";
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
  delegation: Delegation | null;
  capacity: number | null;
  created_at: string;
};
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
  created_at: string;
};

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

const TEMPLATES: { k: string; ar: string; title: string; intro: string; team?: boolean; fields: () => FormField[] }[] = [
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
/** Where an applicant checks their status (and, once accepted, finds the next step). */
const statusLink = (slug: string, ref: string) =>
  slug === "robotex-2026" ? `${SITE}/ar/robotex/?ref=${encodeURIComponent(ref)}#status` : `${SITE}/ar/form/?f=${encodeURIComponent(slug)}&ref=${encodeURIComponent(ref)}#status`;

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
      const row = (await sb().from("forms").insert({ slug, title_ar: t.title, intro_ar: t.intro || null, fields: t.fields(), open: false }).select("id").single().then(must)) as { id: string };
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

      <Section title="بعد القبول">
        <Card className="grid gap-3">
          <p className="text-xs text-fog">اللي بيتقبل بيشوف الرسالة دي واللينك لما يتابع طلبه بكود الطلب، ويقدر يقول إنه سجّل في اللينك (زي موقع تسجيل المعرض).</p>
          <Field label="رسالة للمقبولين">
            <Textarea rows={3} maxLength={1000} value={x.accepted_ar ?? ""} onChange={(e) => edit({ accepted_ar: e.target.value || null })} />
          </Field>
          <Field label="لينك الخطوة الجاية" hint="اختياري — مثلاً تسجيل الزوار في موقع المعرض">
            <Input dir="ltr" placeholder="https://" value={x.accepted_url ?? ""} maxLength={300} onChange={(e) => edit({ accepted_url: e.target.value.trim() || null })} />
          </Field>
        </Card>
      </Section>

      <Section title="وفد (زيارة معرض أو فعالية)">
        <DelegationSettings delegation={x.delegation ?? null} capacity={x.capacity ?? null} onChange={(p) => edit(p)} />
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
              <Input placeholder="توضيح تحت السؤال (اختياري)" value={fl.help_ar ?? ""} maxLength={300} onChange={(e) => setField(i, { help_ar: e.target.value })} />
            </Card>
          ))}
          <div className="flex flex-wrap gap-2">
            {(["name", "phone", "text", "textarea", "select", "multi", "checkbox", "member"] as FieldType[]).map((k) => (
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

export function FormResponses({ id }: { id: string }) {
  const { data, error, loading, reload, set } = useAsync(async () => {
    const [form, responses] = await Promise.all([
      sb().from("forms").select("*").eq("id", id).single().then(must) as Promise<Form>,
      sb().from("form_responses").select("*").eq("form_id", id).order("created_at", { ascending: false }).limit(5000).then(must) as Promise<Response[]>,
    ]);
    return { form, responses };
  }, [id]);
  const [filter, setFilter] = useState<"all" | Response["status"]>("all");
  const [open, setOpen] = useState<Response | null>(null);
  const [pick, setPick] = useState<Set<string> | null>(null);
  const [bulkBusy, setBulkBusy] = useState(false);
  const [queue, setQueue] = useState(false);
  const list = useMemo(() => (data?.responses ?? []).filter((r) => filter === "all" || r.status === filter), [data, filter]);
  if (loading && !data) return <Loading />;
  if (error || !data) return <ErrorBox error={error} retry={reload} />;
  const { form } = data;
  const show = (v: string | string[] | undefined) => (Array.isArray(v) ? v.join("، ") : (v ?? ""));
  const regUrl = form.delegation?.register_url || null;
  const external = !!form.accepted_url || !!regUrl;
  const exportXlsx = (only?: Response["status"]) => {
    const rows = data.responses.filter((r) => !only || r.status === only).sort((a, b) => a.created_at.localeCompare(b.created_at));
    downloadXlsx(`buildx-${form.slug}${only ? `-${only}` : ""}-${today()}.xlsx`, [
      ["#", "كود الطلب", "التاريخ", "الحالة", ...(form.delegation ? ["رقم الوفد"] : []), ...form.fields.map((fl) => fl.label_ar), ...(external ? ["سجّل في اللينك"] : []), "ملاحظة"],
      ...rows.map((r, i) => [i + 1, r.ref, fmt.dateTime(r.created_at), RESP[r.status].ar, ...(form.delegation ? [r.status === "accepted" ? memberId(r.member_no) : ""] : []), ...form.fields.map((fl) => show(r.answers[fl.id])), ...(external ? [r.external_done_at ? "✓ " + fmt.dateTime(r.external_done_at) : ""] : []), r.note]),
    ], { sheet: only === "accepted" ? "المقبولين" : "الردود" });
  };
  const acceptMessage = (r: Response) =>
    form.delegation
      ? `أهلاً ${(r.name ?? "").split(/\s+/)[0]} 🎉\nاتقبلت واتسجّلت في وفد BuildX HUE لـ «${form.title_ar}».\nرقمك في الوفد: ${memberId(r.member_no)}${r.answers.day ? `\nيومك: ${r.answers.day}` : ""}\n${form.delegation.meet_ar ? `${form.delegation.meet_ar}\n` : ""}مش محتاج تسجّل في أي موقع، إحنا بنسجّلك وبنبعت الكشف لإدارة المعرض${form.delegation.register_url ? "، والبادج بيوصلك على إيميلك" : ""}.\nتصريحك من هنا (كود ${r.ref}): ${statusLink(form.slug, r.ref)}\nفريق BuildX HUE`
      : `أهلاً ${(r.name ?? "").split(/\s+/)[0]} 🎉\nاتقبلت في «${form.title_ar}».\n${form.accepted_url ? `سجّل في الرابط ده: ${form.accepted_url}\n` : ""}وتابع طلبك من هنا (كود ${r.ref}): ${statusLink(form.slug, r.ref)}\nفريق BuildX HUE`;
  const update = async (r: Response, p: Partial<Response>, quiet = false): Promise<Response | "full" | null> => {
    try {
      const saved = (await sb().from("form_responses").update(p).eq("id", r.id).select("*").single().then(must)) as Response | null;
      const next = { ...r, ...p, ...(saved ?? {}) };
      if (!quiet && p.status === "accepted" && form.delegation && next.member_no) toast(`اتسجّل في الوفد برقم ${memberId(next.member_no)}`);
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
  const first = form.fields.find((fl) => fl.type !== "name" && fl.type !== "phone" && fl.type !== "email" && fl.type !== "checkbox");
  return (
    <>
      <TopBar title={`ردود: ${form.title_ar}`} sub={`${data.responses.length} رد`} back={`/staff/forms/${id}`} actions={<Button size="sm" icon="download" disabled={!data.responses.length} onClick={() => exportXlsx()}>Excel</Button>} />
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
      <div className="mt-3 flex flex-wrap gap-2">
        <Chip active={filter === "all"} onClick={() => setFilter("all")} count={data.responses.length}>
          الكل
        </Chip>
        {(Object.keys(RESP) as Response["status"][]).map((s) => (
          <Chip key={s} active={filter === s} onClick={() => setFilter(s)} count={count(s)}>
            {RESP[s].ar}
          </Chip>
        ))}
        <Chip active={!!pick} onClick={() => setPick((p) => (p ? null : new Set()))}>
          {pick ? "إلغاء التحديد" : "تحديد أكتر من واحد"}
        </Chip>
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
        </Card>
      )}
      {!list.length ? (
        <Empty icon="list" title="مفيش ردود هنا" body="أول ما حد يملا الفورم على الموقع، رده بيظهر هنا." />
      ) : (
        <List className="mt-4">
          {list.map((r) => (
            <Row key={r.id} onClick={() => (pick ? togglePick(r) : setOpen(r))}>
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
                </div>
                <Badge tone={RESP[r.status].tone}>{RESP[r.status].ar}</Badge>
              </div>
            </Row>
          ))}
        </List>
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
                  <dd className="whitespace-pre-line text-chalk">{show(open.answers[fl.id]) || "—"}</dd>
                </div>
              ))}
            </dl>
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
