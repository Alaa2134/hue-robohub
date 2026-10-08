"use client";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/brand/icons";
import { inputCls } from "@/components/command/field";
import { DAYS, FACULTIES, HEARD_FROM, HOURS, LEVELS, TEAM_ROLES, YEARS, label } from "@/content/application";
import { cn } from "@/lib/cn";
import { whatsappLink } from "@/lib/contact";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";
import { WaitlistForm } from "./site-forms";

export type ApplyTrack = { slug: string; name: string; tagline: string };

type Data = {
  full_name: string;
  phone: string;
  email: string;
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
};

const EMPTY: Data = {
  full_name: "",
  phone: "",
  email: "",
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
};

const DRAFT_KEY = "buildx_apply_draft_v1";
const STEP_FIELDS: (keyof Data)[][] = [
  ["full_name", "phone", "email", "faculty", "academic_year", "student_number"],
  ["track_first", "track_second", "team_roles", "experience_level", "skills", "experience", "portfolio_url"],
  ["motivation", "goals", "hours_per_week", "days", "heard_from", "consent"],
];

const T = {
  en: {
    steps: ["About you", "Your interests", "Motivation & time", "Review"],
    optional: "Optional",
    next: "Next",
    back: "Back",
    edit: "Edit",
    submit: "Submit application",
    sending: "Sending…",
    of: "of",
    f: {
      full_name: "Full name",
      phone: "Phone / WhatsApp",
      phoneHint: "We'll contact you on WhatsApp.",
      email: "Email",
      faculty: "Faculty",
      facultyHint: "Pick from the list or type your faculty.",
      academic_year: "Academic year",
      student_number: "University ID",
      track_first: "Which track do you want to join?",
      track_second: "Second choice",
      none: "No second choice",
      team_roles: "Would you also like to help run the community?",
      team_rolesHint: "Choose any — or none.",
      experience_level: "Your experience level",
      skills: "Skills or tools you know",
      skillsHint: "For example: Python, Arduino, Photoshop, Excel",
      experience: "Projects, courses or competitions you've done",
      portfolio_url: "Link to your work (GitHub, Behance, LinkedIn…)",
      motivation: "Why do you want to join BuildX HUE?",
      motivationHint: "A few honest sentences are perfect.",
      goals: "What would you like to build or learn this year?",
      hours_per_week: "How many hours a week can you give?",
      days: "Which days usually suit you?",
      heard_from: "How did you hear about us?",
      consent: "I agree that BuildX HUE stores my application to review it and contact me.",
    },
    err: {
      required: "This field is required.",
      name: "Write your full name (at least 3 letters).",
      phone: "Enter a valid phone number, e.g. 01012345678.",
      email: "Enter a valid email address.",
      motivation: "Write at least 20 characters.",
      url: "Enter a full link starting with https://",
      consent: "Please agree so we can review your application.",
      invalid: "Some answers look wrong. Please check them and try again.",
      busy: "Lots of people are applying right now. Please try again in a minute.",
      rateLimited: "Too many applications came from this network in the last hour. Please try again later.",
      closed: "Applications are closed right now.",
      network: "We couldn't reach the server. Check your connection and try again.",
    },
    done: "Application received!",
    doneBody: "Thank you for applying to BuildX HUE. Our team will review your answers and contact you on WhatsApp with the next steps.",
    dupBody: "You already applied in the last few days — your application is with our team. Here is its reference again.",
    refLabel: "Your reference",
    trackIt: "Track your application",
    saveRef: "Save this number — you'll use it with your phone number to check your application's status.",
    waFollow: "Message us on WhatsApp",
    another: "Submit another application",
    waText: (ref: string) => `Hi BuildX HUE! I just applied — my reference is ${ref}.`,
  },
  ar: {
    steps: ["بياناتك", "اهتماماتك", "دافعك ووقتك", "المراجعة"],
    optional: "اختياري",
    next: "التالي",
    back: "رجوع",
    edit: "تعديل",
    submit: "ابعت الطلب",
    sending: "بيتبعت…",
    of: "من",
    f: {
      full_name: "الاسم بالكامل",
      phone: "رقم الموبايل / واتساب",
      phoneHint: "هنتواصل معاك على واتساب.",
      email: "الإيميل",
      faculty: "الكلية",
      facultyHint: "اختار من القايمة أو اكتب اسم كليتك.",
      academic_year: "السنة الدراسية",
      student_number: "الرقم الجامعي",
      track_first: "عايز تنضم لأنهي مسار؟",
      track_second: "اختيارك التاني",
      none: "مفيش اختيار تاني",
      team_roles: "تحب كمان تساعد في تنظيم المجتمع؟",
      team_rolesHint: "اختار اللي يعجبك — أو ولا حاجة.",
      experience_level: "مستوى خبرتك",
      skills: "مهارات أو أدوات بتعرفها",
      skillsHint: "مثلاً: Python، Arduino، فوتوشوب، Excel",
      experience: "مشاريع أو كورسات أو مسابقات عملتها قبل كده",
      portfolio_url: "لينك لشغلك (GitHub، Behance، LinkedIn…)",
      motivation: "ليه عايز تنضم لـ BuildX HUE؟",
      motivationHint: "كام سطر بصراحة كفاية جداً.",
      goals: "نفسك تبني أو تتعلّم إيه السنة دي؟",
      hours_per_week: "تقدر تدّينا كام ساعة في الأسبوع؟",
      days: "أنهي أيام بتبقى مناسبة ليك عادةً؟",
      heard_from: "عرفت عنّا منين؟",
      consent: "موافق إن BuildX HUE يحتفظ بطلبي عشان يراجعه ويتواصل معايا.",
    },
    err: {
      required: "الخانة دي مطلوبة.",
      name: "اكتب اسمك بالكامل (3 حروف على الأقل).",
      phone: "اكتب رقم صحيح، مثلاً 01012345678.",
      email: "اكتب إيميل صحيح.",
      motivation: "اكتب 20 حرف على الأقل.",
      url: "اكتب اللينك كامل وبيبدأ بـ https://",
      consent: "لازم توافق عشان نقدر نراجع طلبك.",
      invalid: "فيه إجابات شكلها غلط. راجعها وجرّب تاني.",
      busy: "فيه ناس كتير بتقدّم دلوقتي. جرّب تاني بعد دقيقة.",
      rateLimited: "اتبعت طلبات كتير من نفس الشبكة في آخر ساعة. جرّب تاني بعد شوية.",
      closed: "التقديم مقفول دلوقتي.",
      network: "مقدرناش نوصل للسيرفر. اتأكد من النت وجرّب تاني.",
    },
    done: "طلبك وصل!",
    doneBody: "شكراً إنك قدّمت في BuildX HUE. فريقنا هيراجع إجاباتك وهيتواصل معاك على واتساب بالخطوات الجاية.",
    dupBody: "انت قدّمت قبل كده من كام يوم — طلبك عند الفريق. ده رقمه المرجعي تاني.",
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
const cleanPhone = (v: string) => v.replace(/[^0-9+]/g, "");

function validate(d: Data, step: number, t: (typeof T)["en"]): Partial<Record<keyof Data, string>> {
  const e: Partial<Record<keyof Data, string>> = {};
  const need = (k: keyof Data) => STEP_FIELDS[step]!.includes(k);
  if (need("full_name") && d.full_name.trim().length < 3) e.full_name = t.err.name;
  if (need("phone") && !PHONE_RE.test(cleanPhone(d.phone))) e.phone = t.err.phone;
  if (need("email") && !EMAIL_RE.test(d.email.trim())) e.email = t.err.email;
  if (need("faculty") && d.faculty.trim().length < 2) e.faculty = t.err.required;
  if (need("academic_year") && !d.academic_year) e.academic_year = t.err.required;
  if (need("track_first") && !d.track_first) e.track_first = t.err.required;
  if (need("experience_level") && !d.experience_level) e.experience_level = t.err.required;
  if (need("portfolio_url") && d.portfolio_url.trim() && !/^https?:\/\/\S+\.\S+/.test(d.portfolio_url.trim())) e.portfolio_url = t.err.url;
  if (need("motivation") && d.motivation.trim().length < 20) e.motivation = t.err.motivation;
  if (need("hours_per_week") && !d.hours_per_week) e.hours_per_week = t.err.required;
  if (need("consent") && !d.consent) e.consent = t.err.consent;
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

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
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

export function ApplyForm({ locale, tracks, whatsapp }: { locale: "en" | "ar"; tracks: ApplyTrack[]; whatsapp?: string }) {
  const t = T[locale];
  const [d, setD] = useState<Data>(EMPTY);
  const [step, setStep] = useState(0);
  const [errors, setErrors] = useState<Partial<Record<keyof Data, string>>>({});
  const [formError, setFormError] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState<{ ref: string; duplicate: boolean } | null>(null);
  const [closed, setClosed] = useState<string | null>(null);

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
    return () => {
      alive = false;
    };
  }, [locale]);
  const top = useRef<HTMLDivElement>(null);
  const honey = useRef<HTMLInputElement>(null);
  const loaded = useRef(false);

  // Restore an unfinished draft (per browser only), then keep it saved as the student types.
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) setD({ ...EMPTY, ...(JSON.parse(raw) as Partial<Data>), consent: false });
    } catch {}
    loaded.current = true;
  }, []);
  useEffect(() => {
    if (!loaded.current || done) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...d, consent: false }));
    } catch {}
  }, [d, done]);

  const set = <K extends keyof Data>(k: K, v: Data[K]) => {
    setD((p) => ({ ...p, [k]: v }));
    setErrors((p) => (p[k] ? { ...p, [k]: undefined } : p));
  };
  const toggle = (k: "team_roles" | "days", v: string) => set(k, d[k].includes(v) ? d[k].filter((x) => x !== v) : [...d[k], v]);

  const scrollTop = () => top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  const go = (n: number) => {
    setStep(n);
    setFormError("");
    requestAnimationFrame(scrollTop);
  };
  const next = () => {
    const e = validate(d, step, t);
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      document.getElementById(`ap-${first}`)?.focus();
      return;
    }
    go(step + 1);
  };

  const submit = async () => {
    for (let s = 0; s < 3; s++) {
      const e = validate(d, s, t);
      if (Object.keys(e).length) {
        setErrors(e);
        go(s);
        return;
      }
    }
    setSending(true);
    setFormError("");
    try {
      const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_application`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p: { ...d, phone: cleanPhone(d.phone), locale, website: honey.current?.value ?? "" } }),
      });
      const out = (await res.json().catch(() => null)) as { ok?: boolean; ref?: string; duplicate?: boolean; error?: string } | null;
      if (!res.ok || !out) throw new Error("network");
      if (!out.ok) {
        if (out.error === "closed") setClosed("");
        setFormError(out.error === "busy" ? t.err.busy : out.error === "rate_limited" ? t.err.rateLimited : out.error === "closed" ? t.err.closed : t.err.invalid);
        return;
      }
      setDone({ ref: out.ref ?? "", duplicate: !!out.duplicate });
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
        <div className="rounded-xl border border-[var(--line-2)] bg-void/50 px-5 py-3">
          <p className="text-sm text-fog">{t.refLabel}</p>
          <p className="t-display text-3xl text-cyan" dir="ltr">
            {done.ref}
          </p>
          <p className="mt-2 max-w-sm text-sm text-mist">{t.saveRef}</p>
        </div>
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

  const err = (k: keyof Data) => errors[k];
  const aria = (k: keyof Data) => ({ id: `ap-${k}`, "aria-invalid": err(k) ? true : undefined, "aria-describedby": err(k) ? `ap-${k}-error` : undefined });

  return (
    <div ref={top} className="frame scroll-mt-28 p-5 sm:p-8">
      {/* Progress */}
      <ol className="mb-8 grid grid-cols-4 gap-2" aria-label={t.steps.join(" · ")}>
        {t.steps.map((s, i) => (
          <li key={s} className="flex flex-col gap-2">
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
          <input ref={honey} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      {step === 0 && (
        <fieldset className="grid gap-6 sm:grid-cols-2">
          <legend className="t-headline mb-6 text-2xl text-chalk">{t.steps[0]}</legend>
          <Row id="ap-full_name" label={t.f.full_name} error={err("full_name")} className="sm:col-span-2">
            <input {...aria("full_name")} className={inputCls} autoComplete="name" maxLength={120} value={d.full_name} onChange={(e) => set("full_name", e.target.value)} />
          </Row>
          <Row id="ap-phone" label={t.f.phone} hint={t.f.phoneHint} error={err("phone")}>
            <input {...aria("phone")} className={inputCls} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="01xxxxxxxxx" maxLength={20} value={d.phone} onChange={(e) => set("phone", e.target.value)} />
          </Row>
          <Row id="ap-email" label={t.f.email} error={err("email")}>
            <input {...aria("email")} className={inputCls} type="email" inputMode="email" autoComplete="email" dir="ltr" maxLength={200} value={d.email} onChange={(e) => set("email", e.target.value)} />
          </Row>
          <Row id="ap-faculty" label={t.f.faculty} hint={t.f.facultyHint} error={err("faculty")}>
            <input {...aria("faculty")} className={inputCls} list="ap-faculties" maxLength={120} value={d.faculty} onChange={(e) => set("faculty", e.target.value)} />
            <datalist id="ap-faculties">
              {FACULTIES.map((f) => (
                <option key={f.en} value={locale === "ar" ? f.ar : f.en} />
              ))}
            </datalist>
          </Row>
          <Row id="ap-academic_year" label={t.f.academic_year} error={err("academic_year")}>
            <select {...aria("academic_year")} className={cn(inputCls, "appearance-none")} value={d.academic_year} onChange={(e) => set("academic_year", e.target.value)}>
              <option value="" disabled>
                —
              </option>
              {YEARS.map((y) => (
                <option key={y.key} value={y.key}>
                  {locale === "ar" ? y.label.ar : y.label.en}
                </option>
              ))}
            </select>
          </Row>
          <Row id="ap-student_number" label={t.f.student_number} optional={t.optional} className="sm:col-span-2">
            <input {...aria("student_number")} className={inputCls} dir="ltr" maxLength={40} value={d.student_number} onChange={(e) => set("student_number", e.target.value)} />
          </Row>
        </fieldset>
      )}

      {step === 1 && (
        <fieldset className="grid gap-7">
          <legend className="t-headline mb-6 text-2xl text-chalk">{t.steps[1]}</legend>
          <div className="flex flex-col gap-3">
            <p id="ap-track_first-label" className="text-[0.95rem] font-semibold text-frost">
              {t.f.track_first}
            </p>
            <div role="radiogroup" aria-labelledby="ap-track_first-label" className="grid gap-2.5 sm:grid-cols-2">
              {tracks.map((tr, i) => {
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
                    className={cn("flex flex-col gap-1 rounded-xl border p-4 text-start transition-colors", on ? "border-cyan/70 bg-volt/20" : "border-[var(--line-2)] bg-deep/60 hover:border-volt/50")}
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
            {err("track_first") && (
              <p role="alert" className="text-sm text-danger">
                {err("track_first")}
              </p>
            )}
          </div>
          <Row id="ap-track_second" label={t.f.track_second} optional={t.optional}>
            <select {...aria("track_second")} className={cn(inputCls, "appearance-none")} value={d.track_second} onChange={(e) => set("track_second", e.target.value)}>
              <option value="">{t.f.none}</option>
              {tracks
                .filter((tr) => tr.slug !== d.track_first)
                .map((tr) => (
                  <option key={tr.slug} value={tr.slug}>
                    {tr.name}
                  </option>
                ))}
            </select>
          </Row>
          <div className="flex flex-col gap-3">
            <p className="flex items-baseline justify-between gap-3 text-[0.95rem] font-semibold text-frost">
              {t.f.experience_level}
            </p>
            <div role="radiogroup" className="grid gap-2.5 sm:grid-cols-3">
              {LEVELS.map((lv, i) => {
                const on = d.experience_level === lv.key;
                return (
                  <button
                    key={lv.key}
                    id={i === 0 ? "ap-experience_level" : undefined}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set("experience_level", lv.key)}
                    className={cn("flex flex-col gap-1 rounded-xl border p-4 text-start transition-colors", on ? "border-cyan/70 bg-volt/20" : "border-[var(--line-2)] bg-deep/60 hover:border-volt/50")}
                  >
                    <span className="font-semibold text-chalk">{locale === "ar" ? lv.label.ar : lv.label.en}</span>
                    <span className="text-sm text-mist">{locale === "ar" ? lv.hint.ar : lv.hint.en}</span>
                  </button>
                );
              })}
            </div>
            {err("experience_level") && (
              <p role="alert" className="text-sm text-danger">
                {err("experience_level")}
              </p>
            )}
          </div>
          <Row id="ap-skills" label={t.f.skills} optional={t.optional} hint={t.f.skillsHint}>
            <input {...aria("skills")} className={inputCls} maxLength={500} value={d.skills} onChange={(e) => set("skills", e.target.value)} />
          </Row>
          <Row id="ap-experience" label={t.f.experience} optional={t.optional}>
            <textarea {...aria("experience")} className={cn(inputCls, "h-auto min-h-28 py-3 leading-relaxed")} maxLength={2000} value={d.experience} onChange={(e) => set("experience", e.target.value)} />
          </Row>
          <Row id="ap-portfolio_url" label={t.f.portfolio_url} optional={t.optional} error={err("portfolio_url")}>
            <input {...aria("portfolio_url")} className={inputCls} type="url" inputMode="url" dir="ltr" placeholder="https://" maxLength={300} value={d.portfolio_url} onChange={(e) => set("portfolio_url", e.target.value)} />
          </Row>
          <div className="flex flex-col gap-3">
            <p className="flex items-baseline justify-between gap-3 text-[0.95rem] font-semibold text-frost">
              {t.f.team_roles}
              <span className="text-xs font-normal text-fog">{t.optional}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {TEAM_ROLES.map((r) => (
                <Chip key={r.key} on={d.team_roles.includes(r.key)} onClick={() => toggle("team_roles", r.key)}>
                  {locale === "ar" ? r.label.ar : r.label.en}
                </Chip>
              ))}
            </div>
            <p className="text-sm text-fog">{t.f.team_rolesHint}</p>
          </div>
        </fieldset>
      )}

      {step === 2 && (
        <fieldset className="grid gap-7">
          <legend className="t-headline mb-6 text-2xl text-chalk">{t.steps[2]}</legend>
          <Row id="ap-motivation" label={t.f.motivation} hint={`${t.f.motivationHint} (${d.motivation.trim().length}/2000)`} error={err("motivation")}>
            <textarea {...aria("motivation")} className={cn(inputCls, "h-auto min-h-36 py-3 leading-relaxed")} maxLength={2000} value={d.motivation} onChange={(e) => set("motivation", e.target.value)} />
          </Row>
          <Row id="ap-goals" label={t.f.goals} optional={t.optional}>
            <textarea {...aria("goals")} className={cn(inputCls, "h-auto min-h-24 py-3 leading-relaxed")} maxLength={1000} value={d.goals} onChange={(e) => set("goals", e.target.value)} />
          </Row>
          <div className="flex flex-col gap-3">
            <p className="text-[0.95rem] font-semibold text-frost">{t.f.hours_per_week}</p>
            <div role="radiogroup" className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
              {HOURS.map((h, i) => {
                const on = d.hours_per_week === h.key;
                return (
                  <button
                    key={h.key}
                    id={i === 0 ? "ap-hours_per_week" : undefined}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set("hours_per_week", h.key)}
                    className={cn("min-h-12 rounded-xl border px-3 py-2.5 text-center text-[0.95rem] font-semibold transition-colors", on ? "border-cyan/70 bg-volt/20 text-chalk" : "border-[var(--line-2)] bg-deep/60 text-mist hover:border-volt/50")}
                  >
                    {locale === "ar" ? h.label.ar : h.label.en}
                  </button>
                );
              })}
            </div>
            {err("hours_per_week") && (
              <p role="alert" className="text-sm text-danger">
                {err("hours_per_week")}
              </p>
            )}
          </div>
          <div className="flex flex-col gap-3">
            <p className="flex items-baseline justify-between gap-3 text-[0.95rem] font-semibold text-frost">
              {t.f.days}
              <span className="text-xs font-normal text-fog">{t.optional}</span>
            </p>
            <div className="flex flex-wrap gap-2">
              {DAYS.map((x) => (
                <Chip key={x.key} on={d.days.includes(x.key)} onClick={() => toggle("days", x.key)}>
                  {locale === "ar" ? x.label.ar : x.label.en}
                </Chip>
              ))}
            </div>
          </div>
          <Row id="ap-heard_from" label={t.f.heard_from} optional={t.optional}>
            <select {...aria("heard_from")} className={cn(inputCls, "appearance-none")} value={d.heard_from} onChange={(e) => set("heard_from", e.target.value)}>
              <option value="">—</option>
              {HEARD_FROM.map((h) => (
                <option key={h.key} value={h.key}>
                  {locale === "ar" ? h.label.ar : h.label.en}
                </option>
              ))}
            </select>
          </Row>
          <div className="flex flex-col gap-2">
            <label className="flex items-start gap-3 text-[0.95rem] text-frost">
              <input id="ap-consent" type="checkbox" checked={d.consent} onChange={(e) => set("consent", e.target.checked)} aria-invalid={err("consent") ? true : undefined} className="mt-1 size-5 shrink-0 accent-[#2f7bff]" />
              {t.f.consent}
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
          <p className="t-headline mb-2 text-2xl text-chalk">{t.steps[3]}</p>
          {[
            {
              s: 0,
              rows: [
                [t.f.full_name, d.full_name],
                [t.f.phone, cleanPhone(d.phone)],
                [t.f.email, d.email],
                [t.f.faculty, d.faculty],
                [t.f.academic_year, label(YEARS, d.academic_year, locale)],
                [t.f.student_number, d.student_number],
              ],
            },
            {
              s: 1,
              rows: [
                [t.f.track_first, trackName[d.track_first] ?? ""],
                [t.f.track_second, trackName[d.track_second] ?? ""],
                [t.f.experience_level, label(LEVELS, d.experience_level, locale)],
                [t.f.skills, d.skills],
                [t.f.experience, d.experience],
                [t.f.portfolio_url, d.portfolio_url],
                [t.f.team_roles, d.team_roles.map((r) => label(TEAM_ROLES, r, locale)).join("، ")],
              ],
            },
            {
              s: 2,
              rows: [
                [t.f.motivation, d.motivation],
                [t.f.goals, d.goals],
                [t.f.hours_per_week, label(HOURS, d.hours_per_week, locale)],
                [t.f.days, d.days.map((x) => label(DAYS, x, locale)).join("، ")],
                [t.f.heard_from, label(HEARD_FROM, d.heard_from, locale)],
              ],
            },
          ].map((g) => (
            <section key={g.s} className="rounded-xl border border-[var(--line-2)] bg-deep/50 p-5">
              <div className="mb-3 flex items-center justify-between gap-3">
                <h3 className="font-semibold text-chalk">{t.steps[g.s]}</h3>
                <button type="button" onClick={() => go(g.s)} className="text-sm font-semibold text-cyan hover:underline">
                  {t.edit}
                </button>
              </div>
              <dl className="grid gap-3 sm:grid-cols-2">
                {g.rows
                  .filter(([, v]) => v)
                  .map(([k, v]) => (
                    <div key={k} className={cn((v ?? "").length > 60 && "sm:col-span-2")}>
                      <dt className="text-sm text-fog">{k}</dt>
                      <dd className="whitespace-pre-line break-words text-frost" dir="auto">
                        {v}
                      </dd>
                    </div>
                  ))}
              </dl>
            </section>
          ))}
        </div>
      )}

      {formError && (
        <div role="alert" className="mt-6 rounded-lg border border-danger/40 bg-danger/10 px-4 py-3 text-[0.95rem] text-[#ffb3ba]">
          {formError}
        </div>
      )}

      <div className="mt-8 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--line)] pt-6">
        <span className="text-sm text-fog">
          {step + 1} {t.of} {t.steps.length}
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
