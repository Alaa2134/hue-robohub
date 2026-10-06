"use client";
import { useRouter } from "next/navigation";
import { useOptimistic, useState, useTransition } from "react";
import { cn } from "@/lib/cn";
import { setMemberPublic } from "@/server/actions/members";

/** One-tap PUBLIC PROFILE switch for list views; the website updates as soon as the action returns. */
export function PublicToggle({ id, value, name, compact }: { id: string; value: boolean; name: string; compact?: boolean }) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [on, setOn] = useOptimistic(value);
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="relative z-10 inline-flex items-center gap-2">
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-label={`Public profile: ${name}`}
        title={error ?? (on ? "Public — shown on the website" : "Private — hidden from the website")}
        disabled={pending}
        onClick={() =>
          start(async () => {
            setOn(!on);
            setError(null);
            const r = await setMemberPublic(id, !on);
            if (!r.ok) setError(r.error);
            router.refresh();
          })
        }
        className={cn("relative h-6 w-10 shrink-0 rounded-full transition-colors disabled:opacity-70", on ? "bg-ok" : "bg-steel")}
      >
        <span className={cn("absolute top-1 size-4 rounded-full bg-white transition-all", on ? "start-5" : "start-1")} />
      </button>
      {!compact && <span className={cn("font-mono text-[0.62rem] uppercase tracking-[0.08em]", error ? "text-danger" : on ? "text-ok" : "text-fog")}>{error ? "Failed" : on ? "Public" : "Private"}</span>}
    </span>
  );
}
