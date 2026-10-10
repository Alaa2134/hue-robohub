"use client";
/** The expo visit page, live: how many are in the delegation (by day) and the places left. */
import { useEffect, useState } from "react";
import { SUPABASE_KEY, SUPABASE_URL } from "@/lib/supabase-public";

type Stats = { accepted: number; capacity: number | null; days: Record<string, number> } | null;

export function DelegationCounter({ slug, going, left, full, closed }: { slug: string; going: string; left: string; full: string; closed: string }) {
  const [s, setS] = useState<Stats | undefined>(undefined);
  useEffect(() => {
    fetch(`${SUPABASE_URL}/rest/v1/rpc/form_delegation`, { method: "POST", headers: { apikey: SUPABASE_KEY, "Content-Type": "application/json" }, body: JSON.stringify({ p_slug: slug }) })
      .then((r) => (r.ok ? (r.json() as Promise<Stats>) : null))
      .then((x) => setS(x ?? null), () => setS(null));
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
