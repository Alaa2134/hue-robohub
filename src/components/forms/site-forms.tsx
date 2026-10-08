"use client";
/**
 * The website's forms on the live (static) site, straight to Supabase like the application form:
 * "Contact us" and sponsorship requests (they land in the BuildX App's inbox), the "tell me when
 * applications open" waitlist, and the forms the team builds in the app (team tryouts, renewals,
 * surveys…), which open and close from there.
 */
import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { Icon } from "@/components/brand/icons";
import { inputCls } from "@/components/command/field";
import { cn } from "@/lib/cn";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

type Locale = "ar" | "en";
const L = (l: string): Locale => (l === "ar" ? "ar" : "en");

async function rpc<T>(fn: string, body: unknown): Promise<T> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
}

const C = {
  ar: {
    name: "الاسم",
    email: "البريد الإلكتروني",
    phone: "رقم الموبايل / واتساب",
    org: "الجهة / الشركة",
    topic: "الموضوع",
    message: "رسالتك",
    optional: "اختياري",
    send: "ابعت",
    sending: "بنبعت…",
    oneOf: "اكتب الإيميل أو رقم الموبايل عشان نعرف نرد عليك.",
    required: "الخانة دي مطلوبة.",
    short: (n: number) => `اكتب ${n} حروف على الأقل.`,
    badEmail: "الإيميل مش مظبوط.",
    badPhone: "الرقم مش مظبوط.",
    badUrl: "اكتب رابط كامل يبدأ بـ https://",
    badNumber: "اكتب رقم.",
    badDate: "اختار تاريخ.",
    badOption: "اختار من الاختيارات.",
    tooLong: "الكلام طويل زيادة.",
    errors: { rate_limited: "بعت كذا مرة في وقت قصير. استنى شوية وجرّب تاني.", busy: "في ضغط دلوقتي. جرّب بعد دقيقة.", invalid: "في بيانات مش مظبوطة. راجعها وجرّب تاني.", network: "مقدرناش نوصل. اتأكد من النت وجرّب تاني.", closed: "الفورم ده اتقفل.", not_found: "الفورم ده مش موجود." },
    sentTitle: "وصلتنا رسالتك ✅",
    sentBody: "بنقرا كل رسالة ونرد خلال أيام قليلة.",
    another: "ابعت رسالة تانية",
    topics: { general: "عام", partnership: "شراكة / رعاية", media: "إعلام", workshop: "طلب ورشة", other: "حاجة تانية" },
    tier: "الباقة اللي مهتمين بيها",
    tiers: { strategic: "شريك استراتيجي", gold: "راعي ذهبي", silver: "راعي فضي", technical: "شريك تقني (أجهزة / أدوات / مكان)", unsure: "لسه مش متأكدين" },
    site: "موقع الشركة",
    interest: "مهتمين بإيه؟",
    interests: ["مسابقة معيّنة", "ورش وتدريب", "إيفنت", "توظيف وتدريب صيفي", "حاجة تانية"],
    sponsorMsg: "احكيلنا عن الشركة وإزاي حابين تدعمونا",
    sponsorTitle: "طلب رعاية",
    sponsorSent: "شكراً لاهتمامكم 🤝 فريق الشراكات هيتواصل معاكم قريب.",
    deck: "حمّل ملف الرعاية (PDF)",
    wlTitle: "بلّغني أول ما التقديم يفتح",
    wlBody: "سيب رقمك أو إيميلك، وأول ما التقديم يفتح هنبعتلك.",
    wlSend: "بلّغني",
    wlDone: "تمام ✅ أول ما التقديم يفتح هتعرف.",
    wlDup: "إنت مسجّل قبل كده ✅ هنبلّغك أول ما يفتح.",
    closedTitle: "الفورم ده مقفول دلوقتي",
    opensAt: (d: string) => `هيفتح ${d}`,
    closesAt: (d: string) => `بيقفل ${d}`,
    formSent: "وصلنا ردك ✅ شكراً!",
    formDup: "إنت بعت الفورم ده قبل كده ✅",
    loading: "بنحمّل الفورم…",
    yes: "أيوه",
    choose: "اختار…",
    back: "كل الفورمات",
    noForms: "مفيش فورمات مفتوحة دلوقتي. تابعنا عشان تعرف أول ما يفتح فورم جديد.",
    fill: "املأ الفورم",
    soon: "قريباً",
    applyTeam: "قدّم على الفريق",
    teamOpen: "التقديم على الفريق ده مفتوح دلوقتي!",
  },
  en: {
    name: "Name",
    email: "Email",
    phone: "Mobile / WhatsApp",
    org: "Organization / company",
    topic: "Topic",
    message: "Your message",
    optional: "Optional",
    send: "Send",
    sending: "Sending…",
    oneOf: "Add your email or your phone so we can reply.",
    required: "This field is required.",
    short: (n: number) => `Write at least ${n} characters.`,
    badEmail: "That email doesn't look right.",
    badPhone: "That number doesn't look right.",
    badUrl: "Use a full link starting with https://",
    badNumber: "Enter a number.",
    badDate: "Pick a date.",
    badOption: "Pick one of the options.",
    tooLong: "That's too long.",
    errors: { rate_limited: "Too many tries in a short time. Wait a little and try again.", busy: "We're busy right now. Try again in a minute.", invalid: "Something isn't right. Check the form and try again.", network: "We couldn't connect. Check your connection and try again.", closed: "This form is closed.", not_found: "This form doesn't exist." },
    sentTitle: "Message received ✅",
    sentBody: "We read every message and reply within a few days.",
    another: "Send another message",
    topics: { general: "General", partnership: "Partnership / sponsorship", media: "Media", workshop: "Workshop request", other: "Other" },
    tier: "Package you're interested in",
    tiers: { strategic: "Strategic partner", gold: "Gold sponsor", silver: "Silver sponsor", technical: "Technical partner (equipment / tools / venue)", unsure: "Not sure yet" },
    site: "Company website",
    interest: "Interested in",
    interests: ["A specific competition", "Workshops & training", "An event", "Hiring & internships", "Something else"],
    sponsorMsg: "Tell us about the company and how you'd like to support us",
    sponsorTitle: "Sponsorship request",
    sponsorSent: "Thank you for your interest 🤝 Our partnerships team will be in touch soon.",
    deck: "Download the sponsorship deck (PDF)",
    wlTitle: "Tell me when applications open",
    wlBody: "Leave your phone or email and we'll tell you the moment applications open.",
    wlSend: "Notify me",
    wlDone: "Done ✅ You'll hear from us when applications open.",
    wlDup: "You're already on the list ✅",
    closedTitle: "This form is closed right now",
    opensAt: (d: string) => `Opens ${d}`,
    closesAt: (d: string) => `Closes ${d}`,
    formSent: "Got your answers ✅ Thank you!",
    formDup: "You've already sent this form ✅",
    loading: "Loading the form…",
    yes: "Yes",
    choose: "Choose…",
    back: "All forms",
    noForms: "No forms are open right now. Follow us to hear when a new one opens.",
    fill: "Fill in",
    soon: "Soon",
    applyTeam: "Apply to the team",
    teamOpen: "Applications for this team are open now!",
  },
};

