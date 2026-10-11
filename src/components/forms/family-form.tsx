"use client";
/**
 * «سجّل في أسرة BuildX»: the student family sign-up, with what the Student Welfare Department's list
 * asks for (full name, national ID, address, phone, study level) plus faculty and optional university
 * ID and email. The national ID is read as it's typed (birth date and governorate shown back), and a
 * preview shows the row exactly as it will be printed in the family list.
 * Data: submit_family (rate-limited, honeypot, same checks on the server); settings: site_settings 'family'.
 */
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Icon } from "@/components/brand/icons";
import { inputCls } from "@/components/command/field";
import { FACULTIES } from "@/content/application";
import {
  GOVERNORATES,
  addressOf,
  STUDY_LEVELS,
  currentAcademicYear,
  digitsOnly,
  egyptMobile,
  readNationalId,
  type FamilySettings,
} from "@/content/family";
import { cn } from "@/lib/cn";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

type Data = {
  full_name: string;
  national_id: string;
  phone: string;
  governorate: string;
  address: string;
  level: string;
  faculty: string;
  student_number: string;
  email: string;
  consent: boolean;
};
type Field = keyof Data;

const T = {
  en: {
    s1: "About you",
    s2: "How to reach you",
    s3: "Your studies",
    name: "Full name (as on your national ID)",
    nameHint: "Four names, in Arabic, the way the university has it.",
    nid: "National ID number",
    nidHint: "14 digits, from your ID card.",
    born: "Born",
    phone: "Mobile number",
    phoneHint: "The number you use on WhatsApp.",
    gov: "Governorate",
    address: "Address (city / area)",
    addressPh: "e.g. New Damietta, district 3",
    level: "Study level",
    faculty: "Faculty",
    sid: "University ID",
    email: "Email",
    optional: "Optional",
    consent:
      "I agree that my details are sent to Horus University's Student Welfare Department to register me in the BuildX family.",
    preview: "This is how you'll appear in the family list",
    cols: ["Name", "National ID", "Address", "Phone", "Level"],
    submit: "Register in the family",
    sending: "Sending…",
    err: {
      required: "This is required.",
      name: "Write your full name: at least three names.",
      nid: "This doesn't look like a valid national ID (14 digits starting with 2 or 3).",
      phone: "Write an Egyptian mobile number: 01xxxxxxxxx.",
      email: "Check the email address.",
      consent: "Please agree so we can send your details to Student Welfare.",
      fix: "Some answers need a look (marked in red).",
      limited: "Too many tries from this network. Try again in an hour.",
      busy: "Lots of people are registering right now. Try again in a minute.",
      network: "Couldn't send. Check your connection and try again.",
    },
    closed: "Family registration is closed right now",
    closedBody: "Follow our page for when it opens again.",
    done: "You're in the BuildX family!",
    doneBody: (y: string) =>
      `Your registration for the academic year ${y} reached us. We'll add you to the list we send to Student Welfare.`,
    dupBody: (y: string) =>
      `You're already registered for the academic year ${y}. No need to register again.`,
    refLabel: "Registration number",
    another: "Register someone else",
    join: "Want to join a team too? Apply here",
    progress: (n: number, of: number) => `${n} of ${of} done`,
    ready: "All set, you can send it",
    arabicName: "Write it in Arabic, the way it is on your ID (the list is in Arabic).",
    levelIs: (n: number, y: string) => `Level ${n} = ${y}`,
    years: ["1st year", "2nd year", "3rd year", "4th year", "5th year"],
    draft: "We kept what you wrote on this device, so you can carry on.",
    share: "Send the link to your friends",
    group: "Join the family's WhatsApp group",
    groupHint: "Announcements, trips and meetups are posted there first.",
    shareText: (url: string) => `Register in the BuildX family at Horus University here 👇\n${url}`,
  },
  ar: {
    s1: "بياناتك",
    s2: "نتواصل معاك إزاي",
    s3: "دراستك",
    name: "الاسم رباعي (زي البطاقة)",
    nameHint: "أربع أسامي بالعربي، زي ما هو مكتوب في الجامعة.",
    nid: "الرقم القومي",
    nidHint: "14 رقم، من البطاقة.",
    born: "مواليد",
    phone: "رقم الموبايل",
    phoneHint: "الرقم اللي عليه واتساب.",
    gov: "المحافظة",
    address: "العنوان (المدينة / المنطقة)",
    addressPh: "مثلاً: دمياط الجديدة، المجاورة الثالثة",
    level: "المستوى الدراسي",
    faculty: "الكلية",
    sid: "الرقم الجامعي",
    email: "الإيميل",
    optional: "اختياري",
    consent: "موافق إن بياناتي تتبعت للإدارة العامة لرعاية الطلاب بجامعة حورس عشان أتسجل في أسرة BuildX.",
    preview: "كده هتظهر في كشف الأسرة",
    cols: ["الاسم", "الرقم القومي", "العنوان", "التليفون", "المستوى الدراسي"],
    submit: "سجّلني في الأسرة",
    sending: "بيتبعت…",
    err: {
      required: "الخانة دي مطلوبة.",
      name: "اكتب اسمك كامل: تلات أسامي على الأقل.",
      nid: "الرقم القومي ده مش مظبوط (14 رقم بيبدأ بـ 2 أو 3).",
      phone: "اكتب رقم موبايل مصري: 01xxxxxxxxx.",
      email: "راجع الإيميل.",
      consent: "وافق عشان نقدر نبعت بياناتك لرعاية الطلاب.",
      fix: "فيه إجابات محتاجة تتراجع (معلّمة بالأحمر).",
      limited: "محاولات كتير من الشبكة دي. جرّب كمان ساعة.",
      busy: "ناس كتير بتسجّل دلوقتي. جرّب كمان دقيقة.",
      network: "مقدرناش نبعت. اتأكد من النت وجرّب تاني.",
    },
    closed: "التسجيل في الأسرة مقفول دلوقتي",
    closedBody: "تابع صفحتنا عشان تعرف أول ما يفتح.",
    done: "بقيت في أسرة BuildX!",
    doneBody: (y: string) => `تسجيلك للعام الجامعي ${y} وصلنا، وهنضيفك في الكشف اللي بيتبعت لرعاية الطلاب.`,
    dupBody: (y: string) => `إنت متسجّل خلاص للعام الجامعي ${y}، مش محتاج تسجّل تاني.`,
    refLabel: "رقم التسجيل",
    another: "سجّل حد تاني",
    join: "عايز تنضم لفريق كمان؟ قدّم من هنا",
    progress: (n: number, of: number) => `خلصت ${n} من ${of}`,
    ready: "كله تمام، تقدر تبعت",
    arabicName: "اكتبه بالعربي زي البطاقة (الكشف بالعربي).",
    levelIs: (n: number, y: string) => `Level ${n} = ${y}`,
    years: ["الفرقة الأولى", "الفرقة الثانية", "الفرقة الثالثة", "الفرقة الرابعة", "الفرقة الخامسة"],
    draft: "حفظنا اللي كتبته على الجهاز ده، كمّل من مكانك.",
    share: "ابعت اللينك لصحابك",
    group: "ادخل جروب الأسرة على واتساب",
    groupHint: "الإعلانات والرحلات ومواعيد اللقاءات بتنزل هناك الأول.",
    shareText: (url: string) => `سجّل في أسرة BuildX بجامعة حورس من هنا 👇\n${url}`,
  },
};

