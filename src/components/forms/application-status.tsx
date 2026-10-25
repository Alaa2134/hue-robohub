"use client";
/** /join/status: an applicant checks their application with its reference and their phone number. */
import { useEffect, useState } from "react";
import { Icon, type IconName } from "@/components/brand/icons";
import { GOVERNORATES, digitsOnly, readNationalId } from "@/content/family";
import { cn } from "@/lib/cn";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

type Status = "new" | "contacted" | "interview" | "accepted" | "waitlist" | "rejected";
type Result = { ref: string; first_name: string; track: string; status: Status; created_at: string; updated_at: string; note: string; family_needed?: boolean };

const T = {
  en: {
    ref: "Application reference",
    refHint: "It starts with BX- and was shown when you applied.",
    phone: "Phone number you applied with",
    check: "Check status",
    checking: "Checking…",
    notFound: "We couldn't find an application with this reference and phone number. Check both and try again.",
    formCode: "That's a form code (F-…). Check it on the page of the form you filled in, under «Your application».",
    limited: "Too many tries from this network. Please wait 15 minutes and try again.",
    network: "We couldn't reach the server. Check your connection and try again.",
    hi: (n: string) => `Hi ${n}!`,
    applied: "Applied",
    updated: "Last update",
    track: "First-choice track",
    message: "Message from the team",
    again: "Check another application",
    family: {
      title: "One last step: the Student Welfare family list",
      body: "Now that you're accepted, the university's family list needs your national ID, governorate and address. We ask only once, only after acceptance, and only the team sees them.",
      nid: "National ID number (14 digits)",
      gov: "Governorate",
      address: "Full address",
      save: "Send",
      saving: "Sending…",
      done: "Thanks — you're on the family list.",
      err: { nid: "This doesn't look like a national ID — check the 14 digits.", governorate: "Choose your governorate.", address: "Write the full address: city or village, area and street.", rate_limited: "Too many tries. Wait 15 minutes and try again.", network: "We couldn't reach the server. Try again." } as Record<string, string>,
    },
    steps: ["Received", "In review", "Decision"],
    status: {
      new: ["Received", "Your application is with our team and will be reviewed soon."],
      contacted: ["In review", "We've reached out to you — check your phone and WhatsApp."],
      interview: ["Interview", "You're invited to a short interview. Watch for our message with the time."],
      accepted: ["Accepted 🎉", "Welcome to BuildX HUE! We'll send you your BuildX App sign-in details."],
      waitlist: ["Waiting list", "You're on our waiting list. We'll contact you as soon as a place opens up."],
      rejected: ["Not this round", "We couldn't offer you a place this round. Keep building — you're welcome to apply again next intake."],
    } as Record<Status, [string, string]>,
  },
  ar: {
    ref: "رقم الطلب",
    refHint: "بيبدأ بـ BX- وظهرلك بعد ما قدّمت.",
    phone: "رقم الموبايل اللي قدّمت بيه",
    check: "اعرف حالة طلبك",
    checking: "بندوّر…",
    notFound: "مش لاقيين طلب بالرقم ده ورقم الموبايل ده. اتأكد من الاتنين وجرّب تاني.",
    formCode: "ده كود فورم (F-…). تابعه من صفحة الفورم اللي ملّيته، في «تابع طلبك».",
    limited: "محاولات كتير من الشبكة دي. استنى ربع ساعة وجرّب تاني.",
    network: "مقدرناش نوصل للسيرفر. اتأكد من النت وجرّب تاني.",
    hi: (n: string) => `أهلاً ${n}!`,
    applied: "قدّمت",
    updated: "آخر تحديث",
    track: "المسار الأول",
    message: "رسالة من الفريق",
    again: "اعرف حالة طلب تاني",
    family: {
      title: "خطوة أخيرة: كشف الأسرة في رعاية الطلاب",
      body: "بعد ما اتقبلت، كشف الأسرة في الجامعة محتاج رقمك القومي ومحافظتك وعنوانك. بنطلبهم مرة واحدة بس، وبعد القبول بس، ومحدش بيشوفهم غير الفريق.",
      nid: "الرقم القومي (14 رقم)",
      gov: "المحافظة",
      address: "العنوان بالتفصيل",
      save: "ابعت",
      saving: "بنبعت…",
      done: "شكراً — اتضفت في كشف الأسرة.",
      err: { nid: "الرقم ده مش شبه الرقم القومي — راجع الـ14 رقم.", governorate: "اختار محافظتك.", address: "اكتب العنوان بالتفصيل: المدينة أو القرية والمنطقة والشارع.", rate_limited: "محاولات كتير. استنى ربع ساعة وجرّب تاني.", network: "مقدرناش نوصل للسيرفر. جرّب تاني." } as Record<string, string>,
    },
    steps: ["اتستلم", "بنراجعه", "القرار"],
    status: {
      new: ["اتستلم", "طلبك وصل للفريق وهيتراجع قريب."],
      contacted: ["بنراجعه", "تواصلنا معاك — بص على موبايلك والواتساب."],
      interview: ["مقابلة", "انت مدعو لمقابلة قصيرة. استنى رسالتنا بالميعاد."],
      accepted: ["اتقبلت 🎉", "أهلاً بيك في BuildX HUE! هنبعتلك بيانات الدخول على تطبيق BuildX."],
      waitlist: ["قائمة الانتظار", "انت على قائمة الانتظار. هنكلمك أول ما يبقى في مكان."],
      rejected: ["مش الدورة دي", "مقدرناش نوفّرلك مكان الدورة دي. كمّل اتعلّم وابني — تقدر تقدّم تاني في الدورة الجاية."],
    } as Record<Status, [string, string]>,
  },
};