const EMAIL = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const PHONE = /^\+?[0-9]{7,16}$/;
const cleanPhone = (s: string) => s.replace(/[^0-9+]/g, "");
const fmtWhen = (iso: string, l: Locale) => new Date(iso).toLocaleString(l === "ar" ? "ar-EG" : "en-GB", { weekday: "short", day: "numeric", month: "short", hour: "numeric", minute: "2-digit" });

function Row({ id, label, optional, error, hint, children, className }: { id: string; label: string; optional?: string; error?: string; hint?: ReactNode; children: ReactNode; className?: string }) {
  return (
    <div className={cn("flex flex-col gap-2", className)}>
      <label htmlFor={id} className="flex items-baseline justify-between gap-3 text-[0.95rem] font-semibold text-frost">
        {label}
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

const aria = (id: string, error?: string) => ({ id, "aria-invalid": error ? true : undefined, "aria-describedby": error ? `${id}-error` : undefined });

function Honeypot({ value }: { value: React.RefObject<HTMLInputElement | null> }) {
  return (
    <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
      <label>
        Website
        <input ref={value} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
      </label>
    </div>
  );
}

function Done({ title, body, children }: { title: string; body?: string; children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => ref.current?.focus(), []);
  return (
    <div ref={ref} tabIndex={-1} role="status" className="frame flex flex-col items-start gap-4 p-7 outline-none sm:p-10" style={{ ["--edge" as string]: 0.8 }}>
      <span className="flex size-14 items-center justify-center rounded-2xl border border-ok/40 bg-ok/10 text-ok">
        <Icon name="check" size={26} />
      </span>
      <p className="t-headline text-2xl text-chalk sm:text-3xl">{title}</p>
      {body && <p className="max-w-lg text-mist">{body}</p>}
      {children}
    </div>
  );
}

function Submit({ busy, label, busyLabel }: { busy: boolean; label: string; busyLabel: string }) {
  return (
    <button type="submit" disabled={busy} className="btn btn-primary btn-lg w-full disabled:opacity-70 sm:w-auto">
      <span aria-hidden className="btn-sheen" />
      <span>{busy ? busyLabel : label}</span>
      {!busy && <Icon name="arrow" size={16} className="btn-arrow" />}
    </button>
  );
}

/* ─── Contact us / sponsorship request ─────────────────────────────────── */

export function MessageForm({ locale, kind = "contact", defaultTopic, deckUrl }: { locale: string; kind?: "contact" | "sponsor"; defaultTopic?: string; deckUrl?: string | null }) {
  const l = L(locale);
  const t = C[l];
  const honey = useRef<HTMLInputElement>(null);
  const sponsor = kind === "sponsor";
  const [d, setD] = useState({ name: "", email: "", phone: "", organization: "", topic: defaultTopic && defaultTopic in t.topics ? defaultTopic : "general", message: "", tier: "", site: "", interest: "" });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const set = (k: keyof typeof d, v: string) => {
    setD((x) => ({ ...x, [k]: v }));
    if (errors[k]) setErrors((e) => ({ ...e, [k]: "" }));
  };
  const p = (k: string) => `${kind}-${k}`;

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e: Record<string, string> = {};
    if (d.name.trim().length < 2) e.name = t.required;
    if (sponsor && d.organization.trim().length < 2) e.organization = t.required;
    if (d.email.trim() && !EMAIL.test(d.email.trim())) e.email = t.badEmail;
    if (d.phone.trim() && !PHONE.test(cleanPhone(d.phone))) e.phone = t.badPhone;
    if (!d.email.trim() && !d.phone.trim()) e.email = t.oneOf;
    if (d.site.trim() && !/^https?:\/\/\S+$/i.test(d.site.trim())) e.site = t.badUrl;
    if (d.message.trim().length < 10) e.message = d.message.trim() ? t.short(10) : t.required;
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      document.getElementById(p(first))?.focus();
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const out = await rpc<{ ok: boolean; error?: keyof typeof t.errors }>("submit_message", {
        p: { ...d, phone: cleanPhone(d.phone), kind, locale: l, website: honey.current?.value ?? "" },
      });
      if (!out.ok) setFormError(t.errors[out.error ?? "invalid"] ?? t.errors.invalid);
      else setDone(true);
    } catch {
      setFormError(t.errors.network);
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <Done title={sponsor ? t.sponsorSent : t.sentTitle} body={sponsor ? undefined : t.sentBody}>
        <button
          type="button"
          className="btn"
          onClick={() => {
            setD((x) => ({ ...x, message: "" }));
            setDone(false);
          }}
        >
          {t.another}
        </button>
      </Done>
    );

  return (
    <form onSubmit={submit} noValidate className="frame relative grid gap-5 p-5 sm:grid-cols-2 sm:p-8" aria-label={sponsor ? t.sponsorTitle : undefined}>
      <Honeypot value={honey} />
      <Row id={p("name")} label={t.name} error={errors.name}>
        <input {...aria(p("name"), errors.name)} className={inputCls} autoComplete="name" maxLength={120} value={d.name} onChange={(e) => set("name", e.target.value)} />
      </Row>
      <Row id={p("organization")} label={t.org} optional={sponsor ? undefined : t.optional} error={errors.organization}>
        <input {...aria(p("organization"), errors.organization)} className={inputCls} autoComplete="organization" maxLength={160} value={d.organization} onChange={(e) => set("organization", e.target.value)} />
      </Row>
      <Row id={p("email")} label={t.email} error={errors.email}>
        <input {...aria(p("email"), errors.email)} className={inputCls} type="email" inputMode="email" autoComplete="email" dir="ltr" maxLength={200} value={d.email} onChange={(e) => set("email", e.target.value)} />
      </Row>
      <Row id={p("phone")} label={t.phone} optional={t.optional} error={errors.phone}>
        <input {...aria(p("phone"), errors.phone)} className={inputCls} type="tel" inputMode="tel" autoComplete="tel" dir="ltr" placeholder="01xxxxxxxxx" maxLength={20} value={d.phone} onChange={(e) => set("phone", e.target.value)} />
      </Row>
      {sponsor ? (
        <>
          <Row id={p("tier")} label={t.tier} optional={t.optional}>
            <select {...aria(p("tier"))} className={cn(inputCls, "appearance-none")} value={d.tier} onChange={(e) => set("tier", e.target.value)}>
              <option value="">{t.choose}</option>
              {Object.entries(t.tiers).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </select>
          </Row>
          <Row id={p("interest")} label={t.interest} optional={t.optional}>
            <select {...aria(p("interest"))} className={cn(inputCls, "appearance-none")} value={d.interest} onChange={(e) => set("interest", e.target.value)}>
              <option value="">{t.choose}</option>
              {t.interests.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </Row>
          <Row id={p("site")} label={t.site} optional={t.optional} error={errors.site} className="sm:col-span-2">
            <input {...aria(p("site"), errors.site)} className={inputCls} type="url" inputMode="url" dir="ltr" placeholder="https://" maxLength={300} value={d.site} onChange={(e) => set("site", e.target.value)} />
          </Row>
        </>
      ) : (
        <Row id={p("topic")} label={t.topic} className="sm:col-span-2">
          <select {...aria(p("topic"))} className={cn(inputCls, "appearance-none")} value={d.topic} onChange={(e) => set("topic", e.target.value)}>
            {Object.entries(t.topics).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </select>
        </Row>
      )}
      <Row id={p("message")} label={sponsor ? t.sponsorMsg : t.message} error={errors.message} className="sm:col-span-2">
        <textarea {...aria(p("message"), errors.message)} className={cn(inputCls, "h-auto min-h-36 py-3")} rows={6} maxLength={5000} value={d.message} onChange={(e) => set("message", e.target.value)} />
      </Row>
      {formError && (
        <p role="alert" className="text-sm text-danger sm:col-span-2">
          {formError}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
        <Submit busy={busy} label={t.send} busyLabel={t.sending} />
        {sponsor && deckUrl && (
          <a href={deckUrl} target="_blank" rel="noopener noreferrer" className="btn btn-lg">
            <Icon name="arrowUpRight" size={16} />
            <span>{t.deck}</span>
          </a>
        )}
      </div>
    </form>
  );
}

/** The sponsorship deck link, from the site settings (set in the BuildX App). */
export function useSponsorDeck() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/site_settings?select=value&key=eq.sponsorship`, { headers: { apikey: SUPABASE_KEY } })
      .then((r) => (r.ok ? r.json() : []))
      .then((rows: { value?: { deck_url?: string } }[]) => {
        const u = rows[0]?.value?.deck_url;
        if (u && /^https:\/\//.test(u)) setUrl(u);
      })
      .catch(() => undefined);
  }, []);
  return url;
}

export function SponsorRequest({ locale }: { locale: string }) {
  const deck = useSponsorDeck();
  return <MessageForm locale={locale} kind="sponsor" deckUrl={deck} />;
}

/* ─── Waitlist ─────────────────────────────────────────────────────────── */

export function WaitlistForm({ locale }: { locale: string }) {
  const l = L(locale);
  const t = C[l];
  const honey = useRef<HTMLInputElement>(null);
  const [d, setD] = useState({ name: "", contact: "" });
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "ok" | "dup">("");

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const v = d.contact.trim();
    const email = EMAIL.test(v) ? v : "";
    const phone = !email && PHONE.test(cleanPhone(v)) ? cleanPhone(v) : "";
    if (!email && !phone) {
      setError(v ? (v.includes("@") ? t.badEmail : t.badPhone) : t.oneOf);
      document.getElementById("wl-contact")?.focus();
      return;
    }
    setBusy(true);
    setError("");
    try {
      const out = await rpc<{ ok: boolean; duplicate?: boolean; error?: keyof typeof t.errors }>("join_waitlist", { p: { name: d.name, email, phone, locale: l, website: honey.current?.value ?? "" } });
      if (!out.ok) setError(t.errors[out.error ?? "invalid"] ?? t.errors.invalid);
      else setDone(out.duplicate ? "dup" : "ok");
    } catch {
      setError(t.errors.network);
    } finally {
      setBusy(false);
    }
  };

  if (done)
    return (
      <p role="status" className="flex items-center gap-2 rounded-xl border border-ok/30 bg-ok/10 px-4 py-3 text-chalk">
        <Icon name="check" size={18} className="text-ok" />
        {done === "dup" ? t.wlDup : t.wlDone}
      </p>
    );

  return (
    <form onSubmit={submit} noValidate className="relative flex w-full max-w-xl flex-col gap-3" aria-label={t.wlTitle}>
      <Honeypot value={honey} />
      <p className="font-semibold text-chalk">{t.wlTitle}</p>
      <p className="text-sm text-mist">{t.wlBody}</p>
      <div className="grid gap-3 sm:grid-cols-[1fr_1.3fr_auto]">
        <label className="sr-only" htmlFor="wl-name">
          {t.name}
        </label>
        <input id="wl-name" className={inputCls} placeholder={`${t.name} (${t.optional})`} autoComplete="name" maxLength={120} value={d.name} onChange={(e) => setD({ ...d, name: e.target.value })} />
        <label className="sr-only" htmlFor="wl-contact">
          {`${t.phone} / ${t.email}`}
        </label>
        <input id="wl-contact" {...{ "aria-invalid": error ? true : undefined }} className={inputCls} dir="ltr" placeholder={l === "ar" ? "01xxxxxxxxx أو الإيميل" : "Phone or email"} autoComplete="tel" maxLength={200} value={d.contact} onChange={(e) => setD({ ...d, contact: e.target.value })} />
        <button type="submit" disabled={busy} className="btn btn-primary h-11 disabled:opacity-70">
          <Icon name="signal" size={16} />
          <span>{busy ? t.sending : t.wlSend}</span>
        </button>
      </div>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </form>
  );
}

/* ─── Forms built in the app ───────────────────────────────────────────── */

export type FieldType = "name" | "text" | "textarea" | "email" | "phone" | "number" | "url" | "date" | "select" | "multi" | "checkbox";
export type FormField = { id: string; type: FieldType; label_ar: string; label_en?: string; help_ar?: string; help_en?: string; required?: boolean; options?: { ar: string; en?: string }[] };
export type PublicForm = {
  slug: string;
  title_ar: string;
  title_en?: string | null;
  intro_ar?: string | null;
  intro_en?: string | null;
  success_ar?: string | null;
  success_en?: string | null;
  fields?: FormField[];
  team?: string | null;
  listed?: boolean;
  open: boolean;
  opens_at?: string | null;
  closes_at?: string | null;
};

const titleOf = (f: PublicForm, l: Locale) => (l === "en" && f.title_en) || f.title_ar;
const introOf = (f: PublicForm, l: Locale) => (l === "en" ? f.intro_en || f.intro_ar : f.intro_ar) ?? "";
const labelOf = (x: FormField, l: Locale) => (l === "en" && x.label_en) || x.label_ar;
const helpOf = (x: FormField, l: Locale) => (l === "en" ? x.help_en || x.help_ar : x.help_ar) ?? "";

export function useOpenForms() {
  const [forms, setForms] = useState<PublicForm[] | null>(null);
  useEffect(() => {
    rpc<PublicForm[]>("public_forms", {})
      .then(setForms)
      .catch(() => setForms([]));
  }, []);
  return forms;
}

/** /forms: every form that's open (or opening soon). */
export function OpenForms({ locale, base }: { locale: string; base: string }) {
  const l = L(locale);
  const t = C[l];
  const forms = useOpenForms();
  if (!forms) return <div className="h-40 animate-pulse rounded-[20px] bg-panel/60" aria-busy="true" />;
  const shown = forms.filter((f) => f.listed !== false);
  if (!shown.length) return <p className="rounded-[18px] border border-[var(--line-2)] bg-panel/50 p-6 text-center text-mist">{t.noForms}</p>;
  return (
    <ul className="grid gap-4 sm:grid-cols-2">
      {shown.map((f) => (
        <li key={f.slug} className="frame flex flex-col gap-3 p-6">
          <p className="flex flex-wrap items-center gap-2 text-xs font-semibold">
            <span className={cn("rounded-full px-2.5 py-0.5", f.open ? "bg-ok/15 text-ok" : "bg-warn/15 text-warn")}>{f.open ? (l === "ar" ? "مفتوح" : "Open") : t.soon}</span>
            {f.open && f.closes_at && <span className="text-fog">{t.closesAt(fmtWhen(f.closes_at, l))}</span>}
            {!f.open && f.opens_at && <span className="text-fog">{t.opensAt(fmtWhen(f.opens_at, l))}</span>}
          </p>
          <h2 className="t-title text-xl text-chalk">{titleOf(f, l)}</h2>
          {introOf(f, l) && <p className="line-clamp-3 text-sm leading-relaxed text-mist">{introOf(f, l)}</p>}
          {f.open && (
            <Link href={`${base.replace(/\/?$/, "/")}?f=${encodeURIComponent(f.slug)}`} className="btn btn-primary btn-sm mt-auto w-fit">
              <span>{t.fill}</span>
              <Icon name="arrow" size={14} className="btn-arrow" />
            </Link>
          )}
        </li>
      ))}
    </ul>
  );
}

/** A competition team's page: "Apply to the team" while its tryout form is open. */
export function TeamFormCta({ locale, team, base }: { locale: string; team: string; base: string }) {
  const l = L(locale);
  const t = C[l];
  const forms = useOpenForms();
  const f = forms?.find((x) => x.team === team && x.open);
  if (!f) return null;
  return (
    <div className="frame flex flex-col items-start gap-3 p-6 sm:flex-row sm:items-center sm:justify-between" style={{ ["--edge" as string]: 0.8 }}>
      <div>
        <p className="font-semibold text-chalk">{t.teamOpen}</p>
        <p className="text-sm text-mist">
          {titleOf(f, l)}
          {f.closes_at ? ` · ${t.closesAt(fmtWhen(f.closes_at, l))}` : ""}
        </p>
      </div>
      <Link href={`${base.replace(/\/?$/, "/")}?f=${encodeURIComponent(f.slug)}`} className="btn btn-primary">
        <span aria-hidden className="btn-sheen" />
        <span>{t.applyTeam}</span>
        <Icon name="arrow" size={15} className="btn-arrow" />
      </Link>
    </div>
  );
}

/** /form?f=<slug>: fill in one form. */
export function FormFiller({ locale, listHref }: { locale: string; listHref: string }) {
  const l = L(locale);
  const t = C[l];
  const honey = useRef<HTMLInputElement>(null);
  const [slug, setSlug] = useState<string | null>(null);
  const [form, setForm] = useState<PublicForm | null | undefined>(undefined);
  const [a, setA] = useState<Record<string, string | string[] | boolean>>({});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<"" | "ok" | "dup">("");

  useEffect(() => {
    const s = new URLSearchParams(location.search).get("f") ?? "";
    setSlug(s);
    if (!s) return setForm(null);
    rpc<PublicForm | null>("public_form", { p_slug: s })
      .then((f) => setForm(f ?? null))
      .catch(() => setForm(null));
  }, []);

  if (form === undefined) return <p className="text-mist">{t.loading}</p>;
  if (!form || !slug)
    return (
      <div className="frame flex flex-col items-start gap-4 p-8">
        <p className="t-headline text-2xl text-chalk">{t.errors.not_found}</p>
        <Link href={listHref} className="btn btn-sm">
          {t.back}
        </Link>
      </div>
    );

  const fields = form.fields ?? [];
  const head = (
    <header className="mb-8 flex flex-col gap-3">
      <h1 className="t-headline text-3xl text-chalk sm:text-4xl">{titleOf(form, l)}</h1>
      {introOf(form, l) && <p className="max-w-2xl whitespace-pre-line text-lg leading-relaxed text-mist">{introOf(form, l)}</p>}
      {form.open && form.closes_at && <p className="text-sm font-semibold text-warn">{t.closesAt(fmtWhen(form.closes_at, l))}</p>}
    </header>
  );

  if (!form.open)
    return (
      <>
        {head}
        <div role="status" className="frame flex flex-col items-start gap-3 p-8">
          <span className="flex size-12 items-center justify-center rounded-2xl border border-warn/40 bg-warn/10 text-warn">
            <Icon name="clock" size={22} />
          </span>
          <p className="t-headline text-2xl text-chalk">{t.closedTitle}</p>
          {form.opens_at && new Date(form.opens_at) > new Date() && <p className="text-mist">{t.opensAt(fmtWhen(form.opens_at, l))}</p>}
          <Link href={listHref} className="btn btn-sm">
            {t.back}
          </Link>
        </div>
      </>
    );

  if (done) return <Done title={done === "dup" ? t.formDup : (l === "en" ? form.success_en || form.success_ar : form.success_ar) || t.formSent} />;

  const set = (id: string, v: string | string[] | boolean) => {
    setA((x) => ({ ...x, [id]: v }));
    if (errors[id]) setErrors((e) => ({ ...e, [id]: "" }));
  };
  const reason: Record<string, string> = { required: t.required, email: t.badEmail, phone: t.badPhone, number: t.badNumber, url: t.badUrl, date: t.badDate, option: t.badOption, too_long: t.tooLong };

  const check = () => {
    const e: Record<string, string> = {};
    for (const x of fields) {
      const v = a[x.id];
      const s = typeof v === "string" ? v.trim() : "";
      const empty = x.type === "multi" ? !(Array.isArray(v) && v.length) : x.type === "checkbox" ? v !== true : !s;
      if (empty) {
        if (x.required) e[x.id] = t.required;
        continue;
      }
      if (x.type === "email" && !EMAIL.test(s)) e[x.id] = t.badEmail;
      if (x.type === "phone" && !PHONE.test(cleanPhone(s))) e[x.id] = t.badPhone;
      if (x.type === "url" && !/^https?:\/\/\S+$/i.test(s)) e[x.id] = t.badUrl;
      if (x.type === "number" && !/^-?\d+(\.\d+)?$/.test(s)) e[x.id] = t.badNumber;
    }
    return e;
  };

  const submit = async (ev: React.FormEvent) => {
    ev.preventDefault();
    const e = check();
    setErrors(e);
    const first = Object.keys(e)[0];
    if (first) {
      document.getElementById(`ff-${first}`)?.focus();
      return;
    }
    setBusy(true);
    setFormError("");
    try {
      const answers = Object.fromEntries(Object.entries(a).map(([k, v]) => [k, typeof v === "string" ? v.trim() : v]));
      const out = await rpc<{ ok: boolean; duplicate?: boolean; error?: string; fields?: Record<string, string> }>("submit_form", { p_slug: slug, p_answers: answers, p_locale: l, p_website: honey.current?.value ?? "" });
      if (out.ok) setDone(out.duplicate ? "dup" : "ok");
      else if (out.error === "fields" && out.fields) {
        const fe = Object.fromEntries(Object.entries(out.fields).map(([k, r]) => [k, reason[r] ?? t.errors.invalid]));
        setErrors(fe);
        document.getElementById(`ff-${Object.keys(fe)[0]}`)?.focus();
      } else if (out.error === "closed") setForm({ ...form, open: false });
      else setFormError(t.errors[(out.error as keyof typeof t.errors) ?? "invalid"] ?? t.errors.invalid);
    } catch {
      setFormError(t.errors.network);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      {head}
      <form onSubmit={submit} noValidate className="frame relative grid gap-6 p-5 sm:p-8">
        <Honeypot value={honey} />
        {fields.map((x) => {
          const id = `ff-${x.id}`;
          const err = errors[x.id];
          const label = labelOf(x, l);
          const opt = x.required ? undefined : t.optional;
          const v = a[x.id];
          if (x.type === "checkbox")
            return (
              <div key={x.id} className="flex flex-col gap-1.5">
                <label className="flex items-start gap-3 text-[0.95rem] text-frost">
                  <input {...aria(id, err)} type="checkbox" className="mt-0.5 size-5 shrink-0 accent-[#2b6dff]" checked={v === true} onChange={(e) => set(x.id, e.target.checked)} />
                  <span>{label}</span>
                </label>
                {err && (
                  <p id={`${id}-error`} role="alert" className="text-sm text-danger">
                    {err}
                  </p>
                )}
              </div>
            );
          if (x.type === "multi") {
            const list = Array.isArray(v) ? v : [];
            return (
              <fieldset key={x.id} className="flex flex-col gap-2.5" aria-describedby={err ? `${id}-error` : undefined}>
                <legend className="mb-1 flex w-full items-baseline justify-between gap-3 text-[0.95rem] font-semibold text-frost">
                  {label}
                  {opt && <span className="text-xs font-normal text-fog">{opt}</span>}
                </legend>
                <div className="flex flex-wrap gap-2">
                  {(x.options ?? []).map((o, i) => {
                    const on = list.includes(o.ar);
                    return (
                      <button
                        key={o.ar}
                        id={i === 0 ? id : undefined}
                        type="button"
                        aria-pressed={on}
                        onClick={() => set(x.id, on ? list.filter((y) => y !== o.ar) : [...list, o.ar])}
                        className={cn("rounded-full border px-3.5 py-1.5 text-sm transition-colors", on ? "border-cyan/70 bg-volt/25 text-chalk" : "border-[var(--line-2)] text-mist hover:border-volt/50")}
                      >
                        {(l === "en" && o.en) || o.ar}
                      </button>
                    );
                  })}
                </div>
                {err ? (
                  <p id={`${id}-error`} role="alert" className="text-sm text-danger">
                    {err}
                  </p>
                ) : (
                  helpOf(x, l) && <p className="text-sm text-fog">{helpOf(x, l)}</p>
                )}
              </fieldset>
            );
          }
          const s = typeof v === "string" ? v : "";
          return (
            <Row key={x.id} id={id} label={label} optional={opt} error={err} hint={helpOf(x, l)}>
              {x.type === "textarea" ? (
                <textarea {...aria(id, err)} className={cn(inputCls, "h-auto min-h-32 py-3")} rows={5} maxLength={4000} value={s} onChange={(e) => set(x.id, e.target.value)} />
              ) : x.type === "select" ? (
                <select {...aria(id, err)} className={cn(inputCls, "appearance-none")} value={s} onChange={(e) => set(x.id, e.target.value)}>
                  <option value="">{t.choose}</option>
                  {(x.options ?? []).map((o) => (
                    <option key={o.ar} value={o.ar}>
                      {(l === "en" && o.en) || o.ar}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  {...aria(id, err)}
                  className={inputCls}
                  maxLength={500}
                  value={s}
                  onChange={(e) => set(x.id, e.target.value)}
                  type={x.type === "email" ? "email" : x.type === "phone" ? "tel" : x.type === "url" ? "url" : x.type === "date" ? "date" : "text"}
                  inputMode={x.type === "number" ? "decimal" : x.type === "phone" ? "tel" : x.type === "email" ? "email" : x.type === "url" ? "url" : undefined}
                  autoComplete={x.type === "name" ? "name" : x.type === "email" ? "email" : x.type === "phone" ? "tel" : "off"}
                  dir={["email", "phone", "url", "number"].includes(x.type) ? "ltr" : undefined}
                  placeholder={x.type === "phone" ? "01xxxxxxxxx" : x.type === "url" ? "https://" : undefined}
                />
              )}
            </Row>
          );
        })}
        {formError && (
          <p role="alert" className="text-sm text-danger">
            {formError}
          </p>
        )}
        <div>
          <Submit busy={busy} label={t.send} busyLabel={t.sending} />
        </div>
      </form>
    </>
  );
}
