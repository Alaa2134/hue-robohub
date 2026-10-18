"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/brand/icons";
import { inputCls } from "@/components/command/field";
import { BUILTIN_KEYS, consentText, extraHelp, extraLabel, optionText, parseApplyConfig, resolveField, stepTitles, type ApplyConfig, type BuiltinKey, type ExtraQ, type Resolved } from "@/content/apply-form";
import { GOVERNORATES, digitsOnly, readNationalId } from "@/content/family";
import { cn } from "@/lib/cn";
import { whatsappLink } from "@/lib/contact";
import { asciiDigits } from "@/lib/format";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";
import { WaitlistForm } from "./site-forms";

export type ApplyTrack = { slug: string; name: string; tagline: string };

type Data = {
  full_name: string;
  national_id: string;
  phone: string;
  email: string;
  governorate: string;
  address: string;
  faculty: string;
  academic_year: string;
  student_number: string;
  track_first: string;
  track_second: string;
  team_roles: string[];
  experience_level: string;
  skills: string;
  experience: string;
  portfolio_url: string;
  motivation: string;
  goals: string;
  hours_per_week: string;
  days: string[];
  heard_from: string;
  consent: boolean;
  /** Extra questions the team added (by question id). */
  answers: Record<string, string | string[]>;
};

const EMPTY: Data = {
  full_name: "",
  national_id: "",
  phone: "",
  email: "",
  governorate: "",
  address: "",
  faculty: "",
  academic_year: "",
  student_number: "",
  track_first: "",
  track_second: "",
  team_roles: [],
  experience_level: "",
  skills: "",
  experience: "",
  portfolio_url: "",
  motivation: "",
  goals: "",
  hours_per_week: "",
  days: [],
  heard_from: "",
  consent: false,
  answers: {},
};

const DRAFT_KEY = "buildx_apply_draft_v1";

/**
 * Where people stop: each step reached (and the sent screen) is counted once per visit as a page
 * view of /join/step-N/ (or /join/sent/), so the visits screen in the app shows the drop-off.
 */
const seenSteps = new Set<string>();
function trackStep(locale: string, step: string) {
  const path = `${locale === "ar" ? "/ar" : ""}/join/${step}/`;
  if (seenSteps.has(path)) return;
  seenSteps.add(path);
  fetch(`${SUPABASE_URL}/rest/v1/rpc/track_view`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_path: path, p_locale: locale }), keepalive: true }).catch(() => undefined);
}
const STEP_FIELDS: BuiltinKey[][] = [
  ["full_name", "national_id", "phone", "email", "governorate", "address", "faculty", "academic_year", "student_number"],
  ["track_first", "track_second", "experience_level", "skills", "experience", "portfolio_url", "team_roles"],
  ["motivation", "goals", "hours_per_week", "days", "heard_from"],
];

const T = {
  en: {
    review: "Review",
    optional: "Optional",
    next: "Next",
    back: "Back",
    edit: "Edit",
    submit: "Submit application",
    sending: "Sending…",
    of: "of",
    none: "No second choice",
    yes: "Yes",
    no: "No",
    born: "Born",
    err: {
      required: "This field is required.",
      name: "Write your full name (at least 3 letters).",
      four: "Write your four names, as on your ID card.",
      nid: "This doesn't look like a national ID — check the 14 digits.",
      address: "Write the full address: city or village, area and street.",
      phone: "Enter a valid phone number, e.g. 01012345678.",
      email: "Enter a valid email address.",
      motivation: "Write at least 20 characters.",
      url: "Enter a full link starting with https://",
      number: "Enter a number.",
      consent: "Please agree so we can review your application.",
      invalid: "Some answers look wrong. Please check them and try again.",
      busy: "Lots of people are applying right now. Please try again in a minute.",
      rateLimited: "Too many applications came from this network in the last hour. Please try again later.",
      closed: "Applications are closed right now.",
      network: "We couldn't reach the server. Check your connection and try again.",
    },
    done: "Application received!",
    doneBody: "Thank you for applying to BuildX HUE. Our team will review your answers and contact you on WhatsApp with the next steps.",
    dupBody: "You already applied in the last few days — your application is with our team. Its reference was shown when you applied (and saved on that device); we'll contact you on your phone.",
    refLabel: "Your reference",
    trackIt: "Track your application",
    saveRef: "Save this number — you'll use it with your phone number to check your application's status.",
    waFollow: "Message us on WhatsApp",
    another: "Submit another application",
    waText: (ref: string) => `Hi BuildX HUE! I just applied — my reference is ${ref}.`,
  },
  ar: {
    review: "المراجعة",
    optional: "اختياري",
    next: "التالي",
    back: "رجوع",
    edit: "تعديل",
    submit: "ابعت الطلب",
    sending: "بيتبعت…",
    of: "من",
    none: "مفيش اختيار تاني",
    yes: "أيوه",
    no: "لأ",
    born: "مواليد",
    err: {
      required: "الخانة دي مطلوبة.",
      name: "اكتب اسمك بالكامل (3 حروف على الأقل).",
      four: "اكتب اسمك رباعي زي البطاقة.",
      nid: "الرقم ده مش شبه الرقم القومي — راجع الـ14 رقم.",
      address: "اكتب العنوان بالتفصيل: المدينة أو القرية والمنطقة والشارع.",
      phone: "اكتب رقم صحيح، مثلاً 01012345678.",
      email: "اكتب إيميل صحيح.",
      motivation: "اكتب 20 حرف على الأقل.",
      url: "اكتب اللينك كامل وبيبدأ بـ https://",
      number: "اكتب رقم.",
      consent: "لازم توافق عشان نقدر نراجع طلبك.",
      invalid: "فيه إجابات شكلها غلط. راجعها وجرّب تاني.",
      busy: "فيه ناس كتير بتقدّم دلوقتي. جرّب تاني بعد دقيقة.",
      rateLimited: "اتبعت طلبات كتير من نفس الشبكة في آخر ساعة. جرّب تاني بعد شوية.",
      closed: "التقديم مقفول دلوقتي.",
      network: "مقدرناش نوصل للسيرفر. اتأكد من النت وجرّب تاني.",
    },
    done: "طلبك وصل!",
    doneBody: "شكراً إنك قدّمت في BuildX HUE. فريقنا هيراجع إجاباتك وهيتواصل معاك على واتساب بالخطوات الجاية.",
    dupBody: "انت قدّمت قبل كده من كام يوم — طلبك عند الفريق. رقمه المرجعي ظهرلك وقت التقديم (ومتسجّل على الجهاز اللي قدّمت منه)، وهنكلمك على رقمك.",
    refLabel: "رقم طلبك",
    trackIt: "تابع حالة طلبك",
    saveRef: "احتفظ بالرقم ده — هتستخدمه مع رقم موبايلك عشان تعرف حالة طلبك.",
    waFollow: "كلّمنا على واتساب",
    another: "قدّم طلب تاني",
    waText: (ref: string) => `أهلاً BuildX HUE! لسه مقدّم طلب ورقمه ${ref}.`,
  },
};

