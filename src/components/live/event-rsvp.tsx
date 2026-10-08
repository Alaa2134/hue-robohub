"use client";
/** Event registration on the event page, and the QR ticket page (/ticket/?t=BXT-…). */
import { useEffect, useRef, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

const rpc = async <T,>(fn: string, body: object): Promise<T> => {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error(String(r.status));
  return (await r.json()) as T;
};

const T = {
  en: {
    title: "Register for this event",
    spots: (n: number) => (n === 1 ? "1 place left" : `${n} places left`),
    full: "The event is full — you'll join the waiting list and move up automatically if someone cancels.",
    name: "Full name",
    phone: "Phone (WhatsApp)",
    email: "Email (optional)",
    faculty: "Faculty (optional)",
    submit: "Register",
    sending: "Registering…",
    done: "You're registered!",
    waitlist: "You're on the waiting list",
    waitBody: "We'll move you up automatically if a place opens. Your ticket shows your place in line.",
    doneBody: "Show this ticket's QR code at the door. Save it or take a screenshot.",
    ticket: "Open my ticket",
    again: "Already registered with this phone — here's your ticket again.",
    againNoTicket: "You're already registered with this phone. Your ticket is on the device you registered from; if you lost it, contact us.",
    yours: "You registered for this event",
    err: {
      invalid: "Check your name (3+ letters) and phone number, then try again.",
      closed: "Registration for this event is closed.",
      rate_limited: "Too many registrations from this network. Please try again later.",
      network: "We couldn't reach the server. Check your connection and try again.",
    } as Record<string, string>,
  },
  ar: {
    title: "سجّل في الفعالية",
    spots: (n: number) => (n === 1 ? "فاضل مكان واحد" : `فاضل ${n} مكان`),
    full: "الأماكن اتملت — هتدخل قائمة الانتظار وهتطلع لوحدك لو حد لغى.",
    name: "الاسم بالكامل",
    phone: "الموبايل (واتساب)",
    email: "الإيميل (اختياري)",
    faculty: "الكلية (اختياري)",
    submit: "سجّل",
    sending: "بنسجّلك…",
    done: "اتسجلت!",
    waitlist: "انت على قائمة الانتظار",
    waitBody: "هتطلع لوحدك لو مكان فضي. التذكرة بتوضح دورك.",
    doneBody: "ورّي الـ QR اللي في التذكرة على الباب. احفظها أو خد سكرين شوت.",
    ticket: "افتح تذكرتي",
    again: "انت متسجل قبل كده بالرقم ده — دي تذكرتك تاني.",
    againNoTicket: "انت متسجل قبل كده بالرقم ده. تذكرتك على الجهاز اللي سجّلت منه، ولو ضاعت كلّمنا.",
    yours: "انت متسجل في الفعالية دي",
    err: {
      invalid: "اتأكد من اسمك (3 حروف على الأقل) ورقم الموبايل وجرّب تاني.",
      closed: "التسجيل في الفعالية دي اتقفل.",
      rate_limited: "تسجيلات كتير من الشبكة دي. جرّب تاني بعد شوية.",
      network: "مقدرناش نوصل للسيرفر. اتأكد من النت وجرّب تاني.",
    } as Record<string, string>,
  },
};

const STORE = "bx-tickets";
const saved = (): Record<string, string> => {
  try {
    return JSON.parse(localStorage.getItem(STORE) ?? "{}") as Record<string, string>;
  } catch {
    return {};
  }
};
const ticketHref = (locale: string, t: string) => `${locale === "ar" ? "/ar" : ""}/ticket/?t=${t}`;
const input = "h-12 w-full rounded-xl border border-[var(--line-2)] bg-void/60 px-4 text-[16px] text-chalk outline-none transition-colors placeholder:text-fog focus:border-cyan";

export function EventRsvp({ eventId, locale }: { eventId: string; locale: string }) {
  const t = T[locale === "ar" ? "ar" : "en"];
  const [info, setInfo] = useState<{ open: boolean; capacity: number | null; going: number } | null>(null);
  const [mine, setMine] = useState<string | null>(null);
  const [d, setD] = useState({ full_name: "", phone: "", email: "", faculty: "" });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [done, setDone] = useState<{ ticket: string; status: string; duplicate?: boolean } | null>(null);
  const honey = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setMine(saved()[eventId] ?? null);
    rpc<{ open: boolean; capacity: number | null; going: number } | null>("event_rsvp", { p_event: eventId })
      .then(setInfo)
      .catch(() => setInfo(null));
  }, [eventId]);

  if (done) {
    const wait = done.status === "waitlist";
    return (
      <div role="status" className="frame flex flex-col items-start gap-4 p-6 sm:p-8">
        <span className={cn("flex size-12 items-center justify-center rounded-2xl border", wait ? "border-warn/40 bg-warn/10 text-warn" : "border-ok/40 bg-ok/10 text-ok")}>
          <Icon name={wait ? "clock" : "check"} size={24} />
        </span>
        <p className="t-headline text-2xl text-chalk">{wait ? t.waitlist : t.done}</p>
        <p className="text-mist">{done.duplicate ? (done.ticket ? t.again : t.againNoTicket) : wait ? t.waitBody : t.doneBody}</p>
        {done.ticket && (
          <a href={ticketHref(locale, done.ticket)} className="btn btn-primary">
            <span>{t.ticket}</span>
          </a>
        )}
      </div>
    );
  }
  if (mine)
    return (
      <div className="frame flex flex-wrap items-center justify-between gap-4 p-5">
        <p className="flex items-center gap-2 font-semibold text-chalk">
          <Icon name="check" size={18} className="text-ok" />
          {t.yours}
        </p>
        <a href={ticketHref(locale, mine)} className="btn btn-primary btn-sm">
          <span>{t.ticket}</span>
        </a>
      </div>
    );
  if (!info?.open) return null;

  const left = info.capacity ? Math.max(0, info.capacity - info.going) : null;
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const out = await rpc<{ ok: boolean; ticket?: string; status?: string; duplicate?: boolean; error?: string }>("register_event", { p_event: eventId, p: { ...d, website: honey.current?.value ?? "" } });
      if (!out.ok) return setError(t.err[out.error ?? "invalid"] ?? t.err.invalid);
      // A repeat no longer gets the ticket back from the server (anyone could ask with a phone
      // number); this device may still have it.
      if (!out.ticket) return setDone({ ticket: saved()[eventId] ?? "", status: "going", duplicate: true });
      try {
        if (out.ticket !== "BXT-00000000") localStorage.setItem(STORE, JSON.stringify({ ...saved(), [eventId]: out.ticket }));
      } catch {}
      setDone({ ticket: out.ticket, status: out.status ?? "going", duplicate: out.duplicate });
    } catch {
      setError(t.err.network);
    } finally {
      setBusy(false);
    }
  };

  return (
    <form onSubmit={submit} className="frame grid gap-4 p-6 sm:grid-cols-2 sm:p-8" noValidate>
      <div className="flex flex-wrap items-baseline justify-between gap-2 sm:col-span-2">
        <p className="t-headline text-2xl text-chalk">{t.title}</p>
        {left !== null && left > 0 && <p className="text-sm font-semibold text-cyan">{t.spots(left)}</p>}
      </div>
      {left === 0 && <p className="rounded-xl border border-warn/40 bg-warn/10 p-3 text-sm text-chalk sm:col-span-2">{t.full}</p>}
      <div aria-hidden className="absolute -start-[9999px] h-px w-px overflow-hidden">
        <label>
          Website
          <input ref={honey} type="text" name="website" tabIndex={-1} autoComplete="off" defaultValue="" />
        </label>
      </div>
      {(
        [
          ["full_name", t.name, "text", "name", true],
          ["phone", t.phone, "tel", "tel", true],
          ["email", t.email, "email", "email", false],
          ["faculty", t.faculty, "text", "organization", false],
        ] as const
      ).map(([k, label, type, ac, req]) => (
        <label key={k} className="grid gap-2">
          <span className="text-sm font-semibold text-chalk">{label}</span>
          <input
            className={input}
            type={type}
            autoComplete={ac}
            required={req}
            dir={k === "phone" || k === "email" ? "ltr" : undefined}
            inputMode={k === "phone" ? "tel" : undefined}
            maxLength={k === "phone" ? 20 : 120}
            value={d[k]}
            onChange={(e) => setD((p) => ({ ...p, [k]: e.target.value }))}
          />
        </label>
      ))}
      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-3 text-chalk sm:col-span-2">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary justify-self-start" disabled={busy || d.full_name.trim().length < 3 || d.phone.replace(/\D/g, "").length < 8}>
        <span>{busy ? t.sending : t.submit}</span>
      </button>
    </form>
  );
}

