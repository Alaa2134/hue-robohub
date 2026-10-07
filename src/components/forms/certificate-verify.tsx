"use client";
/** /verify: anyone (an employer, a university) checks a BuildX HUE certificate by its code or QR. */
import { useEffect, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

type Cert = { code: string; name: string; kind: string; title: string; title_ar: string | null; details: string | null; details_ar: string | null; hours: number | null; issued_on: string; revoked: boolean; revoked_on: string | null };

const KIND = {
  en: { completion: "Certificate of Completion", participation: "Certificate of Participation", achievement: "Certificate of Achievement", appreciation: "Certificate of Appreciation" },
  ar: { completion: "شهادة إتمام", participation: "شهادة مشاركة", achievement: "شهادة تميّز", appreciation: "شهادة تقدير" },
} as Record<"en" | "ar", Record<string, string>>;

const T = {
  en: {
    label: "Certificate code",
    hint: "Printed under the QR code, e.g. BXC-1A2B3C4D.",
    check: "Verify",
    checking: "Checking…",
    valid: "Valid certificate",
    validBody: "This certificate was issued by BuildX HUE.",
    revoked: "This certificate was revoked",
    revokedBody: (d: string) => `It was withdrawn on ${d} and is no longer valid.`,
    notFound: "No certificate has this code. Check it and try again — it starts with BXC-.",
    limited: "Too many checks from this network. Please wait a few minutes.",
    network: "We couldn't reach the server. Check your connection and try again.",
    name: "Awarded to",
    program: "Programme",
    issued: "Issued on",
    hours: "Training hours",
    code: "Code",
    another: "Check another code",
  },
  ar: {
    label: "كود الشهادة",
    hint: "مطبوع تحت الـ QR، مثلاً BXC-1A2B3C4D.",
    check: "تحقّق",
    checking: "بنتحقق…",
    valid: "شهادة صحيحة",
    validBody: "الشهادة دي صادرة من BuildX HUE.",
    revoked: "الشهادة دي اتلغت",
    revokedBody: (d: string) => `اتسحبت يوم ${d} ومبقتش سارية.`,
    notFound: "مفيش شهادة بالكود ده. اتأكد منه وجرّب تاني — بيبدأ بـ BXC-.",
    limited: "محاولات كتير من الشبكة دي. استنى شوية وجرّب تاني.",
    network: "مقدرناش نوصل للسيرفر. اتأكد من النت وجرّب تاني.",
    name: "صادرة لـ",
    program: "البرنامج",
    issued: "تاريخ الإصدار",
    hours: "ساعات التدريب",
    code: "الكود",
    another: "تحقّق من كود تاني",
  },
};

const input = "h-12 w-full rounded-xl border border-[var(--line-2)] bg-void/60 px-4 text-[16px] text-chalk outline-none transition-colors placeholder:text-fog focus:border-cyan";

export function CertificateVerify({ locale }: { locale: string }) {
  const l = locale === "ar" ? "ar" : "en";
  const t = T[l];
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState<Cert | null>(null);

  const date = (iso: string) => new Intl.DateTimeFormat(l === "ar" ? "ar-EG" : "en-GB", { day: "numeric", month: "long", year: "numeric" }).format(new Date(`${iso}T12:00:00`));

  const check = async (value: string) => {
    if (busy || value.trim().length < 8) return;
    setBusy(true);
    setError("");
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_certificate`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_code: value.trim() }) });
      const out = (await r.json().catch(() => null)) as ({ ok: true } & Cert) | { ok: false; error: string } | null;
      if (!r.ok || !out) throw new Error("network");
      if (!out.ok) return setError(out.error === "rate_limited" ? t.limited : t.notFound);
      setRes(out);
    } catch {
      setError(t.network);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const c = new URLSearchParams(location.search).get("c");
    if (c && /^[A-Za-z0-9-]{8,14}$/.test(c)) {
      setCode(c.toUpperCase());
      void check(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (res) {
    const title = l === "ar" && res.title_ar ? res.title_ar : res.title;
    const details = l === "ar" ? res.details_ar || res.details : res.details || res.details_ar;
    return (
      <div role="status" className={cn("frame flex flex-col gap-6 p-6 sm:p-10", res.revoked && "!border-danger/50")}>
        <div className="flex items-start gap-4">
          <span className={cn("flex size-14 shrink-0 items-center justify-center rounded-2xl border", res.revoked ? "border-danger/40 bg-danger/10 text-danger" : "border-ok/40 bg-ok/10 text-ok")}>
            <Icon name={res.revoked ? "close" : "check"} size={28} />
          </span>
          <div className="min-w-0">
            <p className="t-headline text-3xl text-chalk">{res.revoked ? t.revoked : t.valid}</p>
            <p className="mt-1 text-mist">{res.revoked ? t.revokedBody(date(res.revoked_on ?? res.issued_on)) : t.validBody}</p>
          </div>
        </div>
        <dl className="grid gap-3 sm:grid-cols-2">
          {(
            [
              [t.name, res.name, true],
              [t.program, `${KIND[l][res.kind] ?? ""} — ${title}`, true],
              [t.issued, date(res.issued_on), false],
              [t.code, res.code, false],
              ...(res.hours ? [[t.hours, String(res.hours), false] as const] : []),
            ] as const
          ).map(([k, v, wide]) => (
            <div key={k} className={cn("rounded-xl border border-[var(--line)] px-4 py-3", wide && "sm:col-span-2")}>
              <dt className="text-sm text-fog">{k}</dt>
              <dd className={cn("mt-0.5 font-semibold text-chalk", k === t.name && "text-2xl")} dir="auto">
                {v}
              </dd>
            </div>
          ))}
          {details && <p className="text-sm text-mist sm:col-span-2">{details}</p>}
        </dl>
        <button
          type="button"
          className="btn self-start"
          onClick={() => {
            setRes(null);
            setCode("");
            history.replaceState(null, "", location.pathname);
          }}
        >
          {t.another}
        </button>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void check(code);
      }}
      className="frame grid gap-5 p-6 sm:p-10"
      noValidate
    >
      <label className="grid gap-2">
        <span className="font-semibold text-chalk">{t.label}</span>
        <input className={input} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} placeholder="BXC-1A2B3C4D" dir="ltr" autoComplete="off" autoCapitalize="characters" spellCheck={false} maxLength={14} required />
        <span className="text-sm text-fog">{t.hint}</span>
      </label>
      {error && (
        <p role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-4 text-chalk">
          {error}
        </p>
      )}
      <button type="submit" className="btn btn-primary justify-self-start" disabled={busy || code.trim().length < 8}>
        <span>{busy ? t.checking : t.check}</span>
      </button>
    </form>
  );
}
