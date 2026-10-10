"use client";
/**
 * BuildX App core: Supabase client, data types, errors, formatting, CSV and upload helpers.
 * The app is a static PWA. Staff use Supabase Auth; students use an opaque token from
 * student_login (see supabase/migrations). Only the public URL and publishable key ship here.
 */
import { Capacitor, registerPlugin } from "@capacitor/core";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

export { SUPABASE_KEY, SUPABASE_URL };
export const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
export const APP_PATH = `${BASE_PATH}/app/`;
export const MAX_UPLOAD = 50 * 1024 * 1024;

/* ─── Native apps (Capacitor) ──────────────────────────────────────────── */

/** True inside the BuildX HUE store app (the same bundle, served from the device). */
export const isNative = () => typeof window !== "undefined" && Capacitor.isNativePlatform();

/** The public site, for links people share (inside the apps the page origin is the device itself). */
export const SITE_ORIGIN = "https://buildxhue.com";
export const publicOrigin = () => (isNative() ? SITE_ORIGIN : window.location.origin);

type FsPlugin = { writeFile(o: { path: string; data: string; directory: string; recursive?: boolean }): Promise<{ uri: string }> };
type SharePlugin = { share(o: { title?: string; files?: string[]; dialogTitle?: string }): Promise<unknown> };
const Filesystem = registerPlugin<FsPlugin>("Filesystem");
const Share = registerPlugin<SharePlugin>("Share");

/** Apps: save the file to the cache and open the share sheet (WebViews ignore download links). */
async function shareFile(blob: Blob, name: string) {
  const data = await new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
  const { uri } = await Filesystem.writeFile({ path: `exports/${name}`, data, directory: "CACHE", recursive: true });
  await Share.share({ title: name, files: [uri], dialogTitle: name });
}

let client: SupabaseClient | null = null;
export function sb(): SupabaseClient {
  client ??= createClient(SUPABASE_URL, SUPABASE_KEY, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: false, storageKey: "rh-app-staff" },
  });
  return client;
}

/* ─── Types ─────────────────────────────────────────────────────────────── */

export type Role = "owner" | "admin" | "lead";
export type StaffRow = { user_id: string; email: string; full_name: string; role: Role; active: boolean; created_at: string; title?: string | null; permissions?: string[] | null };

/**
 * What a team member may work in. The owner has everything and sets a list for anyone else; an admin
 * with no list has everything (including the admin tools), a trainer with no list has the basic areas.
 * The database enforces the same areas (private.member_can).
 */
export type Area =
  | "roster" | "attendance" | "quizzes" | "tasks" | "materials" | "announcements" | "points"
  | "site" | "forms" | "publish" | "portfolios" | "settings"
  | "applications" | "events" | "inbox" | "certificates" | "notify" | "security" | "sectors" | "inventory";
