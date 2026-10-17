"use client";
/**
 * The leader's activity log: every add, change and delete anyone made (the team, students, visitors),
 * who and when, what changed from what to what, and a deleted record put back in one tap. Only the
 * owner opens it; the database refuses everyone else.
 */
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";
import { errorText, fmt, rpc, today } from "./core";
import { downloadXlsx } from "./xlsx";
import { Badge, Button, Chip, Empty, ErrorBox, Icon, type IconKey, Input, List, Loading, SearchBox, Section, Select, Sheet, Stat, TopBar, confirmDialog, toast, useAsync } from "./ui";

type By = "visitor" | "student" | "system";
type Detail = {
  t?: string;
  by?: By;
  an?: string;
  st?: string;
  sf?: string;
  of?: string;
  ch?: Record<string, [unknown, unknown]>;
  row?: Record<string, unknown>;
  cut?: boolean;
  trimmed?: boolean;
  from?: number;
  err?: string;
  name?: string;
  count?: number;
  [k: string]: unknown;
};
export type ActivityEntry = {
  id: number;
  at: string;
  actor: string | null;
  actor_email: string | null;
  action: string;
  entity: string;
  entity_id: string | null;
  detail: Detail;
  has_row?: boolean;
  restored?: boolean;
};
type Full = ActivityEntry & { ip: string | null; restored: { at: string; by: string | null } | null; can_restore: boolean };
type Counts = { insert: number; update: number; delete: number; other: number; total: number };
type Stats = {
  today: Counts;
  week: Counts;
  top: { actor: string; name: string; n: number; deletes: number }[];
  people: { actor: string; name: string; n: number }[];
  entities: Record<string, number>;
  total: number;
  since: string | null;
};

/** Each table: the section it belongs to, and what one record is called. */
const ENTITY: Record<string, [string, string]> = {
  applications: ["طلبات الانضمام", "طلب انضمام"],
  family_members: ["أسرة BuildX", "تسجيل في الأسرة"],
  students: ["الطلاب", "طالب"],
  staff: ["فريق التطبيق", "عضو فريق"],
  forms: ["الفورمات", "فورم"],
  form_responses: ["ردود الفورمات", "رد على فورم"],
  form_attendance: ["حضور الفورمات بالـ QR", "حضور"],
  site_content: ["محتوى الموقع", "محتوى على الموقع"],
  site_pages: ["صفحات الموقع", "صفحة"],
  site_settings: ["إعدادات الموقع", "إعداد"],
  inbox_messages: ["رسائل الموقع", "رسالة"],
  event_registrations: ["تسجيل الفعاليات", "تسجيل في فعالية"],
  event_feedback: ["تقييم الفعاليات", "تقييم فعالية"],
  event_member_checkins: ["دخول الفعاليات بالكارنيه", "دخول فعالية"],
  attendance: ["الحضور", "حضور"],
  attendance_sessions: ["جلسات الحضور", "جلسة حضور"],
  assignments: ["التاسكات", "تاسك"],
  assignment_submissions: ["تسليم التاسكات", "تسليم تاسك"],
  quizzes: ["الكويزات", "كويز"],
  quiz_questions: ["أسئلة الكويزات", "سؤال كويز"],
  quiz_attempts: ["حل الكويزات", "حل كويز"],
  materials: ["المحاضرات والملفات", "محاضرة/ملف"],
  announcements: ["الإعلانات", "إعلان"],
  certificates: ["الشهادات", "شهادة"],
  student_bonus: ["نقاط الطلاب", "نقاط"],
  course_bonus: ["مكافأة الكورس", "مكافأة كورس"],
  student_projects: ["مشاريع الطلاب", "مشروع طالب"],
  access_requests: ["طلبات الدخول", "طلب دخول"],
  deletion_requests: ["طلبات حذف الحسابات", "طلب حذف حساب"],
  community_bans: ["الحظر من الكميونيتي", "حظر"],
  directory_sites: ["دليل المواقع", "موقع في الدليل"],
  directory_suggestions: ["اقتراحات الدليل", "اقتراح موقع"],
  email_suppressions: ["إلغاء الإيميلات", "إلغاء اشتراك"],
  inventory_items: ["المخزن", "صنف"],
  inventory_loans: ["سلف المخزن", "سلفة"],
  inventory_requests: ["طلبات المخزن", "طلب من المخزن"],
  push_messages: ["الإشعارات", "إشعار"],
  sectors: ["الأقسام", "قسم"],
  sector_members: ["أعضاء الأقسام", "عضو في قسم"],
  sector_meetings: ["اجتماعات الأقسام", "اجتماع"],
  sector_meeting_attendance: ["حضور الاجتماعات", "حضور اجتماع"],
  staff_tasks: ["مهام الفريق", "مهمة"],
  staff_task_assignees: ["تسليم مهام الفريق", "مهمة على عضو"],
  staff_task_comments: ["تعليقات المهام", "تعليق"],
  staff_task_requests: ["طلبات المد والأعذار", "طلب مد أو عذر"],
  staff_task_templates: ["قوالب المهام", "قالب مهمة"],
  staff_warnings: ["الإنذارات", "إنذار"],
  team_awards: ["عضو الشهر", "تكريم"],
  team_profiles: ["بروفايلات الفريق", "بروفايل"],
  team_projects: ["مشاريع الفريق", "مشروع"],
  team_settings: ["قواعد الفريق", "قواعد الفريق"],
  voice_clips: ["صوت بقلظ", "تسجيل صوت"],
  waitlist: ["قائمة الانتظار", "تسجيل في قائمة الانتظار"],
  whatsapp_snippets: ["رسايل واتساب الجاهزة", "رسالة جاهزة"],
  whatsapp: ["واتساب", "واتساب"],
  email: ["الإيميل", "الإيميل"],
  push_keys: ["مفاتيح الإشعارات", "مفاتيح الإشعارات"],
  security: ["الأمان", "عنوان IP"],
};
const section = (e: string) => ENTITY[e]?.[0] ?? e;
const noun = (e: string) => ENTITY[e]?.[1] ?? e;

