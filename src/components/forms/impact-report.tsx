"use client";
/**
 * Verified impact reports on the site. /verify/report?c=BXR-…: a report exactly as BuildX HUE issued
 * it — every number counted from the records, with how it was counted, and a fingerprint of the
 * numbers checked again on every view. /partner?t=…: a partner's private page listing the reports
 * issued for them. Data: verify_impact_report, partner_portal (both rate-limited).
 */
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";
import { timeoutSignal } from "@/lib/timeout";

type Data = {
  reach: { views: number; visitors: number; countries: number };
  training: { sessions: number; attendances: number; students: number; active: number; quizzes: number };
  events: { title: string; at: string; registered: number; attended: number }[];
  community: { applications: number; accepted: number; new_students: number };
  output: { certificates: number; projects: number; posts: number };
  lab?: { challenges_passed: number; lab_learners: number; prints_delivered: number };
};
type Report = { found: true; code: string; from: string; to: string; issued_at: string; partner: string | null; revoked_at: string | null; revoked_reason: string | null; data: Data | null; digest: string; intact: boolean };
type Portal = { found: true; name: string; reports: { code: string; from: string; to: string; issued_at: string; revoked: boolean }[] };

const T = {
  en: {
    label: "Report code",
    check: "Check",
    none: "No report with this code.",
    limited: "Too many checks, try again in a few minutes.",
    network: "Couldn't check right now. Try again.",
    period: "Period",
    issued: "Issued",
    for: "For",
    revoked: "This report was withdrawn by BuildX HUE",
    intact: "The numbers are exactly as issued — their fingerprint matches.",
    broken: "The numbers don't match the fingerprint they were issued with.",
    how: "How it's counted",
    noPortal: "This page isn't available. Ask BuildX HUE for a new link.",
    reports: "Reports issued for you",
    noReports: "No reports yet.",
    open: "Open",
    withdrawn: "withdrawn",
    events: "Events",
    registered: "registered",
    attended: "attended",
  },
  ar: {
    label: "كود التقرير",
    check: "تحقّق",
    none: "مفيش تقرير بالكود ده.",
    limited: "محاولات كتير، جرّب كمان كام دقيقة.",
    network: "مقدرناش نتحقق دلوقتي. جرّب تاني.",
    period: "الفترة",
    issued: "اتصدر",
    for: "مقدَّم إلى",
    revoked: "التقرير ده سحبته BuildX HUE",
    intact: "الأرقام زي ما اتصدرت بالظبط — البصمة بتاعتها مطابقة.",
    broken: "الأرقام مش مطابقة للبصمة اللي اتصدرت بيها.",
    how: "اتحسبت إزاي",
    noPortal: "الصفحة دي مش متاحة. اطلب لينك جديد من BuildX HUE.",
    reports: "التقارير اللي اتصدرت لكم",
    noReports: "لسه مفيش تقارير.",
    open: "افتح",
    withdrawn: "اتسحب",
    events: "الفعاليات",
    registered: "سجّلوا",
    attended: "حضروا",
  },
};