const DRAFT = "bx-family-draft";
/** The required answers, for the progress line. */
const REQUIRED: Field[] = ["full_name", "national_id", "phone", "address", "level", "faculty", "consent"];

/** Something the student typed (the governorate starts filled in). */
const typed = (x: Partial<Data>) =>
  [x.full_name, x.phone, x.address, x.level, x.email, x.student_number].some((v) => !!v?.trim());

const EMPTY: Data = {
  full_name: "",
  national_id: "",
  phone: "",
  governorate: "دمياط",
  address: "",
  level: "",
  faculty: "",
  student_number: "",
  email: "",
  consent: false,
};

/** The list writes the level the way students do: "Level 3". */
const levelLabel = (n: number) => `Level ${n}`;

function validate(d: Data, l: "en" | "ar"): Partial<Record<Field, string>> {
  const t = T[l].err;
  const e: Partial<Record<Field, string>> = {};
  const name = d.full_name.trim().replace(/\s+/g, " ");
  if (!name) e.full_name = t.required;
  else if (name.split(" ").length < 3) e.full_name = t.name;
  if (!d.national_id.trim()) e.national_id = t.required;
  else if (!readNationalId(d.national_id)) e.national_id = t.nid;
  if (!d.phone.trim()) e.phone = t.required;
  else if (!egyptMobile(d.phone)) e.phone = t.phone;
  if (!d.governorate) e.governorate = t.required;
  if (d.address.trim().length < 2) e.address = t.required;
  if (!d.level) e.level = t.required;
  if (d.faculty.trim().length < 2) e.faculty = t.required;
  if (d.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(d.email.trim())) e.email = t.email;
  if (!d.consent) e.consent = t.consent;
  return e;
}