/* ─── Ticket page ──────────────────────────────────────────────────────── */

type Ticket = { ticket: string; name: string; status: "going" | "waitlist" | "cancelled"; checked_in: boolean; waitlist_place: number | null; event: { id: string; slug: string | null; title: string; title_ar: string | null; starts_at: string | null; location: string | null; location_ar: string | null } };

const TT = {
  en: {
    going: "Confirmed",
    waitlist: (n: number | null) => (n ? `Waiting list · #${n}` : "Waiting list"),
    cancelled: "Cancelled",
    checkedIn: "Checked in ✓",
    show: "Show this code at the door",
    notFound: "We couldn't find this ticket.",
    event: "Event page",
    cancel: "Can't come? Cancel my place",
    cancelHint: "Enter the phone number you registered with. Your place goes to the next person on the waiting list.",
    confirm: "Cancel my place",
    wrongPhone: "The phone number doesn't match this ticket.",
    error: "We couldn't load the ticket. Check your connection and try again.",
  },
  ar: {
    going: "مؤكَّد",
    waitlist: (n: number | null) => (n ? `قائمة الانتظار · رقم ${n}` : "قائمة الانتظار"),
    cancelled: "اتلغى",
    checkedIn: "دخلت ✓",
    show: "ورّي الكود ده على الباب",
    notFound: "مش لاقيين التذكرة دي.",
    event: "صفحة الفعالية",
    cancel: "مش هتقدر تيجي؟ الغي مكانك",
    cancelHint: "اكتب الموبايل اللي سجلت بيه. مكانك هيروح لأول واحد في قائمة الانتظار.",
    confirm: "الغي مكاني",
    wrongPhone: "رقم الموبايل مش مطابق للتذكرة.",
    error: "مقدرناش نحمّل التذكرة. اتأكد من النت وجرّب تاني.",
  },
};

