"use client";
/**
 * "By the numbers": live totals from the database (site_impact): members, attendances, sessions,
 * certificates, projects, events. A number shows only once it's worth showing (at least MIN), and the
 * whole strip hides until two numbers are, so the page never brags about a zero.
 */
import { useEffect, useRef, useState } from "react";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

export type Impact = {
  members: number;
  sessions: number;
  attendances: number;
  certificates: number;
  projects: number;
  events: number;
  team: number;
  since: string | null;
};
const MIN = 5;
const KEY = "bx-impact";

const LABEL: Record<keyof Omit<Impact, "since" | "team">, { ar: string; en: string }> = {
  members: { ar: "عضو في المجتمع", en: "community members" },
  attendances: { ar: "مرة حضور في الجلسات", en: "session attendances" },
  sessions: { ar: "جلسة تدريب", en: "training sessions" },
  certificates: { ar: "شهادة اتسلمت", en: "certificates awarded" },
  projects: { ar: "مشروع اتعمل", en: "projects built" },
  events: { ar: "فعالية اتعملت", en: "events held" },
};
const ORDER = ["members", "attendances", "sessions", "certificates", "projects", "events"] as const;

/** The live totals (kept for 10 minutes in this visit). */
export function useImpact() {
  const [d, setD] = useState<Impact | null>(null);
  useEffect(() => {
    try {
      const c = JSON.parse(sessionStorage.getItem(KEY) ?? "null") as { at: number; d: Impact } | null;
      if (c && Date.now() - c.at < 600_000) return setD(c.d);
    } catch {}
    fetch(`${SUPABASE_URL}/rest/v1/rpc/site_impact`, {
      method: "POST",
      headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(8000),
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((x: (Impact & { ok?: boolean }) | null) => {
        if (!x?.ok) return;
        setD(x);
        try {
          sessionStorage.setItem(KEY, JSON.stringify({ at: Date.now(), d: x }));
        } catch {}
      })
      .catch(() => undefined);
  }, []);
  return d;
}

/** The numbers worth showing, in order. */
export function impactItems(d: Impact | null, locale: string) {
  if (!d) return [];
  const l = locale === "ar" ? "ar" : "en";
  const list = ORDER.filter((k) => (d[k] ?? 0) >= MIN).map((k) => ({
    key: k,
    value: d[k],
    label: LABEL[k][l],
  }));
  return list.length >= 2 ? list : [];
}

function CountUp({ to, locale }: { to: number; locale: string }) {
  const [n, setN] = useState(to);
  const el = useRef<HTMLSpanElement>(null);
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      window.matchMedia("(prefers-reduced-motion: reduce)").matches ||
      !("IntersectionObserver" in window)
    )
      return;
    // The real number shows until the strip scrolls into view; then it counts up from zero.
    let raf = 0;
    const io = new IntersectionObserver(([e]) => {
      if (!e?.isIntersecting) return;
      io.disconnect();
      const start = performance.now();
      const tick = (t: number) => {
        const p = Math.min(1, (t - start) / 1200);
        setN(Math.round(to * (1 - Math.pow(1 - p, 3))));
        if (p < 1) raf = requestAnimationFrame(tick);
      };
      raf = requestAnimationFrame(tick);
    });
    if (el.current) io.observe(el.current);
    return () => {
      io.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [to]);
  return (
    <span ref={el} dir="ltr">
      {n.toLocaleString(locale === "ar" ? "ar-EG" : "en-US")}+
    </span>
  );
}

export function LiveImpact({ locale, id = "impact" }: { locale: string; id?: string }) {
  const d = useImpact();
  const items = impactItems(d, locale);
  if (!items.length) return null;
  const ar = locale === "ar";
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="mx-auto max-w-[1680px] px-5 py-16 sm:px-8 lg:py-20"
      data-testid="live-impact"
    >
      <p className="t-eyebrow mb-4 text-cyan">{ar ? "بالأرقام" : "By the numbers"}</p>
      <h2 id={`${id}-title`} className="t-display text-[clamp(1.9rem,4.4vw,3.4rem)] text-chalk">
        {ar ? "اللي عملناه لحد دلوقتي" : "What we've done so far"}
      </h2>
      <ul role="list" className="mt-8 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-6">
        {items.map((it) => (
          <li
            key={it.key}
            className="rounded-[18px] border border-[var(--line-2)] bg-void/40 px-3 py-5 text-center sm:p-6"
          >
            <p className="t-display text-4xl text-cyan sm:text-5xl">
              <CountUp to={it.value} locale={locale} />
            </p>
            <p className="mt-2 text-sm font-semibold text-chalk sm:text-base">{it.label}</p>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-xs text-fog">
        {ar
          ? "الأرقام بتتحدّث لوحدها من نظام الحضور والشهادات."
          : "Live from our attendance and certificates system."}
      </p>
    </section>
  );
}
