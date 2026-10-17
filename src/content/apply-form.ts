/**
 * The join form as the team set it up in the app (site_settings «apply_form»), on top of the built-in
 * questions. The website, the review screen and the editor all read it through here.
 * Core questions (name, phone, email, first track, consent) always show; the rest can be renamed,
 * made optional or required, hidden, and (for lists) given other choices. Extra questions are added
 * to any of the three steps and their answers are kept with the application.
 */
import { DAYS, FACULTIES, HEARD_FROM, HOURS, LEVELS, TEAM_ROLES, YEARS } from "./application";

type L = { ar: string; en: string };
export type Locale = "ar" | "en";

export type BuiltinKey =
  | "full_name"
  | "national_id"
  | "phone"
  | "email"
  | "governorate"
  | "address"
  | "faculty"
  | "academic_year"
  | "student_number"
  | "track_first"
  | "track_second"
  | "experience_level"
  | "skills"
  | "experience"
  | "portfolio_url"
  | "team_roles"
  | "motivation"
  | "goals"
  | "hours_per_week"
  | "days"
  | "heard_from";

export type ApplyOption = { key: string; ar: string; en?: string; hint_ar?: string; hint_en?: string };
export type BuiltinCfg = { label_ar?: string; label_en?: string; hint_ar?: string; hint_en?: string; hidden?: boolean; required?: boolean; options?: ApplyOption[] };
export type ExtraType = "text" | "textarea" | "select" | "multi" | "yesno" | "number" | "url" | "date";
export type ExtraQ = { id: string; step: 0 | 1 | 2; type: ExtraType; label_ar: string; label_en?: string; help_ar?: string; help_en?: string; required?: boolean; options?: { ar: string; en?: string }[] };
export type ApplyConfig = {
  steps_ar?: string[];
  steps_en?: string[];
  fields?: Partial<Record<BuiltinKey, BuiltinCfg>>;
  extra?: ExtraQ[];
  /** Tracks not offered on the form. */
  tracks_hidden?: string[];
  consent_ar?: string;
  consent_en?: string;
};
/** One extra answer as stored on the application. */
export type ExtraAnswer = { id: string; q: string; a: string };

type Meta = {
  key: BuiltinKey;
  step: 0 | 1 | 2;
  label: L;
  hint?: L;
  /** Always shown and required. */
  lock?: boolean;
  /** Required unless the team says otherwise. */
  req?: boolean;
  /** Which list of choices it uses (and the team can change). */
  list?: "faculty" | "year" | "level" | "hours" | "days" | "heard" | "roles";
};

export const BUILTIN: Meta[] = [
  { key: "full_name", step: 0, lock: true, label: { ar: "الاسم رباعي (زي البطاقة)", en: "Full name (four names, as on your ID)" } },
  // What the Student Welfare family list asks for: national ID, address, level.
  { key: "national_id", step: 0, req: true, label: { ar: "الرقم القومي", en: "National ID number" }, hint: { ar: "الـ14 رقم اللي على البطاقة — بنحتاجه لكشف الأسرة في رعاية الطلاب.", en: "The 14 digits on your ID card — needed for the Student Welfare family list." } },
  { key: "phone", step: 0, lock: true, label: { ar: "رقم الموبايل / واتساب", en: "Phone / WhatsApp" }, hint: { ar: "هنتواصل معاك على واتساب.", en: "We'll contact you on WhatsApp." } },
  { key: "email", step: 0, lock: true, label: { ar: "الإيميل", en: "Email" } },
  { key: "governorate", step: 0, req: true, label: { ar: "المحافظة", en: "Governorate" } },
  { key: "address", step: 0, req: true, label: { ar: "العنوان بالتفصيل", en: "Full address" }, hint: { ar: "المدينة أو القرية والمنطقة والشارع، مثلاً: دمياط الجديدة - الحي الخامس - المجاورة 28", en: "City or village, area and street, e.g. New Damietta - 5th district - block 28" } },
  { key: "faculty", step: 0, req: true, list: "faculty", label: { ar: "الكلية", en: "Faculty" }, hint: { ar: "اختار من القايمة أو اكتب اسم كليتك.", en: "Pick from the list or type your faculty." } },
  { key: "academic_year", step: 0, req: true, list: "year", label: { ar: "السنة الدراسية", en: "Academic year" } },
  { key: "student_number", step: 0, req: true, label: { ar: "الرقم الجامعي (الكود)", en: "University ID (student code)" } },
  { key: "track_first", step: 1, lock: true, label: { ar: "عايز تنضم لأنهي مسار؟", en: "Which track do you want to join?" } },
  { key: "track_second", step: 1, label: { ar: "اختيارك التاني", en: "Second choice" } },
  { key: "experience_level", step: 1, req: true, list: "level", label: { ar: "مستوى خبرتك", en: "Your experience level" } },
  { key: "skills", step: 1, label: { ar: "مهارات أو أدوات بتعرفها", en: "Skills or tools you know" }, hint: { ar: "مثلاً: Python، Arduino، فوتوشوب، Excel", en: "For example: Python, Arduino, Photoshop, Excel" } },
  { key: "experience", step: 1, label: { ar: "مشاريع أو كورسات أو مسابقات عملتها قبل كده", en: "Projects, courses or competitions you've done" } },
  { key: "portfolio_url", step: 1, label: { ar: "لينك لشغلك (GitHub، Behance، LinkedIn…)", en: "Link to your work (GitHub, Behance, LinkedIn…)" } },
  { key: "team_roles", step: 1, list: "roles", label: { ar: "تحب كمان تساعد في تنظيم المجتمع؟", en: "Would you also like to help run the community?" }, hint: { ar: "اختار اللي يعجبك — أو ولا حاجة.", en: "Choose any — or none." } },
  { key: "motivation", step: 2, req: true, label: { ar: "ليه عايز تنضم لـ BuildX HUE؟", en: "Why do you want to join BuildX HUE?" }, hint: { ar: "كام سطر بصراحة كفاية جداً.", en: "A few honest sentences are perfect." } },
  { key: "goals", step: 2, label: { ar: "نفسك تبني أو تتعلّم إيه السنة دي؟", en: "What would you like to build or learn this year?" } },
  { key: "hours_per_week", step: 2, req: true, list: "hours", label: { ar: "تقدر تدّينا كام ساعة في الأسبوع؟", en: "How many hours a week can you give?" } },
  { key: "days", step: 2, list: "days", label: { ar: "أنهي أيام بتبقى مناسبة ليك عادةً؟", en: "Which days usually suit you?" } },
  { key: "heard_from", step: 2, list: "heard", label: { ar: "عرفت عنّا منين؟", en: "How did you hear about us?" } },
];
export const BUILTIN_KEYS = BUILTIN.map((m) => m.key);
export const metaOf = (k: BuiltinKey) => BUILTIN.find((m) => m.key === k)!;