export function EventTicket({ locale }: { locale: string }) {
  const l = locale === "ar" ? "ar" : "en";
  const t = TT[l];
  const [tk, setTk] = useState<Ticket | null | "missing" | "error">(null);
  const [qr, setQr] = useState("");
  const [cancelOpen, setCancelOpen] = useState(false);
  const [phone, setPhone] = useState("");
  const [msg, setMsg] = useState("");

  const load = (code: string) =>
    rpc<({ ok: true } & Ticket) | { ok: false }>("event_ticket", { p_ticket: code })
      .then((r) => setTk(r.ok ? r : "missing"))
      .catch(() => setTk("error"));

  useEffect(() => {
    const code = new URLSearchParams(location.search).get("t") ?? "";
    if (!/^BXT-?[0-9A-Fa-f]{8}$/.test(code)) return setTk("missing");
    void load(code);
    import("qrcode")
      .then((QR) => QR.toDataURL(code.toUpperCase(), { margin: 1, width: 480, errorCorrectionLevel: "M", color: { dark: "#081634", light: "#ffffff" } }))
      .then(setQr)
      .catch(() => undefined);
  }, []);

  if (tk === null) return <div className="mx-auto h-96 max-w-md animate-pulse rounded-[22px] bg-panel/60" aria-busy="true" />;
  if (tk === "missing" || tk === "error") return <p className="rounded-[18px] border border-[var(--line-2)] bg-panel/50 p-6 text-center text-mist">{tk === "error" ? t.error : t.notFound}</p>;

  const title = l === "ar" && tk.event.title_ar ? tk.event.title_ar : tk.event.title;
  const where = l === "ar" ? tk.event.location_ar || tk.event.location : tk.event.location || tk.event.location_ar;
  const when = tk.event.starts_at ? new Intl.DateTimeFormat(l === "ar" ? "ar-EG" : "en-GB", { weekday: "long", day: "numeric", month: "long", hour: "numeric", minute: "2-digit" }).format(new Date(tk.event.starts_at)) : "";
  const startMs = tk.event.starts_at ? new Date(tk.event.starts_at).getTime() : 0;
  const started = !!startMs && startMs <= Date.now() && Date.now() - startMs < 30 * 86_400_000;
  const tone = tk.status === "cancelled" ? "border-danger/40 bg-danger/10 text-danger" : tk.status === "waitlist" ? "border-warn/40 bg-warn/10 text-warn" : "border-ok/40 bg-ok/10 text-ok";

  const cancel = async (e: React.FormEvent) => {
    e.preventDefault();
    setMsg("");
    try {
      const r = await rpc<{ ok: boolean }>("cancel_event_registration", { p_ticket: tk.ticket, p_phone: phone });
      if (!r.ok) return setMsg(t.wrongPhone);
      setCancelOpen(false);
      void load(tk.ticket);
    } catch {
      setMsg(t.error);
    }
  };

  return (
    <div className="mx-auto grid max-w-md gap-4">
      <div className="overflow-hidden rounded-[22px] border border-[var(--line-2)] bg-panel/80">
        <div className="bg-gradient-to-br from-volt/40 to-cyan/20 p-6">
          <p className="t-eyebrow text-[0.65rem] text-frost">BuildX HUE · Ticket</p>
          <p className="t-headline mt-2 text-2xl text-chalk">{title}</p>
          {when && <p className="mt-2 text-sm text-frost">{when}</p>}
          {where && <p className="text-sm text-frost">{where}</p>}
        </div>
        <div className="grid justify-items-center gap-4 p-6">
          <span className={cn("rounded-full border px-4 py-1 text-sm font-semibold", tone)}>{tk.checked_in ? t.checkedIn : tk.status === "waitlist" ? t.waitlist(tk.waitlist_place) : t[tk.status]}</span>
          {tk.status !== "cancelled" && (
            <>
              <div className="rounded-2xl bg-white p-3">{qr ? <img src={qr} alt={tk.ticket} className="size-56" /> : <span className="block size-56" />}</div>
              <p className="text-sm text-fog">{t.show}</p>
            </>
          )}
          <p className="text-xl font-bold text-chalk" dir="auto">
            {tk.name}
          </p>
          <p className="font-mono tracking-widest text-mist" dir="ltr">
            {tk.ticket}
          </p>
        </div>
      </div>
      {tk.event.slug && (
        <a href={`${l === "ar" ? "/ar" : ""}/events/${tk.event.slug}/`} className="btn justify-self-start">
          <span>{t.event}</span>
        </a>
      )}
      {started && tk.status !== "cancelled" && <EventFeedback locale={l} ticket={tk.ticket} />}
      {tk.status !== "cancelled" && !tk.checked_in && !started && (
        <div className="rounded-[18px] border border-[var(--line)] p-4">
          {!cancelOpen ? (
            <button type="button" className="text-sm font-semibold text-mist underline-offset-4 hover:underline" onClick={() => setCancelOpen(true)}>
              {t.cancel}
            </button>
          ) : (
            <form onSubmit={cancel} className="grid gap-3">
              <p className="text-sm text-mist">{t.cancelHint}</p>
              <input className={input} value={phone} onChange={(e) => setPhone(e.target.value)} dir="ltr" inputMode="tel" placeholder="01xxxxxxxxx" aria-label="Phone" />
              {msg && (
                <p role="alert" className="text-sm text-danger">
                  {msg}
                </p>
              )}
              <button type="submit" className="btn justify-self-start" disabled={phone.replace(/\D/g, "").length < 8}>
                <span>{t.confirm}</span>
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

const FB = {
  ar: { title: "إيه رأيك في الإيفنت؟", stars: ["وحش", "مش أوي", "كويس", "حلو جداً", "تحفة"], comment: "قول رأيك في سطرين (اختياري)", publish: "ممكن ننشر رأيك على الموقع باسمك الأول", send: "ابعت التقييم", thanks: "شكراً على رأيك 🙏 بيفرق معانا جداً.", edit: "عدّل تقييمك", error: "مقدرناش نبعت. جرّب تاني." },
  en: { title: "How was the event?", stars: ["Bad", "Meh", "Good", "Great", "Amazing"], comment: "A line or two (optional)", publish: "You may publish my comment on the website with my first name", send: "Send rating", thanks: "Thank you 🙏 It really helps us.", edit: "Edit your rating", error: "Couldn't send. Try again." },
};

/** After the event starts: rate it (1–5), comment, and allow publishing it as a testimonial. */
function EventFeedback({ locale, ticket }: { locale: "ar" | "en"; ticket: string }) {
  const t = FB[locale];
  const [rating, setRating] = useState(0);
  const [comment, setComment] = useState("");
  const [publish, setPublish] = useState(false);
  const [state, setState] = useState<"" | "sending" | "done" | "error">("");
  useEffect(() => {
    rpc<{ rating: number; comment: string | null; publish_ok: boolean } | null>("event_feedback_of", { p_ticket: ticket })
      .then((f) => {
        if (!f) return;
        setRating(f.rating);
        setComment(f.comment ?? "");
        setPublish(f.publish_ok);
        setState("done");
      })
      .catch(() => undefined);
  }, [ticket]);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!rating) return;
    setState("sending");
    try {
      const r = await rpc<{ ok: boolean }>("submit_event_feedback", { p_ticket: ticket, p_rating: rating, p_comment: comment, p_publish: publish });
      setState(r.ok ? "done" : "error");
    } catch {
      setState("error");
    }
  };
  if (state === "done")
    return (
      <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-ok/30 bg-ok/10 p-4 text-chalk">
        <span>
          {"★".repeat(rating)}
          <span className="text-fog">{"★".repeat(5 - rating)}</span> · {t.thanks}
        </span>
        <button type="button" className="text-sm text-mist underline-offset-4 hover:underline" onClick={() => setState("")}>
          {t.edit}
        </button>
      </div>
    );
  return (
    <form onSubmit={send} className="grid gap-3 rounded-[18px] border border-[var(--line-2)] bg-panel/60 p-5" aria-label={t.title}>
      <p className="font-semibold text-chalk">{t.title}</p>
      <div role="radiogroup" aria-label={t.title} className="flex gap-1.5" dir="ltr">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={rating === n}
            aria-label={`${n} — ${t.stars[n - 1]}`}
            title={t.stars[n - 1]}
            onClick={() => setRating(n)}
            className={cn("flex size-11 items-center justify-center rounded-xl border text-2xl transition", n <= rating ? "border-[#f5c451]/60 bg-[#f5c451]/15 text-[#f5c451]" : "border-[var(--line-2)] text-steel hover:text-mist")}
          >
            ★
          </button>
        ))}
      </div>
      {rating > 0 && <p className="text-sm text-mist">{t.stars[rating - 1]}</p>}
      <textarea className={cn(input, "h-auto min-h-24 py-3")} maxLength={1000} rows={3} value={comment} onChange={(e) => setComment(e.target.value)} placeholder={t.comment} aria-label={t.comment} />
      {comment.trim() && (
        <label className="flex items-start gap-2.5 text-sm text-mist">
          <input type="checkbox" className="mt-0.5 size-4 accent-[#2b6dff]" checked={publish} onChange={(e) => setPublish(e.target.checked)} />
          {t.publish}
        </label>
      )}
      {state === "error" && (
        <p role="alert" className="text-sm text-danger">
          {t.error}
        </p>
      )}
      <button type="submit" className="btn btn-primary justify-self-start" disabled={!rating || state === "sending"}>
        <span>{t.send}</span>
      </button>
    </form>
  );
}