export const AREAS: { key: Area; group: string; label: string; hint: string }[] = [
  { key: "roster", group: "الطلاب والتدريب", label: "بيانات الطلاب", hint: "إضافة وتعديل الطلاب، رموز الدخول، طلبات «نسيت الرمز» والطلاب المحتاجين متابعة" },
  { key: "attendance", group: "الطلاب والتدريب", label: "الحضور", hint: "فتح جلسات وتسجيل الحضور بالباركود والـ QR، وتقارير الحضور" },
  { key: "quizzes", group: "الطلاب والتدريب", label: "الكويزات", hint: "عمل الكويزات ونتايجها ومسابقة الأسبوع" },
  { key: "tasks", group: "الطلاب والتدريب", label: "التاسكات", hint: "التاسكات وتسليمات الطلاب وتصحيحها" },
  { key: "materials", group: "الطلاب والتدريب", label: "المحاضرات والملفات", hint: "رفع ونشر وجدولة المحاضرات والملفات والروابط" },
  { key: "announcements", group: "الطلاب والتدريب", label: "إعلانات الطلاب", hint: "الإعلانات اللي بتظهر في تطبيق الطالب" },
  { key: "points", group: "الطلاب والتدريب", label: "النقاط والأوسمة", hint: "ترتيب الطلاب وإضافة نقاط إضافية" },
  { key: "site", group: "الموقع", label: "محتوى الموقع", hint: "كتابة الأخبار والفعاليات والجاليري (مسودات)، ومشاريع الطلاب" },
  { key: "publish", group: "الموقع", label: "النشر على الموقع", hint: "نشر وإخفاء وتثبيت المحتوى، وتعديل وحذف المنشور" },
  { key: "forms", group: "الموقع", label: "الفورمات", hint: "الفورمات (اختبارات الفرق، متطوعين…) وردودها" },
  { key: "portfolios", group: "الموقع", label: "صفحات الفريق", hint: "تعديل بورتفوليو أي عضو وإضافة أعضاء وترتيب صفحة الفريق" },
  { key: "settings", group: "الموقع", label: "إعدادات الموقع", hint: "التواصل، الواجهة، الإعلان، الأهداف، ملف الرعاية ونسخ التطبيقات" },
  { key: "applications", group: "تاني", label: "طلبات الانضمام", hint: "مراجعة الطلبات وقائمة الانتظار" },
  { key: "events", group: "تاني", label: "الفعاليات", hint: "التسجيل، الدخول بالـ QR والتقييمات" },
  { key: "inbox", group: "تاني", label: "رسائل الموقع", hint: "رسائل التواصل وطلبات الرعاية" },
  { key: "certificates", group: "تاني", label: "الشهادات", hint: "إصدار وطباعة الشهادات" },
  { key: "notify", group: "تاني", label: "الإشعارات", hint: "إرسال إشعارات للطلاب أو الفريق" },
  { key: "security", group: "تاني", label: "الأمان والمتابعة", hint: "الأمان والهجمات وحظر الـ IP، سجل النشاط، زيارات الموقع وأخطاؤه، واستهلاك الباقة" },
  { key: "sectors", group: "تاني", label: "متابعة كل السيكتورات", hint: "يعمل السيكتورات ويحدد الهيدز والأعضاء، يشوف كل التاسكات والإنذارات ويلغي الإنذارات (الهيد مش محتاجها لسيكتوره)" },
  { key: "inventory", group: "تاني", label: "المخزن (القطع والأدوات)", hint: "إضافة القطع، تسليف وصرف وترجيع، والموافقة على طلبات الاستعارة (أي حد في الفريق يقدر يشوف المخزن ويطلب)" },
];
export const TRAINING: Area[] = ["roster", "attendance", "quizzes", "tasks", "materials", "announcements", "points"];
/** Older lists name the two big areas ("students", "content"); they still mean every part of them. */
const OLD: Record<string, Area[]> = { students: TRAINING, content: ["site", "forms"] };
/** A trainer with no list keeps the areas trainers always had; the newer ones are given by name. */
const BASIC = ["applications", "students", "events", "content", "inbox", "certificates"];
/** The owner, or an admin the owner hasn't limited: every area plus the admin tools (team, deleting, security…). */
export const isFull = (me: Pick<StaffRow, "role" | "permissions">) => me.role === "owner" || (me.role === "admin" && !me.permissions);
const granted = (me: Pick<StaffRow, "role" | "permissions">) => (me.permissions ?? BASIC).flatMap((a) => OLD[a] ?? [a as Area]);
/** "training" = any of the student and training areas (enough to see the student list). */
export const can = (me: Pick<StaffRow, "role" | "permissions">, area: Area | "training") =>
  isFull(me) || (area === "training" ? TRAINING.some((a) => granted(me).includes(a)) : granted(me).includes(area));