const PHONE_RE = /^\+?[0-9]{8,15}$/;
const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const URL_RE = /^https?:\/\/\S+\.\S+/;
const cleanPhone = (v: string) => asciiDigits(v).replace(/[^0-9+]/g, "");

type Fields = Record<BuiltinKey, Resolved>;
type Errors = Record<string, string | undefined>;
/** Error/field id of an extra question. */
const xid = (q: ExtraQ) => `x_${q.id}`;
const answerOf = (d: Data, q: ExtraQ) => d.answers[q.id] ?? (q.type === "multi" ? [] : "");
const isEmpty = (v: string | string[]) => (Array.isArray(v) ? !v.length : !v.trim());

function validate(d: Data, step: number, F: Fields, extra: ExtraQ[], t: (typeof T)["en"]): Errors {
  const e: Errors = {};
  const on = (k: BuiltinKey) => STEP_FIELDS[step]!.includes(k) && !F[k].hidden;
  const empty = (k: BuiltinKey) => isEmpty(d[k] as string | string[]);
  if (on("full_name") && d.full_name.trim().length < 3) e.full_name = t.err.name;
  else if (on("full_name") && d.full_name.trim().split(/\s+/).length < 4) e.full_name = t.err.four;
  if (on("national_id") && (F.national_id.required || d.national_id.trim()) && !readNationalId(d.national_id)) e.national_id = d.national_id.trim() ? t.err.nid : t.err.required;
  if (on("address") && (F.address.required || d.address.trim()) && d.address.trim().length < 5) e.address = d.address.trim() ? t.err.address : t.err.required;
  if (on("phone") && !PHONE_RE.test(cleanPhone(d.phone))) e.phone = t.err.phone;
  if (on("email") && !EMAIL_RE.test(d.email.trim())) e.email = t.err.email;
  if (on("faculty") && (F.faculty.required || d.faculty.trim()) && d.faculty.trim().length < 2) e.faculty = t.err.required;
  if (on("track_first") && !d.track_first) e.track_first = t.err.required;
  if (on("portfolio_url") && d.portfolio_url.trim() && !URL_RE.test(d.portfolio_url.trim())) e.portfolio_url = t.err.url;
  if (on("motivation") && F.motivation.required && d.motivation.trim().length < 20) e.motivation = t.err.motivation;
  for (const k of ["governorate", "academic_year", "student_number", "track_second", "experience_level", "skills", "experience", "portfolio_url", "team_roles", "goals", "hours_per_week", "days", "heard_from"] as BuiltinKey[])
    if (on(k) && F[k].required && empty(k) && !e[k]) e[k] = t.err.required;
  for (const q of extra.filter((x) => x.step === step)) {
    const v = answerOf(d, q);
    if (isEmpty(v)) {
      if (q.required) e[xid(q)] = t.err.required;
    } else if (q.type === "url" && !URL_RE.test(String(v).trim())) e[xid(q)] = t.err.url;
    else if (q.type === "number" && !/^-?[0-9]{1,12}([.,][0-9]{1,4})?$/.test(String(v).trim())) e[xid(q)] = t.err.number;
  }
  if (step === 2 && !d.consent) e.consent = t.err.consent;
  return e;
}

