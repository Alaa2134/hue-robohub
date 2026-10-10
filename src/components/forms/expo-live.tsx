"use client";
/** The expo visit page, live: how many are in the delegation (by day) and the places left. */
import { useEffect, useState } from "react";
import { cn } from "@/lib/cn";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

type Stats = { accepted: number; capacity: number | null; days: Record<string, number> } | null;

export function DelegationCounter({ slug, going, left, full, closed }: { slug: string; going: string; left: string; full: string; closed: string }) {
  const [s, setS] = useState<Stats | undefined>(undefined);
  useEffect(() => {
    // The count changes only when the team accepts someone: a minute in this visit is fresh enough.
    const key = `bx-delegation-${slug}`;
    try {
      const c = JSON.parse(sessionStorage.getItem(key) ?? "null") as { at: number; s: Stats } | null;
      if (c && Date.now() - c.at < 60_000) return setS(c.s);
    } catch {}
    fetch(`${SUPABASE_URL}/rest/v1/rpc/form_delegation`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_slug: slug }), signal: AbortSignal.timeout(6000) })
      .then((r) => (r.ok ? (r.json() as Promise<Stats>) : null))
      .then(
        (x) => {
          setS(x ?? null);
          try {
            if (x) sessionStorage.setItem(key, JSON.stringify({ at: Date.now(), s: x }));
          } catch {}
        },
        () => setS(null),
      );
  }, [slug]);
  if (s === undefined) return <div className="frame h-40 animate-pulse" />;
  if (!s || !s.accepted) return <p className="frame p-6 text-mist">{closed}</p>;
  const pct = s.capacity ? Math.min(100, Math.round((s.accepted / s.capacity) * 100)) : null;
  const free = s.capacity ? Math.max(0, s.capacity - s.accepted) : null;
  const leftText = free === null ? null : free ? left.replace("{n}", String(free)) : full;
  return (
    <div className="frame grid gap-5 p-6 sm:p-8" data-testid="delegation-counter">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="flex items-baseline gap-3">
          <span className="t-headline text-6xl text-[#ff7a45]">{s.accepted}</span>
          <span className="text-mist">{going}</span>
        </p>
        {leftText && <p className="text-sm font-semibold text-chalk">{leftText}</p>}
      </div>
      {pct !== null && (
        <div className="h-3 overflow-hidden rounded-full bg-white/[0.06]" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
          <div className="h-full rounded-full bg-gradient-to-l from-[#ff7a45] to-cyan" style={{ width: `${pct}%` }} />
        </div>
      )}
      {!!Object.keys(s.days).length && (
        <ul className="flex flex-wrap gap-2">
          {Object.entries(s.days).map(([d, n]) => (
            <li key={d} className="rounded-full border border-[var(--line-2)] px-3 py-1.5 text-sm text-mist">
              {d}: <b className="text-chalk">{n}</b>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/* ─── Countdown and the phone's "apply" bar ─────────────────────────────── */

/** 14 November 2026, 10:00 in Cairo (UTC+2 by then) to 16 November, 18:00. */
export const EXPO_START = Date.parse("2026-11-14T08:00:00Z");
export const EXPO_END = Date.parse("2026-11-16T16:00:00Z");

function useNow(every = 1000) {
  const [now, setNow] = useState<number | null>(null);
  useEffect(() => {
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), every);
    return () => clearInterval(t);
  }, [every]);
  return now;
}

type CountdownLabels = { title: string; d: string; h: string; m: string; s: string; live: string; over: string };

export function ExpoCountdown({ labels, start = EXPO_START, end = EXPO_END }: { labels: CountdownLabels; start?: number; end?: number }) {
  const now = useNow();
  if (now === null) return <div className="mt-6 h-[5.5rem]" aria-hidden />;
  if (now >= end) return <p className="mt-6 text-lg font-semibold text-mist">{labels.over}</p>;
  if (now >= start) return <p className="mt-6 text-lg font-semibold text-[#ff9b70]">{labels.live}</p>;
  const left = Math.floor((start - now) / 1000);
  const parts: [number, string][] = [
    [Math.floor(left / 86400), labels.d],
    [Math.floor((left % 86400) / 3600), labels.h],
    [Math.floor((left % 3600) / 60), labels.m],
    [left % 60, labels.s],
  ];
  return (
    <div className="mt-6" data-testid="expo-countdown">
      <p className="t-eyebrow text-[0.6rem] text-fog">{labels.title}</p>
      <div className="mt-2 flex gap-2" role="timer" aria-live="off">
        {parts.map(([n, l]) => (
          <span key={l} className="flex min-w-[4.25rem] flex-col items-center rounded-xl border border-[var(--line-2)] bg-void/60 px-2 py-2 backdrop-blur">
            <span className="t-headline font-mono text-2xl tabular-nums text-chalk sm:text-3xl">{String(n).padStart(2, "0")}</span>
            <span className="text-[0.65rem] text-fog">{l}</span>
          </span>
        ))}
      </div>
    </div>
  );
}

type Days = { zero: string; one: string; two: string; few: string; many: string };
const daysText = (n: number, d: Days) => (n <= 0 ? d.zero : n === 1 ? d.one : n === 2 ? d.two : n <= 10 ? d.few : d.many).replace("{n}", String(n));

/** On phones: once past the top, a bar with the days left and "apply"; it hides over the form itself. */
export function ExpoApplyBar({ label, days, start = EXPO_START, end = EXPO_END, target = "apply" }: { label: string; days: Days; start?: number; end?: number; target?: string }) {
  const now = useNow(60_000);
  const [show, setShow] = useState(false);
  useEffect(() => {
    const targets = [target, "status"].map((id) => document.getElementById(id)).filter(Boolean) as HTMLElement[];
    const seen = new Set<Element>();
    const io = new IntersectionObserver((entries) => {
      for (const e of entries) {
        if (e.isIntersecting) seen.add(e.target);
        else seen.delete(e.target);
      }
      update();
    });
    const update = () => setShow(window.scrollY > window.innerHeight * 0.8 && seen.size === 0);
    targets.forEach((t) => io.observe(t));
    window.addEventListener("scroll", update, { passive: true });
    update();
    return () => {
      io.disconnect();
      window.removeEventListener("scroll", update);
    };
  }, [target]);
  if (now === null || now >= end) return null;
  const n = Math.max(0, Math.ceil((start - now) / 86_400_000));
  return (
    <div
      data-testid="expo-apply-bar"
      aria-hidden={!show}
      className={cn(
        "fixed inset-x-3 z-40 flex items-center justify-between gap-3 rounded-2xl border border-[#ff7a45]/40 bg-[rgb(10_18_40/0.94)] p-2.5 ps-4 shadow-[0_20px_50px_-20px_rgb(0_0_0/0.9)] backdrop-blur-xl transition-all duration-300 lg:hidden",
        "bottom-[calc(4.25rem+env(safe-area-inset-bottom)+0.6rem)]",
        show ? "translate-y-0 opacity-100" : "pointer-events-none translate-y-4 opacity-0",
      )}
    >
      <span className="text-sm font-semibold text-chalk">{daysText(n, days)}</span>
      <a href={`#${target}`} tabIndex={show ? 0 : -1} className="btn btn-primary btn-sm">
        {label}
      </a>
    </div>
  );
}
