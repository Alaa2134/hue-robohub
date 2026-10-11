"use client";
/**
 * /verify/member: what someone scanning a BuildX membership card sees (an expo organiser, a company at
 * an event): the name on the card and whether the membership is valid today. The card's QR opens this
 * page with ?c=BXM-…; the code can also be typed. Data: verify_member (rate-limited, name and state only).
 */
import { useEffect, useState, type FormEvent } from "react";
import { Icon } from "@/components/brand/icons";
import { cn } from "@/lib/cn";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

type State = "open" | "active" | "expiring" | "expired" | "stopped";
type Result =
  | { found: false }
  | { found: true; name: string; state: State; until: string | null; since: string; banned: boolean };

const T = {
  en: {
    label: "Membership card code",
    ph: "BXM-…",
    check: "Check",
    valid: "Valid member",
    expired: "Membership has ended",
    stopped: "Membership is suspended",
    banned: "Not allowed at events right now",
    until: "Valid until",
    open: "No end date",
    since: "Member since",
    none: "No membership card with this code.",
    limited: "Too many checks, try again in a few minutes.",
    network: "Couldn't check right now. Try again.",
  },
  ar: {
    label: "كود كارنيه العضوية",
    ph: "BXM-…",
    check: "تحقّق",
    valid: "عضو ساري",
    expired: "العضوية خلصت",
    stopped: "العضوية موقوفة",
    banned: "ممنوع من الفعاليات حاليًا",
    until: "سارية لحد",
    open: "من غير تاريخ انتهاء",
    since: "عضو من",
    none: "مفيش كارنيه عضوية بالكود ده.",
    limited: "محاولات كتير، جرّب كمان كام دقيقة.",
    network: "مقدرناش نتحقق دلوقتي. جرّب تاني.",
  },
};

export function MemberVerify({ locale }: { locale: string }) {
  const l = locale === "ar" ? "ar" : "en";
  const t = T[l];
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [res, setRes] = useState<Result | null>(null);
  const day = (iso: string) =>
    new Intl.DateTimeFormat(l === "ar" ? "ar-EG" : "en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    }).format(new Date(`${iso.slice(0, 10)}T12:00:00`));

  const check = async (value: string) => {
    if (busy || !value.trim()) return;
    setBusy(true);
    setError("");
    setRes(null);
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verify_member`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_code: value.trim() }),
        signal: AbortSignal.timeout(10_000),
      });
      const out = (await r.json().catch(() => null)) as
        ({ ok: true } & Result) | { ok: false; error: string } | null;
      if (!r.ok || !out) throw new Error("network");
      if (!out.ok) return setError(t.limited);
      if (!out.found) return setError(t.none);
      setRes(out);
    } catch {
      setError(t.network);
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    const c = new URLSearchParams(location.search).get("c");
    if (c && /^BXM-?[0-9A-Fa-f]{10}$/.test(c)) {
      setCode(c.toUpperCase());
      void check(c);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    void check(code);
  };

  const ok =
    res?.found && !res.banned && (res.state === "open" || res.state === "active" || res.state === "expiring");
  return (
    <div className="grid gap-6">
      {res?.found && (
        <div
          role="status"
          data-testid="member-result"
          className={cn("frame flex items-start gap-4 p-6 sm:p-8", !ok && "!border-danger/50")}
        >
          <span
            className={cn(
              "flex size-14 shrink-0 items-center justify-center rounded-2xl border",
              ok ? "border-ok/40 bg-ok/10 text-ok" : "border-danger/40 bg-danger/10 text-danger",
            )}
          >
            <Icon name={ok ? "check" : "close"} size={28} />
          </span>
          <div className="min-w-0">
            <p className={cn("text-sm font-semibold", ok ? "text-ok" : "text-danger")}>
              {res.banned ? t.banned : ok ? t.valid : res.state === "stopped" ? t.stopped : t.expired}
            </p>
            <p className="mt-1 text-2xl font-bold text-chalk">{res.name}</p>
            <p className="mt-2 text-sm text-mist">
              {t.until}: {res.until ? day(res.until) : t.open} · {t.since} {day(res.since)}
            </p>
          </div>
        </div>
      )}
      <form onSubmit={submit} className="frame flex flex-col gap-3 p-6 sm:flex-row sm:items-end">
        <label className="grid flex-1 gap-2">
          <span className="text-sm text-mist">{t.label}</span>
          <input
            dir="ltr"
            value={code}
            onChange={(e) => setCode(e.target.value.toUpperCase())}
            placeholder={t.ph}
            maxLength={20}
            className="h-12 w-full rounded-xl border border-[var(--line-2)] bg-panel/60 px-4 font-mono text-chalk placeholder:text-fog"
          />
        </label>
        <button
          type="submit"
          disabled={busy || !code.trim()}
          className="btn btn-primary h-12 disabled:opacity-50"
        >
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