/** Every number in a report, what it means and how it's counted — in both languages. */
const METRICS: { get: (d: Data) => number | undefined; en: [string, string]; ar: [string, string] }[] = [
  { get: (d) => d.training.sessions, en: ["Training sessions", "Sessions held in the period (each one opened for attendance)."], ar: ["سيشنات تدريب", "السيشنات اللي اتعملت في الفترة (كل واحدة اتفتح لها حضور)."] },
  { get: (d) => d.training.attendances, en: ["Attendances", "Students marked present or late at those sessions, by scan or by the trainer."], ar: ["مرات حضور", "طلاب اتسجلوا حاضرين أو متأخرين في السيشنات دي، بالمسح أو من المدرب."] },
  { get: (d) => d.training.students, en: ["Students trained", "Different students with at least one attendance in the period."], ar: ["طلاب اتدربوا", "طلاب مختلفين ليهم حضور واحد على الأقل في الفترة."] },
  { get: (d) => d.training.quizzes, en: ["Quizzes taken", "Quiz attempts submitted in the period."], ar: ["كويزات اتحلت", "محاولات كويز اتسلمت في الفترة."] },
  { get: (d) => d.output.certificates, en: ["Certificates", "Certificates issued in the period and not revoked; each can be checked on /verify."], ar: ["شهادات", "شهادات اتصدرت في الفترة ومتلغتش؛ كل واحدة تتأكد منها على /verify."] },
  { get: (d) => d.output.projects, en: ["Student projects published", "Projects students sent that the team reviewed and published on the site."], ar: ["مشاريع طلاب اتنشرت", "مشاريع بعتها الطلاب والفريق راجعها ونشرها على الموقع."] },
  { get: (d) => d.lab?.challenges_passed, en: ["Lab challenges passed", "Challenges passed in BuildX Lab — each checked by running the student's program in the simulator."], ar: ["تحديات معمل اتعدّت", "تحديات اتعدّت في BuildX Lab — كل واحد اتحقق بتشغيل برنامج الطالب في المحاكي."] },
  { get: (d) => d.lab?.lab_learners, en: ["Lab learners", "Different students who passed at least one Lab challenge in the period."], ar: ["متعلمين في المعمل", "طلاب مختلفين عدّوا تحدي واحد على الأقل في الفترة."] },
  { get: (d) => d.lab?.prints_delivered, en: ["3D prints delivered", "Print Hub jobs handed to students in the period."], ar: ["طباعات 3D اتسلّمت", "طلبات طباعة اتسلّمت للطلبة في الفترة."] },
  { get: (d) => d.community.applications, en: ["Applications", "People who applied to join in the period."], ar: ["طلبات انضمام", "ناس قدّموا ينضموا في الفترة."] },
  { get: (d) => d.community.accepted, en: ["Accepted", "Applications accepted in the period."], ar: ["اتقبلوا", "طلبات اتقبلت في الفترة."] },
  { get: (d) => d.reach.views, en: ["Website views", "Page views on buildxhue.com, counted by our own privacy-friendly analytics (no cookies)."], ar: ["مشاهدات الموقع", "مشاهدات صفحات buildxhue.com، بالعدّاد بتاعنا اللي بيحترم الخصوصية (من غير كوكيز)."] },
  { get: (d) => d.reach.visitors, en: ["Website visitors", "Different visitors per day, added up over the period."], ar: ["زوار الموقع", "زوار مختلفين كل يوم، متجمّعين على الفترة."] },
];