function Row({ id, label: text, optional, hint, error, children, className }: { id: string; label: string; optional?: string; hint?: ReactNode; error?: string; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-[0.95rem] font-semibold text-frost">
        {text}
        {optional && <span className="text-xs font-normal text-fog">{optional}</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-fog">{hint}</p>
      ) : null}
    </div>
  );
}

/** A question whose answer is picked from buttons: a title, the buttons, then the error or hint. */
function Group({ id, label: text, optional, hint, error, children }: { id: string; label: string; optional?: string; hint?: string; error?: string; children: ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <p id={`${id}-label`} className="flex items-baseline justify-between gap-3 text-[0.95rem] font-semibold text-frost">
        {text}
        {optional && <span className="text-xs font-normal text-fog">{optional}</span>}
      </p>
      {children}
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <p className="text-sm text-fog">{hint}</p>
      ) : null}
    </div>
  );
}

function Chip({ on, onClick, children, id }: { on: boolean; onClick: () => void; children: ReactNode; id?: string }) {
  return (
    <button
      id={id}
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={cn(
        "flex min-h-11 items-center gap-2 rounded-xl border px-4 py-2 text-start text-[0.95rem] transition-colors",
        on ? "border-cyan/70 bg-volt/20 text-chalk" : "border-[var(--line-2)] bg-deep/60 text-mist hover:border-volt/50 hover:text-chalk",
      )}
    >
      <span className={cn("flex size-5 shrink-0 items-center justify-center rounded-md border", on ? "border-cyan bg-cyan text-void" : "border-steel")}>{on && <Icon name="check" size={13} />}</span>
      {children}
    </button>
  );
}

const pickCls = (on: boolean) => cn("rounded-xl border text-start transition-colors", on ? "border-cyan/70 bg-volt/20" : "border-[var(--line-2)] bg-deep/60 hover:border-volt/50");

/** One question the team added in the app. */
function ExtraField({ q, value, error, locale, t, onChange }: { q: ExtraQ; value: string | string[]; error?: string; locale: "en" | "ar"; t: (typeof T)["en"]; onChange: (v: string | string[]) => void }) {
  const id = `ap-${xid(q)}`;
  const text = extraLabel(q, locale);
  const optional = q.required ? undefined : t.optional;
  const hint = extraHelp(q, locale);
  const aria = { id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : undefined };
  const opts = q.options ?? [];
  if (q.type === "select" || q.type === "yesno") {
    const list = q.type === "yesno" ? [{ v: "yes", l: t.yes }, { v: "no", l: t.no }] : opts.map((o) => ({ v: o.ar, l: optionText(o, locale) }));
    return (
      <Group id={id} label={text} optional={optional} hint={hint} error={error}>
        <div role="radiogroup" aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2">
          {list.map((o, i) => (
            <button key={o.v} id={i === 0 ? id : undefined} type="button" role="radio" aria-checked={value === o.v} onClick={() => onChange(value === o.v && !q.required ? "" : o.v)} className={cn(pickCls(value === o.v), "min-h-11 px-4 py-2 text-[0.95rem] font-semibold", value === o.v ? "text-chalk" : "text-mist")}>
              {o.l}
            </button>
          ))}
        </div>
      </Group>
    );
  }
  if (q.type === "multi") {
    const arr = Array.isArray(value) ? value : [];
    return (
      <Group id={id} label={text} optional={optional} hint={hint} error={error}>
        <div className="flex flex-wrap gap-2">
          {opts.map((o, i) => (
            <Chip key={o.ar} id={i === 0 ? id : undefined} on={arr.includes(o.ar)} onClick={() => onChange(arr.includes(o.ar) ? arr.filter((x) => x !== o.ar) : [...arr, o.ar])}>
              {optionText(o, locale)}
            </Chip>
          ))}
        </div>
      </Group>
    );
  }
  const v = typeof value === "string" ? value : "";
  return (
    <Row id={id} label={text} optional={optional} hint={hint} error={error} className={q.type === "textarea" ? "sm:col-span-2" : undefined}>
      {q.type === "textarea" ? (
        <textarea {...aria} className={cn(inputCls, "h-auto min-h-24 py-3 leading-relaxed")} maxLength={2000} value={v} onChange={(e) => onChange(e.target.value)} />
      ) : (
        <input
          {...aria}
          className={inputCls}
          type={q.type === "url" ? "url" : q.type === "date" ? "date" : "text"}
          inputMode={q.type === "number" ? "decimal" : q.type === "url" ? "url" : undefined}
          dir={q.type === "url" || q.type === "number" ? "ltr" : undefined}
          placeholder={q.type === "url" ? "https://" : undefined}
          maxLength={300}
          value={v}
          onChange={(e) => onChange(e.target.value)}
        />
      )}
    </Row>
  );
}