const VERB: Record<string, string> = {
  insert: "أضاف",
  update: "عدّل",
  delete: "حذف",
  restore: "رجّع",
  login: "دخل التطبيق",
  bootstrap: "أنشأ حساب المالك",
  set_pins: "عمل رموز دخول للطلاب",
  staff_create: "أضاف عضو للفريق",
  staff_password: "غيّر كلمة سر عضو",
  staff_delete: "شال عضو من الفريق",
  unlock: "فك قفل دخول طالب",
  sign_out: "طلّع طالب من التطبيق",
  block_ip: "حظر عنوان",
  unblock_ip: "فك حظر عنوان",
  account_deleted: "نفّذ طلب حذف حساب",
  deletion_declined: "رفض طلب حذف حساب",
  whatsapp_connect: "ربط واتساب",
  whatsapp_disconnect: "فصل واتساب",
  whatsapp_send: "بعت رسايل واتساب",
  email_connect: "ربط الإيميل",
  email_disconnect: "فصل الإيميل",
  email_send: "بعت إيميلات",
  email_template: "عدّل إيميل تلقائي",
};
/** Actions that name the record they touched. */
const ROW_ACTIONS = new Set(["insert", "update", "delete", "restore"]);

const KIND: { key: string; label: string }[] = [
  { key: "", label: "الكل" },
  { key: "insert", label: "إضافة" },
  { key: "update", label: "تعديل" },
  { key: "delete", label: "حذف" },
  { key: "other", label: "دخول وحاجات تانية" },
];
const WHO: { key: string; label: string }[] = [
  { key: "", label: "كل الناس" },
  { key: "team", label: "الفريق" },
  { key: "student", label: "الطلاب" },
  { key: "visitor", label: "زوار الموقع" },
  { key: "system", label: "تلقائي" },
];
const WHEN: { key: string; label: string }[] = [
  { key: "today", label: "النهارده" },
  { key: "7d", label: "آخر 7 أيام" },
  { key: "30d", label: "آخر 30 يوم" },
  { key: "all", label: "من الأول" },
];