export const DEFAULT_STEPS: Record<Locale, string[]> = { ar: ["بياناتك", "اهتماماتك", "دافعك ووقتك"], en: ["About you", "Your interests", "Motivation & time"] };
export const DEFAULT_CONSENT: L = { ar: "موافق إن BuildX HUE يحتفظ بطلبي عشان يراجعه ويتواصل معايا.", en: "I agree that BuildX HUE stores my application to review it and contact me." };

export const DEFAULT_LISTS: Record<NonNullable<Meta["list"]>, ApplyOption[]> = {
  faculty: FACULTIES.map((f) => ({ key: f.ar, ar: f.ar, en: f.en })),
  year: YEARS.map((y) => ({ key: y.key, ar: y.label.ar, en: y.label.en })),
  level: LEVELS.map((l) => ({ key: l.key, ar: l.label.ar, en: l.label.en, hint_ar: l.hint.ar, hint_en: l.hint.en })),
  hours: HOURS.map((h) => ({ key: h.key, ar: h.label.ar, en: h.label.en })),
  days: DAYS.map((d) => ({ key: d.key, ar: d.label.ar, en: d.label.en })),
  heard: HEARD_FROM.map((h) => ({ key: h.key, ar: h.label.ar, en: h.label.en })),
  roles: TEAM_ROLES.map((r) => ({ key: r.key, ar: r.label.ar, en: r.label.en })),
};

export type Resolved = {
  key: BuiltinKey;
  step: 0 | 1 | 2;
  label: string;
  hint: string;
  hidden: boolean;
  required: boolean;
  options: ApplyOption[];
};

const str = (v: unknown, max: number) => (typeof v === "string" ? v.slice(0, max) : undefined);
const bool = (v: unknown) => (typeof v === "boolean" ? v : undefined);