function Row({
  id,
  label,
  optional,
  hint,
  error,
  children,
  className,
}: {
  id: string;
  label: string;
  optional?: string;
  hint?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label
        htmlFor={id}
        className="flex items-baseline justify-between gap-3 text-[0.95rem] font-semibold text-frost"
      >
        {label}
        {optional && <span className="text-xs font-normal text-fog">{optional}</span>}
      </label>
      {children}
      {error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : hint ? (
        <div className="text-sm text-fog">{hint}</div>
      ) : null}
    </div>
  );
}

function Section({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <fieldset className="grid min-w-0 gap-5 border-t border-[var(--line)] pt-7 first:border-t-0 first:pt-0">
      <legend className="mb-5 flex items-center gap-3">
        <span className="flex size-9 items-center justify-center rounded-xl border border-volt/40 bg-volt/10 font-mono text-sm text-cyan">
          {n}
        </span>
        <span className="font-display text-xl font-semibold text-chalk">{title}</span>
      </legend>
      {children}
    </fieldset>
  );
}

export function FamilyForm({ locale, whatsapp }: { locale: "en" | "ar"; whatsapp?: string }) {
  const ar = locale === "ar";
  const t = T[locale];
  const [d, setD] = useState<Data>(EMPTY);
  const [errors, setErrors] = useState<Partial<Record<Field, string>>>({});
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState("");
  const [settings, setSettings] = useState<FamilySettings | null>(null);
  const [done, setDone] = useState<{
    ref: string;
    year: string;
    duplicate?: boolean;
    group?: string | null;
  } | null>(null);
  const [restored, setRestored] = useState(false);
  const honey = useRef<HTMLInputElement>(null);
  const top = useRef<HTMLDivElement>(null);

  // Baqloz pushes the form over (his "form" scene, config/mascotJourney.ts): it jolts away from him
  // on every shove of his Push clip (two a second, three times).
  useEffect(() => {
    const onScene = (e: Event) => {
      const { id, clip, facing } = (e as CustomEvent<{ id: string; clip: string; facing: number }>).detail;
      const el = top.current;
      if (id !== "form" || clip !== "Push" || !el || !facing) return;
      if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
      const x = 14 * facing;
      el.animate(
        [
          { transform: "translateX(0) rotate(0deg)" },
          { transform: `translateX(${x}px) rotate(${facing * 0.6}deg)`, offset: 0.25 },
          { transform: `translateX(${x * 0.4}px) rotate(0deg)`, offset: 0.6 },
          { transform: "translateX(0) rotate(0deg)" },
        ],
        { duration: 900, iterations: 3, easing: "ease-out", delay: 250 },
      );
    };
    window.addEventListener("bx-mascot-scene", onScene);
    return () => window.removeEventListener("bx-mascot-scene", onScene);
  }, []);

  // What was typed stays on this device until it's sent (never the national ID: shared lab computers).
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(DRAFT) ?? "null") as Partial<Data> | null;
      if (saved && typed(saved)) {
        setD((x) => ({ ...x, ...saved, national_id: "", consent: false }));
        setRestored(true);
      }
    } catch {
      /* nothing saved */
    }
  }, []);
  useEffect(() => {
    if (done || !typed(d)) return;
    try {
      const { national_id: _n, consent: _c, ...keep } = d;
      localStorage.setItem(DRAFT, JSON.stringify(keep));
    } catch {
      /* not saved, nothing lost */
    }
  }, [d, done]);

  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/site_settings?key=eq.family&select=value`, {
      headers: { apikey: SUPABASE_KEY },
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { value: FamilySettings }[]) => {
        const s = rows[0]?.value ?? {};
        setSettings(s);
        if (s.faculty) setD((x) => (x.faculty ? x : { ...x, faculty: s.faculty! }));
      })
      .catch(() => setSettings({}));
  }, []);

  const year = settings?.year || currentAcademicYear();
  const family = settings?.family || "BuildX";
  const nid = useMemo(() => readNationalId(d.national_id), [d.national_id]);
  const set = <K extends Field>(k: K, v: Data[K]) => {
    setD((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: validate({ ...d, [k]: v }, locale)[k] }));
  };
  const blur = (k: Field) => {
    const e = validate(d, locale)[k];
    if (
      (k === "national_id" || k === "phone" || k === "full_name" || k === "email") &&
      (d[k] as string).trim()
    )
      setErrors((x) => ({ ...x, [k]: e }));
  };
  const err = (k: Field) => errors[k];
  const aria = (k: Field) => ({
    id: `fm-${k}`,
    // Baqloz gives a tip for each field by its name (FIELD_TIPS family_*).
    name: `family_${k}`,
    "aria-invalid": err(k) ? true : undefined,
    "aria-describedby": err(k) ? `fm-${k}-error` : undefined,
    onBlur: () => blur(k),
  });

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (busy) return;
    const found = validate(d, locale);
    setErrors(found);
    setProblem("");
    if (Object.keys(found).length) {
      setProblem(t.err.fix);
      document.getElementById(`fm-${Object.keys(found)[0]}`)?.focus();
      return;
    }
    setBusy(true);
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/submit_family`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({
          p: {
            ...d,
            full_name: d.full_name.trim().replace(/\s+/g, " "),
            national_id: digitsOnly(d.national_id),
            phone: egyptMobile(d.phone),
            level: Number(d.level),
            locale,
            website: honey.current?.value ?? "",
          },
        }),
        signal: AbortSignal.timeout(15_000),
      });
      const out = (await r.json().catch(() => null)) as
        | { ok: true; ref: string; year: string; duplicate?: boolean; group?: string | null }
        | { ok: false; error: string; field?: Field }
        | null;
      if (!r.ok || !out) throw new Error("network");
      if (!out.ok) {
        if (out.error === "closed") return setSettings((s) => ({ ...s, open: false }));
        if (out.error === "rate_limited") return setProblem(t.err.limited);
        if (out.error === "busy") return setProblem(t.err.busy);
        if (out.field) {
          const msg = {
            national_id: t.err.nid,
            phone: t.err.phone,
            full_name: t.err.name,
            consent: t.err.consent,
          }[out.field as string];
          setErrors({ [out.field]: msg ?? t.err.required });
          return setProblem(t.err.fix);
        }
        throw new Error(out.error);
      }
      setDone(out);
      if (!out.duplicate) window.dispatchEvent(new Event("bx-family-joined"));
      try {
        localStorage.removeItem(DRAFT);
      } catch {
        /* fine */
      }
      top.current?.scrollIntoView({ behavior: "smooth", block: "start" });
    } catch {
      setProblem(t.err.network);
    } finally {
      setBusy(false);
    }
  };

  if (settings?.open === false) {
    return (
      <div className="frame flex flex-col items-start gap-4 p-7 sm:p-10" data-testid="family-closed">
        <span className="flex size-12 items-center justify-center rounded-2xl border border-warn/40 bg-warn/10 text-warn">
          <Icon name="lock" size={24} />
        </span>
        <p className="t-headline text-2xl text-chalk">{t.closed}</p>
        <p className="text-mist">{t.closedBody}</p>
        {whatsapp && (
          <a href={whatsapp} target="_blank" rel="noopener noreferrer" className="btn">
            <span>WhatsApp</span>
          </a>
        )}
      </div>
    );
  }

  if (done) {
    return (
      <div
        ref={top}
        role="status"
        className="frame flex scroll-mt-28 flex-col items-start gap-5 p-7 sm:p-10"
        data-testid="family-done"
      >
        <span className="flex size-14 items-center justify-center rounded-2xl border border-ok/40 bg-ok/10 text-ok">
          <Icon name="check" size={28} />
        </span>
        <p className="t-headline text-3xl text-chalk">{t.done}</p>
        <p className="max-w-xl text-lg leading-relaxed text-mist">
          {done.duplicate ? t.dupBody(done.year) : t.doneBody(done.year)}
        </p>
        <div className="rounded-xl border border-[var(--line-2)] bg-void/50 px-5 py-3">
          <p className="text-sm text-fog">{t.refLabel}</p>
          <p className="t-display text-3xl text-cyan" dir="ltr">
            {done.ref}
          </p>
        </div>
        {done.group && (
          <a
            href={done.group}
            target="_blank"
            rel="noopener noreferrer"
            className="flex w-full max-w-xl items-center gap-4 rounded-2xl border border-[#25d366]/50 bg-[#25d366]/10 p-4 text-start transition hover:bg-[#25d366]/15"
            data-testid="family-group"
          >
            <span
              className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#25d366] text-xl text-white"
              aria-hidden
            >
              💬
            </span>
            <span>
              <span className="block font-semibold text-chalk">{t.group}</span>
              <span className="block text-sm text-mist">{t.groupHint}</span>
            </span>
          </a>
        )}
        <div className="flex flex-wrap gap-3">
          <a
            href={`https://wa.me/?text=${encodeURIComponent(t.shareText(`${window.location.origin}${ar ? "/ar" : ""}/family/`))}`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-primary"
          >
            <span>{t.share}</span>
          </a>
          <a href={`${ar ? "/ar" : ""}/join/`} className="btn">
            <span>{t.join}</span>
          </a>
          <button
            type="button"
            className="btn"
            onClick={() => {
              setD({ ...EMPTY, faculty: settings?.faculty ?? "" });
              setErrors({});
              setDone(null);
            }}
          >
            {t.another}
          </button>
        </div>
      </div>
    );
  }

  const mobile = egyptMobile(d.phone);
  const missing = validate(d, locale);
  const left = REQUIRED.filter((k) => missing[k]).length;
  const latinName = /[A-Za-z]/.test(d.full_name);
  const shownName = d.full_name.trim() || "—";
  const day = (x: Date) =>
    new Intl.DateTimeFormat(ar ? "ar-EG" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
      timeZone: "UTC",
    }).format(x);

  return (
    <div ref={top} className="frame scroll-mt-28 p-5 sm:p-8" data-testid="family-form">
      <div className="mb-7 flex flex-wrap items-center gap-2 text-sm">
        <span className="rounded-full border border-cyan/40 bg-cyan/10 px-3 py-1 font-semibold text-cyan">
          {ar ? `أسرة ${family}` : `${family} family`}
        </span>
        <span className="rounded-full border border-[var(--line-2)] px-3 py-1 text-mist" dir="ltr">
          {ar ? `العام الجامعي ${year}` : `Academic year ${year}`}
        </span>
      </div>

      <div className="mb-7" data-testid="family-progress">
        <div className="mb-2 flex items-center justify-between text-sm">
          <span className={cn("font-semibold", left ? "text-mist" : "text-ok")}>
            {left ? t.progress(REQUIRED.length - left, REQUIRED.length) : t.ready}
          </span>
          <span className="font-mono text-xs text-fog" dir="ltr">
            {Math.round(((REQUIRED.length - left) / REQUIRED.length) * 100)}%
          </span>
        </div>
        <div className="h-1.5 overflow-hidden rounded-full bg-rim">
          <div
            className="h-full rounded-full bg-gradient-to-r from-volt to-cyan transition-[width] duration-500"
            style={{ width: `${((REQUIRED.length - left) / REQUIRED.length) * 100}%` }}
          />
        </div>
        {restored && <p className="mt-3 text-sm text-fog">{t.draft}</p>}
      </div>

      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input ref={honey} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>

      <form onSubmit={submit} noValidate className="grid grid-cols-1 gap-8 [&>*]:min-w-0">
        <Section n={1} title={t.s1}>
          <Row
            id="fm-full_name"
            label={t.name}
            hint={latinName ? <span className="text-warn">{t.arabicName}</span> : t.nameHint}
            error={err("full_name")}
          >
            <input
              {...aria("full_name")}
              className={inputCls}
              autoComplete="name"
              dir="auto"
              maxLength={120}
              value={d.full_name}
              onChange={(e) => set("full_name", e.target.value)}
            />
          </Row>
          <Row
            id="fm-national_id"
            label={t.nid}
            error={err("national_id")}
            hint={
              nid ? (
                <span className="flex flex-wrap items-center gap-2 text-ok" data-testid="nid-read">
                  <Icon name="check" size={15} />
                  {t.born} {day(nid.birth)} · {ar ? nid.governorate.ar : nid.governorate.en}
                </span>
              ) : (
                <span>
                  {t.nidHint}{" "}
                  <span dir="ltr" className="font-mono">
                    {digitsOnly(d.national_id).length}/14
                  </span>
                </span>
              )
            }
          >
            <input
              {...aria("national_id")}
              className={cn(inputCls, "font-mono tracking-[0.18em]")}
              inputMode="numeric"
              dir="ltr"
              autoComplete="off"
              maxLength={20}
              placeholder="3xxxxxxxxxxxxx"
              value={d.national_id}
              onChange={(e) => set("national_id", digitsOnly(e.target.value).slice(0, 14))}
            />
          </Row>
        </Section>

        <Section n={2} title={t.s2}>
          <Row id="fm-phone" label={t.phone} hint={t.phoneHint} error={err("phone")}>
            <input
              {...aria("phone")}
              className={cn(inputCls, "font-mono")}
              type="tel"
              inputMode="tel"
              autoComplete="tel"
              dir="ltr"
              maxLength={20}
              placeholder="01xxxxxxxxx"
              value={d.phone}
              onChange={(e) => set("phone", e.target.value)}
            />
          </Row>
          <div className="grid gap-5 sm:grid-cols-[minmax(0,2fr)_minmax(0,3fr)]">
            <Row id="fm-governorate" label={t.gov} error={err("governorate")}>
              <select
                {...aria("governorate")}
                className={cn(inputCls, "appearance-none")}
                value={d.governorate}
                onChange={(e) => set("governorate", e.target.value)}
              >
                {GOVERNORATES.map((g) => (
                  <option key={g.code} value={g.label.ar}>
                    {ar ? g.label.ar : g.label.en}
                  </option>
                ))}
              </select>
            </Row>
            <Row id="fm-address" label={t.address} error={err("address")}>
              <input
                {...aria("address")}
                className={inputCls}
                autoComplete="address-level2"
                maxLength={200}
                placeholder={t.addressPh}
                value={d.address}
                onChange={(e) => set("address", e.target.value)}
              />
            </Row>
          </div>
          <Row id="fm-email" label={t.email} optional={t.optional} error={err("email")}>
            <input
              {...aria("email")}
              className={inputCls}
              type="email"
              inputMode="email"
              autoComplete="email"
              dir="ltr"
              maxLength={200}
              value={d.email}
              onChange={(e) => set("email", e.target.value)}
            />
          </Row>
        </Section>

        <Section n={3} title={t.s3}>
          <div className="flex flex-col gap-2">
            <span id="fm-level-label" className="text-[0.95rem] font-semibold text-frost">
              {t.level}
            </span>
            <div role="radiogroup" aria-labelledby="fm-level-label" className="grid grid-cols-5 gap-2">
              {STUDY_LEVELS.map((n, i) => {
                const on = d.level === String(n);
                return (
                  <button
                    key={n}
                    id={i === 0 ? "fm-level" : undefined}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => set("level", String(n))}
                    className={cn(
                      "flex min-h-14 flex-col items-center justify-center rounded-xl border px-1 py-2 transition-colors",
                      on
                        ? "border-cyan/70 bg-volt/20 text-chalk"
                        : "border-[var(--line-2)] bg-deep/60 text-mist hover:border-volt/50 hover:text-chalk",
                    )}
                  >
                    <span className="text-[0.7rem] uppercase tracking-wide text-fog" dir="ltr">
                      Level
                    </span>
                    <span className="font-display text-xl font-bold">{n}</span>
                  </button>
                );
              })}
            </div>
            {err("level") ? (
              <p id="fm-level-error" role="alert" className="text-sm text-danger">
                {err("level")}
              </p>
            ) : d.level ? (
              <p className="text-sm text-fog" dir="auto">
                {t.levelIs(Number(d.level), t.years[Number(d.level) - 1] ?? "")}
              </p>
            ) : null}
          </div>
          <div className="grid gap-5 sm:grid-cols-2">
            <Row id="fm-faculty" label={t.faculty} error={err("faculty")}>
              <input
                {...aria("faculty")}
                className={inputCls}
                list="fm-faculties"
                maxLength={120}
                value={d.faculty}
                onChange={(e) => set("faculty", e.target.value)}
              />
              <datalist id="fm-faculties">
                {FACULTIES.map((f) => (
                  <option key={f.en} value={ar ? f.ar : f.en} />
                ))}
              </datalist>
            </Row>
            <Row id="fm-student_number" label={t.sid} optional={t.optional}>
              <input
                {...aria("student_number")}
                className={cn(inputCls, "font-mono")}
                dir="ltr"
                maxLength={40}
                value={d.student_number}
                onChange={(e) => set("student_number", e.target.value)}
              />
            </Row>
          </div>
        </Section>

        {/* The row as it will be printed in the Student Welfare list. */}
        <div
          className="overflow-hidden rounded-2xl border border-[var(--line-2)] bg-white text-[#0b1f4d]"
          data-testid="family-preview"
        >
          <p className="flex items-center gap-2 border-b border-[#e1e7f0] bg-[#f4f7fb] px-4 py-2.5 text-sm font-semibold">
            <Icon name="eye" size={16} />
            {t.preview}
          </p>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[560px] text-start text-sm" dir="rtl">
              <thead>
                <tr className="bg-[#0b1f4d] text-white">
                  <th className="px-3 py-2 text-start font-semibold">م</th>
                  {T.ar.cols.map((c) => (
                    <th key={c} className="px-3 py-2 text-start font-semibold">
                      {c}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="px-3 py-2.5 text-[#45526b]">1</td>
                  <td className="px-3 py-2.5 font-semibold">{shownName}</td>
                  <td className="px-3 py-2.5 font-mono" dir="ltr">
                    {digitsOnly(d.national_id) || "—"}
                  </td>
                  <td className="px-3 py-2.5">{d.address.trim() ? addressOf(d) : "—"}</td>
                  <td className="px-3 py-2.5 font-mono" dir="ltr">
                    {mobile ?? (d.phone || "—")}
                  </td>
                  <td className="px-3 py-2.5" dir="ltr">
                    {d.level ? levelLabel(Number(d.level)) : "—"}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>

        <div className="flex flex-col gap-2">
          <label className="flex cursor-pointer items-start gap-3 text-[0.95rem] text-mist">
            <input
              id="fm-consent"
              type="checkbox"
              className="mt-1 size-5 shrink-0 accent-[var(--color-cyan,#38dcff)]"
              checked={d.consent}
              aria-invalid={err("consent") ? true : undefined}
              aria-describedby={err("consent") ? "fm-consent-error" : undefined}
              onChange={(e) => set("consent", e.target.checked)}
            />
            <span>{t.consent}</span>
          </label>
          {err("consent") && (
            <p id="fm-consent-error" role="alert" className="text-sm text-danger">
              {err("consent")}
            </p>
          )}
        </div>

        {problem && (
          <p
            role="alert"
            className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
            data-testid="family-problem"
          >
            {problem}
          </p>
        )}

        <button
          type="submit"
          className="btn btn-primary btn-lg w-full justify-center sm:w-auto"
          disabled={busy}
        >
          <Icon name="users" size={18} />
          <span>{busy ? t.sending : t.submit}</span>
        </button>
      </form>
    </div>
  );
}