/** What each column is called on screen (others show as they are). */
const FIELD: Record<string, string> = {
  full_name: "الاسم",
  full_name_ar: "الاسم (عربي)",
  name: "الاسم",
  recipient_name: "اسم صاحب الشهادة",
  title: "العنوان",
  title_ar: "العنوان (عربي)",
  title_en: "العنوان (إنجليزي)",
  status: "الحالة",
  phone: "الموبايل",
  email: "الإيميل",
  notes: "ملاحظات",
  note: "ملاحظة",
  staff_notes: "ملاحظات الفريق",
  public_note: "ملاحظة للمتقدّم",
  role: "الدور",
  active: "شغّال",
  permissions: "الصلاحيات",
  group_name: "المجموعة",
  code: "الكود",
  ref: "الرقم",
  published: "منشور",
  pinned: "مثبّت",
  archived: "مؤرشف",
  description: "الوصف",
  body: "المحتوى",
  body_ar: "المحتوى (عربي)",
  summary: "الملخص",
  summary_ar: "الملخص (عربي)",
  slug: "الرابط",
  starts_at: "بيبدأ",
  ends_at: "بيخلص",
  due_at: "آخر ميعاد",
  publish_at: "ميعاد النشر",
  points: "النقط",
  grade: "الدرجة",
  score: "الدرجة",
  feedback: "التعليق",
  reason: "السبب",
  value: "القيمة",
  key: "المفتاح",
  faculty: "الكلية",
  academic_year: "السنة",
  level: "الفرقة",
  student_number: "الرقم الجامعي",
  national_id: "الرقم القومي",
  governorate: "المحافظة",
  address: "العنوان بالتفصيل",
  track_first: "المسار الأول",
  track_second: "المسار التاني",
  repeats: "مرات التقديم تاني",
  answers: "الإجابات",
  open: "مفتوح",
  opens_at: "بيفتح",
  closes_at: "بيقفل",
  quantity: "الكمية",
  location: "المكان",
  member_until: "العضوية لحد",
  card_token: "كارت العضوية",
  submitted_at: "اتسلّم",
  url: "اللينك",
  link: "اللينك",
  image_path: "الصورة",
  photo_path: "الصورة",
  blocks: "محتوى الصفحة",
  settings: "الإعدادات",
  fields: "الأسئلة",
  capacity: "العدد المتاح",
  max_responses: "أقصى عدد ردود",
  priority: "الأولوية",
  checklist: "قائمة المراجعة",
  state: "الحالة",
  kind: "النوع",
  rating: "التقييم",
  comment: "التعليق",
  message: "الرسالة",
  topic: "الموضوع",
  organization: "الجهة",
  sort_order: "الترتيب",
  headline: "المسمّى",
  headline_ar: "المسمّى (عربي)",
  bio: "نبذة",
  bio_ar: "نبذة (عربي)",
  skills: "المهارات",
  links: "اللينكات",
  track: "المسار",
  tags: "التاجات",
  is_head: "رئيس القسم",
  excused: "بعذر",
  late: "متأخر",
  method: "الطريقة",
  checked_in_at: "دخل",
  returned_at: "اترجّع",
  lifted_at: "اتشال الحظر",
  cancelled_at: "اتلغى",
  appeal: "التظلّم",
  appeal_status: "حالة التظلّم",
  revoked_at: "اتسحبت",
  revoked_reason: "سبب السحب",
  hours: "الساعات",
  design: "التصميم",
  minutes: "محضر الاجتماع",
  agenda: "جدول الأعمال",
  place: "المكان",
  warn_threshold: "عدد الإنذارات للتنبيه",
  auto_warn: "إنذار تلقائي",
  experience_level: "مستوى الخبرة",
  experience: "الخبرة",
  motivation: "ليه عايز ينضم",
  goals: "الأهداف",
  hours_per_week: "الساعات في الأسبوع",
  days: "الأيام",
  heard_from: "عرف منين",
  team_roles: "أدوار في التنظيم",
  portfolio_url: "لينك شغله",
  consent: "موافقة",
  locale: "اللغة",
  created_at: "اتعمل",
  present: "حاضر",
  session: "الموعد",
  pass: "كود الـ QR",
  attendance: "الحضور بالـ QR",
  marked_at: "اتسجّل",
  reviewed_at: "اتراجع",
  graded_at: "اتصحّح",
  decided_at: "اتقرر",
  handled_at: "اتعامل معاه",
  accepted_at: "اتقبل",
  lent_at: "اتسلّف",
};

/** Status words as the app shows them. */
const VALUE: Record<string, string> = {
  new: "جديد",
  contacted: "اتواصلنا",
  interview: "مقابلة",
  accepted: "مقبول",
  waitlist: "قائمة انتظار",
  rejected: "مرفوض",
  pending: "مستني",
  approved: "اتوافق",
  declined: "اترفض",
  done: "خلص",
  open: "مفتوح",
  closed: "مقفول",
  present: "حاضر",
  late: "متأخر",
  excused: "بعذر",
  absent: "غائب",
  submitted: "اتسلّم",
  missed: "فات ميعاده",
  returned: "اترجّع",
  cancelled: "اتلغى",
};
const LABELLED = new Set(["status", "state", "appeal_status"]);