/** Positions (from the BuildX HUE structure) with the areas that usually go with them. */
export const POSITIONS: { title: string; areas: Area[] }[] = [
  { title: "نائب القائد", areas: AREAS.map((a) => a.key) },
  { title: "إداري الموقع", areas: ["site", "publish", "forms", "portfolios", "settings", "notify", "inbox", "security"] },
  { title: "هيد الميديا", areas: ["site", "publish", "portfolios", "notify"] },
  { title: "المدير التقني", areas: [...TRAINING, "events", "certificates"] },
  { title: "مسؤول الروبوتكس", areas: TRAINING },
  { title: "مسؤول Embedded وIoT", areas: TRAINING },
  { title: "مسؤول الذكاء الاصطناعي", areas: TRAINING },
  { title: "مسؤول البرمجة", areas: TRAINING },
  { title: "مسؤول الطباعة والتصميم ثلاثي الأبعاد", areas: TRAINING },
  { title: "مسؤول التنظيم والعمليات", areas: ["events", "attendance"] },
  { title: "مسؤول العضوية والموارد البشرية", areas: ["applications", "roster", "attendance"] },
  { title: "مسؤول الإعلام والتصميم", areas: ["site"] },
  { title: "مسؤول العلاقات العامة والرعاية", areas: ["inbox", "site"] },
  { title: "أمين المخزن", areas: ["inventory"] },
  { title: "منظّم", areas: ["events"] },
  { title: "متطوع", areas: ["events"] },
  { title: "عضو في الفريق", areas: [] },
];
export type Student = {
  id: string;
  code: string;
  codeKey: string;
  barcode: string | null;
  barcodeKey: string | null;
  name: string;
  group: string;
  phone: string | null;
  notes: string | null;
  active: boolean;
  createdAt: string;
  hasPin: boolean;
  locked: boolean;
  lastLogin: string | null;
};
export type AttStatus = "present" | "late" | "excused" | "absent";
export type Session = {
  id: string;
  title: string;
  group_name: string;
  starts_at: string;
  late_after_min: number;
  closed_at: string | null;
  created_by: string | null;
  created_at: string;
};
export type AttRow = { session_id: string; student_id: string; status: AttStatus; method: "scan" | "manual"; marked_at: string };
export type Material = {
  id: string;
  title: string;
  description: string;
  kind: "file" | "link";
  storage_path: string | null;
  url: string | null;
  file_name: string | null;
  mime: string | null;
  size_bytes: number | null;
  group_name: string;
  published: boolean;
  /** Hidden until this time, then it publishes itself (and the group is notified). */
  publish_at?: string | null;
  pinned: boolean;
  created_by: string | null;
  created_at: string;
};
export type QuestionKind = "single" | "multi" | "truefalse" | "short";
export type Option = { id: string; text: string };
export type Question = {
  id: string;
  quiz_id: string;
  position: number;
  kind: QuestionKind;
  prompt: string;
  image_path: string | null;
  options: Option[];
  correct: string[];
  explanation: string;
  points: number;
};
export type Quiz = {
  id: string;
  title: string;
  description: string;
  group_name: string;
  published: boolean;
  opens_at: string | null;
  closes_at: string | null;
  time_limit_min: number | null;
  max_attempts: number;
  shuffle: boolean;
  show_answers: boolean;
  /** The weekly contest (first attempt counts; top three get bonus points). */
  weekly?: boolean;
  created_by: string | null;
  created_at: string;
  updated_at: string;
};
export type Attempt = {
  id: string;
  quiz_id: string;
  student_id: string;
  started_at: string;
  deadline: string | null;
  submitted_at: string | null;
  late: boolean;
  question_ids: string[];
  answers: Record<string, string | string[]>;
  results: Record<string, boolean>;
  score: number | null;
  max_score: number | null;
};

export const ROLE_LABEL: Record<Role, string> = { owner: "المالك", admin: "مشرف", lead: "مدرّب" };
export const STATUS_LABEL: Record<AttStatus | "pending", string> = {
  present: "حاضر",
  late: "متأخر",
  excused: "بعذر",
  absent: "غائب",
  pending: "لم يُسجَّل بعد",
};

/* ─── Errors ────────────────────────────────────────────────────────────── */

type ErrLike = { message?: string; code?: string } | null | undefined;