export function ApplyForm({ locale, tracks, whatsapp }: { locale: "en" | "ar"; tracks: ApplyTrack[]; whatsapp?: string }) {
  const t = T[locale];
  const [d, setD] = useState<Data>(EMPTY);
  const [step, setStep] = useState(0);
  useEffect(() => {
    if (step > 0) trackStep(locale, `step-${step + 1}`);
  }, [step, locale]);
  const [errors, setErrors] = useState<Errors>({});
  const [formError, setFormError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ ref: string; duplicate: boolean } | null>(null);
  const [closed, setClosed] = useState<string | null>(null);
  // The questions as the team set them up in the app (the built-in form until it loads).
  const [cfg, setCfg] = useState<ApplyConfig>({});

  // The team can close the intake from the app; read it before showing the form.
  useEffect(() => {
    let alive = true;
    fetch(`${SUPABASE_URL}/rest/v1/site_settings?select=value&key=eq.applications`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { value?: { open?: boolean; message_ar?: string; message_en?: string } }[]) => {
        const v = rows[0]?.value;
        if (alive && v && v.open === false) setClosed((locale === "ar" ? v.message_ar : v.message_en) || "");
      })
      .catch(() => undefined);
    fetch(`${SUPABASE_URL}/rest/v1/site_settings?select=value&key=eq.apply_form`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { value?: unknown }[]) => {
        if (alive && rows[0]?.value) setCfg(parseApplyConfig(rows[0].value));
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [locale]);
  const top = useRef<HTMLDivElement>(null);
  const honey = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  const F = useMemo(() => Object.fromEntries(BUILTIN_KEYS.map((k) => [k, resolveField(cfg, k, locale)])) as Fields, [cfg, locale]);
  const extra = useMemo(() => cfg.extra ?? [], [cfg]);
  const steps = useMemo(() => [...stepTitles(cfg, locale), t.review], [cfg, locale, t.review]);
  const nid = useMemo(() => readNationalId(d.national_id), [d.national_id]);
  const shownTracks = useMemo(() => tracks.filter((x) => !cfg.tracks_hidden?.includes(x.slug)), [tracks, cfg]);

  // Restore an unfinished draft (per browser only), then keep it saved as the student types.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const saved = JSON.parse(raw) as Partial<Data>;
        setD({ ...EMPTY, ...saved, answers: saved.answers && typeof saved.answers === "object" ? saved.answers : {}, national_id: "", consent: false });
      }
    } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current || done) return;
    try {
      // The national ID never stays on the device.
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, national_id: "", consent: false }));
    } catch {}
  }, [d, done]);

  const set = <K extends keyof Data>(k: K, v: Data[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    setErrors((p) => (p[k] ? { ...p, [k]: undefined } : p));
  };
  const setAnswer = (q: ExtraQ, v: string | string[]) => {
    setD((p) => ({ ...p, answers: { ...p.answers, [q.id]: v } }));
    setErrors((p) => (p[xid(q)] ? { ...p, [xid(q)]: undefined } : p));
  };
  const toggle = (k: "team_roles" | "days", v: string) => set(k, d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v]);

  const scrollTop = () => top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const go = (n: number) => {
    setStep(n);
    setFormError("");
    requestAnimationFrame(scrollTop);
  };
  const next = () => {
    const e = validate(d, step, F, extra, t);
    setErrors(e);
    const first = Object.keys(e).find((k) => e[k]);
    if (first) {
      document.getElementById(`ap-${first}`)?.focus();
      return;
    }
    go(step + 1);
  };

  const submit = async () => {
    for (let s = 0; s < 3; s++) {
      const e = validate(d, s, F, extra, t);
      if (Object.values(e).some(Boolean)) {
        setErrors(e);
        go(s);
        return;
      }
    }
    setSending(true);
    setFormError("");
    try {
      // Only what the form shows now goes out: hidden questions empty, extra answers by question.
      const blank = Object.fromEntries(
        BUILTIN_KEYS.filter((k) => F[k].hidden).map((k) => [k, Array.isArray(d[k as keyof Data]) ? [] : ""]),
      );
      const answers = Object.fromEntries(extra.map((q) => [q.id, answerOf(d, q)]).filter(([, v]) => !isEmpty(v as string | string[])));
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_application`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p: { ...d, ...blank, answers, national_id: digitsOnly(d.national_id), phone: cleanPhone(d.phone), locale, website: honey.current?.value ?? "" } }),
      });
      const out = (await res.json().catch(() => null)) as { ok?: boolean; ref?: string; duplicate?: boolean; error?: string } | null;
      if (!res.ok || !out) throw new Error("network");
      if (!out.ok) {
        if (out.error === "closed") setClosed("");
        setFormError(out.error === "busy" ? t.err.busy : out.error === "rate_limited" ? t.err.rateLimited : out.error === "closed" ? t.err.closed : t.err.invalid);
        return;
      }
      // A repeat no longer gets the reference back from the server (anyone could ask with a phone
      // number); the device that applied still has it.
      let ref = out.ref ?? "";
      if (!ref && out.duplicate)
        try {
          ref = localStorage.getItem("bx-last-ref") ?? "";
        } catch {}
      setDone({ ref, duplicate: !!out.duplicate });
      trackStep(locale, "sent");
      try {
        localStorage.removeItem(DRAFT_KEY);
        if (out.ref && out.ref !== "BX-000000") localStorage.setItem("bx-last-ref", out.ref);
      } catch {}
      requestAnimationFrame(scrollTop);
    } catch {
      setFormError(t.err.network);
    } finally {
      setSending(false);
    }
  };

  const trackName = useMemo(() => Object.fromEntries(tracks.map((x) => [x.slug, x.name])), [tracks]);

  if (closed !== null && !done) {
    return (
      <div role="status" className="frame flex flex-col items-start gap-4 p-7 sm:p-10">
        <span className="flex size-14 items-center justify-center rounded-2xl border border-warn/40 bg-warn/10 text-warn">
          <Icon name="clock" size={26} />
        </span>
        <p className="t-headline text-3xl text-chalk">{t.err.closed}</p>
        <p className="max-w-xl text-lg leading-relaxed text-mist">{closed || (locale === "ar" ? "تابعنا عشان تعرف أول ما التقديم يفتح تاني." : "Follow us to hear the moment applications open again.")}</p>
        <div className="mt-2 w-full border-t border-[var(--line)] pt-5">
          <WaitlistForm locale={locale} />
        </div>
      </div>
    );
  }

  if (done) {
    const wa = whatsapp ? whatsappLink(whatsapp, t.waText(done.ref)) : null;
    return (
      <div ref={top} role="status" className="frame flex scroll-mt-28 flex-col items-start gap-5 p-7 sm:p-10" style={{ ["--edge" as string]: 0.8 }}>
        <span className="flex size-14 items-center justify-center rounded-2xl border border-ok/40 bg-ok/10 text-ok">
          <Icon name="check" size={28} />
        </span>
        <p className="t-headline text-3xl text-chalk">{t.done}</p>
        <p className="max-w-xl text-lg leading-relaxed text-mist">{done.duplicate ? t.dupBody : t.doneBody}</p>
        {done.ref && (
          <div className="rounded-xl border border-[var(--line-2)] bg-void/50 px-5 py-3">
            <p className="text-sm text-fog">{t.refLabel}</p>
            <p className="t-display text-3xl text-cyan" dir="ltr">
              {done.ref}
            </p>
            <p className="mt-2 max-w-sm text-sm text-mist">{t.saveRef}</p>
          </div>
        )}
        <div className="flex flex-wrap gap-3">
          <a href={`${locale === "ar" ? "/ar" : ""}/join/status/?ref=${encodeURIComponent(done.ref)}`} className="btn btn-primary">
            <span>{t.trackIt}</span>
          </a>
          {wa && (
            <a href={wa} target="_blank" rel="noopener noreferrer" className="btn">
              <span>{t.waFollow}</span>
            </a>
          )}
          <button
            type="button"
            className="btn"
            onClick={() => {
              setD(EMPTY);
              setDone(null);
              setStep(0);
            }}
          >
            {t.another}
          </button>
        </div>
      </div>
    );
  }

  const err = (k: string) => errors[k];
  const aria = (k: BuiltinKey) => ({ id: `ap-${k}`, "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? `ap-${k}-error` : undefined });
  const opt = (k: BuiltinKey) => (F[k].required ? undefined : t.optional);
  const show = (k: BuiltinKey) => !F[k].hidden;
  const extras = (s: number) =>
    extra
      .filter((q) => q.step === s)
      .map((q) => <ExtraField key={q.id} q={q} value={answerOf(d, q)} error={err(xid(q))} locale={locale} t={t} onChange={(v) => setAnswer(q, v)} />);
  const opLabel = (k: BuiltinKey, v: string) => {
    const o = F[k].options.find((x) => x.key === v);
    return o ? optionText(o, locale) : v;
  };

  return (
    <div ref={top} className="frame scroll-mt-28 p-5 sm:p-8">
      {/* Progress */}
      <ol className="mb-8 grid grid-cols-4 gap-2" aria-label={steps.join(" · ")}>
        {steps.map((s, i) => (
          <li key={i} className="flex flex-col gap-2">
            <span className={cn("h-1.5 rounded-full transition-colors", i <= step ? "bg-gradient-to-r from-volt to-cyan" : "bg-rim")} />
            <span className={cn("text-xs font-semibold sm:text-sm", i === step ? "text-chalk" : "text-fog")} aria-current={i === step ? "step" : undefined}>
              <span className="max-sm:hidden">{s}</span>
              <span className="sm:hidden">{i === step ? s : i + 1}</span>
            </span>
          </li>
        ))}
      </ol>

      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input ref={honey} type="text" name="bx_hp_note" tabIndex={-1} autoComplete="off" aria-hidden="true" data-lpignore="true" data-1p-ignore="true" defaultValue="" />
        </label>
      </div>

      {step === 0 && (
        <fieldset className="grid gap-6 sm:grid-cols-2">
          <legend className="t-headline mb-6 text-2xl text-chalk">{steps[0]}</legend>
          <Row id="ap-full_name" label={F.full_name.label} hint={F.full_name.hint} error={err("full_name")} className="sm:col-span-2">
            <input {...aria("full_name")} className={inputCls} autoComplete="name" maxLength={120} value={d.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </Row>
          {show("national_id") && (
            <Row
              id="ap-national_id"
              label={F.national_id.label}
              optional={opt("national_id")}
              error={err("national_id")}
              className="sm:col-span-2"
              hint={
                nid ? (
                  <span className="flex flex-wrap items-center gap-2 text-ok" data-testid="ap-nid-read">
                    <Icon name="check" size={15} />
                    {t.born} {nid.birth.toLocaleDateString(locale === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" })} · {locale === "ar" ? nid.governorate.ar : nid.governorate.en}
                  </span>
                ) : (
                  <span>
                    {F.national_id.hint}{" "}
                    <span dir="ltr" className="font-mono">
                      {digitsOnly(d.national_id).length}/14
                    </span>
                  </span>
                )
              }
            >
              <input {...aria("national_id")} className={cn(inputCls, "font-mono tracking-[0.18em]")} inputMode="numeric" dir="ltr" autoComplete="off" maxLength={20} placeholder="3xxxxxxxxxxxxx" value={d.national_id} onChange={(e) => set("national_id", digitsOnly(e.target.value).slice(0, 14))} />
            </Row>
          )}
          <Row id="ap-phone" label={F.phone.label} hint={F.phone.hint} error={err("phone")}>
            <input {...aria("phone")} className={inputCls} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="01xxxxxxxxx" maxLength={20} value={d.phone} onChange={(e) => set("phone", e.target.value)} />
          </Row>
          <Row id="ap-email" label={F.email.label} hint={F.email.hint} error={err("email")}>
            <input {...aria("email")} className={inputCls} type="email" inputMode="email" autoComplete="email" dir="ltr" maxLength={200} value={d.email} onChange={(e) => set("email", e.target.value)} />
          </Row>
          {show("governorate") && (
            <Row id="ap-governorate" label={F.governorate.label} optional={opt("governorate")} hint={F.governorate.hint} error={err("governorate")}>
              <select {...aria("governorate")} className={cn(inputCls, "appearance-none")} value={d.governorate} onChange={(e) => set("governorate", e.target.value)}>
                <option value="" disabled={F.governorate.required}>
                  —
                </option>
                {GOVERNORATES.map((g) => (
                  <option key={g.code} value={g.label.ar}>
                    {locale === "ar" ? g.label.ar : g.label.en}
                  </option>
                ))}
              </select>
            </Row>
          )}
          {show("address") && (
            <Row id="ap-address" label={F.address.label} optional={opt("address")} hint={F.address.hint} error={err("address")}>
              <input {...aria("address")} className={inputCls} autoComplete="street-address" maxLength={200} value={d.address} onChange={(e) => set("address", e.target.value)} />
            </Row>
          )}
          {show("faculty") && (
            <Row id="ap-faculty" label={F.faculty.label} optional={opt("faculty")} hint={F.faculty.hint} error={err("faculty")}>
              <input {...aria("faculty")} className={inputCls} list="ap-faculties" maxLength={120} value={d.faculty} onChange={(e) => set("faculty", e.target.value)} />
              <datalist id="ap-faculties">
                {F.faculty.options.map((f) => (
                  <option key={f.key} value={optionText(f, locale)} />
                ))}
              </datalist>
            </Row>
          )}
          {show("academic_year") && (
            <Row id="ap-academic_year" label={F.academic_year.label} optional={opt("academic_year")} hint={F.academic_year.hint} error={err("academic_year")}>
              <select {...aria("academic_year")} className={cn(inputCls, "appearance-none")} value={d.academic_year} onChange={(e) => set("academic_year", e.target.value)}>
                <option value="" disabled={F.academic_year.required}>
                  —
                </option>
                {F.academic_year.options.map((y) => (
                  <option key={y.key} value={y.key}>
                    {optionText(y, locale)}
                  </option>
                ))}
              </select>
            </Row>
          )}
          {show("student_number") && (
            <Row id="ap-student_number" label={F.student_number.label} optional={opt("student_number")} hint={F.student_number.hint} error={err("student_number")} className="sm:col-span-2">
              <input {...aria("student_number")} className={inputCls} dir="ltr" maxLength={40} value={d.student_number} onChange={(e) => set("student_number", e.target.value)} />
            </Row>
          )}
          {extras(0)}
        </fieldset>
      )}

      {step === 1 && (
        <fieldset className="grid gap-7">
          <legend className="t-headline mb-6 text-2xl text-chalk">{steps[1]}</legend>
          <Group id="ap-track_first" label={F.track_first.label} hint={F.track_first.hint} error={err("track_first")}>
            <div role="radiogroup" aria-labelledby="ap-track_first-label" className="grid gap-2.5 sm:grid-cols-2">
              {shownTracks.map((tr, i) => {
                const on = d.track_first === tr.slug;
                return (
                  <button
                    key={tr.slug}
                    id={i === 0 ? "ap-track_first" : undefined}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => {
                      set("track_first", tr.slug);
                      if (d.track_second === tr.slug) set("track_second", "");
                    }}
                    className={cn(pickCls(on), "flex flex-col gap-1 p-4")}
                  >
                    <span className="flex items-center gap-2 font-semibold text-chalk">
                      <span className={cn("size-4 shrink-0 rounded-full border-2", on ? "border-cyan bg-cyan shadow-[inset_0_0_0_3px_var(--color-deep)]" : "border-steel")} />
                      {tr.name}
                    </span>
                    <span className="ps-6 text-sm text-mist">{tr.tagline}</span>
                  </button>
                );
              })}
            </div>
          </Group>
          {show("track_second") && (
            <Row id="ap-track_second" label={F.track_second.label} optional={opt("track_second")} hint={F.track_second.hint} error={err("track_second")}>
              <select {...aria("track_second")} className={cn(inputCls, "appearance-none")} value={d.track_second} onChange={(e) => set("track_second", e.target.value)}>
                <option value="">{t.none}</option>
                {shownTracks
                  .filter((tr) => tr.slug !== d.track_first)
                  .map((tr) => (
                    <option key={tr.slug} value={tr.slug}>
                      {tr.name}
                    </option>
                  ))}
              </select>
            </Row>
          )}
          {show("experience_level") && (
            <Group id="ap-experience_level" label={F.experience_level.label} optional={opt("experience_level")} hint={F.experience_level.hint} error={err("experience_level")}>
              <div role="radiogroup" aria-labelledby="ap-experience_level-label" className="grid gap-2.5 sm:grid-cols-3">
                {F.experience_level.options.map((lv, i) => {
                  const on = d.experience_level === lv.key;
                  const hint = locale === "ar" ? lv.hint_ar : lv.hint_en || lv.hint_ar;
                  return (
                    <button key={lv.key} id={i === 0 ? "ap-experience_level" : undefined} type="button" role="radio" aria-checked={on} onClick={() => set("experience_level", on && !F.experience_level.required ? "" : lv.key)} className={cn(pickCls(on), "flex flex-col gap-1 p-4")}>
                      <span className="font-semibold text-chalk">{optionText(lv, locale)}</span>
                      {hint && <span className="text-sm text-mist">{hint}</span>}
                    </button>
                  );
                })}
              </div>
            </Group>
          )}
          {show("skills") && (
            <Row id="ap-skills" label={F.skills.label} optional={opt("skills")} hint={F.skills.hint} error={err("skills")}>
              <input {...aria("skills")} className={inputCls} maxLength={500} value={d.skills} onChange={(e) => set("skills", e.target.value)} />
            </Row>
          )}
          {show("experience") && (
            <Row id="ap-experience" label={F.experience.label} optional={opt("experience")} hint={F.experience.hint} error={err("experience")}>
              <textarea {...aria("experience")} className={cn(inputCls, "h-auto min-h-28 py-3 leading-relaxed")} maxLength={2000} value={d.experience} onChange={(e) => set("experience", e.target.value)} />
            </Row>
          )}
          {show("portfolio_url") && (
            <Row id="ap-portfolio_url" label={F.portfolio_url.label} optional={opt("portfolio_url")} hint={F.portfolio_url.hint} error={err("portfolio_url")}>
              <input {...aria("portfolio_url")} className={inputCls} type="url" inputMode="url" dir="ltr" placeholder="https://" maxLength={300} value={d.portfolio_url} onChange={(e) => set("portfolio_url", e.target.value)} />
            </Row>
          )}
          {show("team_roles") && (
            <Group id="ap-team_roles" label={F.team_roles.label} optional={opt("team_roles")} hint={F.team_roles.hint} error={err("team_roles")}>
              <div className="flex flex-wrap gap-2">
                {F.team_roles.options.map((r, i) => (
                  <Chip key={r.key} id={i === 0 ? "ap-team_roles" : undefined} on={d.team_roles.includes(r.key)} onClick={() => toggle("team_roles", r.key)}>
                    {optionText(r, locale)}
                  </Chip>
                ))}
              </div>
            </Group>
          )}
          {extras(1)}
        </fieldset>
      )}

      {step === 2 && (
        <fieldset className="grid gap-7">
          <legend className="t-headline mb-6 text-2xl text-chalk">{steps[2]}</legend>
          {show("motivation") && (
            <Row id="ap-motivation" label={F.motivation.label} optional={opt("motivation")} hint={`${F.motivation.hint ? `${F.motivation.hint} ` : ""}(${d.motivation.trim().length}/2000)`} error={err("motivation")}>
              <textarea {...aria("motivation")} className={cn(inputCls, "h-auto min-h-36 py-3 leading-relaxed")} maxLength={2000} value={d.motivation} onChange={(e) => set("motivation", e.target.value)} />
            </Row>
          )}
          {show("goals") && (
            <Row id="ap-goals" label={F.goals.label} optional={opt("goals")} hint={F.goals.hint} error={err("goals")}>
              <textarea {...aria("goals")} className={cn(inputCls, "h-auto min-h-24 py-3 leading-relaxed")} maxLength={1000} value={d.goals} onChange={(e) => set("goals", e.target.value)} />
            </Row>
          )}
          {show("hours_per_week") && (
            <Group id="ap-hours_per_week" label={F.hours_per_week.label} optional={opt("hours_per_week")} hint={F.hours_per_week.hint} error={err("hours_per_week")}>
              <div role="radiogroup" aria-labelledby="ap-hours_per_week-label" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {F.hours_per_week.options.map((h, i) => {
                  const on = d.hours_per_week === h.key;
                  return (
                    <button key={h.key} id={i === 0 ? "ap-hours_per_week" : undefined} type="button" role="radio" aria-checked={on} onClick={() => set("hours_per_week", on && !F.hours_per_week.required ? "" : h.key)} className={cn(pickCls(on), "min-h-12 px-3 py-2.5 text-center text-[0.95rem] font-semibold", on ? "text-chalk" : "text-mist")}>
                      {optionText(h, locale)}
                    </button>
                  );
                })}
              </div>
            </Group>
          )}
          {show("days") && (
            <Group id="ap-days" label={F.days.label} optional={opt("days")} hint={F.days.hint} error={err("days")}>
              <div className="flex flex-wrap gap-2">
                {F.days.options.map((x, i) => (
                  <Chip key={x.key} id={i === 0 ? "ap-days" : undefined} on={d.days.includes(x.key)} onClick={() => toggle("days", x.key)}>
                    {optionText(x, locale)}
                  </Chip>
                ))}
              </div>
            </Group>
          )}
          {show("heard_from") && (
            <Row id="ap-heard_from" label={F.heard_from.label} optional={opt("heard_from")} hint={F.heard_from.hint} error={err("heard_from")}>
              <select {...aria("heard_from")} className={cn(inputCls, "appearance-none")} value={d.heard_from} onChange={(e) => set("heard_from", e.target.value)}>
                <option value="">—</option>
                {F.heard_from.options.map((h) => (
                  <option key={h.key} value={h.key}>
                    {optionText(h, locale)}
                  </option>
                ))}
              </select>
            </Row>
          )}
          {extras(2)}
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-3 text-[0.95rem] text-frost">
              <input id="ap-consent" type="checkbox" checked={d.consent} onChange={(e) => set("consent", e.target.checked)} aria-invalid={err("consent") ? true : undefined} className="mt-1 size-5 shrink-0 accent-[#2f7bff]" />
              {consentText(cfg, locale)}
            </label>
            {err("consent") && (
              <p role="alert" className="text-sm text-danger">
                {err("consent")}
              </p>
            )}
          </div>
        </fieldset>
      )}

      {step === 3 && (
        <div className="grid gap-4">
          <p className="t-headline mb-2 text-2xl text-chalk">{steps[3]}</p>
          {[0, 1, 2].map((s) => {
            const rows: [string, string][] = [];
            for (const k of STEP_FIELDS[s]!) {
              if (F[k].hidden) continue;
              const v = d[k as keyof Data];
              const text =
                k === "phone"
                  ? cleanPhone(d.phone)
                  : k === "track_first" || k === "track_second"
                    ? (trackName[v as string] ?? "")
                    : Array.isArray(v)
                      ? v.map((x) => opLabel(k, x)).join("، ")
                      : F[k].options.length && k !== "faculty"
                        ? opLabel(k, v as string)
                        : String(v ?? "");
              rows.push([F[k].label, text]);
            }
            for (const q of extra.filter((x) => x.step === s)) {
              const v = answerOf(d, q);
              rows.push([extraLabel(q, locale), Array.isArray(v) ? v.map((x) => optionText((q.options ?? []).find((o) => o.ar === x) ?? { ar: x }, locale)).join("، ") : q.type === "yesno" ? (v === "yes" ? t.yes : v === "no" ? t.no : "") : q.type === "select" ? optionText((q.options ?? []).find((o) => o.ar === v) ?? { ar: v }, locale) : v]);
            }
            return (
              <section key={s} className="rounded-xl border border-[var(--line-2)] bg-deep/50 p-5">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <h3 className="font-semibold text-chalk">{steps[s]}</h3>
                  <button type="button" onClick={() => go(s)} className="text-sm font-semibold text-cyan hover:underline">
                    {t.edit}
                  </button>
                </div>
                <dl className="grid gap-3 sm:grid-cols-2">
                  {rows
                    .filter(([, v]) => v)
                    .map(([k, v], i) => (
                      <div key={i} className={cn(v.length > 60 && "sm:col-span-2")}>
                        <dt className="text-sm text-fog">{k}</dt>
                        <dd className="whitespace-pre-line break-words text-frost" dir="auto">
                          {v}
                        </dd>
                      </div>
                    ))}
                </dl>
              </section>
            );
          })}
        </div>
      )}

      {formError && (
        <div role="alert" className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-[0.95rem] text-[#ffb3ba]">
          {formError}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-6">
        <span className="text-sm text-fog">
          {step + 1} {t.of} {steps.length}
        </span>
        <div className="flex gap-3">
          {step > 0 && (
            <button type="button" className="btn" onClick={() => go(step - 1)} disabled={sending}>
              {t.back}
            </button>
          )}
          {step < 3 ? (
            <button type="button" className="btn btn-primary" onClick={next}>
              <span>{t.next}</span>
              <Icon name="arrow" size={16} className="btn-arrow rtl:-scale-x-100" />
            </button>
          ) : (
            <button type="button" className="btn btn-primary" onClick={submit} disabled={sending}>
              <span aria-hidden className="btn-sheen" />
              <span>{sending ? t.sending : t.submit}</span>
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