const ACTION_LOOK: Record<string, { icon: IconKey; cls: string }> = {
  insert: { icon: "plus", cls: "bg-ok/15 text-[#7cf0c6]" },
  update: { icon: "edit", cls: "bg-cyan/15 text-ice" },
  delete: { icon: "trash", cls: "bg-danger/15 text-[#ff9aa5]" },
  restore: { icon: "refresh", cls: "bg-volt/20 text-[#a9c6ff]" },
  login: { icon: "key", cls: "bg-white/[0.06] text-mist" },
};
const look = (a: string) => ACTION_LOOK[a] ?? { icon: "info" as IconKey, cls: "bg-warn/15 text-[#ffd08a]" };

/** Who did it, as shown: a team member's name, or what kind of person it was. */
function Who({ e }: { e: ActivityEntry }) {
  if (e.actor)
    return (
      <b className="font-semibold text-chalk" translate="no">
        {e.detail.an || e.actor_email || "—"}
      </b>
    );
  if (e.detail.by === "student")
    return (
      <>
        <Badge tone="info">طالب</Badge>{" "}
        {e.detail.st && (
          <b className="font-semibold text-chalk" translate="no">
            {e.detail.st}
          </b>
        )}
      </>
    );
  if (e.detail.by === "visitor") return <Badge tone="warn">زائر</Badge>;
  return <Badge>تلقائي</Badge>;
}

function verbOf(e: ActivityEntry) {
  if (e.action === "insert" && (e.detail.by === "visitor" || e.detail.by === "student")) return "بعت";
  if (e.action === "update" && e.detail.by === "visitor") return "حدّث";
  return VERB[e.action] ?? e.action;
}

/** The record's own name and where it sits ("in quiz X", "for student Y"). */
function Subject({ e }: { e: ActivityEntry }) {
  const d = e.detail;
  const title = d.t ?? d.name;
  const forStudent = d.st && d.by !== "student" && d.st !== title ? d.st : null;
  return (
    <>
      {ROW_ACTIONS.has(e.action) && <> {noun(e.entity)}</>}
      {title && e.action !== "login" && (
        <>
          {" "}
          <span translate="no">«{title}»</span>
        </>
      )}
      {d.of && (
        <>
          {" "}
          <span className="text-fog">في</span> <span translate="no">«{d.of}»</span>
        </>
      )}
      {forStudent && (
        <>
          {" "}
          <span className="text-fog">للطالب</span> <span translate="no">{forStudent}</span>
        </>
      )}
      {d.sf && d.sf !== d.an && (
        <>
          {" "}
          <span className="text-fog">لـ</span> <span translate="no">{d.sf}</span>
        </>
      )}
      {typeof d.count === "number" && <> ({d.count})</>}
    </>
  );
}

const fieldName = (k: string) => FIELD[k] ?? k;
const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/;

/** A stored value as people read it. */
function Val({ v, k }: { v: unknown; k?: string }) {
  if (v === null || v === undefined || v === "") return <span className="text-fog">فاضي</span>;
  if (k && LABELLED.has(k) && typeof v === "string" && VALUE[v]) return <>{VALUE[v]}</>;
  if (v === true) return <>أيوه</>;
  if (v === false) return <>لأ</>;
  if (v === "•••") return <span className="text-fog">مخفي</span>;
  if (typeof v === "object" && v && "_big" in v) return <span className="text-fog">محتوى كبير</span>;
  if (typeof v === "string" && ISO.test(v)) return <>{fmt.dateTime(v)}</>;
  if (Array.isArray(v) && v.every((x) => typeof x !== "object"))
    return v.length ? <span translate="no">{v.join("، ")}</span> : <span className="text-fog">فاضي</span>;
  if (typeof v === "object")
    return (
      <span dir="ltr" className="break-all font-mono text-[11px]" translate="no">
        {JSON.stringify(v).slice(0, 400)}
      </span>
    );
  return (
    <span className="whitespace-pre-wrap break-words" translate="no">
      {String(v)}
    </span>
  );
}

/** Start of a day on this device, n days back. */
function dayStart(daysBack = 0) {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - daysBack);
  return d;
}

function dayLabel(iso: string) {
  const d = new Date(iso);
  d.setHours(0, 0, 0, 0);
  const diff = Math.round((dayStart().getTime() - d.getTime()) / 86_400_000);
  return diff === 0 ? "النهارده" : diff === 1 ? "امبارح" : fmt.full(iso);
}