export function errorText(e: unknown): string {
  const err = e as ErrLike;
  const msg = err?.message ?? String(e ?? "");
  const code = err?.code ?? "";
  if (/Failed to fetch|NetworkError|Load failed|network|ERR_INTERNET/i.test(msg)) return "لا يوجد اتصال بالإنترنت. حاول مرة أخرى.";
  if (msg === "session_invalid") return "انتهت جلسة الدخول. سجّل الدخول من جديد.";
  if (msg === "invalid_code") return "رقم الطالب يجب أن يحتوي على حروف أو أرقام.";
  if (msg === "last_owner") return "يجب أن يبقى مالك واحد على الأقل.";
  if (code === "23505" || /duplicate key|code_taken|barcode_taken/.test(msg)) return "هذا الرقم مسجَّل لطالب آخر.";
  if (code === "42501" || msg === "forbidden" || /permission denied|row-level security|violates row-level/i.test(msg)) return "ليست لديك صلاحية لهذا الإجراء.";
  if (/JWT expired|invalid JWT|refresh token/i.test(msg)) return "انتهت جلسة الدخول. سجّل الدخول من جديد.";
  if (msg === "image_unreadable") return "المتصفح مقدرش يفتح الصورة دي. جرّب صورة تانية، أو خد لها سكرين شوت وارفعها.";
  if (msg === "image_encode") return "مقدرناش نصغّر الصورة دي. جرّب صورة تانية.";
  if (/mime type .* is not supported|invalid_mime_type/i.test(msg)) return "نوع الملف ده مش مسموح. ارفع صورة JPG أو PNG.";
  if (/exceeded the maximum allowed size|Payload too large|413/i.test(msg)) return "الملف أكبر من الحد المسموح (50 ميجابايت).";
  return "حدث خطأ غير متوقع. حاول مرة أخرى.";
}

export const isNetworkError = (e: unknown) => /Failed to fetch|NetworkError|Load failed|network/i.test((e as ErrLike)?.message ?? "");

export async function rpc<T>(fn: string, args?: Record<string, unknown>): Promise<T> {
  const { data, error } = await sb().rpc(fn, args);
  if (error) throw error;
  return data as T;
}

export function must<T>(res: { data: T | null; error: unknown }): T {
  if (res.error) throw res.error;
  return res.data as T;
}

/* ─── Student session (opaque token, never a password) ─────────────────── */

export type StudentSession = { token: string; name: string; code: string; group: string };
const STUDENT_KEY = "rh-app-student";

export const studentStore = {
  get(): StudentSession | null {
    try {
      const v = localStorage.getItem(STUDENT_KEY);
      return v ? (JSON.parse(v) as StudentSession) : null;
    } catch {
      return null;
    }
  },
  set(s: StudentSession | null) {
    try {
      if (s) localStorage.setItem(STUDENT_KEY, JSON.stringify(s));
      else localStorage.removeItem(STUDENT_KEY);
    } catch {
      /* private mode: the session lasts for this tab only */
    }
    window.dispatchEvent(new Event("rh-student"));
  },
};

export async function studentRpc<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const s = studentStore.get();
  if (!s) throw new Error("session_invalid");
  const { data, error } = await sb().rpc(fn, { p_token: s.token, ...args });
  if (error) {
    if (error.message === "session_invalid") studentStore.set(null);
    throw error;
  }
  return data as T;
}

/**
 * A student RPC that still answers offline: each success is kept on the phone (per student), and when
 * the network fails the last answer is returned instead, so the app opens on the bus too.
 */
export async function studentRpcOffline<T>(fn: string, args: Record<string, unknown> = {}): Promise<T> {
  const key = `rh-off:${studentStore.get()?.code ?? ""}:${fn}`;
  try {
    const data = await studentRpc<T>(fn, args);
    try {
      localStorage.setItem(key, JSON.stringify(data));
    } catch {
      /* the copy is optional */
    }
    return data;
  } catch (e) {
    const offline = typeof navigator !== "undefined" && (!navigator.onLine || /fetch|network|load failed/i.test(String((e as Error)?.message)));
    if (offline) {
      try {
        const v = localStorage.getItem(key);
        if (v) return JSON.parse(v) as T;
      } catch {
        /* fall through */
      }
    }
    throw e;
  }
}

/* ─── Codes ─────────────────────────────────────────────────────────────── */

const EASTERN_DIGITS = "٠١٢٣٤٥٦٧٨٩۰۱۲۳۴۵۶۷۸۹";

/** Same normalisation as private.code_key in SQL: Arabic digits → ASCII, upper case, [0-9A-Z] only. */
export function codeKey(v: string): string {
  let s = "";
  for (const ch of v) {
    const i = EASTERN_DIGITS.indexOf(ch);
    s += i >= 0 ? String(i % 10) : ch;
  }
  return s.toUpperCase().replace(/[^0-9A-Z]/g, "");
}