const STEP: Record<Status, number> = { new: 0, contacted: 1, interview: 1, accepted: 2, waitlist: 2, rejected: 2 };
const LOOK: Record<Status, { icon: IconName; cls: string }> = {
  new: { icon: "clock", cls: "border-cyan/40 bg-cyan/10 text-cyan" },
  contacted: { icon: "mail", cls: "border-cyan/40 bg-cyan/10 text-cyan" },
  interview: { icon: "calendar", cls: "border-volt/40 bg-volt/10 text-volt" },
  accepted: { icon: "check", cls: "border-ok/40 bg-ok/10 text-ok" },
  waitlist: { icon: "clock", cls: "border-warn/40 bg-warn/10 text-warn" },
  rejected: { icon: "flag", cls: "border-[var(--line-2)] bg-panel text-mist" },
};

const input = "h-12 w-full rounded-xl border border-[var(--line-2)] bg-void/60 px-4 text-[16px] text-chalk outline-none transition-colors placeholder:text-fog focus:border-cyan";

export function ApplicationStatus({ locale, tracks }: { locale: string; tracks: Record<string, string> }) {
  const t = T[locale === "ar" ? "ar" : "en"];
  const [ref, setRef] = useState("");
  const [phone, setPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState<Result | null>(null);

  useEffect(() => {
    let q = new URLSearchParams(location.search).get("ref");
    try {
      q ||= localStorage.getItem("bx-last-ref");
    } catch {}
    if (q && /^[A-Za-z0-9-]{6,12}$/.test(q)) setRef(q.toUpperCase());
  }, []);

  const date = (iso: string) => new Intl.DateTimeFormat(locale === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(iso));

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/application_status`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_ref: ref.trim(), p_phone: phone.trim() }),
      });
      const out = (await r.json().catch(() => null)) as ({ ok: true } & Result) | { ok: false; error: string } | null;
      if (!r.ok || !out) throw new Error("network");
      if (!out.ok) return setError(out.error === "rate_limited" ? t.limited : out.error === "form_code" ? t.formCode : t.notFound);
      setRes(out);
    } catch {
      setError(t.network);
    } finally {
      setBusy(false);
    }
  };

  if (res) {
    const [title, body] = t.status[res.status] ?? [res.status, ""];
    const look = LOOK[res.status] ?? LOOK.new;
    const step = STEP[res.status] ?? 0;
    return (
      <div role="status" className="frame flex flex-col gap-6 p-6 sm:p-10">
        <div className="flex items-start gap-4">
          <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl border", look.cls)}>
            <Icon name={look.icon} size={26} />
          </span>
          <div className="min-w-0">
            <p className="text-fog">{t.hi(res.first_name)}</p>
            <p className="t-headline text-3xl text-chalk">{title}</p>
          </div>
        </div>
        <ol className="grid grid-cols-3 gap-2" aria-label={t.steps.join(" · ")}>
          {t.steps.map((s, i) => (
            <li key={s} className="flex flex-col gap-2">
              <span className={cn("h-1.5 rounded-full", i <= step ? "bg-gradient-to-r from-volt to-cyan" : "bg-rim")} />
              <span className={cn("text-xs font-semibold sm:text-sm", i === step ? "text-chalk" : "text-fog")} aria-current={i === step ? "step" : undefined}>
                {s}
              </span>
            </li>
          ))}
        </ol>
        <p className="max-w-xl text-lg leading-relaxed text-mist">{body}</p>
        {res.family_needed && <FamilyStep t={t.family} locale={locale} refCode={res.ref} phone={phone} />}
        {res.note && (
          <div className="rounded-xl border border-cyan/30 bg-cyan/[0.06] p-4">
            <p className="text-sm font-semibold text-cyan">{t.message}</p>
            <p className="mt-1 whitespace-pre-line text-chalk">{res.note}</p>
          </div>
        )}
        <dl className="grid gap-3 text-sm sm:grid-cols-2">
          {[
            [t.ref, res.ref],
            [t.track, tracks[res.track] ?? res.track],
            [t.applied, date(res.created_at)],
            [t.updated, date(res.updated_at)],
          ].map(([k, v]) => (
            <div key={k} className="rounded-xl border border-[var(--line)] px-4 py-3">
              <dt className="text-fog">{k}</dt>
              <dd className="mt-0.5 font-semibold text-chalk" dir="auto">
                {v}
              </dd>
            </div>
          ))}
        </dl>
        <button
          type="button"
          className="btn self-start"
          onClick={() => {
            setRes(null);
            setPhone("");
          }}
        >
          {t.again}
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={submit} className="frame grid gap-5 p-6 sm:p-10" noValidate>
      <label className="grid gap-2">
        <span className="font-semibold text-chalk">{t.ref}</span>
        <input className={input} value={ref} onChange={(e) => setRef(e.target.value.toUpperCase())} placeholder="BX-1A2B3C" dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={12} required />
        <span className="text-sm text-fog">{t.refHint}</span>
      </label>
      <label className="grid gap-2">
        <span className="font-semibold text-chalk">{t.phone}</span>
        <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="01xxxxxxxxx" dir="ltr" inputMode="tel" autoComplete="tel" maxLength={20} required />
      </label>
      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-chalk">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary justify-self-start" disabled={busy || ref.trim().length < 6 || phone.trim().length < 8}>
        <span>{busy ? t.checking : t.check}</span>
      </button>
    </form>
  );
}

/** An accepted applicant gives what the family list needs, once (it was left out of the join form on purpose). */
function FamilyStep({ t, locale, refCode, phone }: { t: (typeof T)["ar"]["family"]; locale: string; refCode: string; phone: string }) {
  const [d, setD] = useState({ nid: "", gov: "", address: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState(false);
  const nid = readNationalId(d.nid);
  if (done)
    return (
      <p role="status" className="rounded-xl border border-ok/40 bg-ok/10 p-4 font-semibold text-ok" data-testid="family-done">
        {t.done}
      </p>
    );
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/application_family_complete`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_ref: refCode, p_phone: phone.trim(), p_national_id: digitsOnly(d.nid), p_governorate: d.gov, p_address: d.address.trim() }),
      });
      const out = (await r.json().catch(() => null)) as { ok: boolean; error?: string } | null;
      if (!r.ok || !out) throw new Error("network");
      if (!out.ok) return setError(t.err[out.error ?? ""] ?? t.err.network);
      setDone(true);
    } catch {
      setError(t.err.network);
    } finally {
      setBusy(false);
    }
  };
  return (
    <form onSubmit={send} className="grid gap-4 rounded-2xl border border-volt/40 bg-volt/[0.06] p-5" data-testid="family-step" noValidate>
      <div className="grid gap-1">
        <p className="font-semibold text-chalk">{t.title}</p>
        <p className="text-sm text-mist">{t.body}</p>
      </div>
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-chalk">{t.nid}</span>
        <input className={input} value={d.nid} onChange={(e) => setD({ ...d, nid: e.target.value })} dir="ltr" inputMode="numeric" autoComplete="off" maxLength={20} />
        {nid && <span className="text-sm text-ok">{`✓ ${locale === "ar" ? nid.governorate.ar : nid.governorate.en}`}</span>}
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-chalk">{t.gov}</span>
        <select className={cn(input, "appearance-none")} value={d.gov} onChange={(e) => setD({ ...d, gov: e.target.value })}>
          <option value="">—</option>
          {GOVERNORATES.map((g) => (
            <option key={g.code} value={g.label.ar}>
              {locale === "ar" ? g.label.ar : g.label.en}
            </option>
          ))}
        </select>
      </label>
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-chalk">{t.address}</span>
        <input className={input} value={d.address} onChange={(e) => setD({ ...d, address: e.target.value })} autoComplete="street-address" maxLength={200} />
      </label>
      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-chalk">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary justify-self-start" disabled={busy || digitsOnly(d.nid).length !== 14 || !d.gov || d.address.trim().length < 5}>
        <span>{busy ? t.saving : t.save}</span>
      </button>
    </form>
  );
}