/** Several of the same thing by the same person within minutes show as one line that opens up. */
type Group = { key: string; items: ActivityEntry[] };
function groupEntries(rows: ActivityEntry[]): Group[] {
  const out: Group[] = [];
  for (const e of rows) {
    const last = out[out.length - 1];
    const head = last?.items[0];
    const tail = last?.items[last.items.length - 1];
    const same =
      head &&
      tail &&
      ROW_ACTIONS.has(e.action) &&
      e.action !== "restore" &&
      head.action === e.action &&
      head.entity === e.entity &&
      (head.actor ?? head.detail.by) === (e.actor ?? e.detail.by) &&
      dayLabel(head.at) === dayLabel(e.at) &&
      Math.abs(new Date(tail.at).getTime() - new Date(e.at).getTime()) < 3 * 60_000;
    if (same) last.items.push(e);
    else out.push({ key: String(e.id), items: [e] });
  }
  return out;
}

function changedNames(e: ActivityEntry) {
  return e.detail.ch ? Object.keys(e.detail.ch).map(fieldName) : [];
}

function EntryLine({ e, onOpen }: { e: ActivityEntry; onOpen: () => void }) {
  const l = look(e.action);
  const changed = changedNames(e);
  return (
    <button type="button" onClick={onOpen} className="flex w-full items-start gap-3 px-4 py-3 text-start transition hover:bg-white/[0.03]" data-testid="activity-row">
      <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", l.cls)}>
        <Icon name={l.icon} size={16} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm leading-relaxed text-mist">
          <Who e={e} /> {verbOf(e)}
          <Subject e={e} />
        </span>
        <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-fog">
          <span>{fmt.time(e.at)}</span>
          <span>· {section(e.entity)}</span>
          {changed.length > 0 && <span className="truncate">· {changed.slice(0, 4).join("، ")}</span>}
          {e.restored && <Badge tone="volt">اترجّع</Badge>}
          {e.detail.err && <Badge tone="warn">ناقص التفاصيل</Badge>}
        </span>
      </span>
    </button>
  );
}

function GroupLine({ g, onOpen }: { g: Group; onOpen: (e: ActivityEntry) => void }) {
  const [open, setOpen] = useState(false);
  const e = g.items[0];
  if (g.items.length === 1) return <EntryLine e={e} onOpen={() => onOpen(e)} />;
  const l = look(e.action);
  return (
    <div>
      <button type="button" onClick={() => setOpen((v) => !v)} className="flex w-full items-start gap-3 px-4 py-3 text-start transition hover:bg-white/[0.03]" data-testid="activity-group">
        <span className={cn("mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full", l.cls)}>
          <Icon name={l.icon} size={16} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="block text-sm leading-relaxed text-mist">
            <Who e={e} /> {verbOf(e)} {g.items.length} <span className="text-fog">في</span> {section(e.entity)}
          </span>
          <span className="mt-0.5 block text-xs text-fog">
            {fmt.time(g.items[g.items.length - 1].at)} – {fmt.time(e.at)} · {open ? "اقفل" : "افتح التفاصيل"}
          </span>
        </span>
        <Icon name="chevronDown" size={16} className={cn("mt-2 shrink-0 text-fog transition", open && "rotate-180")} />
      </button>
      {open && (
        <div className="border-t border-[var(--line)] bg-white/[0.015] ps-6">
          {g.items.map((x) => (
            <EntryLine key={x.id} e={x} onOpen={() => onOpen(x)} />
          ))}
        </div>
      )}
    </div>
  );
}