export const digitsOnly = (v: string) => codeKey(v).replace(/\D/g, "");

/** Arabic/Persian digits typed on an Arabic keyboard → ASCII digits. */
export const asciiDigits = (v: string) => v.replace(/[٠-٩۰-۹]/g, (ch) => String(EASTERN_DIGITS.indexOf(ch) % 10));

export function tempPassword(length = 12) {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789";
  return Array.from(crypto.getRandomValues(new Uint32Array(length)), (x) => alphabet[x % alphabet.length]).join("");
}

/** A random v4 UUID. crypto.randomUUID only exists on https (secure contexts); visitors who open the
 * site over plain http still need working uploads, so fall back to getRandomValues, which is always there. */
export const uid = (): string => {
  if (typeof crypto.randomUUID === "function") return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, "0")).join("");
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
};

/* ─── Formatting (Arabic words, Latin digits) ──────────────────────────── */

const LOCALE = "ar-EG-u-nu-latn";
const dtf = (o: Intl.DateTimeFormatOptions) => new Intl.DateTimeFormat(LOCALE, o);
const F = {
  day: dtf({ weekday: "long", day: "numeric", month: "long" }),
  short: dtf({ day: "numeric", month: "short" }),
  time: dtf({ hour: "numeric", minute: "2-digit" }),
  full: dtf({ day: "numeric", month: "long", year: "numeric" }),
};

export const fmt = {
  day: (d: string | Date) => F.day.format(new Date(d)),
  short: (d: string | Date) => F.short.format(new Date(d)),
  time: (d: string | Date) => F.time.format(new Date(d)),
  full: (d: string | Date) => F.full.format(new Date(d)),
  dateTime: (d: string | Date) => `${F.day.format(new Date(d))} · ${F.time.format(new Date(d))}`,
  size(n: number | null | undefined) {
    if (!n) return "";
    if (n < 1024 * 1024) return `${Math.max(1, Math.round(n / 1024))} KB`;
    return `${(n / 1024 / 1024).toFixed(1)} MB`;
  },
  rel(d: string | Date) {
    const s = Math.round((Date.now() - new Date(d).getTime()) / 1000);
    if (s < 45) return "الآن";
    const m = Math.round(s / 60);
    if (m < 60) return m <= 1 ? "منذ دقيقة" : m === 2 ? "منذ دقيقتين" : `منذ ${m} دقيقة`;
    const h = Math.round(m / 60);
    if (h < 24) return h === 1 ? "منذ ساعة" : h === 2 ? "منذ ساعتين" : `منذ ${h} ساعة`;
    return fmt.short(d);
  },
  pct: (n: number) => `${Math.round(n)}%`,
  num: (n: number | null | undefined) => (n == null ? "—" : Number.isInteger(Number(n)) ? String(Number(n)) : Number(n).toFixed(1)),
};

/** Value for <input type="datetime-local"> in the device time zone. */
export function toLocalInput(d: string | Date | null | undefined): string {
  if (!d) return "";
  const x = new Date(d);
  return new Date(x.getTime() - x.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
export const fromLocalInput = (v: string): string | null => (v ? new Date(v).toISOString() : null);

/* ─── Files ─────────────────────────────────────────────────────────────── */

export const fileUrl = (path: string, downloadName?: string) =>
  `${SUPABASE_URL}/storage/v1/object/public/materials/${path.split("/").map(encodeURIComponent).join("/")}${
    downloadName ? `?download=${encodeURIComponent(downloadName)}` : ""
  }`;

/** Storage-safe file name (the original name is kept in the database for display). */
export function safeName(name: string) {
  const dot = name.lastIndexOf(".");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 10) : "";
  const base =
    (dot > 0 ? name.slice(0, dot) : name)
      .normalize("NFKD")
      .replace(/[^A-Za-z0-9._-]+/g, "-")
      .replace(/^[-.]+|[-.]+$/g, "")
      .slice(0, 80) || "file";
  return ext ? `${base}.${ext}` : base;
}

/** Upload straight to Storage with progress (supabase-js has no progress events). */
export async function uploadObject(path: string, body: Blob, contentType: string, onProgress?: (p: number) => void, bucket = "materials"): Promise<void> {
  const { data } = await sb().auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("session_invalid");
  await new Promise<void>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("POST", `${SUPABASE_URL}/storage/v1/object/${bucket}/${path.split("/").map(encodeURIComponent).join("/")}`);
    xhr.setRequestHeader("Authorization", `Bearer ${token}`);
    xhr.setRequestHeader("apikey", SUPABASE_KEY);
    xhr.setRequestHeader("x-upsert", "false");
    xhr.setRequestHeader("cache-control", "max-age=31536000");
    xhr.setRequestHeader("Content-Type", contentType || "application/octet-stream");
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress?.(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) resolve();
      else {
        let message = `upload_failed_${xhr.status}`;
        try {
          message = (JSON.parse(xhr.responseText) as { message?: string }).message ?? message;
        } catch {
          /* keep the status text */
        }
        reject(new Error(message));
      }
    };
    xhr.onerror = () => reject(new TypeError("Failed to fetch"));
    xhr.send(body);
  });
}