async function call<T>(fn: string, body: object): Promise<({ ok: true } & T) | { ok: true; found: false } | { ok: false; error: string } | null> {
  const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${fn}`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify(body), signal: timeoutSignal(10_000) });
  if (!r.ok) return null;
  return r.json().catch(() => null);
}

export function ImpactVerify({ locale }: { locale: string }) {
  const l = locale === "ar" ? "ar" : "en";
  const t = T[l];
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState<Report | null>(null);
  const day = (iso: string) => new Intl.DateTimeFormat(l === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso.slice(0, 10)}T12:00:00`));
  const num = (n: number) => new Intl.NumberFormat(l === "ar" ? "ar-EG" : "en-GB").format(n);

  const check = async (value: string) => {
    if (busy || !value.trim()) return;
    setBusy(true);
    setError("");
    setRes(null);
    try {
      const out = await call<Report>("verify_impact_report", { p_code: value.trim() });
      if (!out) throw new Error("network");
      if (!out.ok) return setError(t.limited);
      if (!out.found) return setError(t.none);
      setRes(out as Report);
    } catch {
      setError(t.network);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    const c = new URLSearchParams(location.search).get("c");
    if (c && /^BXR-?[0-9A-Fa-f]{10}$/.test(c)) {
      setCode(c.toUpperCase());
      void check(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    void check(code);
  };

  return (
    <div className="grid gap-6">
      {res && (
        <div className="grid gap-4" data-testid="impact-report">
          <div className={cn("frame grid gap-2 p-6 sm:p-8", res.revoked_at && "!border-danger/50")}>
            <p className="font-mono text-sm text-mist" dir="ltr">
              {res.code}
            </p>
            {res.revoked_at ? (
              <p className="flex items-center gap-2 font-semibold text-danger">
                <Icon name="close" size={18} /> {t.revoked}
                {res.revoked_reason ? `: ${res.revoked_reason}` : ""}
              </p>
            ) : (
              <p className={cn("flex items-center gap-2 text-sm", res.intact ? "text-ok" : "text-danger")}>
                <Icon name={res.intact ? "check" : "close"} size={16} /> {res.intact ? t.intact : t.broken}
              </p>
            )}
            <p className="text-sm text-mist">{`${t.period}: ${day(res.from)} – ${day(res.to)} · ${t.issued} ${day(res.issued_at)}${res.partner ? ` · ${t.for} ${res.partner}` : ""}`}</p>
          </div>
          {res.data && (
            <>
              <div className="grid gap-3 sm:grid-cols-2">
                {METRICS.filter((m) => m.get(res.data!) !== undefined).map((m) => (
                  <div key={m.en[0]} className="frame grid gap-1 p-5">
                    <p className="text-3xl font-bold text-chalk">{num(m.get(res.data!) ?? 0)}</p>
                    <p className="font-semibold text-chalk">{m[l][0]}</p>
                    <p className="text-xs text-fog">
                      {t.how}: {m[l][1]}
                    </p>
                  </div>
                ))}
              </div>
              {res.data.events.length > 0 && (
                <div className="frame grid gap-2 p-6">
                  <p className="font-semibold text-chalk">{t.events}</p>
                  {res.data.events.map((e, i) => (
                    <p key={i} className="flex flex-wrap justify-between gap-2 text-sm text-mist">
                      <span>{`${e.title} · ${day(e.at)}`}</span>
                      <span>{`${num(e.registered)} ${t.registered} · ${num(e.attended)} ${t.attended}`}</span>
                    </p>
                  ))}
                </div>
              )}
              <p className="break-all font-mono text-[11px] text-fog" dir="ltr">
                SHA-256 {res.digest}
              </p>
            </>
          )}
        </div>
      )}
      <form onSubmit={submit} className="frame flex flex-col gap-3 p-6 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-2">
          <span className="text-sm text-mist">{t.label}</span>
          <input dir="ltr" value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BXR-…" maxLength={20} className="h-12 w-full rounded-xl border border-[var(--line-2)] bg-panel/60 px-4 font-mono text-chalk placeholder:text-fog" />
        </label>
        <button type="submit" disabled={busy || !code.trim()} className="btn btn-primary h-12 disabled:opacity-50">
          {t.check}
        </button>
      </form>
      {error && (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

export function PartnerPortal({ locale }: { locale: string }) {
  const l = locale === "ar" ? "ar" : "en";
  const t = T[l];
  const [state, setState] = useState<"loading" | "none" | "limited" | "network" | "ok">("loading");
  const [p, setP] = useState<Portal | null>(null);
  const prefix = l === "ar" ? "/ar" : "";
  const day = (iso: string) => new Intl.DateTimeFormat(l === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "short", year: "numeric" }).format(new Date(`${iso.slice(0, 10)}T12:00:00`));
  useEffect(() => {
    const token = new URLSearchParams(location.search).get("t") ?? "";
    if (!/^[0-9a-f]{48}$/.test(token)) return setState("none");
    call<Portal>("partner_portal", { p_token: token })
      .then((out) => {
        if (!out) return setState("network");
        if (!out.ok) return setState("limited");
        if (!out.found) return setState("none");
        setP(out as Portal);
        setState("ok");
      })
      .catch(() => setState("network"));
  }, []);
  if (state !== "ok" || !p)
    return (
      <p role="status" className={cn("frame p-6 text-center", state === "loading" ? "text-mist" : "text-danger")} data-testid="partner-state">
        {state === "loading" || state === "ok" ? "…" : state === "none" ? t.noPortal : t[state]}
      </p>
    );
  return (
    <div className="grid gap-4" data-testid="partner-portal">
      <p className="text-2xl font-bold text-chalk">{p.name}</p>
      <div className="frame grid gap-2 p-6">
        <p className="font-semibold text-chalk">{t.reports}</p>
        {p.reports.length ? (
          p.reports.map((r) => (
            <a key={r.code} href={`${prefix}/verify/report/?c=${r.code}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-[var(--line)] p-3 hover:border-cyan/40">
              <span className="text-sm text-chalk">{`${day(r.from)} – ${day(r.to)}`}</span>
              <span className="font-mono text-xs text-mist" dir="ltr">
                {r.code}
                {r.revoked ? ` · ${t.withdrawn}` : ""}
              </span>
            </a>
          ))
        ) : (
          <p className="text-sm text-fog">{t.noReports}</p>
        )}
      </div>
    </div>
  );
}