function Details({ id, onClose, onRestored }: { id: number | null; onClose: () => void; onRestored: () => void }) {
  const { data, error, loading, reload } = useAsync(() => (id ? rpc<Full | null>("staff_audit_get", { p_id: id }) : Promise.resolve(null)), [id]);
  const [busy, setBusy] = useState(false);
  const restore = async () => {
    if (!data) return;
    const ok = await confirmDialog({
      title: "ترجّعه زي ما كان؟",
      body: `هيرجع ${noun(data.entity)} «${data.detail.t ?? ""}» بنفس بياناته وقت ما اتحذف.`,
      ok: "رجّعه",
    });
    if (!ok) return;
    setBusy(true);
    try {
      const r = await rpc<{ ok: boolean; error?: string }>("staff_audit_restore", { p_id: data.id });
      if (r.ok) {
        toast("رجع زي ما كان.");
        reload();
        onRestored();
      } else
        toast.error(
          r.error === "already"
            ? "ده اترجّع قبل كده."
            : r.error === "exists"
              ? "فيه واحد بنفس البيانات موجود دلوقتي، فمش هينفع يرجع تاني."
              : r.error === "parent"
                ? "الحاجة اللي كان تابع ليها اتحذفت هي كمان. رجّعها الأول."
                : "مقدرناش نرجّعه.",
        );
    } catch (e) {
      toast.error(errorText(e));
    } finally {
      setBusy(false);
    }
  };
  const d = data?.detail;
  const row = d?.row ?? {};
  return (
    <Sheet open={id !== null} onClose={onClose} title="تفاصيل الحركة" wide>
      {loading && !data ? (
        <Loading />
      ) : error ? (
        <ErrorBox error={error} retry={reload} />
      ) : !data || !d ? (
        <Empty icon="list" title="مش لاقيين الحركة دي" />
      ) : (
        <div className="grid gap-4" data-testid="activity-details">
          <p className="text-[15px] leading-relaxed text-mist">
            <Who e={data} /> {verbOf(data)}
            <Subject e={data} />
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            <Info label="إمتى">{fmt.full(data.at)} · {fmt.time(data.at)}</Info>
            <Info label="القسم">{section(data.entity)}</Info>
            {data.actor_email && (
              <Info label="الإيميل">
                <span dir="ltr" translate="no">
                  {data.actor_email}
                </span>
              </Info>
            )}
            {data.ip && (
              <Info label="عنوان الجهاز (IP)">
                <span dir="ltr" className="font-mono" translate="no">
                  {data.ip}
                </span>
              </Info>
            )}
          </div>
          {data.restored && (
            <p className="rounded-xl border border-volt/30 bg-volt/10 px-3 py-2 text-sm text-[#a9c6ff]">
              اترجّع {fmt.dateTime(data.restored.at)}
              {data.restored.by && (
                <>
                  {" "}
                  · <span translate="no">{data.restored.by}</span>
                </>
              )}
            </p>
          )}
          {d.ch && Object.keys(d.ch).length > 0 && (
            <Section title="اللي اتغيّر" className="mt-0">
              <List>
                {Object.entries(d.ch).map(([k, [from, to]]) => (
                  <div key={k} className="grid gap-1 px-4 py-3 text-sm" data-testid="activity-change">
                    <span className="text-xs font-semibold text-fog">{fieldName(k)}</span>
                    <span className="grid grid-cols-[auto_1fr] items-baseline gap-x-2 gap-y-1">
                      <span className="text-xs text-[#ff9aa5]">كان</span>
                      <span className="min-w-0 text-mist line-through decoration-white/20">
                        <Val v={from} k={k} />
                      </span>
                      <span className="text-xs text-[#7cf0c6]">بقى</span>
                      <span className="min-w-0 text-chalk">
                        <Val v={to} k={k} />
                      </span>
                    </span>
                  </div>
                ))}
              </List>
            </Section>
          )}
          {Object.keys(row).length > 0 && (
            <Section title={data.action === "delete" ? "البيانات اللي اتحذفت" : "البيانات"} className="mt-0">
              <List>
                {Object.entries(row)
                  .filter(([k, v]) => v !== null && v !== "" && !/^(id|created_by|updated_by|code_key|barcode_key)$/.test(k))
                  .map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[minmax(0,2fr)_minmax(0,3fr)] gap-3 px-4 py-2.5 text-sm">
                      <span className="text-fog">{fieldName(k)}</span>
                      <span className="min-w-0 text-mist">
                        <Val v={v} k={k} />
                      </span>
                    </div>
                  ))}
              </List>
            </Section>
          )}
          {data.can_restore && !data.restored && (
            <Button variant="primary" icon="refresh" loading={busy} onClick={restore} data-testid="activity-restore">
              رجّعه زي ما كان
            </Button>
          )}
          {data.action === "delete" && d.cut && <p className="text-xs text-fog">ده كان كبير قوي فاتحفظ مختصر، فمش هينفع يرجع من هنا.</p>}
          {d.trimmed && <p className="text-xs text-fog">التفاصيل دي اتشالت بعد 180 يوم (زي باقي سجلات الأمان).</p>}
        </div>
      )}
    </Sheet>
  );
}

function Info({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="min-w-0 rounded-xl border border-[var(--line)] bg-white/[0.02] px-3 py-2">
      <p className="text-[11px] text-fog">{label}</p>
      <p className="mt-0.5 truncate text-chalk">{children}</p>
    </div>
  );
}