export async function removeObjects(paths: string[], bucket = "materials") {
  // Photos uploaded through uploadImage have a thumbnail beside them: remove it too.
  const list = [...new Set(paths.filter(Boolean).flatMap((p) => (thumbPath(p) !== p ? [p, thumbPath(p)] : [p])))];
  if (!list.length) return;
  const { error } = await sb().storage.from(bucket).remove(list);
  if (error) throw error;
}

type Decoded = { src: CanvasImageSource; width: number; height: number; done: () => void };

/** Decodes a picked photo. `<img>` first (applies EXIF rotation everywhere); createImageBitmap as a fallback
 * for formats some browsers only decode that way. */
async function loadImage(file: Blob): Promise<Decoded> {
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("image_unreadable"));
      i.src = url;
    });
    if (img.naturalWidth && img.naturalHeight) return { src: img, width: img.naturalWidth, height: img.naturalHeight, done: () => URL.revokeObjectURL(url) };
  } catch {
    /* try the bitmap decoder below */
  }
  URL.revokeObjectURL(url);
  if (typeof createImageBitmap === "function") {
    try {
      const bmp = await createImageBitmap(file, { imageOrientation: "from-image" } as ImageBitmapOptions);
      return { src: bmp, width: bmp.width, height: bmp.height, done: () => bmp.close() };
    } catch {
      /* unreadable */
    }
  }
  throw new Error("image_unreadable");
}

/** Draws the image no larger than `maxEdge` (browsers apply the EXIF rotation; the metadata itself is dropped). */
async function encode(img: Decoded, maxEdge: number, type: string, quality: number, flatten: boolean): Promise<Blob> {
  const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(img.width * scale));
  canvas.height = Math.max(1, Math.round(img.height * scale));
  const ctx = canvas.getContext("2d")!;
  ctx.imageSmoothingQuality = "high";
  if (flatten) {
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
  }
  ctx.drawImage(img.src, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, type, quality));
  canvas.width = canvas.height = 0; // iOS keeps canvas memory until it is shrunk
  if (!blob) throw new Error("image_encode");
  return blob;
}

/** Re-encodes a picture as JPEG (drops EXIF/GPS, keeps quiz images light). */
export async function toJpeg(file: Blob, maxEdge = 1600, quality = 0.86): Promise<Blob> {
  const img = await loadImage(file);
  try {
    return await encode(img, maxEdge, "image/jpeg", quality, true);
  } finally {
    img.done();
  }
}

export type PreparedImage = { main: Blob; thumb: Blob; ext: "webp" | "jpg"; type: string; before: number; after: number; width: number; height: number };

/**
 * The upload pipeline for every photo: resized (main ≤ maxEdge, thumbnail ≤ thumbEdge), re-encoded as
 * WebP (JPEG where the browser can't write WebP) and stripped of metadata such as GPS location.
 */
export async function prepareImage(file: Blob, { maxEdge = 1600, thumbEdge = 640, quality = 0.8 } = {}): Promise<PreparedImage> {
  const img = await loadImage(file);
  try {
    let main = await encode(img, maxEdge, "image/webp", quality, false);
    const webp = main.type === "image/webp";
    if (!webp) main = await encode(img, maxEdge, "image/jpeg", 0.84, true);
    const type = webp ? "image/webp" : "image/jpeg";
    const thumb = await encode(img, thumbEdge, type, webp ? 0.74 : 0.8, !webp);
    const scale = Math.min(1, maxEdge / Math.max(img.width, img.height));
    return { main, thumb, ext: webp ? "webp" : "jpg", type, before: file.size, after: main.size, width: Math.round(img.width * scale), height: Math.round(img.height * scale) };
  } finally {
    img.done();
  }
}

