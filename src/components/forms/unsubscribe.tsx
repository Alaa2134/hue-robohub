"use client";
/** /unsubscribe: the link at the bottom of every BuildX HUE bulk email (?e=<email>&t=<signed token>). */
import { useEffect, useState } from "react";
import { Icon } from "@/components/brand/icons";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

const T = {
  en: {
    ask: (e: string) => `Stop emails to ${e}?`,
    askBody:
      "You won't get our announcements and updates by email any more. You can still follow us on the website and WhatsApp.",
    go: "Unsubscribe",
    busy: "One moment…",
    done: "You're unsubscribed",
    doneBody: "We won't email this address again. Sorry to see you go 💙",
    bad: "This link isn't complete or has expired. Open it again from the email.",
    limited: "Too many tries from this network. Please wait a bit and try again.",
    network: "We couldn't reach the server. Check your connection and try again.",
  },
  ar: {
    ask: (e: string) => `توقف الإيميلات لـ ${e}؟`,
    askBody: "مش هتوصلك إعلاناتنا وأخبارنا على الإيميل تاني. تقدر تتابعنا برضه على الموقع وواتساب.",
    go: "ألغِ الاشتراك",
    busy: "ثانية واحدة…",
    done: "اتلغى اشتراكك",
    doneBody: "مش هنبعت إيميلات للعنوان ده تاني. هتوحشنا 💙",
    bad: "اللينك ده ناقص أو قديم. افتحه تاني من الإيميل نفسه.",
    limited: "محاولات كتير من الشبكة دي. استنى شوية وجرّب تاني.",
    network: "مقدرناش نوصل للسيرفر. اتأكد من النت وجرّب تاني.",
  },
};

export function Unsubscribe({ locale }: { locale: string }) {
  const t = T[locale === "ar" ? "ar" : "en"];
  const [link, setLink] = useState<{ e: string; t: string } | null | undefined>(undefined);
  const [state, setState] = useState<"idle" | "busy" | "done">("idle");
  const [error, setError] = useState("");

  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const e = (q.get("e") ?? "").trim().toLowerCase();
    const tk = (q.get("t") ?? "").trim();
    setLink(/^\S+@\S+\.\S+$/.test(e) && /^[0-9a-f]{32}$/.test(tk) ? { e, t: tk } : null);
  }, []);

  const go = async () => {
    if (!link || state === "busy") return;
    setState("busy");
    setError("");
    try {
      const r = await fetch(`${SUPABASE_URL}/rest/v1/rpc/email_unsubscribe`, {
        method: "POST",
        headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
        body: JSON.stringify({ p_email: link.e, p_token: link.t }),
      });
      if (r.ok) return setState("done");
      const out = (await r.json().catch(() => null)) as { message?: string } | null;
      setError(
        out?.message === "rate_limited" ? t.limited : out?.message === "invalid_link" ? t.bad : t.network,
      );
      setState("idle");
    } catch {
      setError(t.network);
      setState("idle");
    }
  };

  if (link === undefined) return <div className="frame h-48 animate-pulse" />;
  if (link === null)
    return (
      <div className="frame flex items-start gap-4 p-6 sm:p-8" data-testid="unsub-bad">
        <Icon name="mail" size={26} className="mt-1 shrink-0 text-fog" />
        <p className="text-mist">{t.bad}</p>
      </div>
    );
  if (state === "done")
    return (
      <div role="status" className="frame flex items-start gap-4 p-6 sm:p-8" data-testid="unsub-done">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-ok/40 bg-ok/10 text-ok">
          <Icon name="check" size={24} />
        </span>
        <div>
          <p className="t-title text-2xl text-chalk">{t.done}</p>
          <p className="mt-1 text-mist">{t.doneBody}</p>
        </div>
      </div>
    );
  return (
    <div className="frame flex flex-col gap-5 p-6 sm:p-8" data-testid="unsub-ask">
      <div className="flex items-start gap-4">
        <span className="flex size-12 shrink-0 items-center justify-center rounded-2xl border border-cyan/40 bg-cyan/10 text-cyan">
          <Icon name="mail" size={24} />
        </span>
        <div className="min-w-0">
          <p className="t-title break-words text-xl text-chalk">{t.ask(link.e)}</p>
          <p className="mt-1 text-mist">{t.askBody}</p>
        </div>
      </div>
      {error && (
        <p
          role="alert"
          className="rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-sm text-danger"
        >
          {error}
        </p>
      )}
      <button type="button" className="btn btn-primary self-start" onClick={go} disabled={state === "busy"}>
        {state === "busy" ? t.busy : t.go}
      </button>
    </div>
  );
}