export function ActivityScreen() {
  const [kind, setKind] = useState("");
  const [who, setWho] = useState("");
  const [entity, setEntity] = useState("");
  const [when, setWhen] = useState("7d");
  const [day, setDay] = useState("");
  const [q, setQ] = useState("");
  const [qx, setQx] = useState("");
  const [tick, setTick] = useState(0);
  const [rows, setRows] = useState<ActivityEntry[]>([]);
  const [more, setMore] = useState(false);
  const [loading, setLoading] = useState(true);
  const [paging, setPaging] = useState(false);
  const [err, setErr] = useState<unknown>(null);
  const [open, setOpen] = useState<number | null>(null);
  const seq = useRef(0);

  const stats = useAsync(() => rpc<Stats>("staff_audit_stats"), [tick]);

  useEffect(() => {
    const t = setTimeout(() => setQx(q.trim()), 350);
    return () => clearTimeout(t);
  }, [q]);

  const filter = useMemo(() => {
    const p: Record<string, string> = {};
    if (kind) p.kind = kind;
    if (who) p.who = who;
    if (entity) p.entity = entity;
    if (qx) p.q = qx;
    if (day) {
      const from = new Date(`${day}T00:00:00`);
      p.from = from.toISOString();
      p.to = new Date(from.getTime() + 86_400_000).toISOString();
    } else if (when === "today") p.from = dayStart().toISOString();
    else if (when === "7d") p.from = dayStart(6).toISOString();
    else if (when === "30d") p.from = dayStart(29).toISOString();
    return p;
  }, [kind, who, entity, qx, when, day]);

  const load = async (before?: number) => {
    const n = ++seq.current;
    if (before) setPaging(true);
    else setLoading(true);
    setErr(null);
    try {
      const r = await rpc<{ rows: ActivityEntry[]; more: boolean }>("staff_audit_list", { p: { ...filter, limit: 80, ...(before ? { before } : {}) } });
      if (n !== seq.current) return;
      setRows((prev) => (before ? [...prev, ...r.rows] : r.rows));
      setMore(r.more);
    } catch (e) {
      if (n === seq.current) setErr(e);
    } finally {
      if (n === seq.current) {
        setLoading(false);
        setPaging(false);
      }
    }
  };
  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter, tick]);

  const byDay = useMemo(() => {
    const days: { label: string; groups: Group[] }[] = [];
    for (const g of groupEntries(rows)) {
      const label = dayLabel(g.items[0].at);
      const last = days[days.length - 1];
      if (last?.label === label) last.groups.push(g);
      else days.push({ label, groups: [g] });
    }
    return days;
  }, [rows]);

  const s = stats.data;
  const entities = useMemo(
    () =>
      Object.entries(s?.entities ?? {})
        .map(([k, n]) => ({ k, n, label: section(k) }))
        .sort((a, b) => a.label.localeCompare(b.label, "ar")),
    [s],
  );
  const person = who && !["team", "student", "visitor", "system"].includes(who) ? who : "";

  const exportXlsx = () =>
    downloadXlsx(
      `buildx-activity-${today()}.xlsx`,
      [
        ["الوقت", "مين", "عمل إيه", "القسم", "على", "في", "اللي اتغيّر"],
        ...rows.map((e) => [
          `${fmt.full(e.at)} ${fmt.time(e.at)}`,
          e.actor ? e.detail.an || e.actor_email || "" : e.detail.by === "student" ? `طالب: ${e.detail.st ?? ""}` : e.detail.by === "visitor" ? "زائر" : "تلقائي",
          verbOf(e),
          section(e.entity),
          e.detail.t ?? e.detail.name ?? "",
          e.detail.of ?? e.detail.st ?? e.detail.sf ?? "",
          Object.entries(e.detail.ch ?? {})
            .map(([k, [a, b]]) => `${fieldName(k)}: ${plain(a, k)} ← ${plain(b, k)}`)
            .join(" | "),
        ]),
      ],
      { sheet: "سجل الحركات", rtl: true },
    );

  return (
    <>
      <TopBar
        title="سجل الحركات"
        sub="كل إضافة وتعديل وحذف من كل الناس — ليك إنت بس"
        back="/staff/more"
        actions={
          <Button size="sm" icon="refresh" onClick={() => setTick((t) => t + 1)} aria-label="تحديث">
            تحديث
          </Button>
        }
      />
      {s && (
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4" data-testid="activity-stats">
          <Stat label="إضافات النهارده" value={s.today.insert} icon="plus" tone="ok" />
          <Stat label="تعديلات النهارده" value={s.today.update} icon="edit" tone="info" />
          <Stat label="حذف النهارده" value={s.today.delete} icon="trash" tone={s.today.delete ? "danger" : undefined} sub={`${s.week.delete} في آخر 7 أيام`} />
          <Stat label="كل الحركات" value={s.total} icon="list" sub={s.since ? `من ${fmt.short(s.since)}` : undefined} />
        </div>
      )}
      {s && s.top.length > 0 && (
        <Section title="أكتر الناس حركة في آخر 7 أيام">
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
            {s.top.map((t) => (
              <Chip key={t.actor} active={who === t.actor} onClick={() => setWho(who === t.actor ? "" : t.actor)} count={t.n}>
                <span translate="no">{t.name}</span>
                {t.deletes > 0 && <span className="text-[#ff9aa5]">{`· ${t.deletes} حذف`}</span>}
              </Chip>
            ))}
          </div>
        </Section>
      )}

      <div className="mt-5 grid gap-3">
        <SearchBox value={q} onChange={setQ} placeholder="اسم، رقم، إيميل، كلمة اتكتبت…" />
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {KIND.map((k) => (
            <Chip key={k.key} active={kind === k.key} onClick={() => setKind(k.key)}>
              {k.label}
            </Chip>
          ))}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {WHO.map((k) => (
            <Chip key={k.key} active={who === k.key} onClick={() => setWho(k.key)}>
              {k.label}
            </Chip>
          ))}
        </div>
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0">
          {WHEN.map((k) => (
            <Chip
              key={k.key}
              active={!day && when === k.key}
              onClick={() => {
                setDay("");
                setWhen(k.key);
              }}
            >
              {k.label}
            </Chip>
          ))}
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
          <Select value={person} onChange={(e) => setWho(e.target.value)} aria-label="الشخص" data-testid="activity-person">
            <option value="">كل أعضاء الفريق</option>
            {(s?.people ?? []).map((p) => (
              <option key={p.actor} value={p.actor}>
                {p.name} ({p.n})
              </option>
            ))}
          </Select>
          <Select value={entity} onChange={(e) => setEntity(e.target.value)} aria-label="القسم" data-testid="activity-entity">
            <option value="">كل الأقسام</option>
            {entities.map((x) => (
              <option key={x.k} value={x.k}>
                {x.label} ({x.n})
              </option>
            ))}
          </Select>
          <Input type="date" value={day} max={today()} onChange={(e) => setDay(e.target.value)} aria-label="يوم معيّن" dir="ltr" />
        </div>
      </div>

      {loading && !rows.length ? (
        <Loading />
      ) : err ? (
        <ErrorBox error={err} retry={() => void load()} />
      ) : !rows.length ? (
        <Empty icon="list" title="مفيش حركات بالشكل ده" body="جرّب تغيّر الفلتر أو المدة." />
      ) : (
        <>
          {byDay.map((d) => (
            <Section key={d.label} title={d.label}>
              <List>
                {d.groups.map((g) => (
                  <GroupLine key={g.key} g={g} onOpen={(e) => setOpen(e.id)} />
                ))}
              </List>
            </Section>
          ))}
          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {more && (
              <Button icon="arrowDown" loading={paging} onClick={() => void load(rows[rows.length - 1]?.id)}>
                حمّل أقدم
              </Button>
            )}
            <Button icon="download" onClick={exportXlsx} data-testid="activity-xlsx">
              {`Excel باللي ظاهر (${rows.length})`}
            </Button>
          </div>
        </>
      )}
      <Details id={open} onClose={() => setOpen(null)} onRestored={() => setTick((t) => t + 1)} />
    </>
  );
}

/** A value in one line, for the Excel sheet. */
function plain(v: unknown, k?: string): string {
  if (v === null || v === undefined || v === "") return "فاضي";
  if (k && LABELLED.has(k) && typeof v === "string" && VALUE[v]) return VALUE[v];
  if (v === true) return "أيوه";
  if (v === false) return "لأ";
  if (typeof v === "object" && v && "_big" in v) return "محتوى كبير";
  if (typeof v === "string" && ISO.test(v)) return `${fmt.full(v)} ${fmt.time(v)}`;
  if (Array.isArray(v)) return v.map((x) => (typeof x === "object" ? JSON.stringify(x) : String(x))).join("، ");
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}