/** Main image `<dir>/<id>.w.<ext>` with its thumbnail beside it as `.t.<ext>`. */
export const thumbPath = (path: string) => path.replace(/\.w\.(webp|jpg)$/, ".t.$1");

/** Compresses and uploads a photo plus its thumbnail; returns the main object's path. */
export async function uploadImage(bucket: string, dir: string, file: Blob, opts?: { maxEdge?: number; thumbEdge?: number; onProgress?: (p: number) => void }) {
  try {
    const img = await prepareImage(file, { maxEdge: opts?.maxEdge, thumbEdge: opts?.thumbEdge });
    const path = `${dir}/${uid()}.w.${img.ext}`;
    await uploadObject(path, img.main, img.type, opts?.onProgress, bucket);
    await uploadObject(thumbPath(path), img.thumb, img.type, undefined, bucket);
    return { path, before: img.before, after: img.after, width: img.width, height: img.height };
  } catch (e) {
    // Record why (file type and size included) so a failed upload shows up under "أخطاء الموقع".
    const f = file as Partial<File>;
    const message = `upload ${bucket}: ${(e as Error)?.message ?? e} [${f.type || "no-type"} ${Math.round(file.size / 1024)}KB ${(f.name ?? "").split(".").pop()}]`;
    rpc("log_client_error", { p: { message: message.slice(0, 500), source: "uploadImage", path: `${location.pathname}${location.hash.split("?")[0]}` } }).catch(() => undefined);
    throw e;
  }
}

/** "4.8 MB → 214 KB" for the upload toast. */
export const savedText = (before: number, after: number) => `${fmt.size(before)} ← ${fmt.size(after)}`;

/* ─── CSV / download ───────────────────────────────────────────────────── */

export function download(blob: Blob, name: string) {
  if (isNative()) {
    shareFile(blob, name).catch(() => undefined);
    return;
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => {
    URL.revokeObjectURL(a.href);
    a.remove();
  }, 1500);
}

/** UTF-8 CSV with BOM (Excel shows Arabic correctly); cells that could run as formulas are neutralised. */
export function downloadCsv(name: string, rows: (string | number | boolean | null | undefined)[][]) {
  const cell = (v: string | number | boolean | null | undefined) => {
    let s = v == null ? "" : String(v);
    if (typeof v === "string" && /^[=+\-@\t\r]/.test(s)) s = `'${s}`;
    return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  download(new Blob([`﻿${rows.map((r) => r.map(cell).join(",")).join("\r\n")}`], { type: "text/csv;charset=utf-8" }), name);
}

export const today = () => new Date().toISOString().slice(0, 10);

/* ─── Feedback for the scanner ─────────────────────────────────────────── */

let audio: AudioContext | null = null;
export function feedback(kind: "ok" | "warn" | "error") {
  try {
    audio ??= new AudioContext();
    const t = audio.currentTime;
    const tone = (freq: number, at: number, dur: number) => {
      const o = audio!.createOscillator();
      const g = audio!.createGain();
      o.type = "sine";
      o.frequency.value = freq;
      g.gain.setValueAtTime(0.0001, t + at);
      g.gain.exponentialRampToValueAtTime(0.3, t + at + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t + at + dur);
      o.connect(g).connect(audio!.destination);
      o.start(t + at);
      o.stop(t + at + dur + 0.05);
    };
    if (kind === "ok") tone(1480, 0, 0.12);
    else if (kind === "warn") (tone(880, 0, 0.1), tone(880, 0.16, 0.1));
    else (tone(260, 0, 0.18), tone(200, 0.22, 0.22));
  } catch {
    /* audio is optional */
  }
  try {
    navigator.vibrate?.(kind === "ok" ? 45 : [70, 50, 70]);
  } catch {
    /* vibration is optional */
  }
}