/** Whatever came from the database, as a config the form can trust (bad parts are dropped). */
export function parseApplyConfig(raw: unknown): ApplyConfig {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const r = raw as Record<string, unknown>;
  const out: ApplyConfig = {};
  const steps = (v: unknown) => (Array.isArray(v) ? v.slice(0, 3).map((s) => str(s, 60) ?? "") : undefined);
  out.steps_ar = steps(r.steps_ar);
  out.steps_en = steps(r.steps_en);
  out.consent_ar = str(r.consent_ar, 400);
  out.consent_en = str(r.consent_en, 400);
  if (Array.isArray(r.tracks_hidden)) out.tracks_hidden = r.tracks_hidden.filter((x): x is string => typeof x === "string").slice(0, 20);
  if (r.fields && typeof r.fields === "object") {
    out.fields = {};
    for (const k of BUILTIN_KEYS) {
      const f = (r.fields as Record<string, unknown>)[k];
      if (!f || typeof f !== "object") continue;
      const x = f as Record<string, unknown>;
      const opts = Array.isArray(x.options)
        ? x.options
            .filter((o): o is Record<string, unknown> => !!o && typeof o === "object" && typeof (o as Record<string, unknown>).key === "string" && typeof (o as Record<string, unknown>).ar === "string")
            .slice(0, 40)
            .map((o) => ({ key: String(o.key).slice(0, 60), ar: String(o.ar).slice(0, 120), en: str(o.en, 120), hint_ar: str(o.hint_ar, 160), hint_en: str(o.hint_en, 160) }))
        : undefined;
      out.fields[k] = { label_ar: str(x.label_ar, 300), label_en: str(x.label_en, 300), hint_ar: str(x.hint_ar, 300), hint_en: str(x.hint_en, 300), hidden: bool(x.hidden), required: bool(x.required), options: opts?.length ? opts : undefined };
    }
  }
  if (Array.isArray(r.extra)) {
    const TYPES: ExtraType[] = ["text", "textarea", "select", "multi", "yesno", "number", "url", "date"];
    out.extra = r.extra
      .filter((q): q is Record<string, unknown> => !!q && typeof q === "object")
      .map((q) => ({
        id: String(q.id ?? ""),
        step: ([0, 1, 2].includes(Number(q.step)) ? Number(q.step) : 2) as 0 | 1 | 2,
        type: (TYPES.includes(q.type as ExtraType) ? q.type : "text") as ExtraType,
        label_ar: str(q.label_ar, 300) ?? "",
        label_en: str(q.label_en, 300),
        help_ar: str(q.help_ar, 300),
        help_en: str(q.help_en, 300),
        required: !!q.required,
        options: Array.isArray(q.options) ? q.options.filter((o): o is { ar: string; en?: string } => !!o && typeof o === "object" && typeof (o as { ar?: unknown }).ar === "string").slice(0, 30).map((o) => ({ ar: o.ar.slice(0, 120), en: str(o.en, 120) })) : undefined,
      }))
      .filter((q) => /^q_[a-z0-9]{4,16}$/.test(q.id) && q.label_ar.trim())
      .slice(0, 25);
  }
  return out;
}

const pick = (locale: Locale, ar: string | undefined, en: string | undefined, fallback: L) => (locale === "ar" ? ar?.trim() || fallback.ar : en?.trim() || fallback.en);

/** Each built-in question as the visitor sees it. */
export function resolveField(cfg: ApplyConfig, key: BuiltinKey, locale: Locale): Resolved {
  const m = metaOf(key);
  const f = cfg.fields?.[key] ?? {};
  const hidden = !m.lock && !!f.hidden;
  const options = m.list ? (f.options?.length ? f.options : DEFAULT_LISTS[m.list]) : [];
  return {
    key,
    step: m.step,
    label: pick(locale, f.label_ar, f.label_en, m.label),
    hint: pick(locale, f.hint_ar, f.hint_en, m.hint ?? { ar: "", en: "" }),
    hidden,
    required: m.lock ? true : hidden ? false : (f.required ?? !!m.req),
    options,
  };
}

export const stepTitles = (cfg: ApplyConfig, locale: Locale) => DEFAULT_STEPS[locale].map((d, i) => (locale === "ar" ? cfg.steps_ar?.[i] : cfg.steps_en?.[i])?.trim() || d);
export const consentText = (cfg: ApplyConfig, locale: Locale) => pick(locale, cfg.consent_ar, cfg.consent_en, DEFAULT_CONSENT);
export const optionText = (o: ApplyOption | { ar: string; en?: string }, locale: Locale) => (locale === "ar" ? o.ar : o.en?.trim() || o.ar);
export const extraLabel = (q: ExtraQ, locale: Locale) => (locale === "ar" ? q.label_ar : q.label_en?.trim() || q.label_ar);
export const extraHelp = (q: ExtraQ, locale: Locale) => (locale === "ar" ? q.help_ar ?? "" : q.help_en?.trim() || q.help_ar || "");

/** A stored choice (key) shown with the team's current wording, falling back to the built-in list. */
export function choiceLabel(cfg: ApplyConfig, key: BuiltinKey, value: string | null | undefined, locale: Locale = "ar") {
  if (!value) return "";
  const m = metaOf(key);
  if (!m.list) return value;
  const hit = (cfg.fields?.[key]?.options ?? []).find((o) => o.key === value) ?? DEFAULT_LISTS[m.list].find((o) => o.key === value);
  return hit ? optionText(hit, locale) : value;
}

/** New ids for extra questions and choices. */
export const newId = (prefix: "q_" | "o_") => prefix + Math.random().toString(36).slice(2, 10).replace(/[^a-z0-9]/g, "x").padEnd(6, "0");
